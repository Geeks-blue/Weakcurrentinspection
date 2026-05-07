# 巡检权限策略模块
# 控制哪些学生可以进入/巡检特定房间，防止性别错误分配。
# 优先使用房间级别的 gender_restriction 字段；
# 若房间为"无限制"(none)，则回退到楼栋级别的硬编码女寝名单。
import re

from fastapi import HTTPException, status

# 楼栋级别的女寝硬编码名单（兜底逻辑，房间级别优先）
FEMALE_ONLY_BUILDINGS = {"dorm-2", "dorm-4", "dorm-7"}


def normalize_gender(gender: str) -> str:
    """标准化性别字符串为小写去空格。"""
    return gender.strip().lower()


def canonical_building_code(raw_code: str) -> str:
    """将各种格式的楼栋编码规范化，用于与 FEMALE_ONLY_BUILDINGS 比对。"""
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
    """判断楼栋是否属于楼栋级别的女寝限制范围。"""
    return canonical_building_code(building_code) in FEMALE_ONLY_BUILDINGS


def assert_student_can_access_room(student_gender: str, building_code: str, room_gender_restriction: str = "none") -> None:
    """
    校验学生是否有权限巡检该房间。
    优先级：房间级别限制 > 楼栋级别限制。
    - room_gender_restriction = 'female' → 只允许女生
    - room_gender_restriction = 'male'   → 只允许男生
    - room_gender_restriction = 'none'   → 按楼栋级别判断
    """
    restriction = room_gender_restriction.strip().lower()
    g = normalize_gender(student_gender or "")
    if restriction == "female" and g != "female":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此房间仅限女生巡检。")
    if restriction == "male" and g != "male":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此房间仅限男生巡检。")
    if restriction == "none" and is_female_only_building(building_code) and g != "female":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Male students cannot access dorm-2/dorm-4/dorm-7 records.")


def assert_teacher_can_assign(student_gender: str, building_code: str, room_gender_restriction: str = "none") -> None:
    """
    教师派单前校验学生性别是否符合房间限制。
    与 assert_student_can_access_room 逻辑相同，返回 400 而非 403。
    """
    restriction = room_gender_restriction.strip().lower()
    g = normalize_gender(student_gender or "")
    if restriction == "female" and g != "female":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="此房间仅限女生巡检，不能分配给男生。")
    if restriction == "male" and g != "male":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="此房间仅限男生巡检，不能分配给女生。")
    if restriction == "none" and is_female_only_building(building_code) and g != "female":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Female-only dorm task cannot be assigned to male student.")



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


def assert_student_can_access_room(student_gender: str, building_code: str, room_gender_restriction: str = "none") -> None:
    restriction = room_gender_restriction.strip().lower()
    g = normalize_gender(student_gender or "")
    if restriction == "female" and g != "female":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此房间仅限女生巡检。")
    if restriction == "male" and g != "male":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="此房间仅限男生巡检。")
    if restriction == "none" and is_female_only_building(building_code) and g != "female":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Male students cannot access dorm-2/dorm-4/dorm-7 records.")


def assert_teacher_can_assign(student_gender: str, building_code: str, room_gender_restriction: str = "none") -> None:
    restriction = room_gender_restriction.strip().lower()
    g = normalize_gender(student_gender or "")
    if restriction == "female" and g != "female":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="此房间仅限女生巡检，不能分配给男生。")
    if restriction == "male" and g != "male":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="此房间仅限男生巡检，不能分配给女生。")
    if restriction == "none" and is_female_only_building(building_code) and g != "female":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Female-only dorm task cannot be assigned to male student.")

