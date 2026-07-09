import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.crud.base import CRUDBase
from app.models.inquiry import Inquiry
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

    # === Admin methods ===

    async def list_with_filters(
        self,
        db: AsyncSession,
        q: str | None = None,
        is_verified: bool | None = None,
        is_active: bool | None = None,
    ) -> list[Member]:
        """List members with optional search and filters."""
        stmt = select(Member).order_by(Member.created_at.desc())
        if q:
            pattern = f"%{q}%"
            stmt = stmt.where(
                (Member.email.ilike(pattern)) | (Member.name.ilike(pattern))
            )
        if is_verified is not None:
            stmt = stmt.where(Member.is_verified == is_verified)
        if is_active is not None:
            stmt = stmt.where(Member.is_active == is_active)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count_inquiries(self, db: AsyncSession, member_id: int) -> int:
        """Count inquiries sent by a member."""
        result = await db.execute(
            select(func.count(Inquiry.id)).where(Inquiry.sender_id == member_id)
        )
        return int(result.scalar() or 0)

    async def has_inquiries(self, db: AsyncSession, member_id: int) -> bool:
        """Check if a member has any inquiries (used for delete protection)."""
        result = await db.execute(
            select(func.count(Inquiry.id)).where(Inquiry.sender_id == member_id)
        )
        return int(result.scalar() or 0) > 0

    async def set_active(
        self, db: AsyncSession, member: Member, is_active: bool
    ) -> Member:
        member.is_active = is_active
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member

    async def set_verified(self, db: AsyncSession, member: Member) -> Member:
        """Manually mark a member as verified and clear the verification token."""
        member.is_verified = True
        member.verification_token = None
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member

    async def update_profile(
        self, db: AsyncSession, member: Member, *, name: str, company: str | None, phone: str | None
    ) -> Member:
        """Update editable member fields (email is immutable)."""
        member.name = name
        member.company = company
        member.phone = phone
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member


crud_member = CRUDMember(Member)
