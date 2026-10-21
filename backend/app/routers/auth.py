from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, get_password_hash, verify_password
from ..database import get_db
from ..models.user import User

auth_router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    created_at: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@auth_router.post("/register", response_model=TokenResponse, summary="Регистрация нового пользователя")
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    username = request.username.strip()
    email = str(request.email).strip().lower()

    if db.query(User).filter(func.lower(User.username) == username.lower()).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Пользователь с такой почтой уже существует")

    user = User(
        username=username,
        email=email,
        password_hash=get_password_hash(request.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "email": user.email}
    )
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(user))


@auth_router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    identity = form_data.username.strip()
    user = db.query(User).filter(
        or_(
            func.lower(User.username) == identity.lower(),
            func.lower(User.email) == identity.lower(),
        )
    ).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
        )

    token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "email": user.email}
    )
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(user))


@auth_router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)


@auth_router.patch("/me", response_model=UserResponse, summary="Обновить профиль")
async def update_current_user_info(
    request: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.username is None and request.email is None:
        raise HTTPException(status_code=400, detail="Нет данных для обновления")

    if request.username is not None:
        username = request.username.strip()
        duplicate = db.query(User).filter(
            User.id != current_user.id,
            func.lower(User.username) == username.lower(),
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")
        current_user.username = username

    if request.email is not None:
        email = str(request.email).strip().lower()
        duplicate = db.query(User).filter(
            User.id != current_user.id,
            func.lower(User.email) == email,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Пользователь с такой почтой уже существует")
        current_user.email = email

    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user)


@auth_router.get("/users", summary="Поиск пользователей для приглашения")
async def search_users(
    query: str = Query(..., min_length=2, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pattern = f"%{query.strip().lower()}%"
    users = db.query(User).filter(
        User.id != current_user.id,
        or_(
            func.lower(User.username).like(pattern),
            func.lower(User.email).like(pattern),
        ),
    ).order_by(User.username).limit(10).all()
    return {
        "users": [
            {"id": str(user.id), "username": user.username, "email": user.email}
            for user in users
        ]
    }
