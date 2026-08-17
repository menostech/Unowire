"""Payment gateway abstraction layer.

Provides a gateway-agnostic ``PaymentService`` that dispatches to internal
Stripe / PayPal provider methods based on the ``gateway`` parameter
(``"stripe"`` | ``"paypal"``). The service is responsible for talking to the
gateway APIs and persisting the local ``Order`` rows; webhook persistence and
dispatch is handled via the module-level handler registry.

The Stripe provider uses the synchronous ``stripe`` SDK (wrapped with
``asyncio.to_thread`` so the event loop is never blocked), while the PayPal
provider talks to the PayPal REST API v2 over ``httpx``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

import httpx
import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.order import Order
from app.schemas.payment import PaymentResult, RefundResult

logger = logging.getLogger(__name__)

# Configure the Stripe SDK at import time. Individual provider methods also
# reset the key per-call so that late-loaded configuration or test overrides
# are picked up automatically.
stripe.api_key = settings.stripe_secret_key


class PaymentConfigError(Exception):
    """Raised when required gateway credentials are missing."""


# ---------------------------------------------------------------------------
# Module-level webhook handler registry (singleton)
#
# Lets the route layer register handlers once at startup and dispatch webhook
# events without needing to instantiate ``PaymentService`` for the dispatch.
# ---------------------------------------------------------------------------
_webhook_handlers: dict[tuple[str, str], Callable] = {}


def register_webhook_handler(gateway: str, event_type: str, handler: Callable) -> None:
    """Register a handler for a ``(gateway, event_type)`` pair at module level."""
    _webhook_handlers[(gateway, event_type)] = handler


async def dispatch_webhook_event(
    gateway: str, event: dict, raw_payload: dict, db: AsyncSession
) -> None:
    """Dispatch a verified webhook event to the module-level registered handler.

    Handlers registered here receive ``(event, raw_payload, db)``. If no
    handler is registered for the event's type the call is a no-op and a
    warning is logged.
    """
    event_type = event.get("type", "")
    handler = _webhook_handlers.get((gateway, event_type))
    if handler is not None:
        await handler(event, raw_payload, db)
    else:
        logger.warning("No handler for %s:%s — logged only", gateway, event_type)


# ---------------------------------------------------------------------------
# Gateway status normalization maps
# ---------------------------------------------------------------------------
_STRIPE_PAYMENT_STATUS_MAP = {
    "paid": "succeeded",
    "no_payment_required": "succeeded",
    "unpaid": "pending",
    "processing": "pending",
}

_PAYPAL_ORDER_STATUS_MAP = {
    "COMPLETED": "succeeded",
    "APPROVED": "pending",
    "CREATED": "pending",
    "SAVED": "pending",
    "PAYER_ACTION_REQUIRED": "pending",
    "VOIDED": "canceled",
}

_PAYPAL_REFUND_STATUS_MAP = {
    "COMPLETED": "succeeded",
    "PENDING": "pending",
    "FAILED": "failed",
}


def _cents_to_amount_string(amount_cents: int) -> str:
    """Convert an integer cents amount to a PayPal decimal string (2dp)."""
    return f"{amount_cents // 100}.{amount_cents % 100:02d}"


def _amount_string_to_cents(value: Any) -> int:
    """Best-effort conversion of a PayPal decimal string to integer cents."""
    try:
        return int(round(float(value) * 100))
    except (TypeError, ValueError):
        return 0


class PaymentService:
    """Gateway-agnostic payment service.

    The public methods accept a ``gateway`` argument (``"stripe"`` or
    ``"paypal"``) and dispatch to the matching internal provider method.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        # Per-instance handler registry (used by the instance dispatch API).
        self._handlers: dict[tuple[str, str], Callable] = {}
        # Class-level PayPal access-token cache, shared across instances.
        # Using a mutable dict so the cached state can be updated in place.

    # Class-level PayPal token cache. Defined on the class so all instances
    # share one cached token (PayPal tokens are account-scoped, not session).
    _paypal_token_cache: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Config validation + helpers
    # ------------------------------------------------------------------
    def _require_stripe_config(self) -> None:
        if not settings.stripe_secret_key:
            raise PaymentConfigError("stripe_secret_key is not configured")

    def _require_paypal_config(self) -> None:
        if not settings.paypal_client_id or not settings.paypal_client_secret:
            raise PaymentConfigError(
                "paypal_client_id / paypal_client_secret are not configured"
            )

    def _init_stripe(self) -> None:
        self._require_stripe_config()
        stripe.api_key = settings.stripe_secret_key

    def _paypal_base_url(self) -> str:
        if settings.payment_mode == "live":
            return "https://api-m.paypal.com"
        return "https://api-m.sandbox.paypal.com"

    async def _get_paypal_access_token(self) -> str:
        """Return a cached PayPal OAuth2 access token, refreshing when stale."""
        cache = PaymentService._paypal_token_cache
        cached = cache.get("token")
        if cached and time.time() < cache.get("expires_at", 0.0):
            return cached
        self._require_paypal_config()
        url = f"{self._paypal_base_url()}/v1/oauth2/token"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                data={"grant_type": "client_credentials"},
                auth=(settings.paypal_client_id, settings.paypal_client_secret),
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
        token = data["access_token"]
        expires_in = int(data.get("expires_in", 0))
        cache["token"] = token
        # Refresh slightly ahead of the real expiry to avoid edge races.
        cache["expires_at"] = time.time() + max(expires_in - 60, 0)
        return token

    def _paypal_amount(self, data: dict) -> tuple[int, str]:
        """Extract ``(amount_cents, currency)`` from a PayPal order/capture body."""
        for unit in data.get("purchase_units", []):
            amount = unit.get("amount")
            if amount:
                currency = (amount.get("currency_code") or "usd").lower()
                return _amount_string_to_cents(amount.get("value")), currency
        return 0, "usd"

    def _paypal_capture_id(self, data: dict) -> str | None:
        """Return the first capture id from a PayPal order body, if any."""
        for unit in data.get("purchase_units", []):
            captures = (unit.get("payments") or {}).get("captures") or []
            if captures:
                capture_id = captures[0].get("id")
                if capture_id:
                    return capture_id
        return None

    def _paypal_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _map_stripe_status(payment_status: str) -> str:
        return _STRIPE_PAYMENT_STATUS_MAP.get(payment_status, payment_status or "pending")

    @staticmethod
    def _map_paypal_order_status(status: str) -> str:
        return _PAYPAL_ORDER_STATUS_MAP.get(status, status or "pending")

    @staticmethod
    def _map_paypal_refund_status(status: str) -> str:
        return _PAYPAL_REFUND_STATUS_MAP.get(status, status or "pending")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def create_payment_intent(
        self,
        gateway: str,
        member_id: int,
        plan_id: int,
        billing_cycle: str | None,
        amount_cents: int,
        currency: str = "usd",
    ) -> dict:
        """Create a payment intent/order at the gateway.

        Persists a local ``Order`` row with ``status="pending"`` before
        returning ``{"intent_id": str, "redirect_url": str}``.
        """
        if gateway == "stripe":
            intent_id, redirect_url = await self._stripe_create_checkout_session(
                member_id, plan_id, amount_cents, currency
            )
        elif gateway == "paypal":
            intent_id, redirect_url = await self._paypal_create_order(
                member_id, amount_cents, currency
            )
        else:
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
            )

        order = Order(
            member_id=member_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            gateway=gateway,
            gateway_order_id=intent_id,
            amount_cents=amount_cents,
            currency=currency,
            status="pending",
        )
        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(order)
        return {"intent_id": intent_id, "redirect_url": redirect_url}

    async def retrieve_payment(self, gateway: str, intent_id: str) -> PaymentResult:
        """Query the gateway API for payment status. Returns ``PaymentResult``."""
        if gateway == "stripe":
            return await self._stripe_retrieve_session(intent_id)
        if gateway == "paypal":
            return await self._paypal_retrieve_order(intent_id)
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
        )

    async def confirm_payment(self, gateway: str, intent_id: str) -> PaymentResult:
        """Confirm/capture a payment at the gateway. Returns ``PaymentResult``."""
        if gateway == "stripe":
            # Stripe Checkout Sessions auto-confirm; just retrieve and return status.
            return await self._stripe_retrieve_session(intent_id)
        if gateway == "paypal":
            return await self._paypal_capture_order(intent_id)
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
        )

    async def refund_payment(
        self, gateway: str, payment_id: str, amount_cents: int | None = None
    ) -> RefundResult:
        """Issue a refund via the gateway.

        Stub for change #4 but implemented functionally. If ``amount_cents``
        is ``None`` the full amount is refunded.
        """
        if gateway == "stripe":
            return await self._stripe_refund(payment_id, amount_cents)
        if gateway == "paypal":
            return await self._paypal_refund(payment_id, amount_cents)
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
        )

    async def create_subscription_checkout(
        self,
        gateway: str,
        member_id: int,
        plan_id: int,
        billing_cycle: str,
        plan,
    ) -> dict:
        """Create a recurring subscription checkout at the gateway.

        Persists an Order row (status=pending) and returns
        {"redirect_url": str, "order_id": int}.
        """
        if gateway == "stripe":
            intent_id, redirect_url = await self._stripe_create_subscription_session(
                member_id, plan_id, billing_cycle, plan
            )
        elif gateway == "paypal":
            intent_id, redirect_url = await self._paypal_create_subscription(
                member_id, plan_id, billing_cycle
            )
        else:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
            )

        order = Order(
            member_id=member_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            gateway=gateway,
            gateway_order_id=intent_id,
            amount_cents=0,  # recurring; amount determined by gateway price
            currency="usd",
            status="pending",
        )
        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(order)
        return {"redirect_url": redirect_url, "order_id": order.id}

    async def cancel_gateway_subscription(self, gateway: str, gateway_subscription_id: str) -> None:
        """Cancel a subscription at the gateway (at period end)."""
        if gateway == "stripe":
            await self._stripe_cancel_subscription(gateway_subscription_id)
        elif gateway == "paypal":
            await self._paypal_suspend_subscription(gateway_subscription_id)
        else:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
            )

    # ------------------------------------------------------------------
    # Stripe provider
    # ------------------------------------------------------------------
    async def _stripe_create_checkout_session(
        self, member_id: int, plan_id: int, amount_cents: int, currency: str
    ) -> tuple[str, str]:
        self._init_stripe()
        success_url = settings.public_base_url + "/member/billing?status=success"
        cancel_url = settings.public_base_url + "/pricing"
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": currency,
                        "product_data": {"name": f"UnoWire plan {plan_id}"},
                        "unit_amount": amount_cents,
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(member_id),
        )
        return session.id, session.url

    async def _stripe_retrieve_session(self, intent_id: str) -> PaymentResult:
        self._init_stripe()
        session = await asyncio.to_thread(stripe.checkout.Session.retrieve, intent_id)
        return PaymentResult(
            status=self._map_stripe_status(getattr(session, "payment_status", "") or ""),
            amount_cents=getattr(session, "amount_total", None) or 0,
            currency=(getattr(session, "currency", None) or "usd"),
            gateway_payment_id=getattr(session, "payment_intent", None),
        )

    async def _stripe_refund(
        self, payment_id: str, amount_cents: int | None
    ) -> RefundResult:
        self._init_stripe()
        kwargs: dict[str, Any] = {"payment_intent": payment_id}
        if amount_cents is not None:
            kwargs["amount"] = amount_cents
        refund = await asyncio.to_thread(stripe.Refund.create, **kwargs)
        refunded_amount = getattr(refund, "amount", None)
        return RefundResult(
            status=self._map_stripe_status(getattr(refund, "status", "") or ""),
            refund_id=getattr(refund, "id", None),
            amount_cents=refunded_amount if refunded_amount is not None else (amount_cents or 0),
        )

    async def _stripe_create_subscription_session(
        self, member_id: int, plan_id: int, billing_cycle: str, plan
    ) -> tuple[str, str]:
        self._init_stripe()
        price_id = plan.stripe_price_id_monthly if billing_cycle == "monthly" else plan.stripe_price_id_yearly
        if not price_id:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=502,
                detail={"code": 502, "message": f"Stripe Price ID for {billing_cycle} not configured on plan"},
            )
        success_url = settings.public_base_url + "/member/billing?status=success"
        cancel_url = settings.public_base_url + "/member/checkout?status=cancelled"
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(member_id),
        )
        return session.id, session.url

    async def _stripe_cancel_subscription(self, subscription_id: str) -> None:
        self._init_stripe()
        await asyncio.to_thread(
            stripe.Subscription.delete,
            subscription_id,
            prorate=False,
        )

    async def _stripe_retrieve_subscription(self, subscription_id: str) -> dict:
        self._init_stripe()
        sub = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
        return {
            "status": getattr(sub, "status", ""),
            "current_period_end": getattr(sub, "current_period_end", None),
        }

    async def verify_stripe_webhook(self, payload: bytes, signature_header: str) -> dict:
        """Verify a Stripe webhook signature and return the constructed event.

        Raises ``stripe.error.SignatureVerificationError`` (or ``ValueError``)
        on failure; the route layer is expected to translate these into a
        400 response.
        """
        self._init_stripe()
        return await asyncio.to_thread(
            stripe.Webhook.construct_event,
            payload,
            signature_header,
            settings.stripe_webhook_secret,
        )

    # ------------------------------------------------------------------
    # PayPal provider
    # ------------------------------------------------------------------
    async def _paypal_create_order(
        self, member_id: int, amount_cents: int, currency: str
    ) -> tuple[str, str]:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v2/checkout/orders"
        body = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "amount": {
                        "currency_code": currency.upper(),
                        "value": _cents_to_amount_string(amount_cents),
                    },
                    "custom_id": str(member_id),
                }
            ],
            "application_context": {
                "return_url": settings.public_base_url + "/member/billing?status=success",
                "cancel_url": settings.public_base_url + "/pricing",
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        order_id = data["id"]
        approve_url = ""
        for link in data.get("links", []):
            if link.get("rel") == "approve":
                approve_url = link.get("href", "")
                break
        return order_id, approve_url

    async def _paypal_retrieve_order(self, order_id: str) -> PaymentResult:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v2/checkout/orders/{order_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        amount_cents, currency = self._paypal_amount(data)
        return PaymentResult(
            status=self._map_paypal_order_status(data.get("status", "")),
            amount_cents=amount_cents,
            currency=currency,
            gateway_payment_id=self._paypal_capture_id(data),
        )

    async def _paypal_capture_order(self, order_id: str) -> PaymentResult:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v2/checkout/orders/{order_id}/capture"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json={}, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        amount_cents, currency = self._paypal_amount(data)
        return PaymentResult(
            status=self._map_paypal_order_status(data.get("status", "")),
            amount_cents=amount_cents,
            currency=currency,
            gateway_payment_id=self._paypal_capture_id(data),
        )

    async def _paypal_refund(
        self, capture_id: str, amount_cents: int | None
    ) -> RefundResult:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v2/payments/captures/{capture_id}/refund"
        body: dict[str, Any] = {}
        if amount_cents is not None:
            body["amount"] = {
                # PayPal requires the currency on partial refunds; default to
                # USD when the caller did not specify a currency separately.
                "currency_code": "USD",
                "value": _cents_to_amount_string(amount_cents),
            }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        refunded_amount = amount_cents
        amount_obj = data.get("amount")
        if amount_obj and amount_obj.get("value") is not None:
            refunded_amount = _amount_string_to_cents(amount_obj.get("value"))
        return RefundResult(
            status=self._map_paypal_refund_status(data.get("status", "")),
            refund_id=data.get("id"),
            amount_cents=refunded_amount if refunded_amount is not None else (amount_cents or 0),
        )

    async def _paypal_create_subscription(
        self, member_id: int, plan_id: int, billing_cycle: str
    ) -> tuple[str, str]:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        plan_id_pp = (
            settings.paypal_plan_personal_monthly
            if billing_cycle == "monthly"
            else settings.paypal_plan_personal_yearly
        )
        if not plan_id_pp:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=502,
                detail={"code": 502, "message": f"PayPal Plan ID for {billing_cycle} not configured"},
            )
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions"
        body = {
            "plan_id": plan_id_pp,
            "custom_id": str(member_id),
            "application_context": {
                "return_url": settings.public_base_url + "/member/billing?status=success",
                "cancel_url": settings.public_base_url + "/member/checkout?status=cancelled",
                "user_action": "SUBSCRIBE_NOW",
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        sub_id = data["id"]
        approve_url = ""
        for link in data.get("links", []):
            if link.get("rel") == "approve":
                approve_url = link.get("href", "")
                break
        return sub_id, approve_url

    async def _paypal_suspend_subscription(self, subscription_id: str) -> None:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions/{subscription_id}/suspend"
        body = {"reason": "User requested cancellation"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            # 204 is success; 422 UNPROCESSABLE_ENTITY often means already suspended
            if resp.status_code not in (204, 422):
                resp.raise_for_status()

    async def _paypal_retrieve_subscription(self, subscription_id: str) -> dict:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions/{subscription_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        next_billing_time = (data.get("billing_info") or {}).get("next_billing_time")
        return {
            "status": data.get("status", ""),
            "current_period_end": next_billing_time,
        }

    async def verify_paypal_webhook(self, headers: dict, body: dict) -> dict:
        """Verify a PayPal webhook signature via the verify-webhook-signature API.

        Returns the verified event body on success, or raises ``HTTPException``
        with status 400 when verification fails.
        """
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v1/notifications/verify-webhook-signature"

        def _header(name: str) -> str:
            # PayPal headers arrive in either HTTP_ or canonical casing.
            return (
                headers.get(name)
                or headers.get(name.lower())
                or headers.get(name.upper())
                or ""
            )

        verify_body = {
            "transmission_id": _header("PAYPAL-TRANSMISSION-ID"),
            "transmission_sig": _header("PAYPAL-TRANSMISSION-SIG"),
            "cert_url": _header("PAYPAL-CERT-URL"),
            "auth_algo": _header("PAYPAL-AUTH-ALGO"),
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": body,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url, json=verify_body, headers=self._paypal_headers(token)
            )
            resp.raise_for_status()
            data = resp.json()
        if data.get("verification_status") != "SUCCESS":
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail={
                    "code": 400,
                    "message": "PayPal webhook signature verification failed",
                },
            )
        return body

    # ------------------------------------------------------------------
    # Instance-level webhook handler registry
    # ------------------------------------------------------------------
    def register_webhook_handler(self, gateway: str, event_type: str, handler: Callable) -> None:
        """Register a handler for a ``(gateway, event_type)`` pair on this instance."""
        self._handlers[(gateway, event_type)] = handler

    async def dispatch_webhook_event(
        self, gateway: str, event: dict, raw_payload: dict
    ) -> None:
        """Dispatch a verified webhook event to the instance-level handler.

        Handlers receive ``(event, raw_payload)``. If no handler is registered
        for the event's type the call is a no-op and a warning is logged.
        """
        event_type = event.get("type", "")
        handler = self._handlers.get((gateway, event_type))
        if handler is not None:
            await handler(event, raw_payload)
        else:
            logger.warning("No handler for %s:%s — logged only", gateway, event_type)
