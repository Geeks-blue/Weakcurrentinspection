from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import inspections as inspections_api
from app.models.entities import User


def _build_user(username: str) -> User:
    return User(
        id=1,
        username=username,
        password_hash="hashed",
        role="student",
        gender="female",
        is_active=True,
    )


def test_owned_uploaded_photo_accepts_existing_file(tmp_path: Path) -> None:
    user = _build_user("student_f01")
    object_key = "student_f01-abc123.jpg"
    photo_path = tmp_path / object_key
    photo_path.write_bytes(b"demo")

    original_upload_dir = inspections_api.UPLOAD_DIR
    inspections_api.UPLOAD_DIR = tmp_path
    try:
        result = inspections_api._ensure_owned_uploaded_photo(object_key, user, "photo_keys")
    finally:
        inspections_api.UPLOAD_DIR = original_upload_dir

    assert result == object_key


def test_owned_uploaded_photo_rejects_foreign_prefix(tmp_path: Path) -> None:
    user = _build_user("student_f01")
    object_key = "student_m01-abc123.jpg"
    (tmp_path / object_key).write_bytes(b"demo")

    original_upload_dir = inspections_api.UPLOAD_DIR
    inspections_api.UPLOAD_DIR = tmp_path
    try:
        with pytest.raises(HTTPException):
            inspections_api._ensure_owned_uploaded_photo(object_key, user, "photo_keys")
    finally:
        inspections_api.UPLOAD_DIR = original_upload_dir


def test_owned_uploaded_photo_rejects_missing_file(tmp_path: Path) -> None:
    user = _build_user("student_f01")
    object_key = "student_f01-missing.jpg"

    original_upload_dir = inspections_api.UPLOAD_DIR
    inspections_api.UPLOAD_DIR = tmp_path
    try:
        with pytest.raises(HTTPException):
            inspections_api._ensure_owned_uploaded_photo(object_key, user, "photo_keys")
    finally:
        inspections_api.UPLOAD_DIR = original_upload_dir


def test_manual_door_plate_must_be_in_photo_keys() -> None:
    with pytest.raises(HTTPException):
        inspections_api._ensure_manual_door_plate_in_photo_keys(
            "student_f01-door.jpg",
            ["student_f01-a.jpg", "student_f01-b.jpg"],
        )


def test_manual_door_plate_accepts_when_included() -> None:
    inspections_api._ensure_manual_door_plate_in_photo_keys(
        "student_f01-door.jpg",
        ["student_f01-door.jpg", "student_f01-b.jpg"],
    )