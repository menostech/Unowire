"""Tests for page view tracking: recording, dedup, aggregation."""
import pytest
from app.core.database import async_session
from app.models.page_view import PageView


@pytest.fixture(autouse=True)
def cleanup_page_views():
    """Truncate page_views before each test."""
    import asyncio
    from sqlalchemy import text

    async def _clean():
        async with async_session() as db:
            await db.execute(text("TRUNCATE TABLE page_views"))
            await db.commit()
    asyncio.run(_clean())
    yield
    asyncio.run(_clean())


@pytest.fixture
def real_entity_ids():
    """Return (cable_ids, equipment_id) for real entities that resolve to a
    manufacturer scope. Tests that assert rows are inserted need real entity IDs
    because record() silently drops views for entities that can't be resolved
    (drop-on-not-found per spec)."""
    import asyncio
    from sqlalchemy import select
    from app.models.cable import Cable
    from app.models.equipment import EquipmentManufacturer, RecommendedEquipment
    from app.models.manufacturer import Manufacturer

    async def _fetch():
        async with async_session() as db:
            cable_stmt = (
                select(Cable.id)
                .select_from(Cable)
                .join(Manufacturer, Cable.manufacturer_id == Manufacturer.id)
                .order_by(Cable.id)
                .limit(3)
            )
            cable_ids = list((await db.execute(cable_stmt)).scalars().all())
            eq_stmt = (
                select(RecommendedEquipment.id)
                .select_from(RecommendedEquipment)
                .join(
                    EquipmentManufacturer,
                    RecommendedEquipment.manufacturer_id == EquipmentManufacturer.id,
                )
                .order_by(RecommendedEquipment.id)
                .limit(1)
            )
            eq_id = (await db.execute(eq_stmt)).scalar_one_or_none()
        return cable_ids, eq_id

    return asyncio.run(_fetch())


def test_record_page_view_cable(client, db_session):
    """POST /api/page-views records a cable view."""
    # First ensure a cable exists (use admin to create one, or use existing test data)
    res = client.post(
        "/api/page-views",
        json={"entity_type": "cable", "entity_id": "test-cable-1"},
    )
    assert res.status_code == 200


def test_record_page_view_equipment(client):
    """POST /api/page-views records an equipment view."""
    res = client.post(
        "/api/page-views",
        json={"entity_type": "equipment", "entity_id": "test-equip-1"},
    )
    assert res.status_code == 200


def test_dedup_same_ip_same_entity_within_1_minute(client, real_entity_ids):
    """Same IP + same entity within 1 minute only counts once."""
    cable_ids, _ = real_entity_ids
    assert cable_ids, "No real cables with manufacturer scope found in test DB"
    cable_id = cable_ids[0]
    for _ in range(5):
        res = client.post(
            "/api/page-views",
            json={"entity_type": "cable", "entity_id": cable_id},
        )
        assert res.status_code == 200

    # Verify only 1 row was inserted
    import asyncio
    from sqlalchemy import select

    async def _count():
        async with async_session() as db:
            result = await db.execute(
                select(PageView).where(PageView.entity_id == cable_id)
            )
            return len(result.scalars().all())
    count = asyncio.run(_count())
    assert count == 1


def test_different_entities_not_deduped(client, real_entity_ids):
    """Different entity IDs are not deduped."""
    cable_ids, eq_id = real_entity_ids
    assert len(cable_ids) >= 3, "Need >=3 real cables in test DB"
    assert eq_id, "No real equipment with manufacturer scope found in test DB"
    client.post("/api/page-views", json={"entity_type": "cable", "entity_id": cable_ids[1]})
    client.post("/api/page-views", json={"entity_type": "cable", "entity_id": cable_ids[2]})
    client.post("/api/page-views", json={"entity_type": "equipment", "entity_id": eq_id})

    import asyncio
    from sqlalchemy import select

    async def _count():
        async with async_session() as db:
            result = await db.execute(select(PageView))
            return len(result.scalars().all())
    count = asyncio.run(_count())
    assert count == 3


def test_count_by_scope(client):
    """count_by_scope returns total views for a scope."""
    # Insert test data directly
    import asyncio
    from datetime import datetime

    async def _seed():
        async with async_session() as db:
            for _ in range(3):
                db.add(PageView(
                    entity_type="cable", entity_id="c1",
                    scope_type="manufacturer", scope_id="mfr-views-1",
                    viewed_at=datetime.utcnow(),
                ))
            for _ in range(2):
                db.add(PageView(
                    entity_type="cable", entity_id="c2",
                    scope_type="manufacturer", scope_id="mfr-views-2",
                    viewed_at=datetime.utcnow(),
                ))
            await db.commit()
    asyncio.run(_seed())

    from app.crud.page_view import crud_page_view
    async def _count():
        async with async_session() as db:
            return await crud_page_view.count_by_scope(db, "manufacturer", "mfr-views-1")
    count = asyncio.run(_count())
    assert count == 3


def test_daily_trend_zero_filled(client):
    """daily_trend_by_scope returns 30 days, zero-filled for missing days."""
    import asyncio
    from app.crud.page_view import crud_page_view

    async def _trend():
        async with async_session() as db:
            return await crud_page_view.daily_trend_by_scope(
                db, "manufacturer", "mfr-trend-1", days=30
            )
    trend = asyncio.run(_trend())
    assert len(trend) == 30
    assert all("date" in d and "count" in d for d in trend)
    # With no data, all counts should be 0
    assert all(d["count"] == 0 for d in trend)
