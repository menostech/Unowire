import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.payment import PaymentService, dispatch_webhook_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["payments"])


async def _persist_webhook_event(
    db: AsyncSession,
    gateway: str,
    gateway_event_id: str | None,
    event_type: str | None,
    raw_payload: dict,
    amount_cents: int = 0,
):
    """Persist a webhook event to the payments table. Idempotent on gateway_event_id.

    Returns the created Payment row, or None if the event was already processed
    (duplicate delivery or a race-condition insert).
    """
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from app.models.payment import Payment

    # Check if already exists (idempotency)
    if gateway_event_id:
        stmt = select(Payment).where(Payment.gateway_event_id == gateway_event_id)
        existing = await db.execute(stmt)
        if existing.scalar_one_or_none():
            return None  # duplicate, already processed

    payment = Payment(
        order_id=None,  # will be linked by the handler when it processes the event
        gateway=gateway,
        gateway_event_id=gateway_event_id,
        event_type=event_type,
        type="payment",
        status="received",
        amount_cents=amount_cents,
        raw_payload=raw_payload,
    )
    try:
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        return payment
    except IntegrityError:
        await db.rollback()
        return None  # duplicate from race condition


# --- Public webhook receivers (no auth — verified by signature) ---


@router.post("/api/payments/webhooks/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Stripe webhook receiver.

    Verifies the Stripe-Signature header, persists the event idempotently, then
    dispatches to the registered handler. Never returns 500 to avoid gateway
    retries — signature failures return 400, everything else returns 200.
    """
    try:
        payload = await request.body()
        signature = request.headers.get("stripe-signature", "")
        if not signature:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "Missing stripe-signature header"},
            )

        svc = PaymentService(db)
        try:
            event = await svc.verify_stripe_webhook(payload, signature)
        except Exception:
            logger.warning("Stripe webhook signature verification failed", exc_info=True)
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "Signature verification failed"},
            )

        event_type = event.get("type", "")
        gateway_event_id = event.get("id", "")

        payment = await _persist_webhook_event(
            db, "stripe", gateway_event_id, event_type, event
        )
        if payment is None:
            # duplicate delivery — already processed
            return {"status": "ok"}

        try:
            await dispatch_webhook_event("stripe", event, event, db)
        except Exception:
            # Event is already persisted; log and acknowledge so the gateway
            # does not retry. Manual reconciliation can replay the stored event.
            logger.exception(
                "dispatch_webhook_event failed for stripe event %s", gateway_event_id
            )

        return {"status": "ok"}
    except Exception:
        # NEVER return 500 to the gateway (it would retry). Log and acknowledge.
        logger.exception("Unexpected error in stripe webhook receiver")
        return {"status": "ok"}


@router.post("/api/payments/webhooks/paypal")
async def paypal_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """PayPal webhook receiver.

    Verifies the PayPal transmission headers via the verify-webhook-signature
    API, persists the event idempotently, then dispatches to the registered
    handler. Never returns 500 to avoid gateway retries — signature failures
    return 400, everything else returns 200.
    """
    try:
        body = await request.json()
        headers = {
            "transmission_id": request.headers.get("paypal-transmission-id", ""),
            "transmission_sig": request.headers.get("paypal-transmission-sig", ""),
            "cert_url": request.headers.get("paypal-cert-url", ""),
            "auth_algo": request.headers.get("paypal-auth-algo", ""),
        }

        svc = PaymentService(db)
        try:
            event = await svc.verify_paypal_webhook(headers, body)
        except Exception:
            logger.warning("PayPal webhook signature verification failed", exc_info=True)
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "Signature verification failed"},
            )

        event_type = body.get("event_type", "")
        gateway_event_id = body.get("id", "")

        payment = await _persist_webhook_event(
            db, "paypal", gateway_event_id, event_type, body
        )
        if payment is None:
            # duplicate delivery — already processed
            return {"status": "ok"}

        try:
            await dispatch_webhook_event("paypal", body, body, db)
        except Exception:
            logger.exception(
                "dispatch_webhook_event failed for paypal event %s", gateway_event_id
            )

        return {"status": "ok"}
    except Exception:
        # NEVER return 500 to the gateway (it would retry). Log and acknowledge.
        logger.exception("Unexpected error in paypal webhook receiver")
        return {"status": "ok"}
