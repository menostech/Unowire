"""Tests for portal inquiries routes."""
import pytest


def test_portal_inquiries_list(client, cable_manager_headers):
    res = client.get("/api/portal/inquiries", headers=cable_manager_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_portal_inquiries_unread_count(client, cable_manager_headers):
    res = client.get("/api/portal/inquiries/unread-count", headers=cable_manager_headers)
    assert res.status_code == 200
    assert "count" in res.json()


def test_portal_inquiries_requires_portal_token(client, admin_headers):
    res = client.get("/api/portal/inquiries", headers=admin_headers)
    assert res.status_code == 401


def test_portal_inquiries_detail_other_scope_returns_404(client, cable_manager_headers):
    res = client.get("/api/portal/inquiries/999999", headers=cable_manager_headers)
    assert res.status_code == 404


def test_portal_inquiries_reply_other_scope_returns_404(client, cable_manager_headers):
    res = client.post(
        "/api/portal/inquiries/999999/reply",
        json={"reply_body": "Test reply"},
        headers=cable_manager_headers,
    )
    assert res.status_code == 404
