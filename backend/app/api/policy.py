# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from fastapi import APIRouter, HTTPException

from app.core.policies import assert_student_can_access_room, assert_teacher_can_assign
from app.schemas.policy import (
    PolicyCheckResult,
    StudentAccessCheckRequest,
    TeacherAssignCheckRequest,
)

router = APIRouter()


@router.post("/student-access-check", response_model=PolicyCheckResult)
def student_access_check(payload: StudentAccessCheckRequest) -> PolicyCheckResult:
    try:
        assert_student_can_access_room(payload.student_gender, payload.building_code)
    except HTTPException as exc:
        return PolicyCheckResult(allowed=False, reason=str(exc.detail))

    return PolicyCheckResult(allowed=True, reason="Access allowed")


@router.post("/teacher-assign-check", response_model=PolicyCheckResult)
def teacher_assign_check(payload: TeacherAssignCheckRequest) -> PolicyCheckResult:
    try:
        assert_teacher_can_assign(payload.student_gender, payload.building_code)
    except HTTPException as exc:
        return PolicyCheckResult(allowed=False, reason=str(exc.detail))

    return PolicyCheckResult(allowed=True, reason="Assignment allowed")

