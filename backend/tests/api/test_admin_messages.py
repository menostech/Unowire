"""Tests for admin system message endpoints."""


def test_list_messages_requires_auth(client):
    res = client.get("/api/admin/messages")
    assert res.status_code == 401


def test_list_messages_returns_all(client, admin_headers):
    # Create a message first
    client.post(
        "/api/admin/messages",
        json={"title": "Test Message", "body": "Hello members"},
        headers=admin_headers,
    )
    res = client.get("/api/admin/messages", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    last = data["items"][0]
    assert last["title"] == "Test Message"
    assert last["body"] == "Hello members"
    assert "created_by_email" in last


def test_get_message_by_id(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Get Me", "body": "Body content"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["id"] == msg_id
    assert res.json()["title"] == "Get Me"


def test_get_message_not_found(client, admin_headers):
    res = client.get("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404


def test_create_message(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "New Message", "body": "Body text"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    assert res.json()["id"] > 0
    assert res.json()["title"] == "New Message"
    # Cleanup
    client.delete(f"/api/admin/messages/{res.json()['id']}", headers=admin_headers)


def test_create_message_invalid_payload(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "", "body": ""},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_delete_message(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "To Delete", "body": "Bye"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 204
    # Verify gone
    get_res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert get_res.status_code == 404


def test_delete_message_not_found(client, admin_headers):
    res = client.delete("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404
