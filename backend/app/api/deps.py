from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token, decode_member_token
from app.models.member import Member
from app.models.role import Role, RolePermission
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if token is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    # Eager-load role + role.permissions to avoid async MissingGreenlet errors.
    stmt = (
        select(User)
        .where(User.id == int(payload["sub"]))
        .options(selectinload(User.role).selectinload(Role.permissions))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    # Populate a convenience set of allowed module IDs for O(1) lookup.
    user.role_permissions = {rp.module for rp in user.role.permissions}
    return user


async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    """Any authenticated admin user (any role). Use for endpoints that just need auth
    without a specific module check (e.g., /me/permissions, /auth/logout)."""
    return user


def require_module(module: str):
    """Factory: returns a FastAPI dependency that checks the user's role has access
    to the given module. Replaces the old `get_current_admin` dependency.

    Usage:
        @router.post("/cables")
        async def create_cable(user: User = Depends(require_module("cables")), ...):
            ...
    """

    async def checker(user: User = Depends(get_current_user)) -> User:
        allowed = getattr(user, "role_permissions", None) or set()
        if module not in allowed:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": f"No access to module: {module}"},
            )
        return user

    return checker


async def get_current_member(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member:
    if token is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    payload = decode_member_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    member = await db.get(Member, int(payload["sub"]))
    if member is None or not member.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    return member
