## Why

Personal plan users currently have only one path to access paid features: the 14-day free trial (`POST /api/member/subscription/trial` → `trialing` status → auto-downgrade on expiry). Once the trial expires, there is no mechanism for a user to actually pay and keep their Personal subscription. The freemium → paid conversion funnel is broken at the last step: users who want to convert must leave the product or contact sales, and the backend has no concept of a recurring paid subscription lifecycle.

This change adds the missing paid checkout flow and the surrounding subscription lifecycle (renewal, failed-payment dunning, cancellation) so that a Personal plan user can self-serve purchase, auto-renew, and retain their subscription. It builds directly on the payment-gateway foundation delivered by change `add-payment-gateway-foundation` (PaymentService, orders/payments tables, webhook framework, Stripe + PayPal SDK).

## What Changes

- Add backend checkout API endpoints:
  - `POST /api/member/checkout/stripe` — create a Stripe Checkout Session (`mode=subscription`) for the Personal plan.
  - `POST /api/member/checkout/paypal` — create a PayPal order (and first-payment capture for recurring billing agreement).
- Expand `MemberSubscription.status` enum to add `paid` (active paid subscription) and `past_due` (renewal failed, inside grace period). `trialing` remains the free-trial status.
- Add background renewal task `_renewal_loop` (hourly) that:
  - Finds subscriptions nearing `period_end`.
  - Attempts renewal via the saved payment method.
  - On failure: sets `past_due`, starts a 7-day grace period, then downgrades to Freemium after grace elapses.
- Add dunning logic: `past_due` → grace window → `expired`/downgrade.
- Register webhook handlers for subscription-relevant events:
  - `checkout.session.completed` → create `MemberSubscription` (status `paid`).
  - `payment_intent.succeeded` / `invoice.payment_succeeded` → activate / extend subscription period.
  - `invoice.payment_failed` → set `past_due` + start grace period.
- Add frontend checkout page at `/member/checkout?plan=personal&cycle=monthly` with gateway selection (Stripe / PayPal buttons), redirect to gateway, and success/cancel return handling (`/member/subscription`).
- Update `PricingCard` component: add "Start Paid Subscription" button that routes to the checkout page (replaces trial-only CTA for Personal plan).
- Update `SubscriptionPanel` component: show paid status, renewal date, and cancel-subscription action (stays active until period end).
- Add Next.js API proxy routes for the new checkout endpoints.

## Capabilities

### New Capabilities
- `subscription-checkout`: Paid subscription checkout and renewal lifecycle — Stripe Checkout Session creation, PayPal order creation, paid subscription activation via webhook, auto-renewal via background task, failed-payment dunning (past_due → grace → downgrade), and user-initiated cancellation that keeps the subscription active until period end.

### Modified Capabilities
- `membership-plans`: Subscription status enum expanded (`paid`, `past_due` added alongside existing `active`/`trialing`/`expired`/`cancelled`); paid subscription flow added on top of the existing free-trial-only flow; `SubscriptionService` gains paid checkout, renewal, dunning, and cancel-until-period-end behavior. Existing `trialing` → `expired` → Freemium downgrade path is preserved for trials that do not convert to paid.

## Impact

- **Backend routes:**
  - `member_subscription.py` — extend with checkout, renewal-status, and cancel endpoints.
  - New checkout route module — Stripe + PayPal checkout-session creation endpoints.
- **Backend services:**
  - `SubscriptionService` — add `create_checkout_session`, `activate_paid_subscription`, `attempt_renewal`, `mark_past_due`, `apply_grace_expiry`, `cancel_until_period_end`; `resolve_effective_plan` updated to treat `paid`/`past_due` as Personal-tier-effective.
- **Backend models / DB:**
  - `MemberSubscription.status` — enum migration (Alembic `ALTER TYPE ... ADD VALUE`).
  - Add columns as needed: `period_end`, `grace_period_end`, `gateway`, `gateway_subscription_id`, `payment_method_id` (where not already present from change #1).
- **Background tasks:**
  - New hourly `_renewal_loop` task (scheduling via existing task runner).
- **Frontend:**
  - New `/member/checkout` page + gateway selection component.
  - `PricingCard` update — "Start Paid Subscription" CTA.
  - `SubscriptionPanel` update — paid status, renewal date, cancel.
- **Next.js API routes:** proxy routes for `/api/member/checkout/stripe`, `/api/member/checkout/paypal`, and webhook relay if needed.
- **Dependencies:** Requires change `add-payment-gateway-foundation` (PaymentService, orders/payments tables, Stripe + PayPal SDK, webhook framework).
- **Out of scope:** invoices, refunds, admin management pages.
