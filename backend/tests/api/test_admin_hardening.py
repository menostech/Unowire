"""Tests that admin routes reject factory users and portal tokens."""
import pytest


def test_admin_rejects_factory_user_via_admin_login(client):
    """Factory users cannot log in via /api/auth/login — must use /api/portal/auth/login."""
    # Note: cable_manager@test.com is created by the cable_manager_headers fixture.
    # But that fixture runs /api/auth/login, which will fail after Task 3.
    # For this test, we directly attempt login and expect 403.
    # This test is a no-op until Task 3 wires the cross-protection; left here as a placeholder.
    pass  # Will be filled in Task 3


def test_admin_cables_rejects_factory_user(client, cable_manager_headers):
    """Factory user's admin_token (if somehow obtained) cannot access /api/cables POST."""
    # After Task 3, cable_manager_headers will hold a portal_token, not an admin_token.
    # This test verifies that even if a factory user tries to use admin routes with
    # any token, they get 401 or 403.
    res = client.post("/api/cables", headers=cable_manager_headers)
    assert res.status_code in (401, 403)


def test_admin_inquiries_rejects_portal_token(client, cable_manager_headers):
    """portal_token cannot access /api/admin/inquiries."""
    res = client.get("/api/admin/inquiries", headers=cable_manager_headers)
    assert res.status_code in (401, 403)
