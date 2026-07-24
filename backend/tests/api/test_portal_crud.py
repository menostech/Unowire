"""Unit tests for portal-facing CRUD extensions."""
import asyncio
import pytest
from datetime import datetime

from app.core.database import async_session
from app.crud.cable import crud_cable
from app.crud.equipment import crud_equipment
from app.crud.inquiry import crud_inquiry


def test_cable_list_by_manufacturer_returns_only_scope_cables():
    """list_by_manufacturer returns cables where cable.manufacturer_id == scope_id."""
    async def _run():
        async with async_session() as db:
            cables = await crud_cable.list_by_manufacturer(db, scope_id="mfr-1", skip=0, limit=20)
            # All returned cables should have manufacturer_id == "mfr-1" (direct FK)
            for c in cables:
                assert c.manufacturer_id == "mfr-1"
    asyncio.run(_run())


def test_cable_count_by_manufacturer():
    """count_by_manufacturer returns int."""
    async def _run():
        async with async_session() as db:
            count = await crud_cable.count_by_manufacturer(db, scope_id="mfr-1")
            assert isinstance(count, int)
            assert count >= 0
    asyncio.run(_run())


def test_equipment_list_by_manufacturer():
    async def _run():
        async with async_session() as db:
            equipment = await crud_equipment.list_by_manufacturer(db, scope_id="em-1", skip=0, limit=20)
            for e in equipment:
                assert e.manufacturer_id == "em-1"
    asyncio.run(_run())


def test_inquiry_count_for_staff():
    async def _run():
        async with async_session() as db:
            count = await crud_inquiry.count_for_staff(db, scope_type="manufacturer", scope_id="mfr-1")
            assert isinstance(count, int)
    asyncio.run(_run())


def test_inquiry_recent_for_staff_returns_max_5():
    async def _run():
        async with async_session() as db:
            recent = await crud_inquiry.recent_for_staff(db, scope_type="manufacturer", scope_id="mfr-1", limit=5)
            assert len(recent) <= 5
            # Should be ordered by created_at DESC
            for i in range(1, len(recent)):
                assert recent[i-1].created_at >= recent[i].created_at
    asyncio.run(_run())


def test_inquiry_daily_trend_for_staff_returns_30_days():
    async def _run():
        async with async_session() as db:
            trend = await crud_inquiry.daily_trend_for_staff(db, scope_type="manufacturer", scope_id="mfr-1", days=30)
            assert len(trend) == 30
            assert all("date" in d and "count" in d for d in trend)
    asyncio.run(_run())
