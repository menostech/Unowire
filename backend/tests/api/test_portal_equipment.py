"""Tests for portal equipment routes: list, detail, scope isolation."""
import uuid

import pytest


@pytest.fixture(scope="module", autouse=True)
def _ensure_equipment_manufacturer():
    """Ensure the em-1 equipment_manufacturers row exists.

    The conftest seeds the user (scope_id='em-1') and media folders but not the
    equipment_manufacturers row that the POST route looks up for slug-based ID
    generation. Insert idempotently so the create test can succeed.
    """
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


def test_portal_equipment_list(client, equipment_manager_headers):
    res = client.get("/api/portal/equipment", headers=equipment_manager_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_portal_equipment_requires_portal_token(client, admin_headers):
    res = client.get("/api/portal/equipment", headers=admin_headers)
    assert res.status_code == 401


def test_portal_equipment_rejects_cable_scope(client, cable_manager_headers):
    """Cable manufacturer cannot access equipment (different scope_type)."""
    res = client.get("/api/portal/equipment", headers=cable_manager_headers)
    assert res.status_code == 403


def test_portal_equipment_detail_other_scope_returns_404(client, equipment_manager_headers):
    res = client.get("/api/portal/equipment/nonexistent-id", headers=equipment_manager_headers)
    assert res.status_code == 404


def test_portal_create_equipment_success(client, equipment_manager_headers):
    """Equipment manufacturer can create equipment within their scope."""
    # Fetch equipment categories to get a valid category_id
    cat_res = client.get("/api/equipment-categories")
    assert cat_res.status_code == 200
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    # Use a child category if available, otherwise top-level
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    unique_slug = f"test-portal-equipment-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Test Portal Equipment",
        "slug": unique_slug,
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["model"] == "Test Portal Equipment"
    assert data["manufacturer_id"] == "em-1"  # forced to scope_id
    assert data["id"]  # auto-generated
    assert data["slug"] == unique_slug


def test_portal_create_equipment_missing_fields_422(client, equipment_manager_headers):
    """Missing required fields returns 422."""
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={"model": "X"})
    assert res.status_code == 422


def test_portal_create_equipment_cross_scope_403(client, cable_manager_headers):
    """Cable manufacturer cannot create equipment (403)."""
    res = client.post("/api/portal/equipment", headers=cable_manager_headers, json={
        "category_id": "cat-1", "model": "X", "slug": "x",
    })
    assert res.status_code == 403


def test_portal_delete_equipment_success(client, equipment_manager_headers):
    """Equipment manufacturer can delete their own equipment."""
    # Create equipment first
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    create_res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Delete Me Equipment",
        "slug": f"delete-me-equipment-{uuid.uuid4().hex[:8]}",
    })
    assert create_res.status_code == 201
    equipment_id = create_res.json()["id"]

    # Delete it
    del_res = client.delete(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers)
    assert del_res.status_code == 200
    assert del_res.json()["id"] == equipment_id

    # Verify it's gone
    get_res = client.get(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers)
    assert get_res.status_code == 404


def test_portal_delete_equipment_out_of_scope_404(client, equipment_manager_headers):
    """Deleting non-existent or out-of-scope equipment returns 404."""
    res = client.delete("/api/portal/equipment/nonexistent-id", headers=equipment_manager_headers)
    assert res.status_code == 404
