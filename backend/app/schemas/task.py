# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class CreateTaskAssignmentRequest(BaseModel):
    task_title: str = Field(..., min_length=3, max_length=255)
    cycle_type: str = Field(default="one_off", pattern="^(one_off|weekly|monthly)$")
    room_id: int = Field(..., ge=1)
    student_user_id: int = Field(..., ge=1)
    due_at: datetime


class TaskAssignmentItem(BaseModel):
    assignment_id: int
    task_title: str
    building_code: str
    building_name: str
    room_code: str
    floor_label: str | None
    location_text: str | None
    due_at: datetime
    status: str


class TaskAssignmentCreateResponse(BaseModel):
    assignment_id: int
    message: str
    notification_sent: bool = False
    notification_message: str | None = None


class DispatchRoomOption(BaseModel):
    room_id: int
    room_code: str
    building_code: str
    building_name: str
    gender_restriction: str


class DispatchStudentOption(BaseModel):
    student_user_id: int
    username: str
    gender: str | None
    wechat_bound: bool = False


class TaskDispatchOptionsResponse(BaseModel):
    rooms: list[DispatchRoomOption]
    students: list[DispatchStudentOption]


class PendingTaskManageItem(BaseModel):
    assignment_id: int
    task_id: int
    task_title: str
    cycle_type: str
    student_user_id: int
    student_username: str
    room_id: int
    building_code: str
    room_code: str
    due_at: datetime
    status: str


class UpdateTaskAssignmentRequest(BaseModel):
    task_title: str | None = Field(default=None, min_length=3, max_length=255)
    cycle_type: str | None = Field(default=None, pattern="^(one_off|weekly|monthly)$")
    room_id: int | None = Field(default=None, ge=1)
    student_user_id: int | None = Field(default=None, ge=1)
    due_at: datetime | None = None
    status: str | None = Field(default=None, pattern="^(todo|rejected|rectify_required|overdue)$")

    @model_validator(mode="after")
    def validate_non_empty_patch(self) -> "UpdateTaskAssignmentRequest":
        if not any(
            [
                self.task_title is not None,
                self.cycle_type is not None,
                self.room_id is not None,
                self.student_user_id is not None,
                self.due_at is not None,
                self.status is not None,
            ]
        ):
            raise ValueError("At least one field must be provided for update.")
        return self


class TaskAssignmentUpdateResponse(BaseModel):
    assignment_id: int
    task_id: int
    assignment_status: str
    message: str


class TaskAssignmentDeleteResponse(BaseModel):
    assignment_id: int
    task_id: int
    deleted_inspection_count: int
    deleted_photo_count: int
    message: str

