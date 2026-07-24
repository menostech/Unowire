"""Tests for site_menu admin + public endpoints."""
import pytest

from app.crud.site_menu import crud_site_menu
from app.core.database import async_session


# === Fixtures ===

@pytest.fixture
async def cleanup_site_menu():
    """Remove test-created site menu items after each test."""
    yield
    async with async_session() as s:
        items = await crud_site_menu.get_flat(s)
        # Keep seeded items; delete test ones (prefix 'test-')
        for item in items:
            if item.id.startswith("test-"):
                await s.delete(item)
        await s.commit()


# === Validation tests ===

class TestValidation:
    def test_create_link_without_url_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-bad-link",
                "location": "header",
                "type": "link",
                "label": "Bad Link",
                "url": None,
            },
        )
        assert res.status_code == 422

    def test_create_group_with_url_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-bad-group",
                "location": "header",
                "type": "group",
                "label": "Bad Group",
                "url": "/some-url",
            },
        )
        assert res.status_code == 422

    def test_create_with_cross_location_parent_returns_422(self, client, admin_headers):
        # First create a group in footer
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-footer-group",
                "location": "footer",
                "type": "group",
                "label": "Footer Group",
                "url": None,
            },
        )
        # Try to create a header item with footer parent
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-bad-cross",
                "location": "header",
                "parent_id": "test-footer-group",
                "type": "link",
                "label": "Cross",
                "url": "/x",
            },
        )
        assert res.status_code == 422
        assert "same location" in res.json()["message"]

    def test_create_with_link_parent_returns_422(self, client, admin_headers):
        # header-cables is type=link (from seed)
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-bad-linkparent",
                "location": "header",
                "parent_id": "header-cables",
                "type": "link",
                "label": "Child",
                "url": "/x",
            },
        )
        assert res.status_code == 422
        assert "group type" in res.json()["message"]


# === CRUD tests ===

class TestCRUD:
    def test_create_link_success(self, client, admin_headers):
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-link-1",
                "location": "header",
                "type": "link",
                "label": "Test Link",
                "url": "/test",
                "sort_order": 99,
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["id"] == "test-link-1"
        assert data["label"] == "Test Link"
        assert data["url"] == "/test"

    def test_create_group_success(self, client, admin_headers):
        res = client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-group-1",
                "location": "header",
                "type": "group",
                "label": "Test Group",
                "url": None,
            },
        )
        assert res.status_code == 201
        assert res.json()["type"] == "group"

    def test_get_single_item(self, client, admin_headers):
        res = client.get("/api/admin/site-menu/header-cables", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["label"] == "Cables"

    def test_get_404_on_missing(self, client, admin_headers):
        res = client.get("/api/admin/site-menu/nonexistent", headers=admin_headers)
        assert res.status_code == 404

    def test_update_item(self, client, admin_headers):
        # Create then update
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-update-1",
                "location": "header",
                "type": "link",
                "label": "Original",
                "url": "/orig",
            },
        )
        res = client.put(
            "/api/admin/site-menu/test-update-1",
            headers=admin_headers,
            json={"label": "Updated", "is_visible": False},
        )
        assert res.status_code == 200
        assert res.json()["label"] == "Updated"
        assert res.json()["is_visible"] is False

    def test_delete_item_cascades_children(self, client, admin_headers):
        # Create a group with a child
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-del-group",
                "location": "header",
                "type": "group",
                "label": "Del Group",
                "url": None,
            },
        )
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-del-child",
                "location": "header",
                "parent_id": "test-del-group",
                "type": "link",
                "label": "Del Child",
                "url": "/del",
            },
        )
        # Delete the group
        res = client.delete("/api/admin/site-menu/test-del-group", headers=admin_headers)
        assert res.status_code == 200
        # Child should be gone (cascade)
        res2 = client.get("/api/admin/site-menu/test-del-child", headers=admin_headers)
        assert res2.status_code == 404


# === Tree building tests ===

class TestTree:
    def test_tree_excludes_hidden(self, client, admin_headers):
        # header-cables is visible. Hide it.
        client.put(
            "/api/admin/site-menu/header-cables",
            headers=admin_headers,
            json={"is_visible": False},
        )
        # Public tree should not include it
        res = client.get("/api/site-menu/header")
        assert res.status_code == 200
        labels = [item["label"] for item in res.json()]
        assert "Cables" not in labels
        assert "Manufacturers" in labels
        # Restore
        client.put(
            "/api/admin/site-menu/header-cables",
            headers=admin_headers,
            json={"is_visible": True},
        )

    def test_tree_includes_hidden_for_admin(self, client, admin_headers):
        # Use admin tree endpoint with include_hidden
        res = client.get(
            "/api/admin/site-menu/tree?location=header",
            headers=admin_headers,
        )
        assert res.status_code == 200
        labels = [item["label"] for item in res.json()]
        assert "Cables" in labels  # visible
        assert "Manufacturers" in labels


# === Public endpoint tests ===

class TestPublic:
    def test_public_no_auth_required(self, client):
        res = client.get("/api/site-menu/header")
        assert res.status_code == 200

    def test_public_invalid_location_returns_422(self, client):
        res = client.get("/api/site-menu/sidebar")
        assert res.status_code == 422

    def test_public_returns_only_visible(self, client, admin_headers):
        # Hide header-manufacturers
        client.put(
            "/api/admin/site-menu/header-manufacturers",
            headers=admin_headers,
            json={"is_visible": False},
        )
        res = client.get("/api/site-menu/header")
        labels = [item["label"] for item in res.json()]
        assert "Manufacturers" not in labels
        # Restore
        client.put(
            "/api/admin/site-menu/header-manufacturers",
            headers=admin_headers,
            json={"is_visible": True},
        )


# === Permission tests ===

class TestPermissions:
    def test_admin_endpoints_require_auth(self, client):
        # No auth header → 401 or 403
        res = client.get("/api/admin/site-menu")
        assert res.status_code in (401, 403)

    def test_cable_manager_forbidden(self, client, cable_manager_headers):
        # After Task 3, cable_manager_headers returns a portal_token (not an admin_token),
        # so /api/admin/site-menu rejects with 401 (token type mismatch) — both 401 and
        # 403 mean "factory user cannot access admin endpoints".
        res = client.get("/api/admin/site-menu", headers=cable_manager_headers)
        assert res.status_code in (401, 403)


# === Sort tests ===

class TestSort:
    def test_sort_up(self, client, admin_headers):
        # Use dedicated items with high sort_order so they are guaranteed to be
        # adjacent siblings (isolated from seed data + other tests' leftovers).
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-sort-a",
                "location": "header",
                "type": "link",
                "label": "Sort A",
                "url": "/sort-a",
                "sort_order": 50,
            },
        )
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-sort-b",
                "location": "header",
                "type": "link",
                "label": "Sort B",
                "url": "/sort-b",
                "sort_order": 51,
            },
        )
        # Move B up — should swap with A (the immediate predecessor)
        res = client.put(
            "/api/admin/site-menu/test-sort-b/sort",
            headers=admin_headers,
            json={"direction": "up"},
        )
        assert res.status_code == 200
        a = client.get("/api/admin/site-menu/test-sort-a", headers=admin_headers).json()
        b = client.get("/api/admin/site-menu/test-sort-b", headers=admin_headers).json()
        assert a["sort_order"] == 51
        assert b["sort_order"] == 50

    def test_sort_up_at_boundary_returns_400(self, client, admin_headers):
        # Create an item with the lowest possible sort_order so it is guaranteed
        # to be at the top of its sibling list (idx=0), regardless of seed data
        # or leftovers from other tests.
        client.post(
            "/api/admin/site-menu",
            headers=admin_headers,
            json={
                "id": "test-boundary",
                "location": "header",
                "type": "link",
                "label": "Boundary",
                "url": "/boundary",
                "sort_order": -100,
            },
        )
        res = client.put(
            "/api/admin/site-menu/test-boundary/sort",
            headers=admin_headers,
            json={"direction": "up"},
        )
        assert res.status_code == 400
        assert "top" in res.json()["message"]
