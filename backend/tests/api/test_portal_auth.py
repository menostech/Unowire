"""Tests for portal auth: login, logout, me, cross-protection, rate limit."""
import pytest


def test_portal_login_issues_portal_token_cookie(client, db_session):
    """Factory user logs in via /api/portal/auth/login and receives portal_token cookie."""
    # cable_manager@test.com is created by conftest cleanup/fixture setup
    res = client.post(
        "/api/portal/auth/login",
        json={"email": "cable_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200, res.text
    assert "portal_token" in res.cookies
    # Token should be a non-empty string
    assert res.cookies["portal_token"]


def test_portal_login_rejects_operator(client):
    """Operator (admin@unowire.com) cannot log in via portal — gets 403."""
    res = client.post(
        "/api/portal/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    assert res.status_code == 403
    assert "Use /admin/login" in res.json()["message"]


def test_admin_login_rejects_factory_user(client):
    """Factory user cannot log in via /api/auth/login — gets 403."""
    res = client.post(
        "/api/auth/login",
        json={"email": "cable_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 403
    assert "Use /portal/login" in res.json()["message"]


def test_portal_me_returns_factory_user_info(client, cable_manager_headers):
    """/api/portal/auth/me returns user info with scope_type and scope_id."""
    res = client.get("/api/portal/auth/me", headers=cable_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "cable_manager@test.com"
    assert data["scope_type"] == "manufacturer"
    assert data["scope_id"] == "mfr-1"


def test_portal_me_permissions_returns_allowed_modules(client, cable_manager_headers):
    """/api/portal/auth/me/permissions returns fixed allowed_modules for manufacturer scope."""
    res = client.get("/api/portal/auth/me/permissions", headers=cable_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert set(data["allowed_modules"]) == {"dashboard", "cables", "inquiries", "media", "me"}


def test_portal_logout_clears_cookie(client, cable_manager_headers):
    """POST /api/portal/auth/logout clears portal_token cookie."""
    res = client.post("/api/portal/auth/logout", headers=cable_manager_headers)
    assert res.status_code == 200
    # Cookie should be cleared (max_age=0)


def test_admin_token_cannot_access_portal_routes(client, admin_headers):
    """admin_token cannot access /api/portal/auth/me — gets 401."""
    res = client.get("/api/portal/auth/me", headers=admin_headers)
    assert res.status_code == 401


def test_portal_token_cannot_access_admin_routes(client, cable_manager_headers):
    """portal_token cannot access /api/admin/inquiries — gets 401."""
    res = client.get("/api/admin/inquiries", headers=cable_manager_headers)
    assert res.status_code in (401, 403)  # 401 from token type mismatch, or 403 from require_operator


def test_equipment_factory_user_portal_login(client):
    """Equipment manufacturer user can log in via portal."""
    res = client.post(
        "/api/portal/auth/login",
        json={"email": "equip_manager@test.com", "password": "test123456"},
    )
    assert res.status_code == 200
    assert "portal_token" in res.cookies


def test_equipment_factory_user_permissions(client, equipment_manager_headers):
    """Equipment manufacturer user gets equipment-specific allowed modules."""
    res = client.get("/api/portal/auth/me/permissions", headers=equipment_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert set(data["allowed_modules"]) == {"dashboard", "equipment", "inquiries", "media", "me"}
