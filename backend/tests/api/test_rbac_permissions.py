"""Tests for RBAC permission enforcement and scope checks."""


def test_me_permissions(client, admin_headers):
    res = client.get("/api/auth/me/permissions", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["role_id"] == "admin"
    assert "users" in data["allowed_modules"]
    assert "roles" in data["allowed_modules"]


def test_unauthorized_user_cannot_access_cables(client):
    """No token -> 401 on mutation endpoints."""
    res = client.post("/api/cables", json={})
    assert res.status_code == 401
