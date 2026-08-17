"""Tests for the Order and Payment models (DB-level).

Exercises column persistence, the nullable ``Payment.order_id`` FK, the
DB-level ``ON DELETE CASCADE`` on ``payments.order_id``, and the partial unique
index ``uq_payments_gateway_event_id``.

Uses the shared ``db_session`` fixture (real test PostgreSQL via asyncpg +
NullPool) following the same pattern as ``test_subscription_service.py``.
"""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.database import async_session
from app.core.security import hash_password
from app.models.member import Member
from app.models.order import Order
from app.models.payment import Payment
from app.models.subscription_plan import SubscriptionPlan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _make_member_and_plan(db_session, tag="model"):
    """Insert a Member + SubscriptionPlan and return (member, plan)."""
    suffix = uuid.uuid4().hex[:8]
    member = Member(
        email=f"model-{tag}-{suffix}@test-member.com",
        password_hash=hash_password("test123456"),
        name=f"Model {tag}",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    plan = SubscriptionPlan(
        name=f"ModelPlan {suffix}",
        tier_level=f"model_{suffix}",
        price_monthly=15,
        price_yearly=149,
        is_active=True,
        features=[],
        sort_order=999,
        trial_days=0,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return member, plan


# ---------------------------------------------------------------------------
# Order model
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_order_create(db_session):
    member, plan = await _make_member_and_plan(db_session, tag="order-create")
    order = Order(
        member_id=member.id,
        plan_id=plan.id,
        billing_cycle="monthly",
        gateway="stripe",
        gateway_order_id="cs_test_order_create",
        amount_cents=1500,
        currency="usd",
        status="pending",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    assert order.id is not None
    assert order.member_id == member.id
    assert order.plan_id == plan.id
    assert order.billing_cycle == "monthly"
    assert order.gateway == "stripe"
    assert order.gateway_order_id == "cs_test_order_create"
    assert order.amount_cents == 1500
    assert order.currency == "usd"
    assert order.status == "pending"
    assert order.created_at is not None
    assert order.updated_at is not None

    # Cleanup
    await db_session.delete(order)
    await db_session.commit()
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


# ---------------------------------------------------------------------------
# Payment model
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_payment_create_with_null_order(db_session):
    """A Payment with order_id=None must persist (webhook event before order
    linkage). The column is nullable=True.
    """
    event_id = f"evt_null_order_{uuid.uuid4().hex[:8]}"
    payment = Payment(
        order_id=None,
        gateway="stripe",
        gateway_event_id=event_id,
        event_type="payment_intent.succeeded",
        type="payment",
        status="received",
        amount_cents=0,
        raw_payload={"id": event_id},
    )
    db_session.add(payment)
    await db_session.commit()
    await db_session.refresh(payment)

    assert payment.id is not None
    assert payment.order_id is None
    assert payment.gateway == "stripe"
    assert payment.gateway_event_id == event_id
    assert payment.event_type == "payment_intent.succeeded"
    assert payment.type == "payment"
    assert payment.status == "received"
    assert payment.amount_cents == 0
    assert payment.raw_payload == {"id": event_id}
    assert payment.created_at is not None

    # Cleanup
    await db_session.delete(payment)
    await db_session.commit()


@pytest.mark.asyncio
async def test_payment_order_cascade(db_session):
    """Deleting an Order must cascade-delete the linked Payment at the DB level
    (ON DELETE CASCADE on payments.order_id FK).
    """
    member, plan = await _make_member_and_plan(db_session, tag="cascade")
    order = Order(
        member_id=member.id,
        plan_id=plan.id,
        billing_cycle="monthly",
        gateway="stripe",
        gateway_order_id=f"cs_cascade_{uuid.uuid4().hex[:8]}",
        amount_cents=1500,
        currency="usd",
        status="pending",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    payment = Payment(
        order_id=order.id,
        gateway="stripe",
        gateway_event_id=f"evt_cascade_{uuid.uuid4().hex[:8]}",
        event_type="payment_intent.succeeded",
        type="payment",
        status="received",
        amount_cents=1500,
        raw_payload={"id": "evt_cascade"},
    )
    db_session.add(payment)
    await db_session.commit()
    await db_session.refresh(payment)
    payment_id = payment.id

    # Delete the order -- the DB-level CASCADE should remove the payment row.
    await db_session.delete(order)
    await db_session.commit()

    # Use a fresh session to avoid identity-map caching of the deleted Payment.
    async with async_session() as s:
        result = await s.execute(
            select(Payment).where(Payment.id == payment_id)
        )
        assert result.scalar_one_or_none() is None

    # Cleanup (order + payment already gone; just the plan + member remain)
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.mark.asyncio
async def test_payment_gateway_event_id_unique(db_session):
    """Two Payment rows with the same non-null gateway_event_id must violate
    the partial unique index ``uq_payments_gateway_event_id``.
    """
    event_id = f"evt_unique_{uuid.uuid4().hex[:8]}"

    p1 = Payment(
        order_id=None,
        gateway="stripe",
        gateway_event_id=event_id,
        type="payment",
        status="received",
        amount_cents=0,
    )
    db_session.add(p1)
    await db_session.commit()

    p2 = Payment(
        order_id=None,
        gateway="stripe",
        gateway_event_id=event_id,  # same event id -- must conflict
        type="payment",
        status="received",
        amount_cents=0,
    )
    db_session.add(p2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    # Only p1 should exist; clean it up.
    result = await db_session.execute(
        select(Payment).where(Payment.gateway_event_id == event_id)
    )
    p1_fresh = result.scalar_one()
    await db_session.delete(p1_fresh)
    await db_session.commit()
