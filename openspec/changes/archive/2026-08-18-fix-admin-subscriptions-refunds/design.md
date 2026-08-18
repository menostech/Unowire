## Context

UnoWire has a 3-tier membership plan system (Freemium, Personal, Enterprise) with existing admin endpoints for plans (`GET/POST/PUT/DELETE /api/admin/plans`) and a subscriptions list endpoint (`GET /api/admin/subscriptions`). However, the admin UI is broken in three ways:

1. The `/admin/subscriptions` sidebar entry 404s — `adminMenuRegistry.ts` maps the `subscriptions` page_id to href `/admin/subscriptions`, but no such page exists. The DB seeds the menu item with href `/admin/members`, but the frontend registry overrides it at runtime, producing a dead link.
2. The member detail page (`/admin/members/[id]/page.tsx`) does not link to the existing subscription management sub-page (`/admin/members/[id]/subscription/page.tsx`), leaving it orphaned.
3. There is no admin refund capability — no endpoint, no UI, and no order-status transition to "refunded".

Change `add-payment-gateway-foundation` (change #1 in this batch) introduces `PaymentService` (with a `refund_payment` method), the `orders` and `payments` tables, and a `payment` RBAC module. This change (#4) depends on that foundation to deliver the refund flow.

## Goals / Non-Goals

**Goals:**
- `/admin/subscriptions` renders without a 404 and provides a filterable list of subscriptions.
- Admins can filter subscriptions by plan and status (and gateway).
- Member detail page links to the existing subscription management sub-page.
- Admins can initiate a refund (full or partial) on an order, which calls `PaymentService.refund_payment`.
- On refund success, `order.status` becomes "refunded" and a `payments` row with `type = "refund"` is created.
- The sidebar "Subscriptions" menu item works correctly.

**Non-Goals:**
- Checkout flow (handled elsewhere).
- Invoice generation / PDF invoices.
- Recurring billing engine changes.
- Refund of refunds (no chained refunds).
- Payment gateway integration itself (provided by `add-payment-gateway-foundation`).

## Decisions

- **D1: `/admin/subscriptions` as a standalone list page (not a redirect to `/admin/members`).** A dedicated subscription management view with filters by plan/status/gateway, pagination, and links to member detail gives admins a focused surface. Redirecting to `/admin/members` would conflate member management with subscription management and lose the filter/expand-detail UX.

- **D2: Subscription detail shown inline (expandable row) rather than a separate page.** Expanding a row reveals the subscription record plus its linked orders and payments in a single view, reducing navigation round-trips. A separate detail page would force a back-and-forth for every inspection.

- **D3: Refund flow = modal → API → PaymentService → status update.** Admin clicks "Refund" on an order → modal confirms amount (default full, editable to partial) → `POST /api/admin/orders/{id}/refund` → backend calls `PaymentService.refund_payment` → on success, update `order.status = "refunded"` and insert a `payments` row with `type = "refund"` → UI refreshes to show refund status and refunded/remaining amounts.

- **D4: Create the page to match the registry (not change the registry to match the DB seed).** The frontend `adminMenuRegistry.ts` already maps `subscriptions` to `/admin/subscriptions`. We create that page rather than rewiring the registry to `/admin/members`, because the dedicated page is the desired end state (see D1). We only verify the registry href is correct.

- **D5: Member detail page — add a "Subscription" tab/section.** The page `/admin/members/[id]/subscription/page.tsx` already exists but is orphaned. We add a link/tab in `/admin/members/[id]/page.tsx` that navigates to it — no new sub-page needed.

- **D6: Refund permission gated by `payment` RBAC module + existing `subscriptions` module.** Refunds are a payment operation, so the `payment` module (from change #1) is required, in addition to the existing `subscriptions` admin module. Both must be present on the admin's role.

## Risks / Trade-offs

- **Partial refunds — display clarity.** The gateway supports partial refunds, but the UI must clearly distinguish refunded amount vs. remaining amount. Mitigation: order detail shows both `refunded` and `refundable_remaining` fields, derived from existing payments of `type = "refund"`.

- **Refund window varies by gateway.** Stripe allows refunds up to 90 days; PayPal up to 180 days. Mitigation: add a client-side warning in the refund modal if the order is older than the gateway's refund window, and let the backend return a clear error from `PaymentService.refund_payment` when the gateway rejects the refund.

- **Race condition: admin refunds while a webhook arrives.** A payment webhook could arrive for an order an admin is concurrently refunding. Mitigation: the webhook handler must check whether the order is already `refunded` before processing; `PaymentService.refund_payment` and the webhook handler should be idempotent on order id + payment intent.

- **Inline detail vs. deep-linking.** Expandable rows are convenient but harder to deep-link to. Trade-off accepted: the primary workflow is list-filter-inspect, not sharing deep links.

## Migration Plan

- **No DB schema changes.** Uses existing subscription tables plus change #1's `orders` and `payments` tables.
- **No data backfill.** Existing subscriptions/orders are unchanged.
- **Frontend-only page creation + registry verification + member detail update.** No destructive migrations.
- **Rollback:** Delete the new `/admin/subscriptions` page, revert the member detail page link addition, and remove the refund route + `adminApi.ts` method. The registry fix is a no-op revert (page stops existing). No data to roll back.

## Open Questions

- Should partial refunds be allowed to exceed the original payment amount (e.g., to refund fees)? Assumed no — backend validates `refunded_total + requested_amount <= original_amount`.
- Should the refund modal show the gateway's specific refund window, or a generic warning? Assumed generic warning with the order's age; gateway-specific copy can come later.
- Should refunds require a second admin's approval (two-person rule)? Assumed no for v1 — single admin with `payment` + `subscriptions` permission suffices.
