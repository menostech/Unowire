"""Tests for portal me routes: profile + change password."""
import pytest


def test_portal_me_returns_profile(client, cable_manager_headers):
    res = client.get("/api/portal/me", headers=cable_manager_headers)
    assert res.status_code == 200
    data = res.json()
    assert "email" in data
    assert "scope_type" in data


def test_portal_me_change_password(client, cable_manager_headers):
    """Change password with correct old password succeeds."""
    res = client.put(
        "/api/portal/me",
        json={"old_password": "test123456", "new_password": "newpassword123"},
        headers=cable_manager_headers,
    )
    assert res.status_code == 200

    # Change it back so other tests don't break
    res = client.put(
        "/api/portal/me",
        json={"old_password": "newpassword123", "new_password": "test123456"},
        headers=cable_manager_headers,
    )
    assert res.status_code == 200


def test_portal_me_change_password_wrong_old(client, cable_manager_headers):
    res = client.put(
        "/api/portal/me",
        json={"old_password": "wrong", "new_password": "newpassword123"},
        headers=cable_manager_headers,
    )
    assert res.status_code == 400


def test_portal_me_requires_portal_token(client, admin_headers):
    res = client.get("/api/portal/me", headers=admin_headers)
    assert res.status_code == 401
