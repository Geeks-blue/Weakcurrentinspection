# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from sqlalchemy import (
    BIGINT,
    TIMESTAMP,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    gender_restriction: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    rooms: Mapped[list["Room"]] = relationship(back_populates="building")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    building_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("buildings.id"), nullable=False)
    floor_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qr_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    gender_restriction: Mapped[str] = mapped_column(String(16), nullable=False, default="none", server_default="none")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    building: Mapped["Building"] = relationship(back_populates="rooms")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    asset_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    asset_name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_category: Mapped[str] = mapped_column(String(64), nullable=False, default="weak_current")
    room_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("rooms.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(BIGINT, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="in_use")
    manufacturer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    room: Mapped["Room"] = relationship()


class AssetPhoto(Base):
    __tablename__ = "asset_photos"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    asset_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("assets.id"), unique=True, nullable=False, index=True)
    object_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class InspectionTask(Base):
    __tablename__ = "inspection_tasks"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    cycle_type: Mapped[str] = mapped_column(String(16), nullable=False)
    start_at: Mapped[TIMESTAMP] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[TIMESTAMP] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    created_by: Mapped[int] = mapped_column(BIGINT, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "room_id", "student_user_id", name="uq_assignment_key"),
    )

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    task_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("inspection_tasks.id"), nullable=False)
    room_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("rooms.id"), nullable=False)
    student_user_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("users.id"), nullable=False)
    due_at: Mapped[TIMESTAMP] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="todo")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    room: Mapped["Room"] = relationship()


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("task_assignments.id"), nullable=False)
    room_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("rooms.id"), nullable=False)
    inspector_user_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("users.id"), nullable=False)
    checkin_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    checkin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    checkin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    manual_room_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    door_plate_photo_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lock_state: Mapped[str] = mapped_column(String(16), nullable=False)
    clutter_state: Mapped[str] = mapped_column(String(16), nullable=False)
    indicator_state: Mapped[str] = mapped_column(String(16), nullable=False)
    asset_match_state: Mapped[str] = mapped_column(String(16), nullable=False)
    remark_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending_review")
    submitted_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_user_id: Mapped[int | None] = mapped_column(BIGINT, ForeignKey("users.id"), nullable=True)

    photos: Mapped[list["InspectionPhoto"]] = relationship(back_populates="inspection")


class InspectionPhoto(Base):
    __tablename__ = "inspection_photos"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("inspections.id"), nullable=False)
    object_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    inspection: Mapped["Inspection"] = relationship(back_populates="photos")


class InspectionReviewLog(Base):
    __tablename__ = "inspection_review_logs"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("inspections.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_user_id: Mapped[int] = mapped_column(BIGINT, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

