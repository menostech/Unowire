from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token, decode_member_token, decode_portal_token
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


def require_operator(module: str):
    """Factory: like require_module, but also rejects factory users (scope_type != null).
    Use this for all /api/admin/* routes to prevent factory users from accessing
    operator-only endpoints even if their role_permissions are misconfigured."""

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role and user.role.scope_type is not None:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Operator access only"},
            )
        allowed = getattr(user, "role_permissions", None) or set()
        if module not in allowed:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": f"No access to module: {module}"},
            )
        return user

    return checker


async def get_current_factory_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validates portal_token (type='portal') + user has scope_type != null.
    Use for all /api/portal/* routes."""
    if token is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    payload = decode_portal_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    stmt = (
        select(User)
        .where(User.id == int(payload["sub"]))
        .options(selectinload(User.role).selectinload(Role.permissions))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    if user.role is None or user.role.scope_type is None or user.scope_id is None:
        raise HTTPException(status_code=403, detail={"code": 403, "message": "Not a factory user"})
    return user


# Fixed permission matrix for factory portal users. Ignores role_permissions —
# factory users see a curated feature set, even if an operator misconfigures
# their role permissions.
_FACTORY_ALLOWED_BY_SCOPE: dict[str, set[str]] = {
    "manufacturer": {"dashboard", "cables", "inquiries", "media", "me", "messages"},
    "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me", "messages"},
}


def require_factory_module(module: str):
    """Factory: returns a FastAPI dependency for portal routes. Validates portal
    token + factory user scope + module is in the fixed permission matrix for
    the user's scope_type."""

    async def checker(user: User = Depends(get_current_factory_user)) -> User:
        scope_type = user.role.scope_type if user.role else None
        allowed = _FACTORY_ALLOWED_BY_SCOPE.get(scope_type, set())
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


def get_media_scope(user: User = Depends(get_current_user)) -> tuple[str | None, str | None]:
    """Returns (scope_type, scope_id) for media filtering.

    - Global admin/role (scope_type=None): returns (None, None) -> sees all folders
    - Scoped role (manufacturer/equipment_manufacturer): returns (role.scope_type, user.scope_id)
    """
    if user.role and user.role.scope_type in ("manufacturer", "equipment_manufacturer"):
        return (user.role.scope_type, user.scope_id)
    return (None, None)
