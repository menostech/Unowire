## 1. Backend: Subscription Status Enum & Model

- [x] 1.1 Add Alembic migration to extend `MemberSubscription.status` enum with `paid` and `past_due` values (`ALTER TYPE ... ADD VALUE`). _(Note: status is String(20), not a PG enum — migration adds columns only; paid/past_due are plain strings. Implemented in Task 1.)_
- [x] 1.2 Add any missing columns on `MemberSubscription` (`period_end`, `grace_period_end`, `gateway`, `gateway_subscription_id`, `payment_method_id`) if not already introduced by change #1. _(Note: reuses existing `current_period_end`; no new `period_end` column. Implemented in Task 1.)_
- [x] 1.3 Update `MemberSubscription` model to reflect the new enum values and columns (Python-side enum/mapper). _(Implemented in Task 2 — added 4 mapped_column attrs; no enum class to extend since status is String(20).)_
- [x] 1.4 Update `SubscriptionService.resolve_effective_plan` to treat `paid` and `past_due` (within grace) as Personal-tier-effective; keep `trialing`/`active`/`expired`/`cancelled` behavior intact.
- [x] 1.5 Add `SubscriptionService` methods: `create_checkout_session`, `activate_paid_subscription`, `attempt_renewal`, `mark_past_due`, `apply_grace_expiry`, `cancel_until_period_end`.
- [x] 1.6 Ensure `check_and_expire_trial` still downgrades trialing subscriptions that did not convert to paid (preserve existing trial-expiry path).

## 2. Backend: Checkout API & Webhook Handlers

- [x] 2.1 Add `POST /api/member/checkout/stripe` route — create a Stripe Checkout Session (`mode=subscription`) for the Personal plan (monthly/yearly price selection via `cycle` param).
- [x] 2.2 Add `POST /api/member/checkout/paypal` route — create a PayPal order (first-payment capture + billing agreement creation).
- [x] 2.3 Register webhook handler for `checkout.session.completed` → create `MemberSubscription` (status `paid`, set `period_end`, store `gateway_subscription_id`).
- [x] 2.4 Register webhook handler for `invoice.payment_succeeded` / `payment_intent.succeeded` → extend `period_end`, clear `past_due` if recovering.
- [x] 2.5 Register webhook handler for `invoice.payment_failed` → set `past_due`, start grace period.
- [x] 2.6 Make all webhook-driven state transitions idempotent (keyed on `gateway_subscription_id` + event id).
- [x] 2.7 Add `POST /api/member/subscription/cancel` route → cancel-until-period-end (status stays `paid` until `period_end`, then `cancelled`).

## 3. Backend: Renewal Background Task & Dunning

- [x] 3.1 Implement `_renewal_loop` hourly background task: query subscriptions near `period_end`, attempt renewal via saved payment method, extend `period_end` on success.
- [x] 3.2 On renewal failure: set `past_due`, set `grace_period_end = now + 7 days`.
- [x] 3.3 After grace elapses without recovery: set `expired`, downgrade to Freemium.
- [x] 3.4 Add reconciliation step inside `_renewal_loop`: fetch subscription state from gateway API to catch missed webhooks.
- [x] 3.5 Ensure renewal query is indexed on `period_end` and scoped to the near-renewal window.
- [x] 3.6 Register `_renewal_loop` with the existing task runner / scheduler (hourly cadence).

## 4. Backend: Schemas

- [x] 4.1 Add `CheckoutSessionCreate` schema (fields: `plan`, `cycle`, `gateway`, optional `success_url`/`cancel_url`).
- [x] 4.2 Add `CheckoutSessionResponse` schema (fields: `checkout_url`, `session_id`, `gateway`, `expires_at`).
- [x] 4.3 Add `RenewalResult` schema (fields: `subscription_id`, `status`, `period_end`, `grace_period_end`, `attempted_at`, `error`).
- [x] 4.4 Add `SubscriptionStatusResponse` schema (exposes `status`, `plan`, `period_end`, `grace_period_end`, `gateway` for the frontend panel).

## 5. Frontend: Checkout Page

- [x] 5.1 Add `/member/checkout` page reading `plan` and `cycle` query params.
- [x] 5.2 Build gateway selection component (Stripe and PayPal buttons).
- [x] 5.3 On gateway selection: call the Next.js proxy route to create a checkout session and redirect to the returned `checkout_url`.
- [x] 5.4 Handle success redirect → `/member/subscription` with success state.
- [x] 5.5 Handle cancel redirect → back to `/member/checkout` with inline error message.
- [x] 5.6 Guard the page against users who already have a `paid`/`trialing` Personal subscription (redirect to `/member/subscription`).

## 6. Frontend: PricingCard & SubscriptionPanel Updates

- [x] 6.1 Update `PricingCard` — add "Start Paid Subscription" CTA for the Personal plan that routes to `/member/checkout?plan=personal&cycle=monthly`.
- [x] 6.2 Update `SubscriptionPanel` — show paid status, renewal date (`period_end`), and gateway.
- [x] 6.3 Add "Cancel Subscription" action in `SubscriptionPanel` → calls `/api/member/subscription/cancel`, shows "active until <period_end>".
- [x] 6.4 Show `past_due` banner in `SubscriptionPanel` during the grace window.

## 7. Frontend: Next.js API Proxy Routes

- [x] 7.1 Add Next.js API proxy route for `POST /api/member/checkout/stripe`.
- [x] 7.2 Add Next.js API proxy route for `POST /api/member/checkout/paypal`.
- [x] 7.3 Add Next.js API proxy route for `POST /api/member/subscription/cancel`.
- [x] 7.4 Add Next.js API proxy route for `GET /api/member/subscription/status` (if not already present).

## 8. Tests

- [x] 8.1 Checkout flow tests: Stripe Checkout Session creation → webhook `checkout.session.completed` → subscription `paid`.
- [x] 8.2 Checkout flow tests: PayPal order creation → capture → agreement → subscription `paid`.
- [x] 8.3 Renewal task tests: subscription near `period_end` → successful renewal → `period_end` extended.
- [x] 8.4 Renewal task tests: failed renewal → `past_due` + `grace_period_end` set.
- [x] 8.5 Dunning tests: grace elapses without recovery → `expired` → downgrade to Freemium.
- [x] 8.6 Dunning tests: recovery payment during grace → `paid` restored, `period_end` extended.
- [x] 8.7 Webhook handler tests: idempotency (replaying same event id does not double-extend `period_end`).
- [x] 8.8 Cancel-until-period-end tests: subscription stays `paid` until `period_end`, then `cancelled`.
- [x] 8.9 Trial-expiry-without-payment tests: `trialing` → `expired` → Freemium downgrade still works (regression).

## 9. End-to-End Verification

- [x] 9.1 Verify full flow: user clicks "Start Paid Subscription" → checkout page → Stripe → success → `SubscriptionPanel` shows `paid` + renewal date.
- [x] 9.2 Verify full flow: user pays via PayPal → subscription `paid` → renewal at period end.
- [x] 9.3 Verify auto-renewal: simulated period end → renewal task charges saved method → `period_end` extended.
- [x] 9.4 Verify dunning: simulated failed renewal → `past_due` → grace → downgrade to Freemium.
- [x] 9.5 Verify cancel: user cancels → stays active until `period_end` → `cancelled`.
- [x] 9.6 Verify trial expiry without payment still downgrades to Freemium (regression check).
