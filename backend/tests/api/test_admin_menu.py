"""Tests for admin menu API endpoints."""


class TestMenuTree:
    def test_tree_returns_top_level_items(self, client):
        res = client.get("/api/admin/menu/tree")
        assert res.status_code == 200
        data = res.json()
        # 5 top-level items (dashboard, Cable group, equipment group, media, settings group)
        assert len(data) == 5
        # Equipment group has 3 children
        equipment = next(i for i in data if i["id"] == "equipment")
        assert equipment["type"] == "group"
        assert len(equipment["children"]) == 3

    def test_tree_excludes_hidden_items(self, client, admin_headers):
        # Hide the 'media' item
        res = client.put(
            "/api/admin/menu/media",
            json={"is_visible": False},
            headers=admin_headers,
        )
        assert res.status_code == 200
        # Tree should now have 7 top-level items
        res = client.get("/api/admin/menu/tree")
        data = res.json()
        ids = [i["id"] for i in data]
        assert "media" not in ids
        # Restore
        client.put(
            "/api/admin/menu/media",
            json={"is_visible": True},
            headers=admin_headers,
        )


class TestMenuFlat:
    def test_flat_requires_admin(self, client):
        res = client.get("/api/admin/menu")
        assert res.status_code == 401

    def test_flat_returns_all_items(self, client, admin_headers):
        res = client.get("/api/admin/menu", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 15  # all seed items (12 original + roles + users)


class TestMenuCreate:
    def test_create_page_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-page",
                "type": "page",
                "page_id": "cables",
                "label": "Test Page",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        assert res.json()["id"] == "test-page"
        # Cleanup
        client.delete("/api/admin/menu/test-page", headers=admin_headers)

    def test_create_link_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-link",
                "type": "link",
                "url": "https://example.com",
                "label": "Test Link",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        client.delete("/api/admin/menu/test-link", headers=admin_headers)

    def test_create_group_item(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "test-group",
                "type": "group",
                "label": "Test Group",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        client.delete("/api/admin/menu/test-group", headers=admin_headers)

    def test_create_page_without_page_id_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-page",
                "type": "page",
                "label": "Bad Page",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_link_without_url_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-link",
                "type": "link",
                "label": "Bad Link",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_invalid_page_id_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "bad-pageid",
                "type": "page",
                "page_id": "nonexistent",
                "label": "Bad PageId",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_nonexistent_parent_returns_422(self, client, admin_headers):
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "orphan",
                "parent_id": "nonexistent-parent",
                "type": "page",
                "page_id": "cables",
                "label": "Orphan",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_create_with_non_group_parent_returns_422(self, client, admin_headers):
        # 'cables' is a page, not a group — cannot be a parent
        res = client.post(
            "/api/admin/menu",
            json={
                "id": "nested-too-deep",
                "parent_id": "cables",
                "type": "page",
                "page_id": "brands",
                "label": "Nested",
            },
            headers=admin_headers,
        )
        assert res.status_code == 422


class TestMenuSort:
    def test_move_up(self, client, admin_headers):
        # 'equipment-cats' and 'equipment-mfrs' are children of 'equipment' group.
        # equipment-mfrs has sort_order=0, equipment-cats has sort_order=1.
        # Moving 'equipment-cats' up should swap with 'equipment-mfrs'.
        res = client.put(
            "/api/admin/menu/equipment-cats/sort",
            json={"direction": "up"},
            headers=admin_headers,
        )
        assert res.status_code == 200
        # 'equipment-cats' now has sort_order=0
        assert res.json()["sort_order"] == 0
        # Restore
        client.put(
            "/api/admin/menu/equipment-cats/sort",
            json={"direction": "down"},
            headers=admin_headers,
        )

    def test_move_down_at_boundary_returns_400(self, client, admin_headers):
        # 'menu-users' is the last child of 'settings' group (sort_order=2).
        res = client.put(
            "/api/admin/menu/menu-users/sort",
            json={"direction": "down"},
            headers=admin_headers,
        )
        assert res.status_code == 400

    def test_move_up_at_boundary_returns_400(self, client, admin_headers):
        # 'dashboard' is the first top-level item (sort_order=0).
        res = client.put(
            "/api/admin/menu/dashboard/sort",
            json={"direction": "up"},
            headers=admin_headers,
        )
        assert res.status_code == 400


class TestMenuDelete:
    def test_delete_protected_returns_403(self, client, admin_headers):
        res = client.delete("/api/admin/menu/menu-config", headers=admin_headers)
        assert res.status_code == 403

    def test_delete_parent_cascades_children(self, client, admin_headers):
        # Create a temporary group with a child, then delete the group.
        client.post(
            "/api/admin/menu",
            json={
                "id": "tmp-group",
                "type": "group",
                "label": "Tmp Group",
                "sort_order": 99,
            },
            headers=admin_headers,
        )
        client.post(
            "/api/admin/menu",
            json={
                "id": "tmp-child",
                "parent_id": "tmp-group",
                "type": "page",
                "page_id": "cables",
                "label": "Tmp Child",
            },
            headers=admin_headers,
        )
        res = client.delete("/api/admin/menu/tmp-group", headers=admin_headers)
        assert res.status_code == 200
        # Child should be gone.
        res = client.get("/api/admin/menu/tmp-child", headers=admin_headers)
        assert res.status_code == 404

    def test_delete_unauthenticated_returns_401(self, client):
        res = client.delete("/api/admin/menu/dashboard")
        assert res.status_code == 401
