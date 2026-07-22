from datetime import datetime, timedelta

from sqlalchemy import case, select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.crud.base import CRUDBase
from app.models.equipment import EquipmentManufacturer
from app.models.inquiry import Inquiry
from app.models.manufacturer import Manufacturer
from app.schemas.inquiry import InquiryCreate, InquiryReply


# Polymorphic recipient-name resolution: LEFT JOIN both manufacturer tables
# and select the name via a CASE expression based on recipient_type.
# If the manufacturer has been deleted, both joins miss and name is None.
_MfrAlias = aliased(Manufacturer)
_EquipMfrAlias = aliased(EquipmentManufacturer)

_RECIPIENT_NAME_EXPR = case(
    (Inquiry.recipient_type == "manufacturer", _MfrAlias.name),
    (Inquiry.recipient_type == "equipment_manufacturer", _EquipMfrAlias.name),
    else_=None,
)


def _with_recipient_joins(stmt):
    """Apply both polymorphic LEFT JOINs to a select statement on Inquiry."""
    return (
        stmt
        .outerjoin(
            _MfrAlias,
            and_(
                Inquiry.recipient_type == "manufacturer",
                Inquiry.recipient_id == _MfrAlias.id,
            ),
        )
        .outerjoin(
            _EquipMfrAlias,
            and_(
                Inquiry.recipient_type == "equipment_manufacturer",
                Inquiry.recipient_id == _EquipMfrAlias.id,
            ),
        )
    )


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

    async def get_with_recipient_name(
        self, db: AsyncSession, inquiry_id: int
    ) -> tuple[Inquiry, str | None] | None:
        """Fetch a single inquiry with its resolved recipient name.

        Returns (inquiry, recipient_name) or None if not found. If the
        manufacturer has been deleted, recipient_name is None.
        """
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR).where(Inquiry.id == inquiry_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return row[0], row[1]

    async def list_by_member(
        self, db: AsyncSession, member_id: int
    ) -> list[tuple[Inquiry, str | None]]:
        """List inquiries sent by a member, each with its resolved recipient name."""
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR)
            .where(Inquiry.sender_id == member_id)
            .order_by(Inquiry.created_at.desc())
        )
        result = await db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def list_for_staff(
        self,
        db: AsyncSession,
        *,
        scope_type: str | None,
        scope_id: str | None,
    ) -> list[tuple[Inquiry, str | None]]:
        """List inquiries filtered by staff scope, each with its resolved recipient name."""
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR).order_by(Inquiry.created_at.desc())
        )
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
        return [(row[0], row[1]) for row in result.all()]

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

    async def count_for_staff(
        self, db: AsyncSession, scope_type: str | None, scope_id: str | None
    ) -> int:
        """Count inquiries filtered by staff scope."""
        stmt = select(func.count()).select_from(Inquiry)
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "manufacturer", Inquiry.recipient_id == scope_id)
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "equipment_manufacturer", Inquiry.recipient_id == scope_id)
            )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def recent_for_staff(
        self,
        db: AsyncSession,
        scope_type: str | None,
        scope_id: str | None,
        limit: int = 5,
    ) -> list[Inquiry]:
        """Return recent inquiries for portal dashboard, ordered by created_at DESC."""
        stmt = select(Inquiry).order_by(Inquiry.created_at.desc()).limit(limit)
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "manufacturer", Inquiry.recipient_id == scope_id)
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "equipment_manufacturer", Inquiry.recipient_id == scope_id)
            )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def daily_trend_for_staff(
        self,
        db: AsyncSession,
        scope_type: str | None,
        scope_id: str | None,
        days: int = 30,
    ) -> list[dict]:
        """Return daily inquiry counts for the last N days, zero-filled."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(
                func.date(Inquiry.created_at).label("date"),
                func.count().label("count"),
            )
            .where(Inquiry.created_at >= cutoff)
            .group_by(func.date(Inquiry.created_at))
            .order_by(func.date(Inquiry.created_at))
        )
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "manufacturer", Inquiry.recipient_id == scope_id)
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(Inquiry.recipient_type == "equipment_manufacturer", Inquiry.recipient_id == scope_id)
            )
        result = await db.execute(stmt)
        rows = {str(row.date): row.count for row in result.all()}

        trend = []
        today = datetime.utcnow().date()
        for i in range(days - 1, -1, -1):
            day = today - timedelta(days=i)
            day_str = day.isoformat()
            trend.append({"date": day_str, "count": rows.get(day_str, 0)})
        return trend


crud_inquiry = CRUDInquiry(Inquiry)
