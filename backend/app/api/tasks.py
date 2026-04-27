# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.policies import assert_student_can_access_room, assert_teacher_can_assign
from app.deps import get_current_user, get_db, require_teacher_or_admin
from app.models.entities import (
    Building,
    Inspection,
    InspectionPhoto,
    InspectionReviewLog,
    InspectionTask,
    Room,
    TaskAssignment,
    User,
)
from app.schemas.task import (
    CreateTaskAssignmentRequest,
    DispatchRoomOption,
    DispatchStudentOption,
    PendingTaskManageItem,
    TaskAssignmentDeleteResponse,
    TaskDispatchOptionsResponse,
    TaskAssignmentCreateResponse,
    TaskAssignmentItem,
    TaskAssignmentUpdateResponse,
    UpdateTaskAssignmentRequest,
)

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "inspection_photos"


class TaskAssignmentValidationRequest(BaseModel):
    student_id: int = Field(..., ge=1)
    student_gender: str = Field(..., examples=["female", "male"])
    building_code: str = Field(..., examples=["dorm-2", "dorm-5"])


class TaskAssignmentValidationResponse(BaseModel):
    accepted: bool
    message: str


@router.get("/dispatch-options", response_model=TaskDispatchOptionsResponse)
def dispatch_options(
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> TaskDispatchOptionsResponse:
    # 为教师/管理员派单页提供可选学生与房间列表。
    room_rows = (
        db.query(Room, Building)
        .join(Building, Room.building_id == Building.id)
        .filter(Room.is_active.is_(True))
        .order_by(Building.code.asc(), Room.room_code.asc())
        .all()
    )

    student_rows = (
        db.query(User)
        .filter(User.role == "student", User.is_active.is_(True))
        .order_by(User.username.asc())
        .all()
    )

    rooms = [
        DispatchRoomOption(
            room_id=room.id,
            room_code=room.room_code,
            building_code=building.code,
            building_name=building.name,
        )
        for room, building in room_rows
    ]
    students = [
        DispatchStudentOption(
            student_user_id=student.id,
            username=student.username,
            gender=student.gender,
        )
        for student in student_rows
    ]
    return TaskDispatchOptionsResponse(rooms=rooms, students=students)


@router.post("/validate-assignment", response_model=TaskAssignmentValidationResponse)
def validate_assignment(payload: TaskAssignmentValidationRequest) -> TaskAssignmentValidationResponse:
    assert_teacher_can_assign(payload.student_gender, payload.building_code)
    return TaskAssignmentValidationResponse(
        accepted=True,
        message="Assignment passes policy check.",
    )


@router.post("/assign", response_model=TaskAssignmentCreateResponse)
def create_assignment(
    payload: CreateTaskAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin),
) -> TaskAssignmentCreateResponse:
    student = (
        db.query(User)
        .filter(User.id == payload.student_user_id, User.role == "student", User.is_active.is_(True))
        .first()
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student user not found")

    row = (
        db.query(Room, Building)
        .join(Building, Room.building_id == Building.id)
        .filter(Room.id == payload.room_id, Room.is_active.is_(True))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    room, building = row
    assert_teacher_can_assign(student.gender or "", building.code)

    now = datetime.now(UTC)
    task = InspectionTask(
        title=payload.task_title,
        cycle_type=payload.cycle_type,
        start_at=now,
        end_at=payload.due_at,
        status="active",
        created_by=current_user.id,
    )
    db.add(task)
    db.flush()

    assignment = TaskAssignment(
        task_id=task.id,
        room_id=room.id,
        student_user_id=student.id,
        due_at=payload.due_at,
        status="todo",
    )
    db.add(assignment)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicated assignment key for task/room/student",
        ) from exc

    return TaskAssignmentCreateResponse(
        assignment_id=assignment.id,
        message="Task assignment created",
    )


@router.get("/my", response_model=list[TaskAssignmentItem])
def my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskAssignmentItem]:
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student role required")

    # 待巡检任务仅返回学生“可继续提交”的状态，已通过审核任务不再在移动端显示。
    active_statuses = {"todo", "rejected", "rectify_required", "overdue"}

    rows = (
        db.query(TaskAssignment, InspectionTask, Room, Building)
        .join(InspectionTask, TaskAssignment.task_id == InspectionTask.id)
        .join(Room, TaskAssignment.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .filter(
            TaskAssignment.student_user_id == current_user.id,
            TaskAssignment.status.in_(active_statuses),
        )
        .order_by(TaskAssignment.due_at.asc())
        .all()
    )

    result: list[TaskAssignmentItem] = []
    for assignment, task, room, building in rows:
        try:
            assert_student_can_access_room(current_user.gender or "", building.code)
        except HTTPException:
            continue

        result.append(
            TaskAssignmentItem(
                assignment_id=assignment.id,
                task_title=task.title,
                building_code=building.code,
                building_name=building.name,
                room_code=room.room_code,
                floor_label=room.floor_label,
                location_text=room.location_text,
                due_at=assignment.due_at,
                status=assignment.status,
            )
        )

    return result


@router.get("/pending", response_model=list[PendingTaskManageItem])
def pending_tasks(
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> list[PendingTaskManageItem]:
    # 控制台任务管理：仅展示待巡检任务。
    active_statuses = {"todo", "rejected", "rectify_required", "overdue"}
    rows = (
        db.query(TaskAssignment, InspectionTask, Room, Building, User)
        .join(InspectionTask, TaskAssignment.task_id == InspectionTask.id)
        .join(Room, TaskAssignment.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .join(User, TaskAssignment.student_user_id == User.id)
        .filter(TaskAssignment.status.in_(active_statuses))
        .order_by(TaskAssignment.due_at.asc(), TaskAssignment.id.asc())
        .all()
    )

    return [
        PendingTaskManageItem(
            assignment_id=assignment.id,
            task_id=task.id,
            task_title=task.title,
            cycle_type=task.cycle_type,
            student_user_id=student.id,
            student_username=student.username,
            room_id=room.id,
            building_code=building.code,
            room_code=room.room_code,
            due_at=assignment.due_at,
            status=assignment.status,
        )
        for assignment, task, room, building, student in rows
    ]


@router.patch("/{assignment_id}", response_model=TaskAssignmentUpdateResponse)
def update_assignment(
    assignment_id: int,
    payload: UpdateTaskAssignmentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> TaskAssignmentUpdateResponse:
    row = (
        db.query(TaskAssignment, InspectionTask, Room, Building, User)
        .join(InspectionTask, TaskAssignment.task_id == InspectionTask.id)
        .join(Room, TaskAssignment.room_id == Room.id)
        .join(Building, Room.building_id == Building.id)
        .join(User, TaskAssignment.student_user_id == User.id)
        .filter(TaskAssignment.id == assignment_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assignment, task, room, _, student = row
    next_room = room
    next_student = student

    if payload.room_id is not None and payload.room_id != room.id:
        next_room_row = (
            db.query(Room, Building)
            .join(Building, Room.building_id == Building.id)
            .filter(Room.id == payload.room_id, Room.is_active.is_(True))
            .first()
        )
        if not next_room_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        next_room = next_room_row[0]

    if payload.student_user_id is not None and payload.student_user_id != student.id:
        next_student = (
            db.query(User)
            .filter(User.id == payload.student_user_id, User.role == "student", User.is_active.is_(True))
            .first()
        )
        if not next_student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student user not found")

    policy_row = (
        db.query(Building)
        .join(Room, Room.building_id == Building.id)
        .filter(Room.id == next_room.id)
        .first()
    )
    if not policy_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")
    assert_teacher_can_assign(next_student.gender or "", policy_row.code)

    if payload.task_title is not None:
        task.title = payload.task_title
    if payload.cycle_type is not None:
        task.cycle_type = payload.cycle_type
    if payload.room_id is not None:
        assignment.room_id = next_room.id
    if payload.student_user_id is not None:
        assignment.student_user_id = next_student.id
    if payload.due_at is not None:
        assignment.due_at = payload.due_at
    if payload.status is not None:
        assignment.status = payload.status

    db.commit()

    return TaskAssignmentUpdateResponse(
        assignment_id=assignment.id,
        task_id=task.id,
        assignment_status=assignment.status,
        message="Task assignment updated",
    )


@router.delete("/{assignment_id}", response_model=TaskAssignmentDeleteResponse)
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher_or_admin),
) -> TaskAssignmentDeleteResponse:
    row = (
        db.query(TaskAssignment, InspectionTask)
        .join(InspectionTask, TaskAssignment.task_id == InspectionTask.id)
        .filter(TaskAssignment.id == assignment_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assignment, task = row
    inspections = db.query(Inspection).filter(Inspection.assignment_id == assignment.id).all()
    deleted_inspection_count = 0
    deleted_photo_count = 0

    for inspection in inspections:
        photos = db.query(InspectionPhoto).filter(InspectionPhoto.inspection_id == inspection.id).all()
        for photo in photos:
            file_path = UPLOAD_DIR / photo.object_key
            if file_path.exists() and file_path.is_file():
                file_path.unlink(missing_ok=True)
            db.delete(photo)
            deleted_photo_count += 1

        logs = db.query(InspectionReviewLog).filter(InspectionReviewLog.inspection_id == inspection.id).all()
        for log in logs:
            db.delete(log)

        db.delete(inspection)
        deleted_inspection_count += 1

    db.delete(assignment)

    db.commit()

    return TaskAssignmentDeleteResponse(
        assignment_id=assignment_id,
        task_id=task.id,
        deleted_inspection_count=deleted_inspection_count,
        deleted_photo_count=deleted_photo_count,
        message="Task assignment deleted",
    )

