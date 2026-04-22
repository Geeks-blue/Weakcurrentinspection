# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.deps import get_current_user, get_db, require_admin
from app.models.entities import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterUserRequest,
    RegisterUserResponse,
    UserProfile,
)

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.query(User).filter(User.username == payload.username, User.is_active.is_(True)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=user.username)
    return LoginResponse(
        access_token=token,
        user=UserProfile(id=user.id, username=user.username, role=user.role, gender=user.gender),
    )


@router.get("/me", response_model=UserProfile)
def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        gender=current_user.gender,
    )


@router.post("/register", response_model=RegisterUserResponse)
def register_user(
    payload: RegisterUserRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> RegisterUserResponse:
    # 管理员注册：用于创建教师/学生/运维/管理员账号。
    exists = db.query(User).filter(User.username == payload.username).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        gender=payload.gender,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return RegisterUserResponse(
        message="User registered successfully",
        user=UserProfile(id=user.id, username=user.username, role=user.role, gender=user.gender),
    )

