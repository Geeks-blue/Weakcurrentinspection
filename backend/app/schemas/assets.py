# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from datetime import datetime

from pydantic import BaseModel


class AssetRoomItem(BaseModel):
    room_id: int
    building_code: str
    building_name: str
    room_code: str
    floor_label: str | None
    location_text: str | None
    is_active: bool
    gender_restriction: str


class AssetRoomCreate(BaseModel):
    building_code: str
    room_code: str
    floor_label: str | None = None
    location_text: str | None = None
    is_active: bool = True
    gender_restriction: str = "none"


class AssetItemView(BaseModel):
    asset_id: int
    asset_code: str
    asset_name: str
    asset_category: str
    building_code: str
    room_code: str
    quantity: int
    status: str
    manufacturer: str | None
    model: str | None
    note: str | None
    updated_at: datetime
    photo_url: str | None = None


class ImportSummary(BaseModel):
    total_rows: int
    created_count: int
    updated_count: int
    skipped_count: int
    errors: list[str]
