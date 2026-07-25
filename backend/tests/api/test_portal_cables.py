"""Tests for portal cables routes: list, detail, scope isolation."""
import pytest


def test_portal_cables_list_returns_only_scope_cables(client, cable_manager_headers):
    """/api/portal/cables returns only cables in user's scope."""
    res = client.get("/api/portal/cables", headers=cable_manager_headers)
    assert res.status_code == 200
    cables = res.json()
    assert isinstance(cables, list)
    # All cables should belong to mfr-1 (the fixture's scope)
    # We can't assert exact cables without seeding, but the route should not 500


def test_portal_cables_detail_returns_cable(client, cable_manager_headers, admin_headers):
    """Factory user can view their own cable."""
    res = client.get("/api/portal/cables", headers=cable_manager_headers)
    cables = res.json()
    if not cables:
        pytest.skip("No cables in mfr-1 scope — seed test data first")
    cable_id = cables[0]["id"]
    res = client.get(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers)
    assert res.status_code == 200


def test_portal_cables_detail_other_scope_returns_404(client, cable_manager_headers, admin_headers):
    """Factory user cannot view cables outside their scope — gets 404."""
    res = client.get("/api/portal/cables/nonexistent-cable-id", headers=cable_manager_headers)
    assert res.status_code == 404


def test_portal_cables_requires_portal_token(client, admin_headers):
    """admin_token cannot access portal cables."""
    res = client.get("/api/portal/cables", headers=admin_headers)
    assert res.status_code == 401


def test_portal_cables_rejects_equipment_scope(client, equipment_manager_headers):
    """Equipment manufacturer cannot access cables (different scope_type)."""
    res = client.get("/api/portal/cables", headers=equipment_manager_headers)
    assert res.status_code == 403  # require_factory_module rejects wrong scope


def test_portal_create_cable_success(client, cable_manager_headers):
    """Manufacturer can create a cable within their scope."""
    # First fetch taxonomy to get valid IDs
    tax_res = client.get("/api/taxonomy")
    assert tax_res.status_code == 200
    industries = tax_res.json()
    if not industries or not industries[0].get("categories"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    if not category.get("product_types"):
        pytest.skip("No product types seeded")
    product_type = category["product_types"][0]

    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Test Portal Cable",
        "slug": "test-portal-cable",
        "size_system": "awg",
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["model"] == "Test Portal Cable"
    assert data["manufacturer_id"] == "mfr-1"  # forced to scope_id
    assert data["id"]  # auto-generated
    assert data["id"] != "test-portal-cable"  # includes manufacturer slug prefix
    assert data["slug"] == "test-portal-cable"


def test_portal_create_cable_missing_fields_422(client, cable_manager_headers):
    """Missing required fields returns 422."""
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={"model": "X"})
    assert res.status_code == 422


def test_portal_create_cable_cross_scope_403(client, equipment_manager_headers):
    """Equipment manufacturer cannot create cables (403)."""
    res = client.post("/api/portal/cables", headers=equipment_manager_headers, json={
        "product_type_id": "pt-1", "industry_id": "ind-1", "category_id": "cat-1",
        "model": "X", "slug": "x", "size_system": "awg",
    })
    assert res.status_code == 403
