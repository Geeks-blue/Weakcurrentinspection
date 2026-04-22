# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import re

from fastapi import HTTPException, status

FEMALE_ONLY_BUILDINGS = {"dorm-2", "dorm-4", "dorm-7"}


def normalize_gender(gender: str) -> str:
    return gender.strip().lower()


def canonical_building_code(raw_code: str) -> str:
    code = raw_code.strip().lower().replace(" ", "")

    if code in FEMALE_ONLY_BUILDINGS:
        return code

    digits = re.findall(r"\d+", code)
    if "dorm" in code and digits:
        return f"dorm-{digits[0]}"

    if "#" in code and digits:
        return f"dorm-{digits[0]}"

    return code


def is_female_only_building(building_code: str) -> bool:
    return canonical_building_code(building_code) in FEMALE_ONLY_BUILDINGS


def assert_student_can_access_room(student_gender: str, building_code: str) -> None:
    if is_female_only_building(building_code) and normalize_gender(student_gender) != "female":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Male students cannot access dorm-2/dorm-4/dorm-7 records.",
        )


def assert_teacher_can_assign(student_gender: str, building_code: str) -> None:
    if is_female_only_building(building_code) and normalize_gender(student_gender) != "female":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Female-only dorm task cannot be assigned to male student.",
        )

