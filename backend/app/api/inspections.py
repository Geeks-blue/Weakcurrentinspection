# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.policies import assert_student_can_access_room
from app.deps import get_current_user, get_db, require_teacher_or_admin
from app.models.entities import (
    Building,
    Inspection,
    InspectionPhoto,
    InspectionReviewLog,
    Room,
    TaskAssignment,
    User,
)
from app.schemas.inspection import (
    ConsoleInspectionItem,
    InspectionDeleteResponse,
    InspectionItem,
    InspectionReviewRequest,
    InspectionReviewResponse,
    InspectionSubmitRequest,
    InspectionSubmitResponse,
    PendingReviewInspectionItem,
    InspectionPhotoUploadResponse,
)

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "inspection_photos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _build_photo_url(request: Request, object_key: str) -> str:
    return str(request.url_for("get_inspection_photo", object_key=object_key))


def _list_photo_urls(request: Request, inspection_id: int, db: Session) -> list[str]:
    photos = (
        db.query(InspectionPhoto)
        .filter(InspectionPhoto.inspection_id == inspection_id)
        .order_by(InspectionPhoto.created_at.asc())
        .all()
    )
    return [_build_photo_url(request, photo.object_key) for photo in photos]


def _ensure_owned_uploaded_photo(object_key: str, current_user: User, field_name: str) -> str:
    cleaned_key = (object_key or "").strip()
    if not cleaned_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is required")

    user_prefix = f"{current_user.username}-"
    if not cleaned_key.startswith(user_prefix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must reference a photo uploaded by current user",
        )

    file_path = UPLOAD_DIR / cleaned_key
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} does not exist on server",
        )
    return cleaned_key


def _ensure_manual_door_plate_in_photo_keys(door_plate_photo_key: str, photo_keys: list[str]) -> None:
    if door_plate_photo_key not in photo_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="door_plate_photo_key must be included in photo_keys",
        )


@router.post("/photos/upload", response_model=InspectionPhotoUploadResponse)
async def upload_inspection_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> InspectionPhotoUploadResponse:
    # 上传图片先落到后端，再由前端在提交巡检时引用 object_key。
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    image_suffixes = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif"}
    suffix = Path(file.filename or "").suffix.lower() or ".jpg"
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")
    if not content_type and suffix not in image_suffixes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")

    object_key = f"{current_user.username}-{uuid4().hex}{suffix}"
    file_path = UPLOAD_DIR / object_key

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file is not allowed")
    file_path.write_bytes(content)

    return InspectionPhotoUploadResponse(
        object_key=object_key,
        file_url=_build_photo_url(request, object_key),
    )


@router.get("/photos/{object_key}")
def get_inspection_photo(object_key: str) -> FileResponse:
    # 控制台和移动端都通过这个地址读取已上传的巡检照片。
    file_path = UPLOAD_DIR / object_key
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return FileResponse(file_path)


@router.get("/console-records", response_model=list[ConsoleInspectionItem])
def console_records(
    request: Request,
    limit: int = Query(default=120, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> list[ConsoleInspectionItem]:
    # 控制台记录：用于教师/管理员查看巡检提交与审核结果（含已审核数据）。
    rows = (
        db.query(Inspection, Room, Building, User)
        .join(Room, Inspection.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .join(User, Inspection.inspector_user_id == User.id)
        .order_by(Inspection.submitted_at.desc())
        .limit(limit)
        .all()
    )

    result: list[ConsoleInspectionItem] = []
    for inspection, room, building, inspector in rows:
        photo_count = (
            db.query(InspectionPhoto)
            .filter(InspectionPhoto.inspection_id == inspection.id)
            .count()
        )
        result.append(
            ConsoleInspectionItem(
                inspection_id=inspection.id,
                assignment_id=inspection.assignment_id,
                student_username=inspector.username,
                building_code=building.code,
                room_code=room.room_code,
                submitted_at=inspection.submitted_at,
                reviewed_at=inspection.reviewed_at,
                status=inspection.status,
                photo_count=photo_count,
                photo_urls=_list_photo_urls(request, inspection.id, db) if request else [],
            )
        )

    return result


@router.post("/submit", response_model=InspectionSubmitResponse)
def submit_inspection(
    payload: InspectionSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InspectionSubmitResponse:
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    row = (
        db.query(TaskAssignment, Room, Building)
        .join(Room, TaskAssignment.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .filter(
            TaskAssignment.id == payload.assignment_id,
            TaskAssignment.student_user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assignment, room, building = row
    assert_student_can_access_room(current_user.gender or "", building.code)

    if assignment.status not in {"todo", "rejected", "rectify_required", "overdue"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current assignment status does not allow submission: {assignment.status}",
        )

    if payload.checkin_mode == "manual":
        manual_room_code = (payload.manual_room_code or "").strip()
        if manual_room_code.lower() != room.room_code.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="manual_room_code does not match assigned room",
            )
        door_plate_photo_key = _ensure_owned_uploaded_photo(
            payload.door_plate_photo_key or "",
            current_user,
            "door_plate_photo_key",
        )
        _ensure_manual_door_plate_in_photo_keys(door_plate_photo_key, payload.photo_keys)
        payload.door_plate_photo_key = door_plate_photo_key

    payload.photo_keys = [
        _ensure_owned_uploaded_photo(photo_key, current_user, "photo_keys")
        for photo_key in payload.photo_keys
    ]

    inspection = Inspection(
        assignment_id=assignment.id,
        room_id=room.id,
        inspector_user_id=current_user.id,
        checkin_mode=payload.checkin_mode,
        checkin_lat=payload.checkin_lat,
        checkin_lng=payload.checkin_lng,
        manual_room_code=(payload.manual_room_code or "").strip() or None,
        door_plate_photo_key=(payload.door_plate_photo_key or "").strip() or None,
        lock_state=payload.lock_state,
        clutter_state=payload.clutter_state,
        indicator_state=payload.indicator_state,
        asset_match_state=payload.asset_match_state,
        remark_text=(payload.remark_text or "").strip() or None,
        status="pending_review",
    )
    db.add(inspection)
    db.flush()

    photos = [InspectionPhoto(inspection_id=inspection.id, object_key=key) for key in payload.photo_keys]
    db.add_all(photos)

    assignment.status = "submitted"
    db.commit()

    return InspectionSubmitResponse(
        inspection_id=inspection.id,
        assignment_status=assignment.status,
        inspection_status=inspection.status,
        message="Inspection submitted and waiting for review",
    )


@router.get("/my", response_model=list[InspectionItem])
def my_inspections(
    request: Request,
    status_filter: str | None = Query(default=None, alias="status"),
    room_code: str | None = Query(default=None),
    submitted_from: datetime | None = Query(default=None, alias="submitted_from"),
    submitted_to: datetime | None = Query(default=None, alias="submitted_to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InspectionItem]:
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    query = (
        db.query(Inspection, Room, Building)
        .join(Room, Inspection.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .filter(Inspection.inspector_user_id == current_user.id)
        .order_by(Inspection.submitted_at.desc())
    )

    if status_filter:
        query = query.filter(Inspection.status == status_filter)

    if room_code:
        query = query.filter(Room.room_code.ilike(f"%{room_code.strip()}%"))

    if submitted_from:
        query = query.filter(Inspection.submitted_at >= submitted_from)

    if submitted_to:
        query = query.filter(Inspection.submitted_at <= submitted_to)

    rows = query.all()
    result: list[InspectionItem] = []

    for inspection, room, building in rows:
        try:
            assert_student_can_access_room(current_user.gender or "", building.code)
        except HTTPException:
            continue

        photo_count = (
            db.query(InspectionPhoto)
            .filter(InspectionPhoto.inspection_id == inspection.id)
            .count()
        )

        result.append(
            InspectionItem(
                inspection_id=inspection.id,
                assignment_id=inspection.assignment_id,
                building_code=building.code,
                room_code=room.room_code,
                submitted_at=inspection.submitted_at,
                status=inspection.status,
                lock_state=inspection.lock_state,
                clutter_state=inspection.clutter_state,
                indicator_state=inspection.indicator_state,
                asset_match_state=inspection.asset_match_state,
                photo_count=photo_count,
                photo_urls=_list_photo_urls(request, inspection.id, db) if request else [],
            )
        )

    return result


@router.get("/pending-review", response_model=list[PendingReviewInspectionItem])
def pending_review_list(
    request: Request,
    room_code: str | None = Query(default=None),
    student_username: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> list[PendingReviewInspectionItem]:
    query = (
        db.query(Inspection, TaskAssignment, Room, Building, User)
        .join(TaskAssignment, Inspection.assignment_id == TaskAssignment.id)
        .join(Room, Inspection.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .join(User, Inspection.inspector_user_id == User.id)
        .filter(Inspection.status == "pending_review")
        .order_by(Inspection.submitted_at.asc())
    )

    if room_code:
        query = query.filter(Room.room_code.ilike(f"%{room_code.strip()}%"))

    if student_username:
        query = query.filter(User.username.ilike(f"%{student_username.strip()}%"))

    rows = query.all()

    result: list[PendingReviewInspectionItem] = []
    for inspection, _, room, building, inspector in rows:
        photo_count = (
            db.query(InspectionPhoto)
            .filter(InspectionPhoto.inspection_id == inspection.id)
            .count()
        )
        result.append(
            PendingReviewInspectionItem(
                inspection_id=inspection.id,
                assignment_id=inspection.assignment_id,
                student_username=inspector.username,
                building_code=building.code,
                room_code=room.room_code,
                submitted_at=inspection.submitted_at,
                status=inspection.status,
                lock_state=inspection.lock_state,
                clutter_state=inspection.clutter_state,
                indicator_state=inspection.indicator_state,
                asset_match_state=inspection.asset_match_state,
                remark_text=inspection.remark_text,
                photo_count=photo_count,
                photo_urls=_list_photo_urls(request, inspection.id, db) if request else [],
            )
        )

    return result


@router.delete("/{inspection_id}", response_model=InspectionDeleteResponse)
def delete_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> InspectionDeleteResponse:
    # 删除巡检记录时，同步清理照片与审核日志，并将任务状态回退为待处理。
    row = (
        db.query(Inspection, TaskAssignment)
        .join(TaskAssignment, Inspection.assignment_id == TaskAssignment.id)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    inspection, assignment = row
    photos = db.query(InspectionPhoto).filter(InspectionPhoto.inspection_id == inspection.id).all()
    logs = db.query(InspectionReviewLog).filter(InspectionReviewLog.inspection_id == inspection.id).all()

    deleted_photo_count = 0
    for photo in photos:
        file_path = UPLOAD_DIR / photo.object_key
        if file_path.exists() and file_path.is_file():
            file_path.unlink(missing_ok=True)
        db.delete(photo)
        deleted_photo_count += 1

    for log in logs:
        db.delete(log)

    assignment.status = "todo"
    db.delete(inspection)
    db.commit()

    return InspectionDeleteResponse(
        inspection_id=inspection_id,
        assignment_id=assignment.id,
        assignment_status=assignment.status,
        deleted_photo_count=deleted_photo_count,
        message="Inspection deleted successfully",
    )


@router.post("/{inspection_id}/review", response_model=InspectionReviewResponse)
def review_inspection(
    inspection_id: int,
    payload: InspectionReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> InspectionReviewResponse:
    row = (
        db.query(Inspection, TaskAssignment)
        .join(TaskAssignment, Inspection.assignment_id == TaskAssignment.id)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")

    inspection, assignment = row
    if inspection.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only pending_review can be reviewed, current status: {inspection.status}",
        )

    inspection.status = payload.action
    inspection.reviewer_user_id = current_user.id
    inspection.reviewed_at = datetime.now(UTC)

    assignment.status = payload.action

    log = InspectionReviewLog(
        inspection_id=inspection.id,
        action=payload.action,
        reason=(payload.reason or "").strip() or None,
        reviewer_user_id=current_user.id,
    )
    db.add(log)
    db.commit()

    return InspectionReviewResponse(
        inspection_id=inspection.id,
        inspection_status=inspection.status,
        assignment_status=assignment.status,
        reviewed_by=current_user.username,
        message="Inspection reviewed successfully",
    )

