"""Tests for portal staff inbox endpoints."""


def _create_targeted(client, admin_headers, targets):
    """Helper: create a targeted message and return its id."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Portal Test",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": targets,
        },
        headers=admin_headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def test_portal_messages_requires_auth(client):
    res = client.get("/api/portal/messages")
    assert res.status_code == 401


def test_cable_manager_sees_cable_managers_group(client, admin_headers, cable_manager_headers, db_session):
    """Cable manager sees messages targeting group=cable_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "cable_managers"}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_equipment_manager_sees_equipment_managers_group(client, admin_headers, equipment_manager_headers, db_session):
    """Equipment manager sees messages targeting group=equipment_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "equipment_managers"}])
    res = client.get("/api/portal/messages", headers=equipment_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_cable_manager_does_not_see_equipment_managers_group(client, admin_headers, cable_manager_headers, db_session):
    """Cable manager does NOT see messages targeting only group=equipment_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "equipment_managers"}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id not in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_broadcast_excluded_from_portal(client, admin_headers, cable_manager_headers):
    """Broadcast messages are NOT visible in the staff inbox."""
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Broadcast", "body": "Body"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id not in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_staff_sees_individual_user_target(client, admin_headers, cable_manager_headers, db_session):
    """Staff user sees messages targeting kind=user with their user_id.
    We need to know the cable_manager's user_id — query it via /api/portal/auth/me.
    """
    me_res = client.get("/api/portal/auth/me", headers=cable_manager_headers)
    assert me_res.status_code == 200
    user_id = me_res.json()["id"]
    msg_id = _create_targeted(client, admin_headers, [{"kind": "user", "value": user_id}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
