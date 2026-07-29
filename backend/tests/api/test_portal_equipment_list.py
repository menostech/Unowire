"""Tests for portal equipment list endpoint: search, category filter, pagination, backward-compat."""
import uuid

import pytest


@pytest.fixture
def _ensure_em(client, equipment_manager_headers):
    """Ensure em-1 equipment_manufacturers row exists (mirror test_portal_equipment.py autouse)."""
    import asyncio
    from sqlalchemy import text
    from app.core.database import engine

    async def _setup():
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO equipment_manufacturers (id, name, slug, sort_order, created_at, updated_at) "
                "VALUES ('em-1', 'Test Equip Mfr', 'em-1', 0, NOW(), NOW()) "
                "ON CONFLICT (id) DO NOTHING"
            ))
    asyncio.run(_setup())


def _fetch_category_id(client):
    res = client.get("/api/equipment-categories")
    if res.status_code != 200:
        return None
    cats = res.json()
    if not cats:
        return None
    # Prefer a child category if present, else top-level
    for c in cats:
        if c.get("children"):
            return c["children"][0]["id"]
    return cats[0]["id"]


@pytest.fixture
def scoped_equipment(client, equipment_manager_headers, _ensure_em):
    cat_id = _fetch_category_id(client)
    if not cat_id:
        pytest.skip("No equipment categories seeded")
    created = []
    for model in ("Transformer-100", "Transformer-200", "Generator-1"):
        slug = f"test-eq-{model.lower()}-{uuid.uuid4().hex[:8]}"
        res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
            "category_id": cat_id,
            "model": model,
            "slug": slug,
        })
        if res.status_code == 201:
            created.append(res.json())
    if len(created) < 3:
        pytest.skip("Could not create 3 scoped equipment rows")
    return created


def test_portal_equipment_list_with_search(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment?search=Transformer", headers=equipment_manager_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    tf_items = [e for e in items if "Transformer" in e.get("model", "")]
    assert len(tf_items) >= 2
    assert all("Transformer" in e["model"] for e in tf_items)


def test_portal_equipment_list_with_category_filter(client, equipment_manager_headers, scoped_equipment):
    target_cat = scoped_equipment[0]["category_id"]
    res = client.get(f"/api/portal/equipment?category_id={target_cat}", headers=equipment_manager_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    assert all(e["category_id"] == target_cat for e in items)


def test_portal_equipment_list_without_filters(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 20
    assert data["total"] >= 3
    assert all(e["manufacturer_id"] == "em-1" for e in data["items"])


def test_portal_equipment_list_pagination(client, equipment_manager_headers, scoped_equipment):
    res = client.get("/api/portal/equipment?page=1&page_size=2", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert len(data["items"]) <= 2
    assert data["total"] >= 3


def test_admin_equipment_list_with_q(client, admin_headers, scoped_equipment):
    res = client.get("/api/recommended-equipments?q=Transformer", headers=admin_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    tf_items = [e for e in items if "Transformer" in e.get("model", "")]
    assert len(tf_items) >= 2
    assert all("Transformer" in e["model"] for e in tf_items)
