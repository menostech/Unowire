# admin-subscription-management Specification

## Purpose
TBD - created by archiving change fix-admin-subscriptions-refunds. Update Purpose after archive.
## Requirements
### Requirement: Admin subscriptions list page

The system SHALL provide a `/admin/subscriptions` page in the frontend that renders a server-paginated table of all subscriptions. Each row SHALL display: member (name + email), plan (Freemium / Personal / Enterprise), status (`active` | `canceled` | `past_due` | `refunded`), gateway (`stripe` | `paypal` | `—`), amount, current period (start – end), and an actions column. The page SHALL NOT return a 404. This replaces the broken sidebar entry where `adminMenuRegistry.ts` mapped `subscriptions` to `/admin/subscriptions` while no such page existed.

#### Scenario: Page renders without 404

- **WHEN** an admin navigates to `/admin/subscriptions`
- **THEN** the page renders the subscriptions table with at least the columns: member, plan, status, gateway, amount, current period, actions

#### Scenario: Server-side pagination

- **WHEN** the admin opens `/admin/subscriptions?page=2&page_size=20`
- **THEN** the backend `GET /api/admin/subscriptions` returns the second page of up to 20 subscriptions, and the page renders pagination controls reflecting total count and current page

#### Scenario: Empty state

- **WHEN** no subscriptions match the current filters
- **THEN** the page renders an empty-state message ("No subscriptions found") instead of a broken table

### Requirement: Subscription list filtering

The system SHALL support filtering the `/admin/subscriptions` list by `plan` (Freemium / Personal / Enterprise), `status` (`active` / `canceled` / `past_due` / `refunded`), and `gateway` (`stripe` / `paypal`). Filters SHALL be propagated as query parameters on `GET /api/admin/subscriptions` and reflected in the URL so the view is shareable and refresh-safe.

#### Scenario: Filter by plan

- **WHEN** the admin selects `plan=Personal` in the filter UI
- **THEN** `GET /api/admin/subscriptions?plan=Personal` is called and only Personal-plan subscriptions are returned

#### Scenario: Filter by status

- **WHEN** the admin selects `status=past_due`
- **THEN** only subscriptions with `status=past_due` are returned

#### Scenario: Filter by gateway

- **WHEN** the admin selects `gateway=stripe`
- **THEN** only subscriptions whose latest paid order used `gateway=stripe` are returned

#### Scenario: Combined filters

- **WHEN** the admin applies `plan=Personal&status=active&gateway=stripe`
- **THEN** the list is narrowed to Personal, active, Stripe-paid subscriptions

### Requirement: Expandable inline subscription detail

Each subscription row SHALL be expandable to reveal an inline detail panel showing: subscription info (plan, status, current period, gateway customer id), linked orders (id, amount, currency, status, created_at), and linked payments (id, type, amount, gateway reference, created_at). The detail data SHALL be fetched lazily on first expand (not preloaded for all rows).

#### Scenario: Lazy detail fetch on expand

- **WHEN** the admin expands a subscription row
- **THEN** the system calls `GET /api/admin/subscriptions/{id}` (or equivalent detail endpoint) and renders the subscription detail + linked orders + linked payments

#### Scenario: Collapse preserves row state

- **WHEN** the admin collapses an expanded row and re-expands it
- **THEN** the previously fetched detail is shown without a duplicate API call (cached per row for the page session)

### Requirement: Member detail subscription navigation

The member detail page `/admin/members/[id]/page.tsx` SHALL include a "Subscription" tab or section that links to the existing `/admin/members/[id]/subscription` page. The previously orphaned `/admin/members/[id]/subscription/page.tsx` SHALL be reachable from member detail (no dead-end navigation).

#### Scenario: Subscription tab links to sub-page

- **WHEN** the admin views a member at `/admin/members/{id}`
- **THEN** a "Subscription" tab/section is visible and links to `/admin/members/{id}/subscription`

#### Scenario: Subscription sub-page renders

- **WHEN** the admin follows the Subscription tab
- **THEN** `/admin/members/{id}/subscription/page.tsx` renders without error and shows the member's subscription information

### Requirement: Refund API endpoint

The system SHALL expose `POST /api/admin/orders/{id}/refund` accepting a JSON body `{ "amount": <integer cents, optional> }`. If `amount` is omitted, the refund SHALL be for the full refundable remaining amount. The endpoint SHALL call `PaymentService.refund_payment` (from change `add-payment-gateway-foundation`) against the gateway that captured the original payment.

#### Scenario: Full refund (amount omitted)

- **WHEN** `POST /api/admin/orders/{id}/refund` is called with no `amount` body field
- **THEN** the backend refunds the full refundable remaining amount via `PaymentService.refund_payment`

#### Scenario: Partial refund

- **WHEN** `POST /api/admin/orders/{id}/refund` is called with `{ "amount": 500 }` on a $15.00 (1500 cents) order with no prior refunds
- **THEN** the backend issues a $5.00 partial refund via `PaymentService.refund_payment`

#### Scenario: Refund over refundable remaining is rejected

- **WHEN** the admin requests a refund amount such that `existing_refunded_total + requested_amount > original_amount`
- **THEN** the endpoint returns HTTP 422 with a clear error message and no gateway call is made

#### Scenario: Order not found

- **WHEN** `POST /api/admin/orders/{nonexistent_id}/refund` is called
- **THEN** the endpoint returns HTTP 404

### Requirement: Refund permission gating

The refund endpoint SHALL require the admin's role to have BOTH the `payment` RBAC module (from change `add-payment-gateway-foundation`) and the existing `subscriptions` admin module. If either is missing, the endpoint SHALL return HTTP 403.

#### Scenario: Admin with both modules can refund

- **WHEN** an admin whose role has `payment` and `subscriptions` modules calls `POST /api/admin/orders/{id}/refund`
- **THEN** the refund proceeds normally

#### Scenario: Admin without `payment` module gets 403

- **WHEN** an admin whose role lacks the `payment` module calls `POST /api/admin/orders/{id}/refund`
- **THEN** the endpoint returns HTTP 403 without invoking `PaymentService`

#### Scenario: Admin without `subscriptions` module gets 403

- **WHEN** an admin whose role lacks the `subscriptions` module calls `POST /api/admin/orders/{id}/refund`
- **THEN** the endpoint returns HTTP 403 without invoking `PaymentService`

### Requirement: Refund status + payments row update

On a successful refund, the backend SHALL update `order.status` to `"refunded"` (full) or `"partially_refunded"` (partial with remaining refundable), and SHALL insert a new `payments` row with `type = "refund"`, `amount` = refunded amount, `order_id` = original order, and `gateway_payment_id` / gateway reference returned by `PaymentService.refund_payment`. The endpoint SHALL return the updated order and the new refund payment row.

#### Scenario: Full refund updates order and inserts refund payment

- **WHEN** a full refund succeeds
- **THEN** `order.status` becomes `"refunded"`, `order.updated_at` is refreshed, and a `payments` row with `type="refund"` and `amount=original_amount` is inserted

#### Scenario: Partial refund sets partially_refunded status

- **WHEN** a partial refund leaves a remaining refundable amount
- **THEN** `order.status` becomes `"partially_refunded"` and the `payments` refund row amount equals the partial refund amount

#### Scenario: Partial refund that completes the refundable amount sets refunded

- **WHEN** the sum of prior refunds plus this refund equals the original amount
- **THEN** `order.status` becomes `"refunded"` (not `"partially_refunded"`)

### Requirement: Refund idempotency

Refunding an already-fully-refunded order SHALL be a no-op that does not create a duplicate refund `payments` row and does not call the gateway a second time.

#### Scenario: Refund on already-refunded order

- **WHEN** `POST /api/admin/orders/{id}/refund` is called on an order with `status="refunded"`
- **THEN** the endpoint returns the existing refund state without calling `PaymentService.refund_payment` and without inserting a new `payments` row

### Requirement: Refund UI modal

The order detail view (in the inline subscription detail) SHALL provide a "Refund" action that opens a modal. The modal SHALL: pre-fill the full refundable remaining amount (editable), show refunded-vs-refundable-remaining clearly, warn if the order is older than the gateway refund window (Stripe 90 days / PayPal 180 days), call `adminApi.refund(orderId, amount)` on submit, and refresh the view on success.

#### Scenario: Open refund modal pre-filled

- **WHEN** the admin clicks "Refund" on an order with a $15.00 original amount and no prior refunds
- **THEN** the modal opens with the amount field pre-filled to `1500` (cents) and displays "Refundable remaining: $15.00"

#### Scenario: Partial refund via modal

- **WHEN** the admin changes the amount to `500` and submits
- **THEN** `adminApi.refund(orderId, 500)` is called and on success the modal closes and the order detail refreshes to show `$5.00 refunded / $10.00 refundable remaining`

#### Scenario: Refund window warning

- **WHEN** the admin opens the refund modal on an order older than 90 days with gateway `stripe`
- **THEN** the modal displays a warning that the order may be outside the gateway's refund window

### Requirement: adminApi refund client method

The frontend `adminApi.ts` SHALL expose a `refund(orderId: string, amount?: number)` method that calls `POST /api/admin/orders/{orderId}/refund` with body `{ amount }` (omitting `amount` for full refund). The method SHALL return the updated order and the new refund payment row.

#### Scenario: refund method full call

- **WHEN** `adminApi.refund("order_123")` is called
- **THEN** a `POST /api/admin/orders/order_123/refund` request with no body is sent

#### Scenario: refund method partial call

- **WHEN** `adminApi.refund("order_123", 500)` is called
- **THEN** a `POST /api/admin/orders/order_123/refund` request with body `{ "amount": 500 }` is sent

### Requirement: Menu registry sidebar fix

`adminMenuRegistry.ts` SHALL map the `subscriptions` page_id to href `/admin/subscriptions` (the page created by this change). Once the page exists, the sidebar "Subscriptions" entry SHALL navigate to `/admin/subscriptions` and no longer 404.

#### Scenario: Sidebar subscriptions link works

- **WHEN** an admin clicks the "Subscriptions" sidebar item
- **THEN** the browser navigates to `/admin/subscriptions` and the page renders

