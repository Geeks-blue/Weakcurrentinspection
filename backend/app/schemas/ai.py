# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class AiProxyChatRequest(BaseModel):
    endpoint: HttpUrl
    api_key: str | None = Field(default=None)
    model: str = Field(..., min_length=1, max_length=128)
    system_prompt: str = Field(default="")
    user_prompt: str = Field(default="")
    temperature: float = Field(default=0.2, ge=0, le=2)
    images: list[str] = Field(default_factory=list)
    messages: list[dict[str, Any]] | None = Field(default=None)


class AiProxyChatResponse(BaseModel):
    provider_status: int
    text: str
    raw: dict | list | str

