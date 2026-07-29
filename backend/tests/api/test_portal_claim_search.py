"""Tests for the public portal claim search endpoint (/api/portal/claim/search).

These endpoints are public (no auth) so prospective manufacturers can find
their brand before submitting a claim request.
"""
import pytest


@pytest.fixture(scope="module", autouse=True)
def _ensure_test_manufacturers():
    """Ensure test manufacturers exist for claim search/submit tests."""
    import asyncio
    from sqlalchemy import text
    from app.core.database import engine

    async def _setup():
        async with engine.begin() as conn:
            # Cable manufacturer (manufacturers table — no sort_order column)
            await conn.execute(text(
                "INSERT INTO manufacturers (id, name, slug, created_at, updated_at) "
                "VALUES ('mfr-claim-test', 'Claim Test Cable Co', 'claim-test-cable-co', NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))
            # Equipment manufacturer (equipment_manufacturers table)
            await conn.execute(text(
                "INSERT INTO equipment_manufacturers (id, name, slug, sort_order, created_at, updated_at) "
                "VALUES ('em-claim-test', 'Claim Test Equipment Co', 'claim-test-equipment-co', 0, NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))

    asyncio.run(_setup())


def test_search_matching_cable_manufacturer(client):
    """Searching for the cable manufacturer name returns it with type='cable'."""
    res = client.get("/api/portal/claim/search", params={"q": "Claim Test Cable"})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    match = next((r for r in data if r["id"] == "mfr-claim-test"), None)
    assert match is not None, "Cable manufacturer not found in search results"
    assert match["type"] == "cable"
    assert match["name"] == "Claim Test Cable Co"


def test_search_matching_equipment_manufacturer(client):
    """Searching for the equipment manufacturer name returns it with type='equipment'."""
    res = client.get("/api/portal/claim/search", params={"q": "Claim Test Equipment"})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    match = next((r for r in data if r["id"] == "em-claim-test"), None)
    assert match is not None, "Equipment manufacturer not found in search results"
    assert match["type"] == "equipment"
    assert match["name"] == "Claim Test Equipment Co"


def test_search_returns_both_types(client):
    """A broad query matching both manufacturers returns cable and equipment entries."""
    res = client.get("/api/portal/claim/search", params={"q": "Claim Test"})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    ids = {r["id"] for r in data}
    assert "mfr-claim-test" in ids, "Cable manufacturer missing from results"
    assert "em-claim-test" in ids, "Equipment manufacturer missing from results"


def test_search_empty_query_returns_empty_list(client):
    """An empty query returns an empty list (no search performed)."""
    res = client.get("/api/portal/claim/search", params={"q": ""})
    assert res.status_code == 200
    data = res.json()
    assert data == []


def test_search_no_auth_required(client):
    """The search endpoint is public; calling it without auth returns 200, not 401."""
    res = client.get("/api/portal/claim/search", params={"q": "Claim Test"})
    assert res.status_code == 200
    assert res.status_code != 401
