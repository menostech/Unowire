"""Tests for POST /api/member/subscription/checkout and related endpoints."""
from unittest.mock import AsyncMock, patch


def test_checkout_stripe_returns_redirect_url(client, member_token, personal_plan):
    """POST /api/member/subscription/checkout returns redirect_url for stripe."""
    with patch(
        "app.services.payment.PaymentService.create_subscription_checkout",
        new=AsyncMock(return_value={"redirect_url": "https://checkout.stripe.com/x", "order_id": 1}),
    ):
        res = client.post(
            "/api/member/subscription/checkout",
            headers={"Authorization": f"Bearer {member_token}"},
            json={"gateway": "stripe", "plan_id": personal_plan.id, "billing_cycle": "monthly"},
        )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["redirect_url"] == "https://checkout.stripe.com/x"
    assert "order_id" in data


def test_checkout_sales_led_plan_returns_400(client, member_token, enterprise_plan):
    """Sales-led plan (Enterprise) returns 400."""
    res = client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": enterprise_plan.id, "billing_cycle": "monthly"},
    )
    assert res.status_code == 400, res.text


def test_checkout_invalid_billing_cycle_returns_400(client, member_token, personal_plan):
    """Invalid billing_cycle returns 400."""
    res = client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": personal_plan.id, "billing_cycle": "weekly"},
    )
    assert res.status_code == 400, res.text


def test_checkout_conflict_when_already_paid(client, member_token, paid_subscription):
    """Member with an existing paid subscription returns 409."""
    res = client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": paid_subscription.plan_id, "billing_cycle": "monthly"},
    )
    assert res.status_code == 409, res.text
