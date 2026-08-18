"""Minimal reachability test for the admin refund endpoint.

The full refund test suite is added in Task 3; this file exists only to
drive TDD for Task 2 (endpoint registration + 404 path).
"""
import pytest


def test_refund_unknown_order_returns_404(client, admin_headers):
    """POST /api/admin/orders/{order_id}/refund on a non-existent order returns 404.

    This is the minimal RED test that proves the endpoint is registered and
    reachable: before the route exists, FastAPI returns 404 for the path
    itself (route not found) or 405 (method not allowed) — neither matches
    the structured ``{"code": 404, "message": "Order not found"}`` body
    that the handler returns once implemented.
    """
    res = client.post(
        "/api/admin/orders/999999/refund",
        json={},
        headers=admin_headers,
    )
    assert res.status_code == 404, res.text
    body = res.json()
    assert body.get("code") == 404
    assert body.get("message") == "Order not found"
