import asyncio
from datetime import datetime

from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.member import Member
from app.models.role import Role
from app.models.system_message import SystemMessage, SystemMessageRead, SystemMessageUserRead
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

    async def list_recipients_by_group(
        self, db: AsyncSession
    ) -> tuple[list[tuple[int, str, str | None]], list[tuple[int, str, str | None]], list[tuple[int, str, str | None]]]:
        """Return (cable_managers, equipment_managers, members) recipient lists.
        Each list contains (id, email, name) tuples.
        - cable_managers: Users with role.scope_type='manufacturer'
        - equipment_managers: Users with role.scope_type='equipment_manufacturer'
        - members: all Members
        """
        cable_stmt = (
            select(User.id, User.email)
            .join(Role, User.role_id == Role.id)
            .where(Role.scope_type == "manufacturer")
            .order_by(User.email)
        )
        equip_stmt = (
            select(User.id, User.email)
            .join(Role, User.role_id == Role.id)
            .where(Role.scope_type == "equipment_manufacturer")
            .order_by(User.email)
        )
        member_stmt = (
            select(Member.id, Member.email, Member.name)
            .order_by(Member.email)
        )

        cable_result, equip_result, member_result = await asyncio.gather(
            db.execute(cable_stmt),
            db.execute(equip_stmt),
            db.execute(member_stmt),
        )

        cable_managers = [(r[0], r[1], None) for r in cable_result.all()]
        equipment_managers = [(r[0], r[1], None) for r in equip_result.all()]
        members = [(r[0], r[1], r[2]) for r in member_result.all()]
        return cable_managers, equipment_managers, members

    async def list_for_staff_user(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        scope_type: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, bool]], int]:
        """List targeted messages visible to a staff user.
        Visible if recipient_type='targeted' AND any target matches:
        - kind='group' + value=<group_for_scope> where group_for_scope is
          'cable_managers' for scope_type='manufacturer',
          'equipment_managers' for scope_type='equipment_manufacturer'
        - kind='user' + value=str(user_id)
        Broadcast messages are excluded (member-only).
        """
        group_value = (
            "cable_managers" if scope_type == "manufacturer"
            else "equipment_managers" if scope_type == "equipment_manufacturer"
            else None
        )

        conditions = []
        if group_value is not None:
            group_filter = cast(
                [{"kind": "group", "value": group_value}],
                JSONB,
            )
            conditions.append(SystemMessage.recipient_targets.op("@>")(group_filter))
        # Individual user target — value stored as string in JSONB
        user_filter = cast(
            [{"kind": "user", "value": str(user_id)}],
            JSONB,
        )
        conditions.append(SystemMessage.recipient_targets.op("@>")(user_filter))

        base_filter = and_(
            SystemMessage.recipient_type == "targeted",
            or_(*conditions),
        )

        # Total count
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage).where(base_filter)
        )
        total = total_result.scalar() or 0

        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, SystemMessageUserRead.user_id)
            .outerjoin(
                SystemMessageUserRead,
                and_(
                    SystemMessageUserRead.message_id == SystemMessage.id,
                    SystemMessageUserRead.user_id == user_id,
                ),
            )
            .where(base_filter)
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1] is not None) for row in result.all()]
        return items, total

    async def get_for_staff_user(
        self, db: AsyncSession, *, user_id: int, scope_type: str, message_id: int
    ) -> tuple[SystemMessage, bool] | None:
        """Get a single message for a staff user. Returns (message, is_read) or None
        if the message does not exist or is not targeted to the caller."""
        group_value = (
            "cable_managers" if scope_type == "manufacturer"
            else "equipment_managers" if scope_type == "equipment_manufacturer"
            else None
        )

        conditions = []
        if group_value is not None:
            group_filter = cast(
                [{"kind": "group", "value": group_value}],
                JSONB,
            )
            conditions.append(SystemMessage.recipient_targets.op("@>")(group_filter))
        user_filter = cast(
            [{"kind": "user", "value": str(user_id)}],
            JSONB,
        )
        conditions.append(SystemMessage.recipient_targets.op("@>")(user_filter))

        stmt = (
            select(SystemMessage, SystemMessageUserRead.user_id)
            .outerjoin(
                SystemMessageUserRead,
                and_(
                    SystemMessageUserRead.message_id == SystemMessage.id,
                    SystemMessageUserRead.user_id == user_id,
                ),
            )
            .where(
                and_(
                    SystemMessage.id == message_id,
                    SystemMessage.recipient_type == "targeted",
                    or_(*conditions),
                ),
            )
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1] is not None)

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
