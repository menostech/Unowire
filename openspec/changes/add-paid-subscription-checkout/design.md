## Context

UnoWire has a 3-tier membership model: Freemium ($0), Personal ($15/mo or $149/yr, 14-day free trial), and Enterprise (sales-led). The current Personal plan flow is trial-only: `POST /api/member/subscription/trial` flips `MemberSubscription.status` to `trialing`, and `SubscriptionService.check_and_expire_trial` downgrades to Freemium on expiry. There is no way for a user to pay and keep a Personal subscription.

Change `add-payment-gateway-foundation` (change #1) delivers the payment substrate this change depends on: a `PaymentService`, `orders`/`payments` tables, a webhook framework, and Stripe + PayPal SDK integrations. This change (#2) builds the paid checkout flow and the recurring subscription lifecycle on top of that substrate.

Existing relevant code:
- Models: `SubscriptionPlan`, `MemberSubscription` (status: `active`/`trialing`/`expired`/`cancelled`), `UsageRecord`.
- Services: `SubscriptionService` (`get_active_subscription`, `resolve_effective_plan`, `check_and_expire_trial`, `start_trial`, `cancel_subscription`).

## Goals / Non-Goals

**Goals:**
- Personal plan paid checkout flow via Stripe Checkout (subscription mode) and PayPal (Billing Plans + Agreements).
- Extend `MemberSubscription.status` to model the paid lifecycle: add `paid` (active paid) and `past_due` (renewal failed, in grace).
- Auto-renewal of paid subscriptions at period end using the saved payment method.
- Dunning: failed renewal → `past_due` → 7-day grace period → downgrade to Freemium.
- User-initiated cancellation that keeps the subscription active until the end of the current period.
- Preserve the existing free-trial flow (trial expiry without payment → Freemium).

**Non-Goals:**
- Invoices (rendering, PDF, history page).
- Refunds (handled separately in a future change).
- Admin management pages for subscriptions/payments.
- Dunning email notifications (this change sets `past_due` status and grace timing only; email integration is deferred).
- Enterprise plan checkout (sales-led, unchanged).

## Decisions

- **D1 — Stripe Checkout Session in `mode=subscription` (not `mode=payment`).**
  Stripe's subscription mode natively handles recurring billing, stored payment methods, and webhook events (`checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`). Using `mode=payment` would force us to re-implement recurring billing client-side, which is error-prone. Trade-off: less flexibility over the charge schedule, but we accept Stripe's recurring semantics for Personal plan pricing tiers.

- **D2 — PayPal recurring via Billing Plans + Agreements.**
  First payment is captured immediately and a billing agreement is created so subsequent renewals can be charged through PayPal without user interaction. This is a two-step flow (create order → capture → execute agreement) versus Stripe's single Checkout Session redirect. The checkout page handles both flows with a shared gateway-selection entry point.

- **D3 — Extend `MemberSubscription.status` enum: add `paid` and `past_due`.**
  - `trialing` — unchanged; free-trial status.
  - `paid` — active paid subscription (replaces overloading `active` for paid; `active` is retained for backward compatibility but new paid subscriptions use `paid`).
  - `past_due` — renewal failed; subscription is still effective (Personal-tier access retained) but inside the grace window.
  - `expired` / `cancelled` — unchanged.
  This makes the lifecycle explicit and machine-readable for the renewal loop and the frontend.

- **D4 — Background `_renewal_loop` task (hourly).**
  The loop queries subscriptions whose `period_end` is within the next renewal window, attempts renewal via the saved payment method, and on success extends `period_end`. On failure it sets `past_due` and `grace_period_end = now + 7 days`. After grace elapses without successful recovery, the subscription is set to `expired` and the user is downgraded to Freemium. Hourly cadence balances responsiveness against gateway API load; renewals are only attempted within a narrow window near `period_end`.

- **D5 — Webhook handlers are the source of truth; API polling is fallback.**
  - `checkout.session.completed` → create `MemberSubscription` (status `paid`, set `period_end`, store `gateway_subscription_id`).
  - `invoice.payment_succeeded` / `payment_intent.succeeded` → extend `period_end`; clear `past_due` if recovery succeeded.
  - `invoice.payment_failed` → set `past_due`, start grace period.
  A reconciliation job (part of the `_renewal_loop`) periodically fetches subscription state from the gateway API to catch missed webhooks.

- **D6 — Frontend checkout page at `/member/checkout?plan=personal&cycle=monthly`.**
  Shows gateway selection (Stripe and PayPal buttons), redirects to the chosen gateway, and returns to `/member/subscription` on success (or back to `/member/checkout` on cancel with an inline error). The query params drive which Stripe price / PayPal plan to reference. `PricingCard` gains a "Start Paid Subscription" CTA that links here.

## Risks / Trade-offs

- **Stripe webhook vs API polling race condition.** Webhooks and the renewal loop can both observe the same event. Mitigation: webhooks are the source of truth; the renewal loop's API fetch is used only to reconcile missed webhooks. All state transitions are idempotent (keyed on `gateway_subscription_id` + event id).
- **PayPal billing agreement requires initial capture (two-step flow).** Unlike Stripe's single-redirect Checkout Session, PayPal requires create-order → capture → execute-agreement. The checkout page handles the extra step, but this adds a failure surface (capture succeeds, agreement creation fails). Mitigation: on agreement-creation failure, refund the captured payment and surface an inline error.
- **Grace-period dunning emails deferred.** This change sets `past_due` status and grace timing only; no emails are sent. Users in `past_due` will be downgraded silently after 7 days. Trade-off: acceptable for the first iteration; email integration is a follow-up change.
- **`active` vs `paid` status split.** Existing code may assume `active` is the only "currently effective" status. `resolve_effective_plan` must be updated to treat `paid` and `past_due` (within grace) as Personal-tier-effective. Risk of missed call sites; mitigated by routing all plan resolution through `resolve_effective_plan`.
- **Hourly renewal loop load.** With many subscriptions, the hourly query must be indexed on `period_end` and scoped to the near-renewal window to avoid full-table scans.

## Migration Plan

- **DB migration (Alembic):** `ALTER TYPE member_subscription_status ADD VALUE 'paid';` and `ALTER TYPE member_subscription_status ADD VALUE 'past_due';`. Add any missing columns (`period_end`, `grace_period_end`, `gateway`, `gateway_subscription_id`, `payment_method_id`) if not already introduced by change #1.
- **No data backfill:** existing `trialing` subscriptions are unaffected; they continue to expire via `check_and_expire_trial`. Existing `active` records (if any) remain valid.
- **Code rollout:** deploy backend (services, routes, webhook handlers, renewal task) first; then frontend (checkout page, PricingCard/SubscriptionPanel updates). Feature-flag the checkout page until change #1 is confirmed deployed.
- **Rollback:** `ALTER TYPE ... DROP VALUE` is not supported in PostgreSQL; rollback is achieved by code-level revert (stop writing `paid`/`past_due`) and a follow-up migration to recreate the enum without the new values once no rows reference them. The enum additions themselves are additive and safe to leave in place if the code is reverted.

## Open Questions

- Should `paid` and `past_due` subscriptions block new trials on the same account? (Assumed yes — a paid or past_due subscription should prevent starting a new trial.)
- Should the grace period length (7 days) be configurable per environment, or hardcoded? (Assumed hardcoded constant for v1.)
- Do we need to surface `past_due` status to the user in the UI, or only after downgrade? (Assumed: surface a banner in `SubscriptionPanel` during `past_due`.)
- For PayPal recurring, do we store the billing-agreement ID on `MemberSubscription.gateway_subscription_id`, or a separate column? (Assumed: reuse `gateway_subscription_id`.)
