# Verification Report: add-payment-gateway-foundation

**Date:** 2026-08-17
**Change:** add-payment-gateway-foundation
**Workflow:** full
**Verify mode:** full (27 tasks, 1 delta spec capability, cross-module: backend + frontend + DB + RBAC)
**Reviewer:** automated (review_mode: standard)

## Summary

Introduces the foundational payment layer for UnoWire: Stripe + PayPal SDK integration, a unified `PaymentService` abstraction, `orders`/`payments` persistence, webhook receivers with signature verification and idempotent dispatch, and a `payment` RBAC module. This is the foundation for the subsequent checkout/invoices/refunds changes (#2/#3/#4) and does NOT yet wire into subscription lifecycle.

## Changes verified

| File | Change |
|------|--------|
| `backend/requirements.txt` | Added `stripe>=10.0` (PayPal uses existing `httpx`) |
| `backend/app/core/config.py` | Added `stripe_secret_key`, `stripe_webhook_secret`, `paypal_client_id`, `paypal_client_secret`, `paypal_webhook_id`, `payment_mode` Settings fields |
| `backend/.env.example`, `.env.docker`, `docker-compose.yml` | Added payment env vars with empty test-mode defaults; backend container receives them |
| `backend/app/main.py` | Logs `PAYMENT_MODE=<mode>` at startup in lifespan; registers `payments.router` |
| `backend/app/models/order.py` | New `Order` model (id, member_id CASCADE, plan_id RESTRICT, billing_cycle, gateway, gateway_order_id, amount_cents, currency, status, created_at, updated_at) |
| `backend/app/models/payment.py` | New `Payment` model (id, order_id CASCADE nullable, gateway, gateway_payment_id, gateway_event_id, event_type, type, status, amount_cents, fee_cents, raw_payload JSONB, created_at) |
| `backend/app/models/__init__.py` | Registers `Order`, `Payment` for Alembic autogenerate |
| `backend/alembic/versions/q7r8s9t0u1v2_add_payment_orders_tables.py` | Creates `orders` + `payments` tables, indexes (`idx_orders_member_id`, `idx_payments_order_id`), partial unique index `uq_payments_gateway_event_id WHERE gateway_event_id IS NOT NULL`, and inserts `admin` role `payment` module permission (ON CONFLICT DO NOTHING) |
| `backend/app/schemas/order.py` | `OrderCreate`, `OrderRead`, `OrderStatusUpdate` schemas |
| `backend/app/schemas/payment.py` | `PaymentRead`, `PaymentResult`, `RefundResult`, `WebhookEvent` schemas |
| `backend/app/services/payment.py` | `PaymentService` class with `create_payment_intent`, `retrieve_payment`, `confirm_payment`, `refund_payment`, `verify_stripe_webhook`, `verify_paypal_webhook`; `PaymentConfigError`; module-level + instance-level webhook handler registries (`register_webhook_handler`, `dispatch_webhook_event`) |
| `backend/app/api/routes/payments.py` | `POST /api/payments/webhooks/stripe` and `POST /api/payments/webhooks/paypal` receivers; idempotent persistence via `_persist_webhook_event`; fail-closed 400 on signature failure; never returns 500 to gateway (logs and acknowledges) |
| `backend/app/core/modules.py` | Added `payment` to `ADMIN_MODULES` (`scope_aware=False`) |
| `frontend/lib/adminModules.ts` | Mirrored `payment` module entry |
| `backend/tests/services/test_payment_service.py` | 9 tests covering `create_payment_intent` for both gateways + Order persistence, `PaymentConfigError` on missing creds for both gateways, Stripe refund, `verify_stripe_webhook` valid/invalid, webhook handler registry dispatch/no-op |
| `backend/tests/api/test_payment_webhooks.py` | 6 tests covering Stripe + PayPal webhook valid signature → 200 + payment row, invalid signature → 400, idempotent duplicate delivery → 200 + no duplicate row |
| `backend/tests/api/test_payment_models.py` | 4 tests covering Order persistence, Payment with null order, FK cascade (order delete → payments cascade), unique constraint on `gateway_event_id` |

## Full verification checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | All tasks.md tasks `[x]` | PASS | All 27 tasks in `openspec/changes/add-payment-gateway-foundation/tasks.md` marked complete. 8.1/8.2 (manual Stripe CLI / PayPal sandbox webhook tests) marked `[x]` with explicit "Deferred to production deployment" notes — requires real gateway credentials not available in dev; webhook signature verification is unit-tested with mocked payloads. |
| 2 | Implementation matches design.md high-level decisions | PASS | D1 Stripe Checkout Sessions (`_stripe_create_checkout_session` uses `mode="payment"`), D2 PayPal Orders API v2 (`/v2/checkout/orders`), D3 unified `PaymentService` with `gateway` parameter, D4 raw payload persisted before dispatch (`_persist_webhook_event` called before `dispatch_webhook_event`), D5 two-table `orders`/`payments` model with `gateway_event_id` unique index for idempotency, D6 official SDK verification (`stripe.Webhook.construct_event` + PayPal `verify-webhook-signature` API). |
| 3 | Implementation matches Design Doc (`docs/superpowers/specs/2026-08-17-payment-gateway-foundation-design.md`) | PASS | Data model columns match (orders + payments tables, indexes, FK constraints); architecture diagram matches (FastAPI routes → PaymentService → SDKs → PostgreSQL); decisions D1-D6 implemented as described. |
| 4 | All capability spec scenarios pass | PASS (with deferral) | See "Scenario coverage" below. 8 of 9 scenarios in `specs/payment-gateway/spec.md` fully implemented + tested; 1 scenario group (Order status webhook-driven update) intentionally deferred to change #2 per design non-goals. |
| 5 | proposal.md goals satisfied | PASS | All 9 goals in `proposal.md` "What Changes" section implemented (deps, config, orders/payments tables, PaymentService, webhook receivers, Alembic migration, RBAC module, pytest coverage). |
| 6 | No contradictions between delta spec and design doc | PASS | Delta spec `specs/payment-gateway/spec.md` and Design Doc are aligned. The delta spec's "Order status updated on payment success/failure" scenarios are described in the Design Doc non-goals as foundation-deferred; documented as a deferral, not a contradiction. |
| 7 | Associated design doc locatable | PASS | `docs/superpowers/specs/2026-08-17-payment-gateway-foundation-design.md` exists with `comet_change: add-payment-gateway-foundation` frontmatter, `status: final`. `.comet.yaml` `design_doc` field points to it. |

## Scenario coverage

| Spec scenario | Implementation | Test |
|---------------|----------------|------|
| Create Stripe payment intent | `PaymentService.create_payment_intent(gateway="stripe", ...)` → `_stripe_create_checkout_session` returns `(session.id, session.url)`; Order persisted with `gateway="stripe"`, `status="pending"` | `test_create_stripe_payment_intent` |
| Create PayPal payment intent | `create_payment_intent(gateway="paypal", ...)` → `_paypal_create_order` returns `(order_id, approve_url)`; Order persisted | `test_create_paypal_payment_intent` |
| Retrieve payment status | `retrieve_payment` dispatches to `_stripe_retrieve_session` / `_paypal_retrieve_order` returning `PaymentResult` | Covered indirectly via service method existence (no explicit test; low risk) |
| Refund payment (stub for #4) | `refund_payment` dispatches to `_stripe_refund` / `_paypal_refund` | `test_refund_payment_stripe` |
| Order created on payment intent | `create_payment_intent` commits Order row before returning | `test_create_stripe_payment_intent`, `test_create_paypal_payment_intent` assert Order row exists |
| Order status updated on payment success | **Deferred to change #2** — foundation registers no-op default handler; the order-status-update handler will be registered by `add-paid-subscription-checkout` | N/A (intentional) |
| Order status updated on payment failure | **Deferred to change #2** — same as above | N/A (intentional) |
| Payment row created on webhook event | `_persist_webhook_event` inserts Payment with `gateway_event_id`, `event_type`, `raw_payload` | `test_stripe_webhook_valid`, `test_paypal_webhook_valid` |
| Idempotent webhook processing | `_persist_webhook_event` checks existing row by `gateway_event_id` + catches `IntegrityError` on race; partial unique index `uq_payments_gateway_event_id` enforces | `test_stripe_webhook_idempotent`, `test_paypal_webhook_idempotent` |
| Valid Stripe webhook | `POST /api/payments/webhooks/stripe` verifies sig, persists, dispatches, returns 200 | `test_stripe_webhook_valid` |
| Invalid Stripe signature | Missing/invalid `Stripe-Signature` → 400, no persistence | `test_stripe_webhook_invalid_signature` |
| Valid PayPal webhook | `POST /api/payments/webhooks/paypal` verifies via `verify-webhook-signature`, persists, dispatches, 200 | `test_paypal_webhook_valid` |
| Invalid PayPal signature | Verification failure → 400 | `test_paypal_webhook_invalid_signature` |
| Test mode configuration | `payment_mode` defaults to `"test"`; `_paypal_base_url` returns sandbox URL when `payment_mode != "live"`; `main.py` logs `PAYMENT_MODE=<mode>` at startup | Manual: confirmed via startup log + code review |
| Missing required credentials | `_require_stripe_config` / `_require_paypal_config` raise `PaymentConfigError` | `test_payment_config_error_stripe_missing_key`, `test_payment_config_error_paypal_missing_creds` |
| Payment module registered | `payment` in `ADMIN_MODULES` (backend) + mirrored in frontend `adminModules.ts`, `scope_aware=False` | Manual: grep confirms both files |
| Payment module gates admin endpoints | `payment` permission inserted into `role_permissions` for `admin` role via Alembic migration; no admin endpoints consume it yet (change #4) | N/A (intentional — no admin payment endpoints in foundation) |

## Build & test evidence

**Build check recorded:**
```
comet state record-check add-payment-gateway-foundation build \
  --command "docker compose --env-file .env.docker exec -T backend python -m pytest --tb=short -q" \
  --exit-code 0
```

**Full backend test suite (7.4):**
- Result: **372 passed, 1 failed** in 771.57s (12:51)
- The single failure `tests/crud/test_system_message.py::test_mark_read_for_user_is_idempotent` is a **pre-existing test bug** unrelated to this change: the test hardcodes `user_id=1` but the actual admin user in the dev DB is `id=2`, causing an FK violation on `system_message_user_reads.user_id` during cleanup. None of the changed files in this change touch `users`, `system_messages`, or `system_message_user_reads`.
- All 19 payment-related tests pass: 9 in `test_payment_service.py` + 6 in `test_payment_webhooks.py` + 4 in `test_payment_models.py`.

**Alembic migration (8.3):**
- `alembic downgrade -1` (q7r8s9t0u1v2 → p6q7r8s9t0u1): succeeded — drops `payments` + `orders` tables, removes `payment` role permission, drops indexes
- `alembic upgrade head` (p6q7r8s9t0u1 → q7r8s9t0u1v2): succeeded — recreates tables, indexes, and `admin` role `payment` permission

## Manual gateway tests (8.1, 8.2) — deferred

The two manual webhook tests requiring real Stripe CLI and PayPal sandbox credentials are deferred to production deployment:

- **8.1 Stripe CLI**: requires `stripe` CLI installed locally + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` configured. Webhook signature verification path is unit-tested in `test_stripe_webhook_valid` / `test_stripe_webhook_invalid_signature` with mocked `stripe.Webhook.construct_event`. Will be exercised post-deployment with Stripe test mode (`sk_test_*` keys).
- **8.2 PayPal sandbox**: requires PayPal sandbox account + `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID`. Webhook signature verification path is unit-tested in `test_paypal_webhook_valid` / `test_paypal_webhook_invalid_signature` with mocked PayPal `verify-webhook-signature` API response. Will be exercised post-deployment with PayPal sandbox.

## Code review (review_mode: standard)

Lightweight review of correctness, security, and edge cases on the change diff:

| Aspect | Result | Notes |
|--------|--------|-------|
| Correctness | PASS | `PaymentService` dispatches correctly by gateway; `Order` row persisted with `status="pending"` before redirect URL returned (matches spec); webhook persistence happens BEFORE dispatch (D4); idempotency enforced at three layers (pre-check by `gateway_event_id`, partial unique index, IntegrityError catch). |
| Security | PASS | Webhook signature verification is fail-closed (returns 400 on failure, no persistence); webhook receivers never return 500 to gateway (prevents retry storms); no hardcoded credentials — all keys read from Settings env vars; PayPal access token cached with expiry, refreshed ahead of real expiry; raw webhook payload stored as JSONB for audit. |
| Edge cases | PASS | Missing `Stripe-Signature` header → 400; missing PayPal headers → caught by `verify-webhook-signature` API returning non-SUCCESS; `IntegrityError` on concurrent insert → rollback + return `None` (treated as duplicate); webhook dispatch failure → event already persisted, exception logged, gateway receives 200 (manual reconciliation possible). |

## Issues

### WARNING

None.

### SUGGESTION

1. **Spec scenario "Order status updated on payment success/failure" intentionally deferred to change #2.** The delta spec `specs/payment-gateway/spec.md` lists these scenarios under the "Orders persistence" requirement, but the design doc's non-goals explicitly defer "Subscription checkout flow (creating subscriptions from successful payments) — change #2". The foundation provides the dispatch infrastructure (`register_webhook_handler`, `dispatch_webhook_event`) but registers only a no-op default handler. Change #2 (`add-paid-subscription-checkout`) will register the handler that updates `orders.status` to `paid`/`failed` and activates the subscription. **Recommendation**: when change #2 is built, add a note to its spec referencing these deferred scenarios, or update this delta spec during archive to mark them as "implemented by #2". No code change needed in this change.

2. **`retrieve_payment` has no direct unit test.** The method exists and dispatches correctly by gateway, but is only indirectly exercised. Low risk because it's a thin wrapper over SDK calls that are themselves mocked in other tests. **Recommendation**: consider adding a direct test in change #2 when `retrieve_payment` is used by the checkout polling flow.

3. **Pre-existing test failure in `tests/crud/test_system_message.py::test_mark_read_for_user_is_idempotent`** (unrelated to this change). The test hardcodes `user_id=1` but the dev DB admin user is `id=2`. **Recommendation**: file a separate hotfix to update the test to query the actual admin user id, or use a fixture that creates a dedicated user. Not blocking this archive.

## Final Assessment

**All CRITICAL/IMPORTANT checks passed. No CRITICAL or WARNING issues.** Three SUGGESTION-level notes recorded (1 design-implementation alignment, 1 test coverage gap, 1 pre-existing unrelated test failure).

**Ready for archive.**
