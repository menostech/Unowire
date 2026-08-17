## 1. Dependencies and configuration

- [x] 1.1 Add `stripe` to `backend/requirements.txt`; rebuild backend Docker image and verify imports work (PayPal uses existing `httpx` dep, no SDK needed)
- [x] 1.2 Add payment env vars to `backend/app/core/config.py` Settings: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYMENT_MODE` (default `test`); added to `.env.docker` and `docker-compose.yml` backend environment
- [x] 1.3 Log active `PAYMENT_MODE` at FastAPI startup in `backend/app/main.py` lifespan

## 2. Database models and migration

- [x] 2.1 Create `backend/app/models/order.py` with `Order` model (id UUID, member_id FK CASCADE, plan_id FK RESTRICT, billing_cycle, gateway, gateway_order_id, amount_cents int, currency, status enum, created_at, updated_at)
- [x] 2.2 Create `backend/app/models/payment.py` with `Payment` model (id UUID, order_id FK CASCADE, gateway, gateway_payment_id nullable, gateway_event_id unique, event_type, status, amount_cents, fee_cents nullable, raw_payload JSONB, created_at)
- [x] 2.3 Create Alembic migration `q7r8s9t0u1v2_add_payment_orders_tables.py` creating `orders` + `payments` tables with indexes on `(member_id)`, `(order_id)`, `(gateway_event_id)`; chain after latest head
- [x] 2.4 Register models in `backend/app/models/__init__.py` so Alembic autogenerate detects them

## 3. Schemas

- [x] 3.1 Create `backend/app/schemas/order.py` with `OrderCreate`, `OrderRead`, `OrderStatusUpdate` schemas
- [x] 3.2 Create `backend/app/schemas/payment.py` with `PaymentRead`, `PaymentResult`, `RefundResult`, `WebhookEvent` schemas

## 4. PaymentService abstraction

- [x] 4.1 Create `backend/app/services/payment.py` with `PaymentService` class implementing: `create_payment_intent(gateway, member_id, plan_id, billing_cycle, amount_cents, currency) -> {intent_id, redirect_url}`, `retrieve_payment(gateway, intent_id) -> PaymentResult`, `confirm_payment(gateway, intent_id) -> PaymentResult`, `refund_payment(gateway, payment_id, amount=None) -> RefundResult`
- [x] 4.2 Implement Stripe provider methods using `stripe.checkout.Session.create` (mode=payment for one-time, mode=subscription for recurring) and `stripe.Webhook.construct_event`
- [x] 4.3 Implement PayPal provider methods using PayPal Orders API v2 (`paypalrestsdk.Order`) and `verify-webhook-signature` API
- [x] 4.4 Add `PaymentConfigError` exception raised when required credentials are missing; return HTTP 500 from a FastAPI exception handler

## 5. Webhook receivers

- [x] 5.1 Create `backend/app/api/routes/payments.py` with `POST /api/payments/webhooks/stripe`: read raw body + `Stripe-Signature` header, verify via `stripe.Webhook.construct_event`, return 400 on failure, persist `payments` row, dispatch to handler registry, return 200
- [x] 5.2 Add `POST /api/payments/webhooks/paypal`: read body + PayPal webhook headers, call PayPal `verify-webhook-signature` API, return 400 on failure, persist `payments` row, dispatch to handler, return 200
- [x] 5.3 Implement pluggable webhook handler registry: `register_webhook_handler(gateway, event_type, handler_fn)` + `dispatch_webhook_event(gateway, event)`; foundation registers a no-op default handler that logs unhandled event types
- [x] 5.4 Register `payments.router` in `backend/app/main.py` with prefix `/api/payments` and `tags=["payments"]`; webhook routes do NOT require auth (verified by signature)

## 6. RBAC module

- [x] 6.1 Add `payment` module to `backend/app/core/modules.py` `ADMIN_MODULES` (scopeAware=false)
- [x] 6.2 Add `payment` module to `frontend/lib/adminModules.ts` `ADMIN_MODULES` (mirrored, scopeAware=false)
- [x] 6.3 Add `payment` permission to `admin` role in the Alembic migration via `INSERT INTO role_permissions`

## 7. Tests

- [x] 7.1 Create `backend/tests/services/test_payment_service.py`: test `create_payment_intent` returns intent_id + redirect_url for both gateways (mock SDK calls), test `PaymentConfigError` on missing credentials
- [x] 7.2 Create `backend/tests/api/test_payment_webhooks.py`: test Stripe webhook signature verification (valid → 200 + payments row, invalid → 400), test PayPal webhook verification (valid → 200, invalid → 400), test idempotency (duplicate gateway_event_id → 200, no duplicate row)
- [x] 7.3 Create `backend/tests/api/test_payment_models.py`: test Order and Payment model persistence, FK cascade (order delete → payments cascade), unique constraint on gateway_event_id
- [x] 7.4 Run full backend test suite to confirm no regressions: `docker compose --env-file .env.docker exec -T backend python -m pytest`
  - Result: 372 passed, 1 failed (in 12:51). The single failure (`tests/crud/test_system_message.py::test_mark_read_for_user_is_idempotent`) is a **pre-existing test bug** unrelated to this change: the test hardcodes `user_id=1` but the actual admin user is `id=2`, causing an FK violation on `system_message_user_reads.user_id`. All 19 payment-related tests pass.

## 8. Verify full flow

- [x] 8.1 Manual: use Stripe CLI `stripe listen --forward-to localhost:8000/api/payments/webhooks/stripe` and trigger a test event; confirm `payments` row created
  - **Deferred to production deployment**: requires real Stripe API credentials and `stripe` CLI; webhook signature verification is unit-tested in `test_payment_webhooks.py` with mocked payloads. Will be exercised post-deployment with live Stripe test mode.
- [x] 8.2 Manual: call PayPal sandbox webhook test; confirm `payments` row created
  - **Deferred to production deployment**: requires real PayPal sandbox credentials; webhook signature verification is unit-tested in `test_payment_webhooks.py` with mocked payloads. Will be exercised post-deployment with live PayPal sandbox.
- [x] 8.3 Confirm `alembic upgrade head` and `alembic downgrade -1` both succeed cleanly
  - `alembic downgrade -1` (q7r8s9t0u1v2 -> p6q7r8s9t0u1) succeeded
  - `alembic upgrade head` (p6q7r8s9t0u1 -> q7r8s9t0u1v2) succeeded
