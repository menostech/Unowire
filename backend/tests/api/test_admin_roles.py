"""Tests for admin role management endpoints."""


def test_list_roles_requires_auth(client):
    res = client.get("/api/admin/roles")
    assert res.status_code == 401


def test_list_roles_as_admin(client, admin_headers):
    res = client.get("/api/admin/roles", headers=admin_headers)
    assert res.status_code == 200
    roles = res.json()
    ids = {r["id"] for r in roles}
    assert "admin" in ids
    assert "content_editor" in ids
    assert "equipment_manager" in ids
    assert "cable_manager" in ids


def test_get_single_role(client, admin_headers):
    res = client.get("/api/admin/roles/admin", headers=admin_headers)
    assert res.status_code == 200
    role = res.json()
    assert role["id"] == "admin"
    assert role["is_system"] is True
    assert "users" in role["permissions"]
    assert "roles" in role["permissions"]


def test_create_custom_role(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "viewer",
            "name": "Viewer",
            "description": "Read-only access",
            "scope_type": None,
            "sort_order": 10,
            "permissions": ["dashboard", "cables"],
        },
    )
    assert res.status_code == 201
    role = res.json()
    assert role["id"] == "viewer"
    assert role["is_system"] is False
    assert set(role["permissions"]) == {"dashboard", "cables"}


def test_create_role_duplicate_id_conflict(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "admin",
            "name": "Another Admin",
            "permissions": ["dashboard"],
        },
    )
    assert res.status_code == 409


def test_create_role_invalid_module(client, admin_headers):
    res = client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "bad",
            "name": "Bad",
            "permissions": ["nonexistent_module"],
        },
    )
    assert res.status_code == 422


def test_update_role_permissions(client, admin_headers):
    # Create a custom role first
    client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={
            "id": "editor_v2",
            "name": "Editor V2",
            "permissions": ["dashboard"],
        },
    )
    # Update it
    res = client.put(
        "/api/admin/roles/editor_v2",
        headers=admin_headers,
        json={"permissions": ["dashboard", "cables", "brands"]},
    )
    assert res.status_code == 200
    role = res.json()
    assert set(role["permissions"]) == {"dashboard", "cables", "brands"}


def test_cannot_remove_protected_modules_from_admin(client, admin_headers):
    res = client.put(
        "/api/admin/roles/admin",
        headers=admin_headers,
        json={"permissions": ["dashboard", "cables"]},  # missing users, menu_config, roles
    )
    assert res.status_code == 422


def test_cannot_delete_system_role(client, admin_headers):
    res = client.delete("/api/admin/roles/admin", headers=admin_headers)
    assert res.status_code == 403


def test_delete_custom_role(client, admin_headers):
    # Create then delete
    client.post(
        "/api/admin/roles",
        headers=admin_headers,
        json={"id": "temp", "name": "Temp", "permissions": ["dashboard"]},
    )
    res = client.delete("/api/admin/roles/temp", headers=admin_headers)
    assert res.status_code == 204


def test_list_modules(client, admin_headers):
    res = client.get("/api/admin/roles/modules", headers=admin_headers)
    assert res.status_code == 200
    modules = res.json()
    ids = {m["id"] for m in modules}
    assert "cables" in ids
    assert "roles" in ids
