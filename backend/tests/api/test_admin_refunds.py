"""Tests for the admin refund endpoint POST /api/admin/orders/{order_id}/refund.

Covers: full refund, partial refund, two partial refunds completing the full
amount, over-amount rejection (422), order-not-found (404), idempotency on
already-refunded orders, and permission gating (403 for an admin lacking the
``payment`` module).

``PaymentService.refund_payment`` is replaced via an autouse fixture so no
real gateway (Stripe/PayPal) calls are made in the test environment.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import text

from app.core.database import async_session
from app.core.security import hash_password
from app.models.member import Member
from app.models.order import Order
from app.models.payment import Payment
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.payment import RefundResult
from app.services.payment import PaymentService


# ---------------------------------------------------------------------------
# Autouse fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _ensure_admin_payment_module():
    """Idempotently ensure the admin role has the ``payment`` module permission.

    The seed migration already grants this; this is a safety net so a prior
    test that temporarily removed the permission cannot break these tests.
    """

    async def _seed():
        async with async_session() as s:
            await s.execute(text(
                "INSERT INTO role_permissions (role_id, module) "
                "VALUES ('admin', 'payment') ON CONFLICT DO NOTHING"
            ))
            await s.commit()

    asyncio.run(_seed())


@pytest.fixture(autouse=True)
def _patch_refund_payment(monkeypatch):
    """Autouse: replace ``PaymentService.refund_payment`` with a fake that
    returns a successful ``RefundResult`` without real gateway calls.

    Returns a dict tracking the number of gateway calls made during the test
    so the idempotency test can assert the gateway was not called twice.
    """
    calls = {"n": 0}

    async def _fake_refund(self, gateway, payment_id, amount_cents=None):
        calls["n"] += 1
        return RefundResult(
            status="succeeded",
            refund_id=f"re_fake_{calls['n']}",
            amount_cents=amount_cents if amount_cents is not None else 0,
        )

    monkeypatch.setattr(PaymentService, "refund_payment", _fake_refund)
    return calls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_order_and_payment(amount_cents=1500, gateway="stripe"):
    """Insert a Member, Plan, Order (status=succeeded), and original Payment.

    Each test gets a unique suffix so rows never collide across tests in the
    same session. Returns ``(member_id, plan_id, order_id, payment_id)``.
    """
    suffix = uuid.uuid4().hex[:8]
    async with async_session() as db:
        member = Member(
            email=f"refund-{suffix}@test-member.com",
            password_hash=hash_password("test123456"),
            name=f"Refund Test {suffix}",
        )
        db.add(member)
        await db.commit()
        await db.refresh(member)

        plan = SubscriptionPlan(
            name=f"RefundPlan {suffix}",
            tier_level=f"refund_{suffix}",
            price_monthly=15,
            price_yearly=149,
            is_active=True,
            features=[],
            sort_order=999,
            trial_days=0,
        )
        db.add(plan)
        await db.commit()
        await db.refresh(plan)

        order = Order(
            member_id=member.id,
            plan_id=plan.id,
            billing_cycle="monthly",
            gateway=gateway,
            gateway_order_id=f"cs_test_{suffix}",
            amount_cents=amount_cents,
            currency="usd",
            status="succeeded",
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        payment = Payment(
            order_id=order.id,
            gateway=gateway,
            gateway_payment_id=f"pi_test_{suffix}",
            type="payment",
            status="succeeded",
            amount_cents=amount_cents,
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)

        return member.id, plan.id, order.id, payment.id


async def _count_refund_payments(order_id):
    """Return the number of refund payment rows for the given order."""
    async with async_session() as s:
        result = await s.execute(
            text(
                "SELECT COUNT(*) FROM payments "
                "WHERE order_id = :oid AND type = 'refund'"
            ),
            {"oid": order_id},
        )
        return result.scalar()


async def _cleanup(member_id, plan_id, order_id):
    """Delete test-created rows: payments, order, member, plan.

    Order matters: payments -> order -> member (cascades) -> plan (RESTRICT
    until the referencing order is gone).
    """
    async with async_session() as s:
        await s.execute(
            text("DELETE FROM payments WHERE order_id = :oid"), {"oid": order_id}
        )
        await s.execute(
            text("DELETE FROM orders WHERE id = :oid"), {"oid": order_id}
        )
        await s.execute(
            text("DELETE FROM members WHERE id = :mid"), {"mid": member_id}
        )
        await s.execute(
            text("DELETE FROM subscription_plans WHERE id = :pid"), {"pid": plan_id}
        )
        await s.commit()


async def _remove_admin_payment_module():
    async with async_session() as s:
        await s.execute(text(
            "DELETE FROM role_permissions WHERE role_id = 'admin' AND module = 'payment'"
        ))
        await s.commit()


async def _restore_admin_payment_module():
    async with async_session() as s:
        await s.execute(text(
            "INSERT INTO role_permissions (role_id, module) "
            "VALUES ('admin', 'payment') ON CONFLICT DO NOTHING"
        ))
        await s.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_refund_unknown_order_returns_404(client, admin_headers):
    """POST /api/admin/orders/{order_id}/refund on a non-existent order returns 404."""
    res = client.post(
        "/api/admin/orders/999999/refund",
        json={},
        headers=admin_headers,
    )
    assert res.status_code == 404, res.text
    body = res.json()
    assert body.get("code") == 404
    assert body.get("message") == "Order not found"


def test_full_refund_sets_refunded_status(client, admin_headers):
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        res = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["order"]["status"] == "refunded"
        assert data["refund_payment"]["type"] == "refund"
        assert data["refund_payment"]["amount_cents"] == 1500
        assert asyncio.run(_count_refund_payments(order_id)) == 1
    finally:
        asyncio.run(_cleanup(member_id, plan_id, order_id))


def test_partial_refund_sets_partially_refunded(client, admin_headers):
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        res = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={"amount": 500},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["order"]["status"] == "partially_refunded"
        assert data["refund_payment"]["amount_cents"] == 500
        assert asyncio.run(_count_refund_payments(order_id)) == 1
    finally:
        asyncio.run(_cleanup(member_id, plan_id, order_id))


def test_two_partial_refunds_completing_full_sets_refunded(client, admin_headers):
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        res1 = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={"amount": 500},
            headers=admin_headers,
        )
        assert res1.status_code == 200, res1.text
        assert res1.json()["order"]["status"] == "partially_refunded"

        res2 = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={"amount": 1000},
            headers=admin_headers,
        )
        assert res2.status_code == 200, res2.text
        assert res2.json()["order"]["status"] == "refunded"
        assert asyncio.run(_count_refund_payments(order_id)) == 2
    finally:
        asyncio.run(_cleanup(member_id, plan_id, order_id))


def test_refund_over_amount_rejected(client, admin_headers):
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        res = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={"amount": 99999},
            headers=admin_headers,
        )
        assert res.status_code == 422, res.text
        # No refund payment should have been created.
        assert asyncio.run(_count_refund_payments(order_id)) == 0
    finally:
        asyncio.run(_cleanup(member_id, plan_id, order_id))


def test_refund_already_refunded_is_idempotent(client, admin_headers, _patch_refund_payment):
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        # First refund: full amount.
        res1 = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={},
            headers=admin_headers,
        )
        assert res1.status_code == 200, res1.text
        assert res1.json()["order"]["status"] == "refunded"
        assert _patch_refund_payment["n"] == 1

        # Second refund attempt: idempotent — no gateway call, no duplicate row.
        res2 = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={},
            headers=admin_headers,
        )
        assert res2.status_code == 200, res2.text
        assert res2.json()["order"]["status"] == "refunded"
        # Gateway was NOT called again.
        assert _patch_refund_payment["n"] == 1
        # Still only one refund payment row.
        assert asyncio.run(_count_refund_payments(order_id)) == 1
    finally:
        asyncio.run(_cleanup(member_id, plan_id, order_id))


def test_refund_without_payment_module_returns_403(client, admin_headers):
    """An admin lacking the ``payment`` module permission gets 403."""
    member_id, plan_id, order_id, _ = asyncio.run(_make_order_and_payment())
    try:
        asyncio.run(_remove_admin_payment_module())

        res = client.post(
            f"/api/admin/orders/{order_id}/refund",
            json={},
            headers=admin_headers,
        )
        assert res.status_code == 403, res.text
        body = res.json()
        assert body.get("code") == 403
        assert "payment" in body.get("message", "")
    finally:
        # Restore the payment module so subsequent tests are not affected.
        asyncio.run(_restore_admin_payment_module())
        asyncio.run(_cleanup(member_id, plan_id, order_id))
