# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_teacher_assign_check_male_rejected_for_female_dorm() -> None:
    response = client.post(
        "/policy/teacher-assign-check",
        json={"student_gender": "male", "building_code": "dorm-2"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is False


def test_teacher_assign_check_female_allowed_for_female_dorm() -> None:
    response = client.post(
        "/policy/teacher-assign-check",
        json={"student_gender": "female", "building_code": "dorm-2"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is True

