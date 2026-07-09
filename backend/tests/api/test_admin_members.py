"""Tests for admin member management endpoints."""


def test_list_members_requires_auth(client):
    res = client.get("/api/admin/members")
    assert res.status_code == 401


def test_list_members_returns_all(client, admin_headers):
    # Ensure at least one test member exists
    client.post(
        "/api/member/register",
        json={
            "email": "list-all@test-member.com",
            "password": "password123",
            "name": "List All",
        },
    )
    res = client.get("/api/admin/members", headers=admin_headers)
    assert res.status_code == 200
    members = res.json()
    assert len(members) >= 1
    # Verify schema has inquiry_count
    assert "inquiry_count" in members[0]
    assert "is_verified" in members[0]


def test_list_members_with_search_query(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "search-target@test-member.com",
            "password": "password123",
            "name": "Search Target",
        },
    )
    res = client.get(
        "/api/admin/members?q=search-target",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert any(m["email"] == "search-target@test-member.com" for m in members)


def test_list_members_filter_by_is_verified(client, admin_headers):
    # Register but do NOT verify
    client.post(
        "/api/member/register",
        json={
            "email": "unverified@test-member.com",
            "password": "password123",
            "name": "Unverified",
        },
    )
    res = client.get(
        "/api/admin/members?is_verified=false",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert all(m["is_verified"] is False for m in members)
    assert any(m["email"] == "unverified@test-member.com" for m in members)


def test_list_members_filter_by_is_active(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "active-filter@test-member.com",
            "password": "password123",
            "name": "Active Filter",
        },
    )
    res = client.get(
        "/api/admin/members?is_active=true",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert all(m["is_active"] is True for m in members)
