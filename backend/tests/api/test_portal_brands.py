"""Tests for portal brands routes: list, detail, scope isolation."""
import pytest


def test_portal_brands_list(client, cable_manager_headers):
    res = client.get("/api/portal/brands", headers=cable_manager_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_portal_brands_requires_portal_token(client, admin_headers):
    res = client.get("/api/portal/brands", headers=admin_headers)
    assert res.status_code == 401


def test_portal_brands_rejects_equipment_scope(client, equipment_manager_headers):
    res = client.get("/api/portal/brands", headers=equipment_manager_headers)
    assert res.status_code == 403
