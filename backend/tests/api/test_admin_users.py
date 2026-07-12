"""Tests for admin user management endpoints."""


def test_list_users_requires_auth(client):
    res = client.get("/api/admin/users")
    assert res.status_code == 401


def test_list_users_as_admin(client, admin_headers):
    res = client.get("/api/admin/users", headers=admin_headers)
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    admin_user = next(u for u in users if u["email"] == "admin@unowire.com")
    assert admin_user["role_id"] == "admin"
    assert admin_user["role_name"] == "Admin"


def test_create_user(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "neweditor@unowire.com",
            "password": "password123",
            "role_id": "content_editor",
            "scope_id": None,
        },
    )
    assert res.status_code == 201
    user = res.json()
    assert user["email"] == "neweditor@unowire.com"
    assert user["role_id"] == "content_editor"


def test_create_user_duplicate_email(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "admin@unowire.com",
            "password": "password123",
            "role_id": "admin",
        },
    )
    assert res.status_code == 409


def test_create_user_invalid_role(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "bad@unowire.com",
            "password": "password123",
            "role_id": "nonexistent_role",
        },
    )
    assert res.status_code == 422


def test_create_scoped_user_without_scope_id_fails(client, admin_headers):
    res = client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "cablemgr@unowire.com",
            "password": "password123",
            "role_id": "cable_manager",
            "scope_id": None,  # missing scope_id
        },
    )
    assert res.status_code == 422


def test_cannot_delete_self(client, admin_headers):
    # Get current user id from /me
    me = client.get("/api/auth/me", headers=admin_headers)
    my_id = me.json()["id"]
    res = client.delete(f"/api/admin/users/{my_id}", headers=admin_headers)
    assert res.status_code == 400


def test_list_scopes(client, admin_headers):
    res = client.get("/api/admin/users/scopes/manufacturer", headers=admin_headers)
    assert res.status_code == 200
    scopes = res.json()
    assert isinstance(scopes, list)


def test_list_scopes_invalid_type(client, admin_headers):
    res = client.get("/api/admin/users/scopes/nonexistent", headers=admin_headers)
    assert res.status_code == 422
