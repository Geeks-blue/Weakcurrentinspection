# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from pydantic import BaseModel, Field, HttpUrl


class AiProxyChatRequest(BaseModel):
    endpoint: HttpUrl
    api_key: str | None = Field(default=None)
    model: str = Field(..., min_length=1, max_length=128)
    system_prompt: str = Field(default="")
    user_prompt: str = Field(..., min_length=1)
    temperature: float = Field(default=0.2, ge=0, le=2)


class AiProxyChatResponse(BaseModel):
    provider_status: int
    text: str
    raw: dict | list | str

