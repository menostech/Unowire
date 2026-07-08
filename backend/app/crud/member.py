import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.crud.base import CRUDBase
from app.models.member import Member
from app.schemas.member import MemberRegister, MemberUpdate


class CRUDMember(CRUDBase[Member, MemberRegister, MemberUpdate]):
    async def get_by_email(self, db: AsyncSession, email: str) -> Member | None:
        result = await db.execute(select(Member).where(Member.email == email))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: MemberRegister) -> Member:
        """Override to hash password and set defaults."""
        data = obj_in.model_dump()
        password = data.pop("password")
        db_obj = Member(
            email=data["email"],
            password_hash=hash_password(password),
            name=data["name"],
            company=data.get("company"),
            phone=data.get("phone"),
            is_active=True,
            is_verified=False,
            verification_token=secrets.token_urlsafe(32),
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_member = CRUDMember(Member)
