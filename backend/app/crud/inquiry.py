from datetime import datetime

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.inquiry import Inquiry
from app.schemas.inquiry import InquiryCreate, InquiryReply


class CRUDInquiry(CRUDBase[Inquiry, InquiryCreate, InquiryReply]):
    async def create_for_member(
        self, db: AsyncSession, *, obj_in: InquiryCreate, sender_id: int
    ) -> Inquiry:
        data = obj_in.model_dump()
        db_obj = Inquiry(sender_id=sender_id, **data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def list_by_member(
        self, db: AsyncSession, member_id: int
    ) -> list[Inquiry]:
        result = await db.execute(
            select(Inquiry)
            .where(Inquiry.sender_id == member_id)
            .order_by(Inquiry.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_for_staff(
        self,
        db: AsyncSession,
        *,
        scope_type: str | None,
        scope_id: str | None,
    ) -> list[Inquiry]:
        """List inquiries filtered by staff scope."""
        stmt = select(Inquiry).order_by(Inquiry.created_at.desc())
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "equipment_manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        # else: admin/global — no scope filter
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def unread_count_for_staff(
        self, db: AsyncSession, scope_type: str | None, scope_id: str | None
    ) -> int:
        stmt = select(func.count()).select_from(Inquiry).where(Inquiry.is_read == False)
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "equipment_manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def unread_count_for_member(
        self, db: AsyncSession, member_id: int
    ) -> int:
        """Count inquiries with replies that the member hasn't read."""
        result = await db.execute(
            select(func.count())
            .select_from(Inquiry)
            .where(
                and_(
                    Inquiry.sender_id == member_id,
                    Inquiry.reply_body.isnot(None),
                    Inquiry.is_member_read == False,
                )
            )
        )
        return result.scalar() or 0

    async def mark_read_for_staff(self, db: AsyncSession, inquiry: Inquiry) -> Inquiry:
        inquiry.is_read = True
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry

    async def mark_read_for_member(self, db: AsyncSession, inquiry: Inquiry) -> Inquiry:
        inquiry.is_member_read = True
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry

    async def reply(
        self,
        db: AsyncSession,
        inquiry: Inquiry,
        *,
        reply_body: str,
        replied_by: int,
    ) -> Inquiry:
        inquiry.reply_body = reply_body
        inquiry.replied_at = datetime.utcnow()
        inquiry.replied_by = replied_by
        inquiry.is_member_read = False
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry


crud_inquiry = CRUDInquiry(Inquiry)
