"""Tests for portal equipment routes: list, detail, scope isolation."""
import pytest


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
