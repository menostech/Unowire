---
comet_change: add-paid-subscription-checkout
role: technical-design
canonical_spec: openspec
status: draft
---

# Design Doc: Paid Subscription Checkout (Stripe + PayPal Recurring)

## Overview

UnoWire has a 3-tier membership model (Freemium / Personal / Enterprise). The Personal plan currently only supports a 14-day free trial that auto-downgrades to Freemium on expiry; there is no way for a user to pay and keep a Personal subscription. Change `add-payment-gateway-foundation` (change #1) delivered the payment substrate: `PaymentService`, `orders`/`payments` tables, webhook receivers, and Stripe + PayPal SDK integration. This change (#2) builds the paid checkout flow and the recurring subscription lifecycle on top of that substrate.

The canonical capability spec lives in `openspec/changes/add-paid-subscription-checkout/specs/subscription-checkout/spec.md`. This Design Doc is the technical design authority; OpenSpec is the canonical spec.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                    │
│  /member/checkout?plan=personal&cycle=monthly               │
│  /member/billing?status=success    (return from gateway)     │
│  /member/subscription              (panel: paid/past_due UI) │
│  PricingCard → "Start Paid Subscription" CTA                │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  FastAPI Layer                                               │
│  POST /api/member/subscription/checkout                      │
│  GET  /api/member/subscription  (extended: gateway/grace)    │
│  POST /api/member/subscription/cancel  (extended: paid)     │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  SubscriptionService (extended)                             │
│  create_checkout_session(gateway, member_id, plan_id, cycle) │
│  activate_paid_subscription(...)                             │
│  mark_past_due(sub_id, grace_days=7)                         │
│  apply_grace_expiry()  (batch downgrade)                    │
│  cancel_until_period_end(member_id)                         │
│  resolve_effective_plan(...)  (treats paid/past_due as Paid)  │
└────────┬───────────────────────────────┬────────────────────┘
         │ stripe                         │ paypal
┌────────▼─────────────┐  ┌──────────────▼────────────────────┐
│  PaymentService      │  │  PaymentService                   │
│  (extended: create_  │  │  (extended: create_subscription_  │
│   subscription_      │  │   checkout for PayPal Subscriptions│
│   checkout mode=     │  │   API v1/billing/subscriptions)   │
│   subscription)      │  │                                   │
└──────────────────────┘  └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Webhook Handlers (app/services/payment_webhooks.py)        │
│  register_all() called from main.py lifespan                │
│  Stripe: checkout.session.completed, invoice.payment_       │
│          succeeded, invoice.payment_failed                  │
│  PayPal: BILLING.SUBSCRIPTION.ACTIVATED, PAYMENT.SALE.      │
│          COMPLETED, BILLING.SUBSCRIPTION.CANCELLED           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Background Tasks (main.py lifespan)                        │
│  _trial_expiry_loop  (existing, hourly)                     │
│  _renewal_loop        (new, hourly — reconciliation only)    │
└─────────────────────────────────────────────────────────────┘
```

## Data Model Changes

### `MemberSubscription` (existing table, add columns)

Reuses the existing `current_period_end` column — no new `period_end` column is introduced.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `gateway` | `String(20)` | yes | `"stripe"` or `"paypal"` |
| `gateway_subscription_id` | `String(255)` | yes | Stripe subscription ID or PayPal subscription ID |
| `payment_method_id` | `String(255)` | yes | Stored payment method reference (Stripe PM ID / PayPal token) |
| `grace_period_end` | `DateTime` | yes | End of `past_due` grace window |

### `MemberSubscription.status` (existing `String(20)`, not a PG enum)

The column is a plain `String(20)`, **not** a PostgreSQL enum type. **No `ALTER TYPE` migration is needed.** New values are simply written as strings:

- `trialing` — unchanged; free-trial status.
- `paid` — new; active paid subscription (replaces overloading `active` for paid; `active` is retained for backward compatibility but new paid subscriptions use `paid`).
- `past_due` — new; renewal failed, subscription still effective (Personal-tier access retained) but inside the grace window.
- `active` / `expired` / `cancelled` — unchanged.

### `SubscriptionPlan` (existing table, add columns)

Pre-created Stripe Price IDs are stored on the plan (user-selected approach during design).

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `stripe_price_id_monthly` | `String(255)` | yes | Stripe Price ID for monthly recurring |
| `stripe_price_id_yearly` | `String(255)` | yes | Stripe Price ID for yearly recurring |

PayPal Product/Plan IDs are environment-specific and stored in settings (env vars), not on the plan row.

### Alembic Migration

Two `ALTER TABLE ... ADD COLUMN` statements. **No `ALTER TYPE`.** No data backfill — existing `trialing` subscriptions are unaffected. Downgrade drops the new columns; new `status` string values are additive and safe to leave in place if the code is reverted.

## Checkout Flow

Unified entry: `POST /api/member/subscription/checkout` with `{gateway, plan_id, billing_cycle}`.

### Stripe Flow (single redirect)

1. `SubscriptionService.create_checkout_session("stripe", member_id, plan_id, billing_cycle)`
2. Select Stripe Price ID from `SubscriptionPlan` by billing cycle (`stripe_price_id_monthly` or `stripe_price_id_yearly`)
3. `PaymentService.create_subscription_checkout("stripe", ...)` creates a Stripe Checkout Session:
   - `mode="subscription"`
   - `line_items=[{price: plan.stripe_price_id_*}]`
   - `client_reference_id=str(member_id)`
   - `success_url = {public_base_url}/member/billing?status=success`
   - `cancel_url = {public_base_url}/member/checkout?status=cancelled`
4. Persist `Order` row (`status="pending"`, `gateway="stripe"`, `gateway_order_id=session.id`)
5. Return `{redirect_url, order_id}` → user redirected to Stripe-hosted page
6. User completes payment → Stripe sends `checkout.session.completed` webhook
7. Webhook handler calls `activate_paid_subscription(...)` → creates `MemberSubscription` (`status="paid"`, `gateway="stripe"`, `gateway_subscription_id=...`, `current_period_end=...`)

### PayPal Flow (two-step: create → approve → activate)

1. `SubscriptionService.create_checkout_session("paypal", member_id, plan_id, billing_cycle)`
2. `PaymentService.create_subscription_checkout("paypal", ...)` creates a PayPal Subscription via `POST /v1/billing/subscriptions`:
   - `plan_id` selected by billing cycle from env (`PAYPAL_PLAN_PERSONAL_MONTHLY` / `PAYPAL_PLAN_PERSONAL_YEARLY`)
   - `custom_id=str(member_id)`
   - `application_context.return_url` / `cancel_url` set as above
3. Persist `Order` row (`status="pending"`, `gateway="paypal"`, `gateway_order_id=subscription.id`)
4. Return `{redirect_url, order_id}` → user redirected to PayPal approval page
5. User approves → PayPal sends `BILLING.SUBSCRIPTION.ACTIVATED` webhook
6. Webhook handler calls `activate_paid_subscription(...)` → creates `MemberSubscription` (`status="paid"`, `gateway="paypal"`, `gateway_subscription_id=...`, `current_period_end=next_billing_time`)

### PayPal Product/Plan Pre-creation

Pre-created once per environment (sandbox and live) via PayPal API or Developer Dashboard. Required environment variables:

- `PAYPAL_PRODUCT_ID` — the product representing UnoWire Personal plan
- `PAYPAL_PLAN_PERSONAL_MONTHLY` — billing plan ID for monthly cycle
- `PAYPAL_PLAN_PERSONAL_YEARLY` — billing plan ID for yearly cycle

Deployment documentation must include the manual setup steps; checkout will fail with `502` if these are missing.

## Subscription Lifecycle

### State Machine

```
trialing ──(checkout complete)──► paid
paid ──(renewal succeeds)──► paid (extend current_period_end)
paid ──(renewal fails)──► past_due (grace_period_end = now + 7d)
past_due ──(recovery payment)──► paid (clear grace_period_end)
past_due ──(grace expires)──► expired → freemium
paid ──(user cancels)──► cancelled (access until current_period_end)
cancelled ──(period_end passes)──► expired → freemium
```

### Renewal Loop (`_renewal_loop`, hourly)

Runs in `main.py` lifespan as `asyncio.create_task`, parallel to the existing `_trial_expiry_loop`. Both Stripe and PayPal perform auto-renewals via the gateway; the loop is **reconciliation-only**:

- Query `status=paid` subscriptions whose `current_period_end` is within the next renewal window (e.g. next 1 hour)
- **Stripe**: fetch subscription state via Stripe API (`stripe.Subscription.retrieve`), update `current_period_end` from `current_period_end`, detect missed `invoice.payment_failed` events
- **PayPal**: fetch subscription state via PayPal Subscriptions API, update `current_period_end` from `billing_info.next_billing_time`
- **Grace expiry**: query `status=past_due` where `grace_period_end < now` → set `expired`, downgrade to freemium (reuse `_get_plan_by_tier("freemium")` + new active freemium subscription, mirroring `check_and_expire_trial`)
- On gateway API failure: skip the current iteration, retry next hour. Gateway-side auto-renewal is unaffected.

### SubscriptionService New Methods

| Method | Behavior |
|---|---|
| `create_checkout_session(gateway, member_id, plan_id, billing_cycle)` | Validates plan is not sales-led, member has no active paid subscription, billing_cycle is valid; delegates to `PaymentService`; persists `Order`; returns `{redirect_url, order_id}` |
| `activate_paid_subscription(member_id, gateway, gateway_subscription_id, current_period_end)` | Idempotent (keyed on `gateway_subscription_id`); marks any prior trialing subscription `expired`; creates `MemberSubscription(status="paid")`; snapshots plan limits |
| `mark_past_due(subscription_id, grace_days=7)` | Sets `status=past_due`, `grace_period_end = now + grace_days` |
| `apply_grace_expiry()` | Batch query `past_due` where `grace_period_end < now`; downgrade each to freemium; returns count |
| `cancel_until_period_end(member_id)` | Extends existing `cancel_subscription` to handle `paid`: calls gateway API to cancel at period end (Stripe `subscriptions.cancel` with `prorate=False`; PayPal `subscriptions.suspend`), marks local `cancelled` with access until `current_period_end` |

### `resolve_effective_plan` Update

Treats `paid` and `past_due` (within grace) as Personal-tier-effective. Existing behavior for `active`/`trialing`/`cancelled`/`expired` is preserved.

```python
if sub.status in ("active", "trialing", "paid"):
    return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
if sub.status == "past_due" and sub.grace_period_end and sub.grace_period_end > now:
    return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
if sub.status == "cancelled" and sub.current_period_end and sub.current_period_end > now:
    return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
return await self._freemium_limits()
```

## Webhook Handlers

New module `app/services/payment_webhooks.py` registers handlers via the existing `register_webhook_handler()` module-level API. `payments.py` route layer is unchanged. Registration happens in `main.py` lifespan startup via `payment_webhooks.register_all()`.

### Stripe Handlers

| Event Type | Handler Logic |
|---|---|
| `checkout.session.completed` | Extract `member_id` from `client_reference_id`, `gateway_subscription_id` from `data.object.subscription`. The session object does not expose `current_period_end` directly — fetch the Stripe Subscription via `stripe.Subscription.retrieve(gateway_subscription_id)` and read `current_period_end` (fall back to `now + 30 days` if missing). Call `activate_paid_subscription()`. Idempotent: first check if a `MemberSubscription` with this `gateway_subscription_id` already exists. |
| `invoice.payment_succeeded` | Find subscription by `gateway_subscription_id` from `data.object.subscription`; extend `current_period_end` from `data.object.period_end`; if `status=past_due`, roll back to `paid` and clear `grace_period_end`. |
| `invoice.payment_failed` | Find subscription by `gateway_subscription_id`; call `mark_past_due(sub.id)`; sets `grace_period_end = now + 7d`. |

### PayPal Handlers

| Event Type | Handler Logic |
|---|---|
| `BILLING.SUBSCRIPTION.ACTIVATED` | Extract `member_id` from `resource.custom_id`, `gateway_subscription_id` from `resource.id`, `current_period_end` from `resource.billing_info.next_billing_time`; call `activate_paid_subscription()`. Idempotent on `gateway_subscription_id`. |
| `PAYMENT.SALE.COMPLETED` | Renewal success: find subscription by `gateway_subscription_id` (match `resource.billing_agreement_id`); extend `current_period_end` from the next billing time (fetch via PayPal API); clear `past_due` if set. |
| `BILLING.SUBSCRIPTION.CANCELLED` | Mark subscription `cancelled`; retain access until `current_period_end`. |

### Idempotency

Two layers:

1. **Payment table**: `_persist_webhook_event` deduplicates on `gateway_event_id` (already in place from change #1).
2. **Subscription layer**: `activate_paid_subscription` checks for an existing `MemberSubscription` with the same `gateway_subscription_id` before inserting; subsequent webhook deliveries for the same subscription are no-ops.

## API Endpoints

Extends `app/api/routes/member_subscription.py` with the following. All endpoints require `get_current_member`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/member/subscription/checkout` | `POST` | Body: `{gateway, plan_id, billing_cycle}`. Returns `{redirect_url, order_id}`. Validates: plan is not sales-led; member has no active paid subscription; `billing_cycle ∈ {monthly, yearly}`. |
| `/api/member/subscription` | `GET` (extend existing) | Returns `SubscriptionRead` extended with `gateway`, `gateway_subscription_id`, `grace_period_end`. |
| `/api/member/subscription/cancel` | `POST` (extend existing) | Already exists; extended to handle `paid`: delegates to `cancel_until_period_end`. |

### Schemas (`app/schemas/member_subscription.py`)

- New `CheckoutRequest` (`gateway: str`, `plan_id: int`, `billing_cycle: str`) and `CheckoutResponse` (`redirect_url: str`, `order_id: int`)
- `SubscriptionRead` extended with `gateway: str | None`, `gateway_subscription_id: str | None`, `grace_period_end: datetime | None`

### Error Codes

- `409` — member already has an active paid subscription, or trialing subscription not yet expired
- `400` — plan is sales-led, or `billing_cycle` not in `{monthly, yearly}`
- `502` — gateway API call failed (Stripe/PayPal unreachable, or pre-created Price/Plan IDs missing)

## Frontend

### New Page: `/member/checkout`

File: `frontend/app/member/checkout/page.tsx`. Query params: `?plan=personal&cycle=monthly`.

Component structure:

```
CheckoutPage
├── OrderSummary         # plan name, billing cycle, price
├── GatewaySelector      # Stripe / PayPal card buttons
└── CheckoutError        # inline error on cancel/failure
```

Flow:

1. User clicks "Start Paid Subscription" on `PricingCard` → navigates to `/member/checkout?plan=personal&cycle=monthly`
2. Selects gateway → `POST /api/member/subscription/checkout` → `window.location = redirect_url`
3. On success, gateway redirects back to `/member/billing?status=success` (existing route)
4. On cancel, gateway redirects back to `/member/checkout?status=cancelled` → inline error shown

### `SubscriptionPanel` (existing component) Extension

- `status=paid` → "Active, renews on {current_period_end}" + Cancel button
- `status=past_due` → warning banner "Payment failed — update your payment method before {grace_period_end}"
- `status=trialing` → "Trial ends {trial_end}" + "Upgrade to Paid" CTA → links to checkout

### `PricingCard` (existing component) Extension

- Personal card gains a "Start Paid Subscription" button (in addition to the existing "Start Free Trial" button, which is retained)

### API Client

`frontend/lib/api/member.ts` gains `createCheckout(gateway: "stripe" | "paypal", planId: number, billingCycle: "monthly" | "yearly")`.

## Testing Strategy

### Unit Tests (`backend/tests/services/test_subscription_checkout.py`)

| Test | Coverage |
|---|---|
| `test_create_checkout_session_stripe` | Mock Stripe SDK, assert `Order` created, `redirect_url` returned, `mode="subscription"` |
| `test_create_checkout_session_paypal` | Mock PayPal via `respx`, assert `Order` created, `redirect_url` returned |
| `test_activate_paid_subscription_idempotent` | Two activations with same `gateway_subscription_id`, second is no-op |
| `test_mark_past_due_sets_grace` | `paid` → `past_due`, `grace_period_end = now + 7d` |
| `test_resolve_effective_plan_paid` | `paid` returns Personal quotas |
| `test_resolve_effective_plan_past_due_in_grace` | Within grace returns Personal quotas |
| `test_resolve_effective_plan_past_due_expired` | Past grace returns Freemium quotas |
| `test_renewal_loop_extends_period_end` | Mock renewal success, assert `current_period_end` extended |
| `test_renewal_loop_marks_past_due` | Mock renewal failure, assert `past_due` + `grace_period_end` |
| `test_apply_grace_expiry_downgrades` | Batch downgrade expired `past_due` → freemium |
| `test_cancel_paid_subscription_keeps_access` | Cancel `paid`, assert `cancelled` but `current_period_end` unchanged |

### Webhook Tests (`backend/tests/api/test_payment_webhooks.py`)

| Test | Coverage |
|---|---|
| `test_stripe_checkout_completed_activates_subscription` | Construct `checkout.session.completed` event, assert `MemberSubscription(status=paid)` created |
| `test_stripe_payment_failed_marks_past_due` | Construct `invoice.payment_failed`, assert `past_due` + grace |
| `test_stripe_payment_succeeded_clears_past_due` | Pre-set `past_due`, trigger `invoice.payment_succeeded`, assert rollback to `paid` |
| `test_paypal_subscription_activated` | Construct `BILLING.SUBSCRIPTION.ACTIVATED`, assert subscription activated |
| `test_webhook_idempotency_duplicate_event` | Same `gateway_event_id` delivered twice, second is no-op |

### API Tests (`backend/tests/api/test_member_subscription_checkout.py`)

| Test | Coverage |
|---|---|
| `test_checkout_stripe_returns_redirect_url` | Authenticated member, POST checkout, assert 200 + `redirect_url` |
| `test_checkout_paypal_returns_redirect_url` | Same for PayPal |
| `test_checkout_conflict_when_already_paid` | Existing `paid` subscription → 409 |
| `test_checkout_sales_led_plan_returns_400` | Enterprise plan → 400 |
| `test_checkout_invalid_billing_cycle_returns_400` | `billing_cycle="weekly"` → 400 |

### Test Infrastructure

- Reuse existing `pytest` + `pytest-asyncio` + `httpx.AsyncClient` patterns
- Mock Stripe SDK via `monkeypatch` replacing `stripe.checkout.Session.create` etc.
- Mock PayPal via `respx` (already introduced in change #1)
- Database transaction isolation per test (existing `conftest.py` pattern)

### Frontend

No automated tests required for MVP (per project constraint). Manual verification only.

## Edge Cases & Risks

- **Stripe webhook vs renewal loop race**: Both may observe the same event. Mitigation: webhooks are source of truth; renewal loop only reconciles. All state transitions are idempotent (keyed on `gateway_subscription_id` + event id).
- **PayPal agreement capture succeeds, agreement creation fails**: Not applicable here — PayPal Subscriptions API does the capture and agreement setup atomically on approval. The `BILLING.SUBSCRIPTION.ACTIVATED` event fires only after the agreement is fully active. No partial-state recovery needed.
- **Grace-period dunning emails deferred**: This change sets `past_due` status and grace timing only; no emails are sent. Users in `past_due` will be downgraded silently after 7 days. Trade-off acceptable for v1; email integration is a follow-up change.
- **`active` vs `paid` status split**: Existing code may assume `active` is the only "currently effective" status. `resolve_effective_plan` is updated; all plan resolution is routed through this method. The change #1 `PaymentService` does not read subscription status, so it is unaffected.
- **Hourly renewal loop load**: The hourly query must be scoped to `current_period_end` within the next renewal window (e.g. `WHERE current_period_end < now() + interval '1 hour' AND status = 'paid'`). No index change is required for MVP volumes; a partial index can be added later if scale demands.
- **Timezone**: All `current_period_end` / `grace_period_end` use `datetime.utcnow()` (consistent with existing code).
- **Paid/past_due blocks new trials**: A `paid` or `past_due` subscription prevents starting a new trial — the member must cancel first. Implemented in `create_checkout_session` validation.
- **Grace period length**: Hardcoded as `GRACE_PERIOD_DAYS = 7` constant in `SubscriptionService` for v1.

## Migration Plan

1. **DB migration (Alembic)**: Add 6 columns across `member_subscriptions` (4) and `subscription_plans` (2). No `ALTER TYPE`. No backfill.
2. **Backend rollout**: deploy backend (services, routes, webhook handlers, renewal task) first.
3. **Frontend rollout**: deploy checkout page, PricingCard/SubscriptionPanel updates.
4. **Feature flag**: gate checkout page behind an env flag `PAID_CHECKOUT_ENABLED` until change #1 is confirmed deployed and Stripe/PayPal Price/Plan IDs are configured.
5. **Rollback**: `alembic downgrade -1` drops the new columns. New `status` string values are additive and safe to leave in place if code is reverted. Code-level revert stops writing `paid`/`past_due`.

## Open Questions (Resolved)

- **Stripe Price IDs**: Pre-created in Stripe Dashboard, stored in `SubscriptionPlan.stripe_price_id_monthly` / `stripe_price_id_yearly`. (User-selected during design.)
- **PayPal recurring**: Uses Subscriptions API (`/v1/billing/subscriptions`), not legacy Billing Plans + Agreements API. Reuses `gateway_subscription_id` column (no separate column).
- **`paid` and `past_due` block new trials**: Yes — implemented in `create_checkout_session` validation.
- **Grace period length**: Hardcoded constant `GRACE_PERIOD_DAYS = 7` for v1.
- **`past_due` surfaced to user**: Yes — banner in `SubscriptionPanel` during `past_due`.
