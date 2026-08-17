"""Tests for RBAC permission enforcement and scope checks."""


def test_me_permissions(client, admin_headers):
    res = client.get("/api/auth/me/permissions", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["role_id"] == "admin"
    assert "users" in data["allowed_modules"]
    assert "roles" in data["allowed_modules"]


def test_me_permissions_returns_canonical_connectivity_modules(client, admin_headers):
    """Regression: /me/permissions must return canonical connectivity_* module ids,
    not legacy terminal_* ids. The admin sidebar maps connectivity page_ids to
    connectivity_* module ids; if the endpoint returns terminal_* the sidebar
    filters out every Connectivity menu item."""
    res = client.get("/api/auth/me/permissions", headers=admin_headers)
    assert res.status_code == 200
    allowed = set(res.json()["allowed_modules"])
    # Canonical connectivity modules must be present so the sidebar renders them.
    assert "connectivity_mfrs" in allowed, (
        f"expected connectivity_mfrs in allowed_modules, got {sorted(allowed)}"
    )
    assert "connectivity_cats" in allowed, (
        f"expected connectivity_cats in allowed_modules, got {sorted(allowed)}"
    )
    assert "connectivity_list" in allowed, (
        f"expected connectivity_list in allowed_modules, got {sorted(allowed)}"
    )
    # Legacy terminal_* ids must NOT leak to the frontend (they break the
    # sidebar's module-id match and are superseded by the connectivity_* aliases).
    assert "terminal_mfrs" not in allowed, (
        f"legacy terminal_mfrs should be remapped to connectivity_mfrs, got {sorted(allowed)}"
    )
    assert "terminal_cats" not in allowed, (
        f"legacy terminal_cats should be remapped to connectivity_cats, got {sorted(allowed)}"
    )
    assert "terminal_list" not in allowed, (
        f"legacy terminal_list should be remapped to connectivity_list, got {sorted(allowed)}"
    )


def test_unauthorized_user_cannot_access_cables(client):
    """No token -> 401 on mutation endpoints."""
    res = client.post("/api/cables", json={})
    assert res.status_code == 401
