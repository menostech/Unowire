## 1. Menu registry fix

- [ ] 1.1 Verify `adminMenuRegistry.ts` maps the `subscriptions` page_id to href `/admin/subscriptions` (the page created in task group 2). If it points elsewhere, correct it to `/admin/subscriptions`.
- [ ] 1.2 Confirm the sidebar "Subscriptions" item resolves to `/admin/subscriptions` and no longer 404s once the page exists.

## 2. /admin/subscriptions list page

- [ ] 2.1 Create `/admin/subscriptions/page.tsx` (or equivalent route) rendering a table of subscriptions with columns: member, plan, status, gateway, amount, current period, actions.
- [ ] 2.2 Add filters: plan (Freemium/Personal/Enterprise), status (active/canceled/past_due/refunded), gateway (stripe/paypal/…) — backed by query params on `GET /api/admin/subscriptions`.
- [ ] 2.3 Add pagination (server-side) to the subscriptions list.
- [ ] 2.4 Add an expandable-row inline detail component showing the subscription record plus linked orders and payments (see task group 3).

## 3. Subscription detail component

- [ ] 3.1 Build the inline expandable detail component: subscription info (plan, status, current period, gateway customer id), linked orders (id, amount, status, created_at), and linked payments (id, type, amount, gateway reference, created_at).
- [ ] 3.2 Wire the expand/collapse toggle per row and ensure data is fetched on expand (lazy) to avoid loading everything upfront.

## 4. Member detail page — subscription link

- [ ] 4.1 In `/admin/members/[id]/page.tsx`, add a "Subscription" tab/section that links to `/admin/members/[id]/subscription` (existing page).
- [ ] 4.2 Verify the existing `/admin/members/[id]/subscription/page.tsx` renders and is now reachable from member detail.

## 5. Refund API — backend

- [ ] 5.1 Create `POST /api/admin/orders/{id}/refund` route accepting `{ amount }` (full or partial; defaults to full refund if omitted).
- [ ] 5.2 Gate the route with both the `payment` RBAC module (from `add-payment-gateway-foundation`) and the existing `subscriptions` module; reject with 403 if either is missing from the admin's role.
- [ ] 5.3 Validate `refunded_total + requested_amount <= original_amount`; reject with 422 otherwise.

## 6. Refund handler — status + payments row

- [ ] 6.1 On successful refund, call `PaymentService.refund_payment(order_id, amount)` (from change #1).
- [ ] 6.2 Update `order.status = "refunded"` (or `"partially_refunded"` if partial and `refunded_total < original_amount`).
- [ ] 6.3 Insert a new `payments` row with `type = "refund"`, `amount`, `order_id`, and gateway reference returned by `PaymentService.refund_payment`.
- [ ] 6.4 Return the updated order and the new refund payment row to the caller.

## 7. Refund UI + adminApi.ts

- [ ] 7.1 Add a `refund(orderId, amount)` method to `adminApi.ts` that calls `POST /api/admin/orders/{id}/refund`.
- [ ] 7.2 Build a refund modal in the order detail / inline subscription detail: pre-fills full refund amount (editable), shows refunded vs. refundable-remaining, warns if order is older than the gateway refund window, calls `adminApi.refund`, and refreshes the view on success.
- [ ] 7.3 Show refund status (refunded / partially_refunded) and refunded/remaining amounts in the order detail after a successful refund.

## 8. Tests

- [ ] 8.1 Backend: refund endpoint — full refund sets `order.status = "refunded"` and creates a `payments` row with `type = "refund"`.
- [ ] 8.2 Backend: partial refund sets `order.status = "partially_refunded"` when `refunded_total < original_amount`, and `"refunded"` when fully refunded.
- [ ] 8.3 Backend: refund over the original amount is rejected (422).
- [ ] 8.4 Backend: permission check — admin without `payment` or `subscriptions` module gets 403.
- [ ] 8.5 Backend: refund is idempotent — refunding an already-fully-refunded order does not create a duplicate refund payment.

## 9. End-to-end verification

- [ ] 9.1 `/admin/subscriptions` renders without a 404.
- [ ] 9.2 Filters (plan/status/gateway) narrow the list correctly.
- [ ] 9.3 Member detail page links to the subscription management sub-page.
- [ ] 9.4 Sidebar "Subscriptions" menu item navigates to `/admin/subscriptions`.
- [ ] 9.5 Admin can initiate a refund (full + partial) and the order/payment status updates accordingly.
