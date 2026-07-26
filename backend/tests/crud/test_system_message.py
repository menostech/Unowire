"""Unit tests for system_message CRUD methods.

NOTE: pytest-asyncio is NOT installed in this project. We use synchronous test
functions that wrap async work in asyncio.run(), creating the DB session INSIDE
the asyncio.run() call (not from the db_session fixture) to avoid cross-event-
loop issues.
"""
import asyncio

from sqlalchemy import select

from app.core.database import async_session
from app.crud.system_message import crud_system_message
from app.models.system_message import SystemMessage, SystemMessageUserRead


def test_list_recipients_by_group_returns_three_lists():
    """list_recipients_by_group returns a 3-tuple of lists."""
    async def _do():
        async with async_session() as db:
            cable, equip, members = await crud_system_message.list_recipients_by_group(db)
            assert isinstance(cable, list)
            assert isinstance(equip, list)
            assert isinstance(members, list)
    asyncio.run(_do())


def test_mark_read_for_user_is_idempotent():
    """Calling mark_read_for_user twice does not duplicate the row."""
    async def _do():
        async with async_session() as db:
            # Create a test message
            msg = SystemMessage(
                title="Idempotency Test",
                body="Body",
                recipient_type="targeted",
                recipient_targets=[{"kind": "group", "value": "cable_managers"}],
            )
            db.add(msg)
            await db.commit()
            await db.refresh(msg)

            user_id = 1  # admin user (always exists)

            try:
                # First mark
                await crud_system_message.mark_read_for_user(
                    db, user_id=user_id, message_id=msg.id
                )
                # Second mark (idempotent)
                await crud_system_message.mark_read_for_user(
                    db, user_id=user_id, message_id=msg.id
                )

                # Verify only one row exists
                result = await db.execute(
                    select(SystemMessageUserRead).where(
                        SystemMessageUserRead.user_id == user_id,
                        SystemMessageUserRead.message_id == msg.id,
                    )
                )
                rows = result.all()
                assert len(rows) == 1
            finally:
                # Cleanup
                await db.delete(msg)
                await db.commit()
    asyncio.run(_do())


def test_list_for_staff_user_filters_by_scope():
    """list_for_staff_user returns only messages matching the caller's scope."""
    async def _do():
        async with async_session() as db:
            # Create a message targeted to cable_managers
            msg = SystemMessage(
                title="Cable Only",
                body="Body",
                recipient_type="targeted",
                recipient_targets=[{"kind": "group", "value": "cable_managers"}],
            )
            db.add(msg)
            # Create a message targeted to equipment_managers
            msg2 = SystemMessage(
                title="Equip Only",
                body="Body",
                recipient_type="targeted",
                recipient_targets=[{"kind": "group", "value": "equipment_managers"}],
            )
            db.add(msg2)
            await db.commit()
            await db.refresh(msg)
            await db.refresh(msg2)

            try:
                # Cable manager (scope_type='manufacturer') should see msg but not msg2
                items, total = await crud_system_message.list_for_staff_user(
                    db, user_id=99999, scope_type="manufacturer"
                )
                ids = [m.id for m, _ in items]
                assert msg.id in ids
                assert msg2.id not in ids
            finally:
                # Cleanup
                await db.delete(msg)
                await db.delete(msg2)
                await db.commit()
    asyncio.run(_do())
