## Why

UnoWire has a complete 3-tier membership plan system (Freemium / Personal / Enterprise) with subscription lifecycle, usage quotas, and a pricing page, but **zero payment integration**. Personal plan users can only start a 14-day free trial that auto-downgrades to Freemium on expiry — there is no way to actually pay. The archived membership-tiers design explicitly deferred payment integration to a subsequent change. This change introduces the foundational payment layer (Stripe + PayPal) that all subsequent paid-subscription features depend on.

## What Changes

- Add `stripe` and `paypal` Python SDK dependencies to backend `requirements.txt`
- Add payment configuration (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`) to backend settings and `.env.docker`
- Create `orders` table: records a payment intent/order created against a member + plan + billing cycle, with status (`pending` / `paid` / `failed` / `refunded` / `cancelled`), gateway, gateway_order_id, amount, currency
- Create `payments` table: records individual payment transactions (attempts) against an order, with gateway, gateway_payment_id, status, amount, fee, raw webhook payload
- Create `PaymentService` abstraction layer in `backend/app/services/payment.py` with a unified interface supporting both Stripe and PayPal (create_payment_intent, retrieve, confirm, refund)
- Create webhook receiver endpoints `POST /api/payments/webhooks/stripe` and `POST /api/payments/webhooks/paypal` that verify signatures, persist events to `payments` table, and route to a pluggable handler
- Add Alembic migration for `orders` and `payments` tables
- Add `payment` RBAC module to backend `ADMIN_MODULES` and frontend `adminModules.ts` for admin-side payment/order views
- Add pytest coverage for PaymentService, webhook signature verification, and order/payment persistence

## Capabilities

### New Capabilities

- `payment-gateway`: Stripe + PayPal payment processing abstraction — gateway SDK integration, PaymentService unified interface, orders/payments persistence, webhook signature verification and routing. Foundation layer; does not yet wire into subscription lifecycle.

### Modified Capabilities

_(none — this change adds infrastructure only; subscription checkout and plan modifications come in subsequent changes)_

## Impact

- **Backend**: new models (`order.py`, `payment.py`), schemas, service (`payment.py`), routes (`payments.py` webhooks), migration, settings, requirements.txt
- **Database**: two new tables (`orders`, `payments`) with foreign keys to `members` and `subscription_plans`
- **Dependencies**: adds `stripe` and `paypalrestsdk` (or `paypal-payouts-sdk`) Python packages
- **Config**: new env vars for gateway credentials and webhook secrets; `.env.docker` updated
- **RBAC**: new `payment` admin module registered in both backend `modules.py` and frontend `adminModules.ts`
- **No frontend changes in this change** — checkout UI, billing pages, and admin order views come in subsequent changes
