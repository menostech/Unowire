"""Tests for portal media routes."""
import pytest


def test_portal_folders_list(client, cable_manager_headers):
    res = client.get("/api/portal/folders", headers=cable_manager_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_portal_uploads_list(client, cable_manager_headers):
    res = client.get("/api/portal/uploads", headers=cable_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data or isinstance(data, list)


def test_portal_media_requires_portal_token(client, admin_headers):
    res = client.get("/api/portal/folders", headers=admin_headers)
    assert res.status_code == 401
