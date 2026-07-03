from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
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
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Not authenticated"})
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> dict:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail={"code": 403, "message": "Admin privileges required"})
    return {"id": user.id, "email": user.email, "role": user.role}
