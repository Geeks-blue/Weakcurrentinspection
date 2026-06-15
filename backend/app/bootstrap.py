# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import UTC, datetime, timedelta

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.entities import Building, InspectionTask, Room, TaskAssignment, User
from app.models.entities import Inspection, InspectionPhoto


def init_db_and_seed() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_schema_compatibility()
    with SessionLocal() as db:
        _seed_users(db)
        _seed_buildings_and_rooms(db)
        _seed_demo_tasks(db)
        _seed_demo_inspection_submission(db)


def _ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "wechat_openid" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128)"))


def _seed_users(db: Session) -> None:
    if db.query(User).count() > 0:
        return

    users = [
        User(
            username="admin",
            password_hash=hash_password("Admin@123456"),
            role="admin",
            gender=None,
            is_active=True,
        ),
        User(
            username="teacher01",
            password_hash=hash_password("Teacher@123"),
            role="teacher",
            gender=None,
            is_active=True,
        ),
        User(
            username="student_f01",
            password_hash=hash_password("Student@123"),
            role="student",
            gender="female",
            is_active=True,
        ),
        User(
            username="student_m01",
            password_hash=hash_password("Student@123"),
            role="student",
            gender="male",
            is_active=True,
        ),
    ]
    db.add_all(users)
    db.commit()


def _seed_buildings_and_rooms(db: Session) -> None:
    if db.query(Building).count() > 0:
        return

    building_rows = [
        ("library", "Library", "public", "none"),
        ("office", "Office", "public", "none"),
        ("lab", "Lab", "public", "none"),
        ("teaching", "Teaching", "public", "none"),
        ("gym", "Gym", "public", "none"),
        ("canteen", "Canteen", "public", "none"),
        ("dorm-1", "Dorm 1", "dorm", "none"),
        ("dorm-2", "Dorm 2", "dorm", "female_only"),
        ("dorm-3", "Dorm 3", "dorm", "none"),
        ("dorm-4", "Dorm 4", "dorm", "female_only"),
        ("dorm-5", "Dorm 5", "dorm", "none"),
        ("dorm-6", "Dorm 6", "dorm", "none"),
        ("dorm-7", "Dorm 7", "dorm", "female_only"),
    ]

    buildings = [
        Building(code=code, name=name, category=category, gender_restriction=gender_restriction)
        for code, name, category, gender_restriction in building_rows
    ]
    db.add_all(buildings)
    db.flush()

    now = datetime.now(UTC)
    rooms: list[Room] = []
    for building in buildings:
        rooms.append(
            Room(
                room_code=f"{building.code}-R1",
                building_id=building.id,
                floor_label="1F",
                location_text=f"{building.name} weak-current room",
                qr_token=f"QR-{building.code}-R1-{int(now.timestamp())}",
                is_active=True,
            )
        )

    db.add_all(rooms)
    db.commit()


def _seed_demo_tasks(db: Session) -> None:
    if db.query(TaskAssignment).count() > 0:
        return

    teacher = db.query(User).filter(User.username == "teacher01").first()
    student_f = db.query(User).filter(User.username == "student_f01").first()
    student_m = db.query(User).filter(User.username == "student_m01").first()

    if not teacher or not student_f or not student_m:
        return

    room_dorm_1 = db.query(Room).filter(Room.room_code == "dorm-1-R1").first()
    room_dorm_2 = db.query(Room).filter(Room.room_code == "dorm-2-R1").first()

    if not room_dorm_1 or not room_dorm_2:
        return

    now = datetime.now(UTC)
    due = now + timedelta(days=7)

    task_rows = [
        ("Demo Weekly Inspection Dorm 1", room_dorm_1, student_m),
        ("Demo Weekly Inspection Dorm 2", room_dorm_2, student_f),
    ]

    for title, room, student in task_rows:
        task = InspectionTask(
            title=title,
            cycle_type="weekly",
            start_at=now,
            end_at=due,
            status="active",
            created_by=teacher.id,
        )
        db.add(task)
        db.flush()

        assignment = TaskAssignment(
            task_id=task.id,
            room_id=room.id,
            student_user_id=student.id,
            due_at=due,
            status="todo",
        )
        db.add(assignment)

    db.commit()


def _seed_demo_inspection_submission(db: Session) -> None:
    if db.query(Inspection).count() > 0:
        return

    assignment = (
        db.query(TaskAssignment)
        .join(Room, TaskAssignment.room_id == Room.id)
        .filter(Room.room_code == "dorm-2-R1")
        .first()
    )
    if not assignment:
        return

    inspection = Inspection(
        assignment_id=assignment.id,
        room_id=assignment.room_id,
        inspector_user_id=assignment.student_user_id,
        checkin_mode="qr",
        checkin_lat=23.123456,
        checkin_lng=113.123456,
        lock_state="locked",
        clutter_state="stacked_items",
        indicator_state="all_ok",
        asset_match_state="matched",
        remark_text="Demo pending review inspection",
        status="pending_review",
    )
    db.add(inspection)
    db.flush()

    db.add(
        InspectionPhoto(
            inspection_id=inspection.id,
            object_key="demo-pending-review-photo-1.jpg",
        )
    )

    assignment.status = "submitted"
    db.commit()

