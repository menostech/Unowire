"""Tests for the payment webhook receiver endpoints.

Signature verification is mocked at the ``PaymentService`` method level so the
tests exercise the full route pipeline (header checks, idempotent persistence,
dispatch) without depending on real gateway credentials. DB assertions use a
fresh ``async_session()`` inside ``asyncio.run()`` -- the same pattern used by
``test_member_auth.py`` / ``test_admin_messages.py``.
"""
import asyncio
import json
import uuid
from unittest.mock import AsyncMock, patch

from app.core.database import async_session
from app.models.payment import Payment
from app.services.payment import PaymentService
from sqlalchemy import delete, select


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stripe_event_id():
    return f"evt_test_stripe_{uuid.uuid4().hex[:8]}"


def _paypal_event_id():
    return f"evt_test_paypal_{uuid.uuid4().hex[:8]}"


def _count_payments(gateway_event_id):
    """Return the number of Payment rows matching ``gateway_event_id``."""
    async def _q():
        async with async_session() as s:
            result = await s.execute(
                select(Payment).where(Payment.gateway_event_id == gateway_event_id)
            )
            return result.all()
    return asyncio.run(_q())


def _get_payment(gateway_event_id):
    async def _q():
        async with async_session() as s:
            result = await s.execute(
                select(Payment).where(Payment.gateway_event_id == gateway_event_id)
            )
            return result.scalar_one_or_none()
    return asyncio.run(_q())


def _cleanup_payment(gateway_event_id):
    async def _c():
        async with async_session() as s:
            await s.execute(
                delete(Payment).where(Payment.gateway_event_id == gateway_event_id)
            )
            await s.commit()
    asyncio.run(_c())


def _post_stripe(client, body_dict, signature="t=123,v1=abc"):
    """POST a Stripe webhook payload (raw bytes) with the signature header."""
    return client.post(
        "/api/payments/webhooks/stripe",
        content=json.dumps(body_dict).encode(),
        headers={"stripe-signature": signature, "Content-Type": "application/json"},
    )


def _post_paypal(client, body_dict):
    """POST a PayPal webhook payload (JSON) with the PayPal headers."""
    return client.post(
        "/api/payments/webhooks/paypal",
        json=body_dict,
        headers={
            "paypal-transmission-id": "test-tid",
            "paypal-transmission-sig": "test-sig",
            "paypal-cert-url": "https://cert.example.com",
            "paypal-auth-algo": "SHA256withRSA",
            "Content-Type": "application/json",
        },
    )


# ---------------------------------------------------------------------------
# Stripe webhook receiver
# ---------------------------------------------------------------------------
def test_stripe_webhook_valid(client):
    event_id = _stripe_event_id()
    event = {"id": event_id, "type": "payment_intent.succeeded"}

    with patch.object(
        PaymentService, "verify_stripe_webhook", new_callable=AsyncMock,
        return_value=event,
    ):
        res = _post_stripe(client, event)

    assert res.status_code == 200

    payment = _get_payment(event_id)
    assert payment is not None
    assert payment.gateway == "stripe"
    assert payment.gateway_event_id == event_id
    assert payment.event_type == "payment_intent.succeeded"

    _cleanup_payment(event_id)


def test_stripe_webhook_invalid_signature(client):
    event_id = _stripe_event_id()

    with patch.object(
        PaymentService, "verify_stripe_webhook", new_callable=AsyncMock,
        side_effect=ValueError("Invalid signature"),
    ):
        res = _post_stripe(client, {"id": event_id}, signature="bad_sig")

    assert res.status_code == 400
    assert _get_payment(event_id) is None  # no Payment persisted


def test_stripe_webhook_idempotent(client):
    event_id = _stripe_event_id()
    event = {"id": event_id, "type": "payment_intent.succeeded"}

    with patch.object(
        PaymentService, "verify_stripe_webhook", new_callable=AsyncMock,
        return_value=event,
    ):
        res1 = _post_stripe(client, event)
        assert res1.status_code == 200

        res2 = _post_stripe(client, event)
        assert res2.status_code == 200

    rows = _count_payments(event_id)
    assert len(rows) == 1  # no duplicate

    _cleanup_payment(event_id)


# ---------------------------------------------------------------------------
# PayPal webhook receiver
# ---------------------------------------------------------------------------
def test_paypal_webhook_valid(client):
    event_id = _paypal_event_id()
    body = {"id": event_id, "event_type": "PAYMENT.CAPTURE.COMPLETED"}

    with patch.object(
        PaymentService, "verify_paypal_webhook", new_callable=AsyncMock,
        return_value=body,
    ):
        res = _post_paypal(client, body)

    assert res.status_code == 200

    payment = _get_payment(event_id)
    assert payment is not None
    assert payment.gateway == "paypal"
    assert payment.gateway_event_id == event_id
    assert payment.event_type == "PAYMENT.CAPTURE.COMPLETED"

    _cleanup_payment(event_id)


def test_paypal_webhook_invalid_signature(client):
    event_id = _paypal_event_id()
    body = {"id": event_id, "event_type": "PAYMENT.CAPTURE.COMPLETED"}

    with patch.object(
        PaymentService, "verify_paypal_webhook", new_callable=AsyncMock,
        side_effect=ValueError("Invalid signature"),
    ):
        res = _post_paypal(client, body)

    assert res.status_code == 400
    assert _get_payment(event_id) is None  # no Payment persisted


def test_paypal_webhook_idempotent(client):
    event_id = _paypal_event_id()
    body = {"id": event_id, "event_type": "PAYMENT.CAPTURE.COMPLETED"}

    with patch.object(
        PaymentService, "verify_paypal_webhook", new_callable=AsyncMock,
        return_value=body,
    ):
        res1 = _post_paypal(client, body)
        assert res1.status_code == 200

        res2 = _post_paypal(client, body)
        assert res2.status_code == 200

    rows = _count_payments(event_id)
    assert len(rows) == 1  # no duplicate

    _cleanup_payment(event_id)
