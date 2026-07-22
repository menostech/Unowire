"""Portal me routes: view profile + change password."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_factory_user
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.models.user import User

router = APIRouter(prefix="/api/portal/me", tags=["portal-me"])


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.get("")
async def get_me(user: User = Depends(get_current_factory_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": user.role.name if user.role else None,
        "scope_type": user.role.scope_type if user.role else None,
        "scope_id": user.scope_id,
    }


@router.put("")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_factory_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Current password is incorrect"})
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Password must be at least 8 characters"})
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    await db.commit()
    return {"ok": True}
