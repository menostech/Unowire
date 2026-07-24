"""Portal auth routes for factory users (cable manufacturers + equipment manufacturers)."""
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_factory_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.role import Role
from app.models.user import User

router = APIRouter(prefix="/api/portal/auth", tags=["portal-auth"])

# Independent rate limit counter for portal login (stricter: 5 attempts per 5 minutes)
_portal_login_attempts: dict[str, list[float]] = {}

PORTAL_RATE_LIMIT_WINDOW = 300  # 5 minutes
PORTAL_RATE_LIMIT_MAX = 5


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def portal_login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"

    # Rate limit check
    attempts = _portal_login_attempts.get(ip, [])
    attempts = [t for t in attempts if time.time() - t < PORTAL_RATE_LIMIT_WINDOW]
    _portal_login_attempts[ip] = attempts
    if len(attempts) >= PORTAL_RATE_LIMIT_MAX:
        return JSONResponse(
            status_code=429,
            content={"code": 429, "message": "Too many login attempts"},
        )

    stmt = (
        select(User)
        .where(User.email == body.email)
        .options(selectinload(User.role).selectinload(Role.permissions))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash) or not user.is_active:
        _portal_login_attempts.setdefault(ip, []).append(time.time())
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Invalid email or password"})

    # Cross-protection: reject operators (scope_type is None)
    if user.role is None or user.role.scope_type is None:
        raise HTTPException(
            status_code=403,
            detail={"code": 403, "message": "Use /admin/login"},
        )

    token = create_access_token(user.id, user.email, user.role_id, token_type="portal")
    _portal_login_attempts.pop(ip, None)

    response = JSONResponse(
        content={"user": {"id": user.id, "email": user.email, "role": user.role_id}, "token": token}
    )
    response.set_cookie(
        "portal_token",
        token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=14400,  # 4 hours (shorter than admin's 8h)
        path="/",
    )
    return response


@router.post("/logout")
async def portal_logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.set_cookie("portal_token", "", max_age=0, path="/")
    return response


@router.get("/me")
async def portal_me(user: User = Depends(get_current_factory_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
    }


@router.get("/me/permissions")
async def portal_my_permissions(user: User = Depends(get_current_factory_user)):
    """Return the factory user's fixed allowed_modules (does not read role_permissions)."""
    from app.api.deps import _FACTORY_ALLOWED_BY_SCOPE
    scope_type = user.role.scope_type if user.role else None
    allowed = _FACTORY_ALLOWED_BY_SCOPE.get(scope_type, set())
    return {
        "user_id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": scope_type,
        "scope_id": user.scope_id,
        "allowed_modules": sorted(allowed),
    }
