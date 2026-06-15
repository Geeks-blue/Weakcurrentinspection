# 认证模块：登录、获取当前用户信息、注册账号、用户管理（CRUD）
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
    UpdateUserRequest,
    UserManageItem,
    UserProfile,
)

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """用户登录：验证账号密码，返回 JWT 访问令牌和用户信息。"""
    user = db.query(User).filter(User.username == payload.username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号不存在")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号已被停用，请联系管理员")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码错误")

    token = create_access_token(subject=user.username)
    return LoginResponse(
        access_token=token,
        user=UserProfile(id=user.id, username=user.username, role=user.role, gender=user.gender),
    )


@router.get("/me", response_model=UserProfile)
def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    """获取当前登录用户信息，用于前端恢复登录状态。"""
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
    """管理员创建新账号（学生/教师/运维/管理员）。学生账号必须指定性别。"""
    exists = db.query(User).filter(User.username == payload.username).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        gender=payload.gender,
        wechat_openid=payload.wechat_openid,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return RegisterUserResponse(
        message="User registered successfully",
        user=UserProfile(id=user.id, username=user.username, role=user.role, gender=user.gender),
    )


@router.get("/users", response_model=list[UserManageItem])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[UserManageItem]:
    """管理员查看所有用户列表（按 ID 升序）。"""
    users = db.query(User).order_by(User.id.asc()).all()
    return [
        UserManageItem(
            id=u.id,
            username=u.username,
            role=u.role,
            gender=u.gender,
            wechat_openid=u.wechat_openid,
            is_active=u.is_active,
        )
        for u in users
    ]


@router.put("/users/{user_id}", response_model=UserManageItem)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> UserManageItem:
    """管理员修改指定用户的角色/性别/状态/密码。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.role is not None:
        user.role = payload.role
    if payload.gender is not None or payload.role == "student":
        user.gender = payload.gender
    if "wechat_openid" in payload.model_fields_set:
        user.wechat_openid = (payload.wechat_openid or "").strip() or None
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.new_password:
        user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return UserManageItem(
        id=user.id,
        username=user.username,
        role=user.role,
        gender=user.gender,
        wechat_openid=user.wechat_openid,
        is_active=user.is_active,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> dict:
    """管理员删除指定用户（不能删除自己）。"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"ok": True, "deleted_id": user_id}

