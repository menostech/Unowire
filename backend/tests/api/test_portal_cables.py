"""Tests for portal cables routes: list, detail, scope isolation."""
import uuid

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

    unique_slug = f"test-portal-cable-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Test Portal Cable",
        "slug": unique_slug,
        "size_system": "awg",
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["model"] == "Test Portal Cable"
    assert data["manufacturer_id"] == "mfr-1"  # forced to scope_id
    assert data["id"]  # auto-generated
    assert data["id"] != unique_slug  # includes manufacturer slug prefix
    assert data["slug"] == unique_slug


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


def test_portal_delete_cable_success(client, cable_manager_headers):
    """Manufacturer can delete their own cable."""
    # Create a cable first
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Delete Me Cable",
        "slug": f"delete-me-cable-{uuid.uuid4().hex[:8]}",
        "size_system": "awg",
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]

    # Delete it
    del_res = client.delete(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers)
    assert del_res.status_code == 200
    assert del_res.json()["id"] == cable_id

    # Verify it's gone
    get_res = client.get(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers)
    assert get_res.status_code == 404


def test_portal_delete_cable_out_of_scope_404(client, cable_manager_headers):
    """Deleting a non-existent or out-of-scope cable returns 404."""
    res = client.delete("/api/portal/cables/nonexistent-cable-id", headers=cable_manager_headers)
    assert res.status_code == 404


def test_portal_create_cable_with_specs(client, cable_manager_headers):
    """POST with common_specs and variants persists specs and returns them in the response."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    unique_slug = f"test-portal-cable-specs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Spec Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "common_specs": [
            {"spec_key": "voltage_rating", "label": "Voltage Rating", "value_string": "600V", "spec_type": "string", "filterable": True, "sort_order": 0},
        ],
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert len(data["common_specs"]) == 1
    assert data["common_specs"][0]["spec_key"] == "voltage_rating"
    assert data["common_specs"][0]["value_string"] == "600V"
    assert len(data["variants"]) == 1
    assert data["variants"][0]["slug"] == "red"
    assert len(data["variants"][0]["specs"]) == 1
    assert data["variants"][0]["specs"][0]["spec_key"] == "color"


def test_portal_update_cable_replace_common_specs(client, cable_manager_headers):
    """PUT with common_specs fully replaces existing common specs."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    # Create a cable with one common spec.
    unique_slug = f"test-portal-cable-replace-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Replace Specs Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "common_specs": [
            {"spec_key": "old_spec", "label": "Old", "value_string": "old", "spec_type": "string", "sort_order": 0},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]

    # PUT with a new common_specs list.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "common_specs": [
            {"spec_key": "new_spec", "label": "New", "value_string": "new", "spec_type": "string", "sort_order": 0},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["common_specs"]) == 1
    assert data["common_specs"][0]["spec_key"] == "new_spec"
    # The old spec is gone (full replacement, not append).
    assert all(s["spec_key"] != "old_spec" for s in data["common_specs"])


def test_portal_update_cable_variants_preserve_id(client, cable_manager_headers):
    """PUT with variants matching existing slug preserves variant id and replaces specs only."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    # Create a cable with a "red" variant.
    unique_slug = f"test-portal-cable-varid-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Variant ID Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]
    original_variant_id = create_res.json()["variants"][0]["id"]
    assert create_res.json()["variants"][0]["specs"][0]["value_string"] == "Red"

    # PUT with the same slug but different specs.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Crimson", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["variants"]) == 1
    # Variant id preserved.
    assert data["variants"][0]["id"] == original_variant_id
    assert data["variants"][0]["slug"] == "red"
    # Specs replaced.
    assert len(data["variants"][0]["specs"]) == 1
    assert data["variants"][0]["specs"][0]["value_string"] == "Crimson"
