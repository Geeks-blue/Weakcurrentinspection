# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import datetime

from pydantic import BaseModel, Field


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
    room_code: str
    due_at: datetime
    status: str


class TaskAssignmentCreateResponse(BaseModel):
    assignment_id: int
    message: str


class DispatchRoomOption(BaseModel):
    room_id: int
    room_code: str
    building_code: str
    building_name: str


class DispatchStudentOption(BaseModel):
    student_user_id: int
    username: str
    gender: str | None


class TaskDispatchOptionsResponse(BaseModel):
    rooms: list[DispatchRoomOption]
    students: list[DispatchStudentOption]

