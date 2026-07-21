"""Tests for page view tracking: recording, dedup, aggregation."""
import time
from datetime import datetime, timedelta

import pytest
from app.core.database import async_session
from app.models.page_view import PageView
from sqlalchemy import delete


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


def test_dedup_same_ip_same_entity_within_1_minute(client):
    """Same IP + same entity within 1 minute only counts once."""
    for _ in range(5):
        res = client.post(
            "/api/page-views",
            json={"entity_type": "cable", "entity_id": "dedup-cable"},
        )
        assert res.status_code == 200

    # Verify only 1 row was inserted
    import asyncio
    from sqlalchemy import select

    async def _count():
        async with async_session() as db:
            result = await db.execute(
                select(PageView).where(PageView.entity_id == "dedup-cable")
            )
            return len(result.scalars().all())
    count = asyncio.run(_count())
    assert count == 1


def test_different_entities_not_deduped(client):
    """Different entity IDs are not deduped."""
    client.post("/api/page-views", json={"entity_type": "cable", "entity_id": "cable-A"})
    client.post("/api/page-views", json={"entity_type": "cable", "entity_id": "cable-B"})
    client.post("/api/page-views", json={"entity_type": "equipment", "entity_id": "equip-A"})

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
