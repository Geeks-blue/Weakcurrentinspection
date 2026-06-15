# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class UserProfile(BaseModel):
    id: int
    username: str
    role: str
    gender: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


UserRole = Literal["student", "teacher", "maintainer", "admin"]
UserGender = Literal["male", "female"]


class RegisterUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole
    gender: UserGender | None = None
    wechat_openid: str | None = Field(default=None, max_length=128)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_gender_for_student(self) -> "RegisterUserRequest":
        # 学生账号必须指定性别，以便执行女寝访问策略。
        if self.role == "student" and self.gender is None:
            raise ValueError("Student role requires gender")
        if self.role != "student":
            self.gender = None
        self.wechat_openid = (self.wechat_openid or "").strip() or None
        return self


class RegisterUserResponse(BaseModel):
    message: str
    user: UserProfile


class UserManageItem(BaseModel):
    id: int
    username: str
    role: str
    gender: str | None
    wechat_openid: str | None
    is_active: bool


class UpdateUserRequest(BaseModel):
    role: UserRole | None = None
    gender: UserGender | None = None
    wechat_openid: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=6, max_length=128)

