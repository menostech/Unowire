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


def test_get_member_by_id(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "get-by-id@test-member.com",
            "password": "password123",
            "name": "Get By Id",
        },
    )
    # Find the member in the list
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member = next(m for m in listing if m["email"] == "get-by-id@test-member.com")
    member_id = member["id"]

    res = client.get(f"/api/admin/members/{member_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "get-by-id@test-member.com"
    assert res.json()["inquiry_count"] == 0


def test_get_member_by_id_not_found_returns_404(client, admin_headers):
    res = client.get("/api/admin/members/999999", headers=admin_headers)
    assert res.status_code == 404


def test_update_member_fields(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "update-test@test-member.com",
            "password": "password123",
            "name": "Original Name",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "update-test@test-member.com")

    res = client.put(
        f"/api/admin/members/{member_id}",
        headers=admin_headers,
        json={"name": "Updated Name", "company": "ACME Corp", "phone": "+1234567890"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Updated Name"
    assert data["company"] == "ACME Corp"
    assert data["phone"] == "+1234567890"


def test_update_member_not_found_returns_404(client, admin_headers):
    res = client.put(
        "/api/admin/members/999999",
        headers=admin_headers,
        json={"name": "Ghost", "company": None, "phone": None},
    )
    assert res.status_code == 404


def test_activate_member_toggles_is_active(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "activate-test@test-member.com",
            "password": "password123",
            "name": "Activate Test",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "activate-test@test-member.com")

    # Deactivate
    res = client.put(
        f"/api/admin/members/{member_id}/activate",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Reactivate
    res = client.put(
        f"/api/admin/members/{member_id}/activate",
        headers=admin_headers,
        json={"is_active": True},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is True


def test_verify_member_sets_is_verified_true(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "verify-test@test-member.com",
            "password": "password123",
            "name": "Verify Test",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member = next(m for m in listing if m["email"] == "verify-test@test-member.com")
    assert member["is_verified"] is False  # not verified yet

    res = client.put(
        f"/api/admin/members/{member['id']}/verify",
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_verified"] is True


def test_verify_member_clears_verification_token(client, admin_headers):
    client.post(
        "/api/member/register",
        json={
            "email": "token-clear@test-member.com",
            "password": "password123",
            "name": "Token Clear",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "token-clear@test-member.com")

    # Manually verify
    client.put(f"/api/admin/members/{member_id}/verify", headers=admin_headers)

    # Verify the member can now login WITHOUT needing the token
    # (login should work for verified members)
    login_res = client.post(
        "/api/member/login",
        json={"email": "token-clear@test-member.com", "password": "password123"},
    )
    assert login_res.status_code == 200
