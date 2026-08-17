## Context

UnoWire's backend (`FastAPI` + `SQLAlchemy` async + `PostgreSQL`) has a 3-tier membership plan system with `subscription_plans`, `member_subscriptions`, and `usage_records` tables. The Personal plan ($15/mo, $149/yr) currently only supports a 14-day free trial that auto-downgrades to Freemium. There is no payment gateway, no orders table, and no webhook handling. The archived `add-membership-tiers` design explicitly deferred payment integration.

This change introduces the payment foundation: Stripe + PayPal SDK integration, `orders`/`payments` tables, a unified `PaymentService` abstraction, and webhook receivers. Subsequent changes (checkout, invoices, refunds) build on this layer.

## Goals / Non-Goals

**Goals:**
- Integrate Stripe and PayPal SDKs with a unified `PaymentService` interface so downstream features are gateway-agnostic
- Persist payment lifecycle in `orders` (intent/order) and `payments` (transaction attempts) tables
- Receive and verify Stripe + PayPal webhooks, persist raw payloads, and route to pluggable handlers
- Add `payment` RBAC module for admin-side order/payment views (used by later changes)
- Support multi-currency (USD now, extensible) and both one-time and recurring payment intents

**Non-Goals:**
- Subscription checkout flow (creating subscriptions from successful payments) — change #2
- Invoice generation and billing history UI — change #3
- Admin order management page and refund UI — change #4
- Frontend checkout pages — change #2
- Tax calculation engine — deferred (manual `tax_amount` field only)

## Decisions

### D1: Stripe Checkout Sessions (hosted) over Stripe PaymentIntents (embedded)

**Choice**: Use Stripe Checkout Sessions (hosted payment page) for the initial integration.

**Rationale**: Checkout Sessions handle PCI compliance, 3DS, Apple Pay, and Google Pay out of the box. UnoWire is a small team MVP; embedding PaymentIntents requires building a custom payment form, handling 3DS redirects, and deeper PCI scope. Checkout redirects to Stripe-hosted pages and returns via success_url.

**Alternatives considered**:
- PaymentIntents + Stripe Elements: more control, lower Stripe branding, but significantly more frontend work and PCI surface
- Stripe Payment Links: no-code, but too rigid for subscription lifecycle integration

**Note**: The foundation layer exposes a generic `create_payment_intent` that returns a redirect URL. The checkout change (#2) calls it with `mode="subscription"` for recurring payments. If we later need embedded flows, the abstraction supports adding a `PaymentIntentsProvider` without breaking callers.

### D2: PayPal Orders API v2 over PayPal Subscriptions API

**Choice**: Use PayPal Orders API v2 for one-time and initial subscription payments.

**Rationale**: Orders API v2 is the current PayPal recommendation for checkout flows. For recurring subscriptions, we capture the first payment via Orders API, then use the resulting `access_token`/billing agreement for recurring charges via PayPal Billing. This keeps the foundation simple while enabling subscriptions.

**Alternatives considered**:
- PayPal Subscriptions API directly: couples foundation to subscription logic (violates non-goal)
- Braintree: adds another dependency, overkill for MVP

### D3: Unified PaymentService with gateway provider enum

**Choice**: A single `PaymentService` class with a `gateway` parameter (`"stripe"` | `"paypal"`), dispatching to internal provider methods.

```
PaymentService.create_payment_intent(gateway, member, plan, billing_cycle, amount, currency) -> { intent_id, redirect_url }
PaymentService.retrieve_payment(gateway, intent_id) -> PaymentResult
PaymentService.confirm_payment(gateway, intent_id) -> PaymentResult
PaymentService.refund_payment(gateway, payment_id, amount) -> RefundResult  # stub for change #4
```

**Rationale**: Downstream code (checkout, invoices, refunds) stays gateway-agnostic. Adding a third gateway later means adding methods, not changing callers.

**Alternatives considered**:
- Strategy pattern with separate `StripeProvider`/`PayPalProvider` classes: cleaner OCP, but overkill for 2 gateways and adds indirection. If a third gateway arrives, refactor then.
- Single gateway now (Stripe only): violates user requirement for Stripe + PayPal

### D4: Webhook receiver stores raw payload before processing

**Choice**: Every webhook call writes the raw payload + signature + gateway to a `payments` row (or a `payment_events` append-only log) BEFORE dispatching to business-logic handlers.

**Rationale**: Idempotency and auditability. If the handler crashes or the DB transaction fails, the raw event is preserved for replay. Stripe sends events with `id` (evt_*) which we store as `gateway_event_id` with a unique constraint for idempotency.

**Alternatives considered**:
- Process inline without persisting raw: loses audit trail, harder to debug webhook failures
- Separate `webhook_events` table: adds a table; `payments` with `event_type` and `raw_payload` JSONB is sufficient

### D5: orders + payments two-table model

**Choice**:
- `orders`: one per payment intent (member + plan + billing_cycle + amount + gateway + status). An order may have multiple payment attempts.
- `payments`: one per transaction attempt (order_id FK, gateway_payment_id, status, amount, fee, raw_payload JSONB).

**Rationale**: Mirrors Stripe's PaymentIntent → Charge model and PayPal's Order → Capture model. Failed retries create new `payments` rows against the same `order`. Refunds create `payments` rows with `type=refund`.

**Alternatives considered**:
- Single `payments` table with `parent_id`: simpler but conflates orders and attempts, harder to query
- `transactions` table instead of `payments`: naming preference, same structure

### D6: Webhook signature verification via official SDKs

**Choice**: Use `stripe.Webhook.construct_event(payload, sig, secret)` and PayPal's `verify-webhook-signature` API. Fail closed (return 400) on verification failure.

**Rationale**: Official SDKs handle edge cases (timing, encoding). Rolling our own verification is a security risk.

## Risks / Trade-offs

- **[Risk] Webhook delivery failures** → Stripe retries for up to 3 days; PayPal retries for up to 24 hours. Our idempotency key (`gateway_event_id` unique) prevents double-processing on retry. Document that handlers MUST be idempotent.
- **[Risk] Stripe test/live mode confusion** → Config uses `STRIPE_SECRET_KEY` (sk_test_* or sk_live_*). Add a `PAYMENT_MODE` env var (`test` | `live`) logged at startup to make the active mode visible.
- **[Risk] PayPal webhook verification requires a live API call** → slower than Stripe's local verification. Acceptable; cache the access token with expiry.
- **[Trade-off] Hosted Checkout Sessions redirect away from UnoWire** → users leave the site briefly. Acceptable for MVP; keeps PCI scope minimal.
- **[Trade-off] No async webhook queue** → webhooks are processed inline in the request handler. For MVP volume this is fine. If webhook volume grows, add a background task queue (Celery/RQ) later — the `PaymentService` interface won't change.

## Migration Plan

1. Add `stripe` and `paypalrestsdk` to `requirements.txt` and rebuild backend image
2. Add env vars to `.env.docker` (with placeholder test keys)
3. Create Alembic migration `q7r8s9t0u1v2_add_payment_orders_tables.py` creating `orders` + `payments` tables
4. Add `payment` module to `ADMIN_MODULES` (backend) and `ADMIN_MODULES` (frontend) — no menu items yet (admin UI comes in change #4)
5. Deploy: `git push` → server `./deploy/deploy.sh master` → `alembic upgrade head`
6. **Rollback**: `alembic downgrade -1` drops the two tables. No existing data affected (new tables only). Remove new env vars if needed.

## Open Questions

- **PayPal SDK choice**: `paypalrestsdk` (official, but PayPal recommends moving to REST API directly) vs raw `httpx` calls to PayPal REST API. Prefer `paypalrestsdk` for MVP; migrate to `httpx` if it gets deprecated.
- **Webhook URL exposure**: webhooks must be reachable from the internet. In dev, use Stripe CLI (`stripe listen --forward-to localhost:8000/api/payments/webhooks/stripe`). PayPal sandbox webhooks point directly at `https://www.unowire.com/api/payments/webhooks/paypal`. Confirm Nginx routes `/api/payments/` to backend (it should, since `/api/` is already proxied).
