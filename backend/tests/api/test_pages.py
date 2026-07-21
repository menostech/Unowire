"""Tests for CMS pages endpoints."""


# === TestPageCRUD (5 tests) ===

def test_create_page_success(client, admin_headers):
    res = client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-about",
            "slug": "test-about",
            "title": "About Us",
            "content": "# Hello\n\nThis is the about page.",
            "status": "draft",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["id"] == "page-test-about"
    assert data["slug"] == "test-about"
    assert data["title"] == "About Us"
    assert data["status"] == "draft"
    assert data["is_visible"] is True
    assert data["sort_order"] == 0
    assert data["published_at"] is None


def test_create_page_reserved_slug(client, admin_headers):
    res = client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-reserved",
            "slug": "admin",
            "title": "Should Fail",
            "content": "",
        },
    )
    assert res.status_code == 400, res.text
    assert "reserved" in res.json()["message"].lower()


def test_create_page_invalid_slug_format(client, admin_headers):
    res = client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-invalid",
            "slug": "About Us",
            "title": "Should Fail",
            "content": "",
        },
    )
    # Pydantic validation rejects the pattern; FastAPI returns 422
    assert res.status_code == 422, res.text


def test_create_page_duplicate_slug(client, admin_headers):
    payload = {
        "id": "page-test-dup-1",
        "slug": "test-duplicate",
        "title": "First",
        "content": "",
    }
    res1 = client.post("/api/admin/pages", headers=admin_headers, json=payload)
    assert res1.status_code == 201, res1.text
    payload2 = {**payload, "id": "page-test-dup-2", "title": "Second"}
    res2 = client.post("/api/admin/pages", headers=admin_headers, json=payload2)
    assert res2.status_code == 409, res2.text
    assert "exists" in res2.json()["message"].lower()


def test_update_page_slug_uniqueness(client, admin_headers):
    # Create two pages
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={"id": "page-test-upd-a", "slug": "test-upd-a", "title": "A", "content": ""},
    )
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={"id": "page-test-upd-b", "slug": "test-upd-b", "title": "B", "content": ""},
    )
    # Try to rename B's slug to A's slug
    res = client.put(
        "/api/admin/pages/page-test-upd-b",
        headers=admin_headers,
        json={"slug": "test-upd-a"},
    )
    assert res.status_code == 409, res.text
    assert "exists" in res.json()["message"].lower()


# === TestPagePublish (2 tests) ===

def test_publish_sets_published_at(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-pub-1",
            "slug": "test-pub-1",
            "title": "Pub 1",
            "content": "",
            "status": "draft",
        },
    )
    res = client.put(
        "/api/admin/pages/page-test-pub-1",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "published"
    assert res.json()["published_at"] is not None


def test_publish_does_not_overwrite_published_at(client, admin_headers):
    # Create as published (sets published_at)
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-pub-2",
            "slug": "test-pub-2",
            "title": "Pub 2",
            "content": "",
            "status": "published",
        },
    )
    create_res = client.get(
        "/api/admin/pages/page-test-pub-2", headers=admin_headers
    )
    first_published_at = create_res.json()["published_at"]
    assert first_published_at is not None
    # Demote to draft
    client.put(
        "/api/admin/pages/page-test-pub-2",
        headers=admin_headers,
        json={"status": "draft"},
    )
    # Re-publish
    res = client.put(
        "/api/admin/pages/page-test-pub-2",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert res.status_code == 200, res.text
    # published_at must NOT have changed
    assert res.json()["published_at"] == first_published_at


# === TestPageVisibility (2 tests) ===

def test_draft_not_public(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-vis-1",
            "slug": "test-vis-1",
            "title": "Draft",
            "content": "draft content",
            "status": "draft",
        },
    )
    res = client.get("/api/pages/test-vis-1")
    assert res.status_code == 404, res.text


def test_hidden_not_public(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-vis-2",
            "slug": "test-vis-2",
            "title": "Hidden",
            "content": "hidden content",
            "status": "published",
            "is_visible": False,
        },
    )
    res = client.get("/api/pages/test-vis-2")
    assert res.status_code == 404, res.text


# === TestPagePublicAccess (2 tests) ===

def test_public_get_published_visible(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-pub-access",
            "slug": "test-pub-access",
            "title": "Public Page",
            "content": "# Hello world\n\nThis is content.",
            "status": "published",
            "is_visible": True,
            "meta_title": "Public SEO Title",
            "meta_description": "Public SEO description",
        },
    )
    res = client.get("/api/pages/test-pub-access")
    assert res.status_code == 200, res.text
    data = res.json()
    # PagePublicRead should NOT expose status/is_visible/sort_order/timestamps
    assert set(data.keys()) == {
        "slug", "title", "content", "meta_title", "meta_description", "og_image_url"
    }
    assert data["slug"] == "test-pub-access"
    assert data["title"] == "Public Page"
    assert "Hello world" in data["content"]
    assert data["meta_title"] == "Public SEO Title"


def test_public_get_nonexistent(client):
    res = client.get("/api/pages/does-not-exist")
    assert res.status_code == 404, res.text


# === TestPagePermission (2 tests) ===

def test_non_admin_cannot_access_admin_endpoints(client, cable_manager_headers):
    res = client.get("/api/admin/pages", headers=cable_manager_headers)
    assert res.status_code in (401, 403), res.text  # 401 portal_token rejected, 403 operator-only


def test_admin_can_access_admin_endpoints(client, admin_headers):
    res = client.get("/api/admin/pages", headers=admin_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "items" in data
    assert "total" in data


# === TestPageDelete (2 tests) ===

def test_delete_success(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={"id": "page-test-del", "slug": "test-del", "title": "Del", "content": ""},
    )
    res = client.delete("/api/admin/pages/page-test-del", headers=admin_headers)
    assert res.status_code == 204, res.text
    # Verify it's gone
    get_res = client.get("/api/admin/pages/page-test-del", headers=admin_headers)
    assert get_res.status_code == 404


def test_delete_nonexistent(client, admin_headers):
    res = client.delete("/api/admin/pages/does-not-exist", headers=admin_headers)
    assert res.status_code == 404, res.text


# === TestPageSitemap (1 test) ===

def test_sitemap_returns_published_visible_only(client, admin_headers):
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-sitemap-1",
            "slug": "test-sitemap-1",
            "title": "Sitemap 1",
            "content": "",
            "status": "published",
            "is_visible": True,
        },
    )
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-sitemap-2",
            "slug": "test-sitemap-2",
            "title": "Sitemap 2",
            "content": "",
            "status": "draft",
        },
    )
    client.post(
        "/api/admin/pages",
        headers=admin_headers,
        json={
            "id": "page-test-sitemap-3",
            "slug": "test-sitemap-3",
            "title": "Sitemap 3",
            "content": "",
            "status": "published",
            "is_visible": False,
        },
    )
    res = client.get("/api/pages/sitemap")
    assert res.status_code == 200, res.text
    slugs = [item["slug"] for item in res.json()]
    assert "test-sitemap-1" in slugs
    assert "test-sitemap-2" not in slugs  # draft excluded
    assert "test-sitemap-3" not in slugs  # hidden excluded
