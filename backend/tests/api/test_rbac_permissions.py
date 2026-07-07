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


def test_admin_can_create_brand(client, admin_headers):
    """Admin with 'brands' permission can create a brand."""
    # First need a manufacturer - check if any exists
    mfrs = client.get("/api/manufacturers", headers=admin_headers)
    if mfrs.status_code == 200 and mfrs.json().get("items"):
        mfr_id = mfrs.json()["items"][0]["id"]
    else:
        # Create a manufacturer first
        client.post(
            "/api/manufacturers",
            headers=admin_headers,
            json={"id": "test-mfr", "name": "Test Mfr", "slug": "test-mfr", "country": "US", "website": ""},
        )
        mfr_id = "test-mfr"
    res = client.post(
        "/api/brands",
        headers=admin_headers,
        json={"id": "test-brand-rbac", "name": "Test Brand", "slug": "test-brand-rbac", "manufacturer_id": mfr_id},
    )
    assert res.status_code == 201
