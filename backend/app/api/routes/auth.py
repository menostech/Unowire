import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_login_attempts: dict[str, list[float]] = {}

RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX = 10


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"

    # Rate limit check
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if time.time() - t < RATE_LIMIT_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= RATE_LIMIT_MAX:
        return JSONResponse(
            status_code=429,
            content={"code": 429, "message": "Too many login attempts"},
        )

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        _login_attempts.setdefault(ip, []).append(time.time())
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Invalid email or password"})

    token = create_access_token(user.id, user.email, user.role_id)
    _login_attempts.pop(ip, None)

    response = JSONResponse(
        content={"user": {"id": user.id, "email": user.email, "role": user.role_id}, "token": token}
    )
    response.set_cookie(
        "admin_token",
        token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=28800,
        path="/",
    )
    return response


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.set_cookie("admin_token", "", max_age=0, path="/")
    return response


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
    }


@router.get("/me/permissions")
async def my_permissions(user: User = Depends(get_current_user)):
    """Return the current user's role + allowed modules. Used by frontend sidebar."""
    return {
        "user_id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
        "allowed_modules": sorted(getattr(user, "role_permissions", set())),
    }
