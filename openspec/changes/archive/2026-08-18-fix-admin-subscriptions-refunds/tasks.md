## 1. Menu registry fix

- [x] 1.1 Verify `adminMenuRegistry.ts` maps the `subscriptions` page_id to href `/admin/subscriptions` (the page created in task group 2). If it points elsewhere, correct it to `/admin/subscriptions`.
- [x] 1.2 Confirm the sidebar "Subscriptions" item resolves to `/admin/subscriptions` and no longer 404s once the page exists.

## 2. /admin/subscriptions list page

- [x] 2.1 Create `/admin/subscriptions/page.tsx` (or equivalent route) rendering a table of subscriptions with columns: member, plan, status, gateway, amount, current period, actions.
- [x] 2.2 Add filters: plan (Freemium/Personal/Enterprise), status (active/canceled/past_due/refunded), gateway (stripe/paypal/…) — backed by query params on `GET /api/admin/subscriptions`.
- [x] 2.3 Add pagination (server-side) to the subscriptions list.
- [x] 2.4 Add an expandable-row inline detail component showing the subscription record plus linked orders and payments (see task group 3).

## 3. Subscription detail component

- [x] 3.1 Build the inline expandable detail component: subscription info (plan, status, current period, gateway customer id), linked orders (id, amount, status, created_at), and linked payments (id, type, amount, gateway reference, created_at).
- [x] 3.2 Wire the expand/collapse toggle per row and ensure data is fetched on expand (lazy) to avoid loading everything upfront.

## 4. Member detail page — subscription link

- [x] 4.1 In `/admin/members/[id]/page.tsx`, add a "Subscription" tab/section that links to `/admin/members/[id]/subscription` (existing page).
- [x] 4.2 Verify the existing `/admin/members/[id]/subscription/page.tsx` renders and is now reachable from member detail.

## 5. Refund API — backend

- [x] 5.1 Create `POST /api/admin/orders/{id}/refund` route accepting `{ amount }` (full or partial; defaults to full refund if omitted).
- [x] 5.2 Gate the route with both the `payment` RBAC module (from `add-payment-gateway-foundation`) and the existing `subscriptions` module; reject with 403 if either is missing from the admin's role.
- [x] 5.3 Validate `refunded_total + requested_amount <= original_amount`; reject with 422 otherwise.

## 6. Refund handler — status + payments row

- [x] 6.1 On successful refund, call `PaymentService.refund_payment(order_id, amount)` (from change #1).
- [x] 6.2 Update `order.status = "refunded"` (or `"partially_refunded"` if partial and `refunded_total < original_amount`).
- [x] 6.3 Insert a new `payments` row with `type = "refund"`, `amount`, `order_id`, and gateway reference returned by `PaymentService.refund_payment`.
- [x] 6.4 Return the updated order and the new refund payment row to the caller.

## 7. Refund UI + adminApi.ts

- [x] 7.1 Add a `refund(orderId, amount)` method to `adminApi.ts` that calls `POST /api/admin/orders/{id}/refund`.
- [x] 7.2 Build a refund modal in the order detail / inline subscription detail: pre-fills full refund amount (editable), shows refunded vs. refundable-remaining, warns if order is older than the gateway refund window, calls `adminApi.refund`, and refreshes the view on success.
- [x] 7.3 Show refund status (refunded / partially_refunded) and refunded/remaining amounts in the order detail after a successful refund.

## 8. Tests

- [x] 8.1 Backend: refund endpoint — full refund sets `order.status = "refunded"` and creates a `payments` row with `type = "refund"`.
- [x] 8.2 Backend: partial refund sets `order.status = "partially_refunded"` when `refunded_total < original_amount`, and `"refunded"` when fully refunded.
- [x] 8.3 Backend: refund over the original amount is rejected (422).
- [x] 8.4 Backend: permission check — admin without `payment` or `subscriptions` module gets 403.
- [x] 8.5 Backend: refund is idempotent — refunding an already-fully-refunded order does not create a duplicate refund payment.

## 9. End-to-end verification

- [x] 9.1 `/admin/subscriptions` renders without a 404.
- [x] 9.2 Filters (plan/status/gateway) narrow the list correctly.
- [x] 9.3 Member detail page links to the subscription management sub-page.
- [x] 9.4 Sidebar "Subscriptions" menu item navigates to `/admin/subscriptions`.
- [x] 9.5 Admin can initiate a refund (full + partial) and the order/payment status updates accordingly.
