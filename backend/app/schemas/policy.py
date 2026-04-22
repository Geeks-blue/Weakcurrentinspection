# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from pydantic import BaseModel, Field


class StudentAccessCheckRequest(BaseModel):
    student_gender: str = Field(..., examples=["female", "male"])
    building_code: str = Field(..., examples=["dorm-2", "dorm-1", "2#"])


class TeacherAssignCheckRequest(BaseModel):
    student_gender: str = Field(..., examples=["female", "male"])
    building_code: str = Field(..., examples=["dorm-4", "teaching-building"])


class PolicyCheckResult(BaseModel):
    allowed: bool
    reason: str

