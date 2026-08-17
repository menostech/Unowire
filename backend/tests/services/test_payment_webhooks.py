"""Tests for paid subscription webhook handlers."""
import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_stripe_checkout_completed_activates_subscription(db_session, personal_plan, freemium_plan):
    """The checkout.session.completed handler creates a paid MemberSubscription."""
    from app.services.payment_webhooks import _handle_stripe_checkout_completed

    event = {
        "id": "evt_test_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "client_reference_id": "1",
                "subscription": "sub_test_1",
            }
        },
    }
    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())

    with patch("app.services.payment_webhooks.PaymentService._stripe_retrieve_subscription", new=AsyncMock(return_value={"status": "active", "current_period_end": period_end})):
        await _handle_stripe_checkout_completed(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == "sub_test_1")
    sub = (await db_session.execute(stmt)).scalar_one()
    assert sub.status == "paid"
    assert sub.gateway == "stripe"
    assert sub.member_id == 1


@pytest.mark.asyncio
async def test_stripe_payment_failed_marks_past_due(db_session, paid_subscription):
    """The invoice.payment_failed handler flips paid to past_due with a grace window."""
    from app.services.payment_webhooks import _handle_stripe_payment_failed

    event = {
        "id": "evt_test_2",
        "type": "invoice.payment_failed",
        "data": {"object": {"subscription": paid_subscription.gateway_subscription_id}},
    }
    await _handle_stripe_payment_failed(event, event, db_session)

    await db_session.refresh(paid_subscription)
    assert paid_subscription.status == "past_due"
    assert paid_subscription.grace_period_end is not None


@pytest.mark.asyncio
async def test_stripe_payment_succeeded_clears_past_due(db_session, past_due_subscription):
    """The invoice.payment_succeeded handler rolls back past_due to paid."""
    from app.services.payment_webhooks import _handle_stripe_payment_succeeded

    new_period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    event = {
        "id": "evt_test_3",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "subscription": past_due_subscription.gateway_subscription_id,
                "period_end": new_period_end,
            }
        },
    }
    await _handle_stripe_payment_succeeded(event, event, db_session)

    await db_session.refresh(past_due_subscription)
    assert past_due_subscription.status == "paid"
    assert past_due_subscription.grace_period_end is None


@pytest.mark.asyncio
async def test_paypal_subscription_activated(db_session, personal_plan):
    """The BILLING.SUBSCRIPTION.ACTIVATED handler creates a paid MemberSubscription."""
    from app.services.payment_webhooks import _handle_paypal_subscription_activated

    next_billing = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    event = {
        "id": "evt_pp_1",
        "event_type": "BILLING.SUBSCRIPTION.ACTIVATED",
        "resource": {
            "id": "I-PAYPALSUB1",
            "custom_id": "1",
            "billing_info": {"next_billing_time": next_billing},
        },
    }
    await _handle_paypal_subscription_activated(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == "I-PAYPALSUB1")
    sub = (await db_session.execute(stmt)).scalar_one()
    assert sub.status == "paid"
    assert sub.gateway == "paypal"


@pytest.mark.asyncio
async def test_webhook_idempotency_duplicate_event(db_session, paid_subscription):
    """Replaying the same checkout.session.completed event is a no-op (idempotent)."""
    from app.services.payment_webhooks import _handle_stripe_checkout_completed

    event = {
        "id": "evt_dup_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_dup_1",
                "client_reference_id": str(paid_subscription.member_id),
                "subscription": paid_subscription.gateway_subscription_id,
            }
        },
    }
    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())

    with patch("app.services.payment_webhooks.PaymentService._stripe_retrieve_subscription", new=AsyncMock(return_value={"status": "active", "current_period_end": period_end})):
        await _handle_stripe_checkout_completed(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == paid_subscription.gateway_subscription_id)
    subs = (await db_session.execute(stmt)).scalars().all()
    assert len(subs) == 1  # no duplicate created
