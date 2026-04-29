# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class InspectionSubmitRequest(BaseModel):
    assignment_id: int = Field(..., ge=1)
    checkin_mode: Literal["qr", "manual"]
    checkin_lat: float | None = None
    checkin_lng: float | None = None
    manual_room_code: str | None = None
    door_plate_photo_key: str | None = None
    lock_state: Literal["locked", "unlocked", "lock_damaged"]
    clutter_state: Literal["none", "stacked_items", "water", "odor"]
    indicator_state: Literal["all_ok", "partial_abnormal", "all_abnormal"]
    asset_match_state: Literal["matched", "missing", "extra", "moved"]
    remark_text: str | None = Field(default=None, max_length=2000)
    photo_keys: list[str] = Field(..., min_length=1, max_length=5)

    @model_validator(mode="after")
    def validate_manual_checkin_fields(self) -> "InspectionSubmitRequest":
        if self.checkin_lat is None or self.checkin_lng is None:
            raise ValueError("Check-in latitude and longitude are required.")

        if self.checkin_mode == "manual":
            if not (self.manual_room_code or "").strip():
                raise ValueError("Manual check-in requires manual_room_code.")
            if not (self.door_plate_photo_key or "").strip():
                raise ValueError("Manual check-in requires door_plate_photo_key.")

        cleaned = [item.strip() for item in self.photo_keys if item and item.strip()]
        if len(cleaned) == 0:
            raise ValueError("At least one valid photo key is required.")
        if len(cleaned) > 5:
            raise ValueError("At most 5 photos are allowed.")
        self.photo_keys = cleaned
        return self


class InspectionSubmitResponse(BaseModel):
    inspection_id: int
    assignment_status: str
    inspection_status: str
    message: str


class InspectionItem(BaseModel):
    inspection_id: int
    assignment_id: int
    building_code: str
    room_code: str
    submitted_at: datetime
    status: str
    lock_state: str
    clutter_state: str
    indicator_state: str
    asset_match_state: str
    photo_count: int
    photo_urls: list[str]


ReviewAction = Literal["approved", "rejected", "rectify_required"]


class PendingReviewInspectionItem(BaseModel):
    inspection_id: int
    assignment_id: int
    student_username: str
    building_code: str
    room_code: str
    submitted_at: datetime
    status: str
    lock_state: str
    clutter_state: str
    indicator_state: str
    asset_match_state: str
    remark_text: str | None
    photo_count: int
    photo_urls: list[str]


class ConsoleInspectionItem(BaseModel):
    inspection_id: int
    assignment_id: int
    student_username: str
    building_code: str
    room_code: str
    submitted_at: datetime
    reviewed_at: datetime | None
    status: str
    lock_state: str
    clutter_state: str
    indicator_state: str
    asset_match_state: str
    remark_text: str | None
    photo_count: int
    photo_urls: list[str]


class InspectionPhotoUploadResponse(BaseModel):
    object_key: str
    file_url: str


class InspectionDeleteResponse(BaseModel):
    inspection_id: int
    assignment_id: int
    assignment_status: str
    deleted_photo_count: int
    message: str


class InspectionReviewRequest(BaseModel):
    action: ReviewAction
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_reason_for_negative_actions(self) -> "InspectionReviewRequest":
        if self.action in {"rejected", "rectify_required"} and not (self.reason or "").strip():
            raise ValueError("Reason is required for rejected or rectify_required actions.")
        return self


class InspectionReviewResponse(BaseModel):
    inspection_id: int
    inspection_status: str
    assignment_status: str
    reviewed_by: str
    message: str

