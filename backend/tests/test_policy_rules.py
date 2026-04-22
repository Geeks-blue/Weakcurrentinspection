# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import pytest
from fastapi import HTTPException

from app.core.policies import (
    assert_student_can_access_room,
    assert_teacher_can_assign,
    canonical_building_code,
    is_female_only_building,
)


def test_building_code_normalization() -> None:
    assert canonical_building_code("Dorm 2") == "dorm-2"
    assert canonical_building_code("2#") == "dorm-2"
    assert canonical_building_code("dorm-7") == "dorm-7"


def test_female_only_building_detection() -> None:
    assert is_female_only_building("dorm-2") is True
    assert is_female_only_building("dorm-4") is True
    assert is_female_only_building("dorm-7") is True
    assert is_female_only_building("dorm-1") is False


def test_male_student_blocked_from_female_dorm() -> None:
    with pytest.raises(HTTPException):
        assert_student_can_access_room("male", "dorm-2")


def test_female_student_can_access_female_dorm() -> None:
    assert_student_can_access_room("female", "dorm-2")


def test_teacher_assignment_policy_for_female_dorm() -> None:
    with pytest.raises(HTTPException):
        assert_teacher_can_assign("male", "dorm-4")

    assert_teacher_can_assign("female", "dorm-4")

