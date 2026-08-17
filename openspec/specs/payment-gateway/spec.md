# payment-gateway Specification

## Purpose
TBD - created by archiving change add-payment-gateway-foundation. Update Purpose after archive.
## Requirements
### Requirement: PaymentService unified interface

The system SHALL provide a `PaymentService` class in `backend/app/services/payment.py` that exposes a gateway-agnostic interface for creating payment intents, retrieving payment status, confirming payments, and issuing refunds. The service SHALL accept a `gateway` parameter (`"stripe"` or `"paypal"`) on each method and dispatch to the corresponding provider implementation. Downstream code SHALL NOT import or call Stripe/PayPal SDKs directly — it SHALL go through `PaymentService`.

#### Scenario: Create Stripe payment intent

- **WHEN** `PaymentService.create_payment_intent(gateway="stripe", member_id, plan_id, billing_cycle="monthly", amount=1500, currency="usd")` is called
- **THEN** the system returns `{ intent_id, redirect_url }` where `redirect_url` is a Stripe Checkout Session URL, and an `orders` row is persisted with `gateway="stripe"`, `status="pending"`, and `gateway_order_id=intent_id`

#### Scenario: Create PayPal payment intent

- **WHEN** `PaymentService.create_payment_intent(gateway="paypal", member_id, plan_id, billing_cycle="monthly", amount=1500, currency="usd")` is called
- **THEN** the system returns `{ intent_id, redirect_url }` where `redirect_url` is a PayPal approve URL, and an `orders` row is persisted with `gateway="paypal"`, `status="pending"`, and `gateway_order_id=intent_id`

#### Scenario: Retrieve payment status

- **WHEN** `PaymentService.retrieve_payment(gateway, intent_id)` is called
- **THEN** the system queries the gateway API and returns a `PaymentResult` with `status`, `amount`, `currency`, and `gateway_payment_id`

#### Scenario: Refund payment (stub for change #4)

- **WHEN** `PaymentService.refund_payment(gateway, payment_id, amount=None)` is called
- **THEN** the system calls the gateway refund API and returns a `RefundResult` with `status`, `refund_id`, and `amount`

### Requirement: Orders persistence

The system SHALL persist every payment intent creation as an `orders` table row with: `id` (UUID), `member_id` (FK → members, CASCADE), `plan_id` (FK → subscription_plans, RESTRICT), `billing_cycle` (`monthly` | `yearly` | null), `gateway` (`stripe` | `paypal`), `gateway_order_id` (string, the gateway's intent/order id), `amount_cents` (integer), `currency` (string, default `usd`), `status` (`pending` | `paid` | `failed` | `refunded` | `cancelled`), `created_at`, `updated_at`.

#### Scenario: Order created on payment intent

- **WHEN** `PaymentService.create_payment_intent` is called
- **THEN** an `orders` row is inserted with `status="pending"` before the gateway redirect URL is returned

#### Scenario: Order status updated on payment success

- **WHEN** a webhook confirms a payment succeeded for an order
- **THEN** the order's `status` is updated to `paid` and `updated_at` is refreshed

#### Scenario: Order status updated on payment failure

- **WHEN** a webhook confirms a payment failed for an order
- **THEN** the order's `status` is updated to `failed`

### Requirement: Payments transaction persistence

The system SHALL persist every payment transaction attempt (including webhook events) as a `payments` table row with: `id` (UUID), `order_id` (FK → orders, CASCADE), `gateway` (`stripe` | `paypal`), `gateway_payment_id` (string, nullable until captured), `gateway_event_id` (string, unique — for idempotency), `event_type` (string, e.g. `payment_intent.succeeded`, `PAYMENT.CAPTURE.COMPLETED`), `status` (string, mirrors gateway status), `amount_cents` (integer), `fee_cents` (integer, nullable), `raw_payload` (JSONB — full webhook payload), `created_at`.

#### Scenario: Payment row created on webhook event

- **WHEN** a Stripe webhook `payment_intent.succeeded` event arrives
- **THEN** a `payments` row is inserted with `gateway_event_id` set to the Stripe event id (e.g. `evt_12345`), `event_type="payment_intent.succeeded"`, `status="succeeded"`, and `raw_payload` containing the full event JSON

#### Scenario: Idempotent webhook processing

- **WHEN** the same webhook event is received twice (Stripe retry)
- **THEN** the second delivery finds an existing `payments` row by `gateway_event_id` (unique constraint) and returns 200 without re-processing the business logic

### Requirement: Stripe webhook receiver

The system SHALL expose `POST /api/payments/webhooks/stripe` that: (1) reads the raw request body and `Stripe-Signature` header, (2) verifies the signature using `STRIPE_WEBHOOK_SECRET` via `stripe.Webhook.construct_event`, (3) returns HTTP 400 on verification failure, (4) on success persists a `payments` row and dispatches to a registered event handler, (5) returns HTTP 200.

#### Scenario: Valid Stripe webhook

- **WHEN** Stripe sends a signed webhook event to `POST /api/payments/webhooks/stripe`
- **THEN** the system verifies the signature, persists the event to `payments`, dispatches the handler, and returns HTTP 200

#### Scenario: Invalid Stripe signature

- **WHEN** a request with an invalid or missing `Stripe-Signature` header arrives
- **THEN** the system returns HTTP 400 without persisting any data

### Requirement: PayPal webhook receiver

The system SHALL expose `POST /api/payments/webhooks/paypal` that: (1) reads the webhook headers (`PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`) and body, (2) calls PayPal's `verify-webhook-signature` API using `PAYPAL_WEBHOOK_ID`, (3) returns HTTP 400 on verification failure, (4) on success persists a `payments` row and dispatches to a registered handler, (5) returns HTTP 200.

#### Scenario: Valid PayPal webhook

- **WHEN** PayPal sends a signed webhook event to `POST /api/payments/webhooks/paypal`
- **THEN** the system verifies the signature via PayPal API, persists the event to `payments`, dispatches the handler, and returns HTTP 200

#### Scenario: Invalid PayPal signature

- **WHEN** a request with an invalid PayPal webhook signature arrives
- **THEN** the system returns HTTP 400 without persisting any data

### Requirement: Payment configuration

The system SHALL read payment gateway credentials from environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYMENT_MODE` (`test` | `live`). The backend SHALL log the active `PAYMENT_MODE` at startup. In `test` mode, Stripe keys SHALL be `sk_test_*` and PayPal SHALL use sandbox endpoints.

#### Scenario: Test mode configuration

- **WHEN** `PAYMENT_MODE=test` is set
- **THEN** the system initializes Stripe with `sk_test_*` keys and PayPal with sandbox base URL, and logs `PAYMENT_MODE=test` at startup

#### Scenario: Missing required credentials

- **WHEN** `STRIPE_SECRET_KEY` is not set and a payment operation is attempted
- **THEN** the `PaymentService` raises a `PaymentConfigError` and the API returns HTTP 500 with a clear message

### Requirement: Payment RBAC module

The system SHALL register a `payment` RBAC module in `backend/app/core/modules.py` `ADMIN_MODULES` and the mirrored `frontend/lib/adminModules.ts` `ADMIN_MODULES`. This module gates admin-side order and payment management endpoints (used by change #4). No admin menu items are added in this change.

#### Scenario: Payment module registered

- **WHEN** the admin modules are enumerated
- **THEN** `payment` appears in both backend `ADMIN_MODULES` and frontend `ADMIN_MODULES` with `scopeAware=false`

#### Scenario: Payment module gates admin endpoints

- **WHEN** an admin endpoint under `/api/admin/payments/*` or `/api/admin/orders/*` is called without the `payment` module permission
- **THEN** the system returns HTTP 403

