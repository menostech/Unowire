---
comet_change: add-payment-gateway-foundation
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-17-add-payment-gateway-foundation
status: final
---

# Design Doc: Payment Gateway Foundation (Stripe + PayPal)

## Overview

UnoWire has a complete 3-tier membership plan system (Freemium / Personal / Enterprise) with subscription lifecycle, usage quotas, and a pricing page, but **zero payment integration**. The Personal plan ($15/mo, $149/yr) currently only supports a 14-day free trial that auto-downgrades to Freemium. This change introduces the foundational payment layer (Stripe + PayPal) that all subsequent paid-subscription features depend on: gateway SDK integration, a unified `PaymentService` abstraction, `orders`/`payments` persistence, webhook receivers, and a `payment` RBAC module.

The canonical capability spec lives in `openspec/changes/add-payment-gateway-foundation/specs/payment-gateway/spec.md`. This Design Doc is the technical design authority; OpenSpec is the canonical spec.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (no changes)                  │
└──────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    FastAPI Layer                             │
│  POST /api/payments/webhooks/stripe   (no auth, sig-verified)│
│  POST /api/payments/webhooks/paypal   (no auth, sig-verified)│
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│              PaymentService (unified abstraction)           │
│  create_payment_intent(gateway, ...)  → {intent_id, url}    │
│  retrieve_payment(gateway, intent_id) → PaymentResult       │
│  confirm_payment(gateway, intent_id)  → PaymentResult       │
│  refund_payment(gateway, payment_id, amount) → RefundResult │
└──────────┬──────────────────────────────────┬───────────────┘
           │ stripe                           │ paypal
┌──────────▼─────────────┐  ┌─────────────────▼──────────────┐
│  Stripe SDK            │  │  PayPal SDK (Orders API v2)    │
│  checkout.Session      │  │  Order.create / verify-webhook │
└─────────────────────────┘  └────────────────────────────────┘
           │                              │
┌──────────▼──────────────────────────────▼───────────────────┐
│            PostgreSQL: orders + payments tables             │
│  orders:   id, member_id, plan_id, gateway, status, amount   │
│  payments: id, order_id, gateway_event_id (UNIQUE), payload │
└─────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- Integrate Stripe and PayPal SDKs behind a unified `PaymentService` interface so downstream features are gateway-agnostic
- Persist payment lifecycle in `orders` (intent/order) and `payments` (transaction attempts) tables
- Receive and verify Stripe + PayPal webhooks, persist raw payloads, route to pluggable handlers
- Add `payment` RBAC module for admin-side order/payment views (consumed by later changes)
- Support multi-currency (USD now, extensible)

**Non-Goals:**
- Subscription checkout flow (creating subscriptions from successful payments) — change #2
- Invoice generation and billing history UI — change #3
- Admin order management page and refund UI — change #4
- Frontend checkout pages — change #2
- Tax calculation engine — deferred (manual `tax_amount` field only)

## Decisions

### D1: Stripe Checkout Sessions (hosted) over Stripe PaymentIntents (embedded)
Use Stripe Checkout Sessions (hosted payment page). Checkout Sessions handle PCI compliance, 3DS, Apple Pay, and Google Pay out of the box. Embedded PaymentIntents require a custom payment form, 3DS redirect handling, and deeper PCI scope — overkill for an MVP small team. The foundation exposes a generic `create_payment_intent` returning a redirect URL; change #2 calls it with `mode="subscription"` for recurring payments.

### D2: PayPal Orders API v2 over PayPal Subscriptions API
Use PayPal Orders API v2 for one-time and initial subscription payments. For recurring subscriptions, capture the first payment via Orders API then use the resulting billing agreement for recurring charges via PayPal Billing. This keeps the foundation decoupled from subscription logic.

### D3: Unified PaymentService with gateway provider enum
A single `PaymentService` class with a `gateway` parameter (`"stripe"` | `"paypal"`), dispatching to internal provider methods. Downstream code stays gateway-agnostic; adding a third gateway later means adding methods, not changing callers.

### D4: Webhook receiver stores raw payload before processing
Every webhook call writes the raw payload + signature + gateway to a `payments` row BEFORE dispatching to business-logic handlers. This guarantees idempotency (unique constraint on `gateway_event_id`) and auditability. Stripe event ids (`evt_*`) and PayPal transmission ids are stored with a unique constraint; duplicate deliveries return 200 without re-processing.

### D5: orders + payments two-table model
- `orders`: one per payment intent (member + plan + billing_cycle + amount + gateway + status). An order may have multiple payment attempts.
- `payments`: one per transaction attempt (order_id FK, gateway_payment_id, status, amount, fee, raw_payload JSONB).

Mirrors Stripe's PaymentIntent → Charge and PayPal's Order → Capture models. Failed retries create new `payments` rows against the same `order`. Refunds create `payments` rows with `type=refund`.

## Data Model

### `orders` table
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| member_id | UUID FK → members | CASCADE |
| plan_id | UUID FK → subscription_plans | RESTRICT |
| billing_cycle | enum | `monthly` \| `yearly` \| null |
| gateway | enum | `stripe` \| `paypal` |
| gateway_order_id | string | gateway's intent/order id |
| amount_cents | integer | |
| currency | string | default `usd` |
| status | enum | `pending` \| `paid` \| `failed` \| `refunded` \| `cancelled` |
| created_at | timestamp | |
| updated_at | timestamp | |

Indexes: `member_id`, `gateway_order_id`.

### `payments` table
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | CASCADE |
| gateway | enum | `stripe` \| `paypal` |
| gateway_payment_id | string | nullable until captured |
| gateway_event_id | string | UNIQUE — idempotency key |
| event_type | string | e.g. `payment_intent.succeeded` |
| status | string | mirrors gateway status |
| amount_cents | integer | |
| fee_cents | integer | nullable |
| raw_payload | JSONB | full webhook payload |
| created_at | timestamp | |

Indexes: `order_id`, UNIQUE(`gateway_event_id`).

## PaymentService Interface

```python
class PaymentService:
    def create_payment_intent(
        gateway, member_id, plan_id, billing_cycle, amount_cents, currency
    ) -> { intent_id, redirect_url }
    # Persists orders row with status="pending" before returning redirect_url

    def retrieve_payment(gateway, intent_id) -> PaymentResult
    # Queries gateway API; returns { status, amount, currency, gateway_payment_id }

    def confirm_payment(gateway, intent_id) -> PaymentResult

    def refund_payment(gateway, payment_id, amount=None) -> RefundResult
    # Stub used by change #4; returns { status, refund_id, amount }
```

Downstream code MUST NOT import Stripe/PayPal SDKs directly — it goes through `PaymentService`.

## Webhook Flow

```
Stripe/PayPal → POST /api/payments/webhooks/{gateway}
  1. Read raw body + signature header
  2. Verify signature (Stripe: stripe.Webhook.construct_event; PayPal: verify-webhook-signature API)
  3. On failure → HTTP 400, persist nothing
  4. On success → INSERT payments row (gateway_event_id UNIQUE → idempotent)
  5. Dispatch to registered handler (foundation registers a no-op default that logs unhandled events)
  6. Return HTTP 200
```

Webhook routes do NOT require auth (verified by signature).

## Configuration

Environment variables read by `backend/app/core/config.py`:
- `STRIPE_SECRET_KEY` — `sk_test_*` in test mode
- `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYMENT_MODE` (`test` | `live`) — logged at FastAPI startup

`PaymentConfigError` is raised when required credentials are missing during a payment operation; a FastAPI exception handler returns HTTP 500.

## RBAC

A `payment` module is added to `backend/app/core/modules.py` `ADMIN_MODULES` and mirrored in `frontend/lib/adminModules.ts` `ADMIN_MODULES` (scopeAware=false). This gates admin-side order/payment endpoints (used by change #4). No admin menu items are added in this change.

## Migration Plan

- Add `stripe` and `paypalrestsdk` to `backend/requirements.txt`
- Alembic migration `q7r8s9t0u1v2_add_payment_orders_tables.py` creates `orders` + `payments` tables with indexes, chained after latest head
- Register new models in `backend/app/models/__init__.py`
- `alembic upgrade head` and `alembic downgrade -1` both verified clean
- No destructive changes; rollback drops the two new tables

## Risks / Trade-offs

- **Stripe vs PayPal refund windows differ** (90 vs 180 days) — handled in change #4's refund UI
- **Webhook idempotency** — solved via UNIQUE constraint on `gateway_event_id`
- **Race: webhook arrives while admin refunds** — webhook handler must check order status before processing (handled in change #4)
- **Credential rotation** — keys read from env at startup; app restart picks up new keys

## Test Strategy

- `test_payment_service.py`: mock SDK calls; assert `create_payment_intent` returns intent_id + redirect_url for both gateways; assert `PaymentConfigError` on missing credentials
- `test_payment_webhooks.py`: valid Stripe signature → 200 + payments row; invalid → 400; idempotency on duplicate `gateway_event_id`
- `test_payment_models.py`: FK cascade (order delete → payments cascade); unique constraint on `gateway_event_id`
- Manual: `stripe listen --forward-to localhost:8000/api/payments/webhooks/stripe`; PayPal sandbox webhook test
