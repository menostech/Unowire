from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.system_message import SystemMessage, SystemMessageRead
from app.models.user import User
from app.schemas.system_message import MessageCreate


class CRUDSystemMessage(
    CRUDBase[SystemMessage, MessageCreate, MessageCreate]
):
    async def list_for_admin(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, str | None]], int]:
        """Return (items, total) where items are (message, publisher_email) tuples."""
        # Total count
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage)
        )
        total = total_result.scalar() or 0

        # Paginated items with publisher email
        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, User.email)
            .outerjoin(User, SystemMessage.created_by == User.id)
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1]) for row in result.all()]
        return items, total

    async def get_for_admin(
        self, db: AsyncSession, message_id: int
    ) -> tuple[SystemMessage, str | None] | None:
        stmt = (
            select(SystemMessage, User.email)
            .outerjoin(User, SystemMessage.created_by == User.id)
            .where(SystemMessage.id == message_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1])

    async def create_message(
        self, db: AsyncSession, *, obj_in: MessageCreate, created_by: int
    ) -> SystemMessage:
        data = obj_in.model_dump()
        # Convert RecipientTarget Pydantic objects to plain dicts for JSONB storage.
        # model_dump() already produces dicts, but we ensure value is string (enforced
        # by RecipientTarget.stringify_value validator).
        db_obj = SystemMessage(created_by=created_by, **data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete_message(self, db: AsyncSession, message_id: int) -> bool:
        msg = await self.get(db, message_id)
        if msg is None:
            return False
        await db.delete(msg)
        await db.commit()
        return True

    async def list_for_member(
        self,
        db: AsyncSession,
        *,
        member_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, bool]], int]:
        """Return (items, total) where items are (message, is_read) tuples."""
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage)
        )
        total = total_result.scalar() or 0

        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, SystemMessageRead.member_id)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1] is not None) for row in result.all()]
        return items, total

    async def unread_count_for_member(
        self, db: AsyncSession, member_id: int
    ) -> int:
        """Count messages where no read row exists for this member."""
        stmt = (
            select(func.count())
            .select_from(SystemMessage)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .where(SystemMessageRead.member_id.is_(None))
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def get_for_member(
        self, db: AsyncSession, *, member_id: int, message_id: int
    ) -> tuple[SystemMessage, bool] | None:
        """Get a message for a member. Returns (message, is_read) or None."""
        stmt = (
            select(SystemMessage, SystemMessageRead.member_id)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .where(SystemMessage.id == message_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1] is not None)

    async def mark_read(
        self, db: AsyncSession, *, member_id: int, message_id: int
    ) -> None:
        """Idempotently mark a message as read by a member."""
        stmt = pg_insert(SystemMessageRead).values(
            member_id=member_id,
            message_id=message_id,
            read_at=datetime.utcnow(),
        ).on_conflict_do_nothing(
            index_elements=["member_id", "message_id"],
        )
        await db.execute(stmt)
        await db.commit()


crud_system_message = CRUDSystemMessage(SystemMessage)
