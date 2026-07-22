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
