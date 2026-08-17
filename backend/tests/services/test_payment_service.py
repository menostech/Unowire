"""Tests for the PaymentService abstraction (Stripe + PayPal providers).

SDK calls (``stripe`` and ``httpx``) are mocked with ``unittest.mock``; DB
operations use the real test PostgreSQL via the shared ``db_session`` fixture so
that ``Order`` persistence is exercised end-to-end.
"""
import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.models.member import Member
from app.models.order import Order
from app.models.subscription_plan import SubscriptionPlan
from app.services.payment import (
    PaymentConfigError,
    PaymentService,
    _webhook_handlers,
    dispatch_webhook_event,
    register_webhook_handler,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _make_member_and_plan(db_session, tag="svc"):
    """Insert a Member + SubscriptionPlan and return (member, plan).

    Uses a random suffix so tests can run in any order without unique-key
    collisions, and @test-member.com emails so the session-scoped conftest
    cleanup catches any leftover rows.
    """
    suffix = uuid.uuid4().hex[:8]
    member = Member(
        email=f"pay-{tag}-{suffix}@test-member.com",
        password_hash=hash_password("test123456"),
        name=f"Pay {tag}",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    plan = SubscriptionPlan(
        name=f"TestPlan {suffix}",
        tier_level=f"test_{suffix}",
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


async def _cleanup_order(db_session, gateway_order_id):
    """Delete an Order row (and any linked payments via FK) by gateway_order_id."""
    stmt = select(Order).where(Order.gateway_order_id == gateway_order_id)
    result = await db_session.execute(stmt)
    order = result.scalar_one_or_none()
    if order is not None:
        await db_session.delete(order)
        await db_session.commit()


async def _cleanup_member_and_plan(db_session, member, plan):
    await db_session.delete(plan)
    await db_session.delete(member)
    await db_session.commit()


@pytest.fixture
def clean_webhook_registry():
    """Save and restore the module-level webhook handler registry.

    The registry is a module-level singleton; without this fixture a handler
    registered in one test would leak into subsequent tests.
    """
    saved = dict(_webhook_handlers)
    yield
    _webhook_handlers.clear()
    _webhook_handlers.update(saved)


# ---------------------------------------------------------------------------
# create_payment_intent -- Stripe
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_create_stripe_payment_intent(db_session, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe_svc")
    member, plan = await _make_member_and_plan(db_session, tag="stripe-intent")

    mock_session = SimpleNamespace(
        id="cs_test_123", url="https://checkout.stripe.com/test"
    )
    mock_stripe = MagicMock()
    mock_stripe.checkout.Session.create.return_value = mock_session

    with patch("app.services.payment.stripe", mock_stripe):
        svc = PaymentService(db_session)
        result = await svc.create_payment_intent(
            gateway="stripe",
            member_id=member.id,
            plan_id=plan.id,
            billing_cycle="monthly",
            amount_cents=1500,
        )

    assert result == {
        "intent_id": "cs_test_123",
        "redirect_url": "https://checkout.stripe.com/test",
    }

    # An Order row should have been persisted
    stmt = select(Order).where(Order.gateway_order_id == "cs_test_123")
    order = (await db_session.execute(stmt)).scalar_one()
    assert order.gateway == "stripe"
    assert order.status == "pending"
    assert order.gateway_order_id == "cs_test_123"
    assert order.amount_cents == 1500
    assert order.member_id == member.id
    assert order.plan_id == plan.id
    assert order.billing_cycle == "monthly"

    # Cleanup
    await _cleanup_order(db_session, "cs_test_123")
    await _cleanup_member_and_plan(db_session, member, plan)


# ---------------------------------------------------------------------------
# create_payment_intent -- PayPal
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_create_paypal_payment_intent(db_session, monkeypatch):
    monkeypatch.setattr(settings, "paypal_client_id", "test_client_id")
    monkeypatch.setattr(settings, "paypal_client_secret", "test_client_secret")
    member, plan = await _make_member_and_plan(db_session, tag="paypal-intent")

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {
        "id": "ORDER_123",
        "links": [{"href": "https://paypal.approve.url", "rel": "approve"}],
    }
    mock_client = AsyncMock()
    mock_client.post.return_value = mock_resp
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch.object(
        PaymentService, "_get_paypal_access_token", new_callable=AsyncMock,
        return_value="fake_token",
    ), patch(
        "app.services.payment.httpx.AsyncClient", return_value=mock_client,
    ):
        svc = PaymentService(db_session)
        result = await svc.create_payment_intent(
            gateway="paypal",
            member_id=member.id,
            plan_id=plan.id,
            billing_cycle="monthly",
            amount_cents=1500,
        )

    assert result == {
        "intent_id": "ORDER_123",
        "redirect_url": "https://paypal.approve.url",
    }

    stmt = select(Order).where(Order.gateway_order_id == "ORDER_123")
    order = (await db_session.execute(stmt)).scalar_one()
    assert order.gateway == "paypal"
    assert order.status == "pending"
    assert order.gateway_order_id == "ORDER_123"

    # Cleanup
    await _cleanup_order(db_session, "ORDER_123")
    await _cleanup_member_and_plan(db_session, member, plan)


# ---------------------------------------------------------------------------
# PaymentConfigError on missing credentials
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_payment_config_error_stripe_missing_key(db_session, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    svc = PaymentService(db_session)
    with pytest.raises(PaymentConfigError):
        await svc.create_payment_intent(
            gateway="stripe",
            member_id=1,
            plan_id=1,
            billing_cycle="monthly",
            amount_cents=1500,
        )


@pytest.mark.asyncio
async def test_payment_config_error_paypal_missing_creds(db_session, monkeypatch):
    monkeypatch.setattr(settings, "paypal_client_id", "")
    monkeypatch.setattr(settings, "paypal_client_secret", "")
    svc = PaymentService(db_session)
    with pytest.raises(PaymentConfigError):
        await svc.create_payment_intent(
            gateway="paypal",
            member_id=1,
            plan_id=1,
            billing_cycle="monthly",
            amount_cents=1500,
        )


# ---------------------------------------------------------------------------
# refund_payment -- Stripe
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_refund_payment_stripe(db_session, monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe_refund")

    mock_refund = SimpleNamespace(id="re_123", status="succeeded", amount=1500)
    mock_stripe = MagicMock()
    mock_stripe.Refund.create.return_value = mock_refund

    with patch("app.services.payment.stripe", mock_stripe):
        svc = PaymentService(db_session)
        result = await svc.refund_payment(
            gateway="stripe", payment_id="pi_123", amount_cents=1500
        )

    assert result.status == "succeeded"
    assert result.refund_id == "re_123"
    assert result.amount_cents == 1500


# ---------------------------------------------------------------------------
# verify_stripe_webhook
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_verify_stripe_webhook_valid(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe_wh")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")

    event = {"id": "evt_123", "type": "payment_intent.succeeded"}
    mock_stripe = MagicMock()
    mock_stripe.Webhook.construct_event.return_value = event

    with patch("app.services.payment.stripe", mock_stripe):
        svc = PaymentService(MagicMock())  # db unused by verify_stripe_webhook
        result = await svc.verify_stripe_webhook(
            b'{"id": "evt_123"}', "t=123,v1=abc"
        )

    assert result == event
    mock_stripe.Webhook.construct_event.assert_called_once()


@pytest.mark.asyncio
async def test_verify_stripe_webhook_invalid(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_stripe_wh")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")

    mock_stripe = MagicMock()
    mock_stripe.Webhook.construct_event.side_effect = ValueError(
        "Invalid signature"
    )

    with patch("app.services.payment.stripe", mock_stripe):
        svc = PaymentService(MagicMock())
        with pytest.raises(ValueError):
            await svc.verify_stripe_webhook(
                b'{"id": "evt_123"}', "invalid_sig"
            )


# ---------------------------------------------------------------------------
# Module-level webhook handler registry
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_webhook_handler_registry_dispatch(clean_webhook_registry):
    handler = AsyncMock()
    register_webhook_handler("stripe", "checkout.session.completed", handler)

    event = {"type": "checkout.session.completed", "id": "evt_test"}
    db = MagicMock()
    await dispatch_webhook_event("stripe", event, {}, db)

    handler.assert_awaited_once_with(event, {}, db)


@pytest.mark.asyncio
async def test_webhook_handler_registry_noop_unregistered(clean_webhook_registry):
    # No handler registered for ("stripe", "unknown.event") -- must not raise.
    db = MagicMock()
    await dispatch_webhook_event(
        "stripe", {"type": "unknown.event"}, {}, db
    )
