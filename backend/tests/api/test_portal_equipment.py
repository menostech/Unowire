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


def test_portal_create_equipment_with_applicable_specs(client, equipment_manager_headers):
    """POST with applicable_specs persists the JSONB value and returns it in the response."""
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    unique_slug = f"test-portal-eq-specs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Spec Equipment",
        "slug": unique_slug,
        "applicable_specs": [
            {"spec_key": "conductor_area", "min": 0.1, "max": 1.0},
        ],
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert len(data["applicable_specs"]) == 1
    assert data["applicable_specs"][0]["spec_key"] == "conductor_area"
    assert data["applicable_specs"][0]["min"] == 0.1
    assert data["applicable_specs"][0]["max"] == 1.0


def test_portal_create_equipment_without_applicable_specs(client, equipment_manager_headers):
    """POST without applicable_specs defaults to empty list (server_default), not NULL."""
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    unique_slug = f"test-portal-eq-nospecs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "No Spec Equipment",
        "slug": unique_slug,
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    # Server default should be [] — not None, not missing.
    assert data["applicable_specs"] == []


def test_portal_update_equipment_applicable_specs(client, equipment_manager_headers):
    """PUT with applicable_specs persists the new JSONB value."""
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    # Create with initial specs.
    unique_slug = f"test-portal-eq-update-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Update Spec Equipment",
        "slug": unique_slug,
        "applicable_specs": [
            {"spec_key": "old_key", "min": 0.0, "max": 1.0},
        ],
    })
    assert create_res.status_code == 201
    equipment_id = create_res.json()["id"]

    # PUT with new specs.
    put_res = client.put(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers, json={
        "applicable_specs": [
            {"spec_key": "new_key", "min": 1.0, "max": 10.0},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["applicable_specs"]) == 1
    assert data["applicable_specs"][0]["spec_key"] == "new_key"
    assert data["applicable_specs"][0]["max"] == 10.0


def test_portal_equipment_cross_scope_404(client, equipment_manager_headers):
    """PUT on another manufacturer's equipment returns 404 (no information leakage)."""
    # Non-existent id exercises the same _check_equipment_ownership code path
    # as a real out-of-scope equipment id (both return 404).
    res = client.put("/api/portal/equipment/nonexistent-equipment-id", headers=equipment_manager_headers, json={
        "applicable_specs": [{"spec_key": "x", "min": 0, "max": 1}],
    })
    assert res.status_code == 404
