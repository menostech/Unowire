## Why

The `/admin/subscriptions` page currently returns a 404 because `adminMenuRegistry.ts` maps the `subscriptions` page_id to the href `/admin/subscriptions`, but that page does not exist in the frontend. The DB seeds the menu item with href `/admin/members`, but the frontend registry overrides it at runtime, producing a dead link. Additionally, the member detail page (`/admin/members/[id]/page.tsx`) does not link to the subscription management sub-page — `/admin/members/[id]/subscription/page.tsx` exists but is orphaned with no navigation entry point. Finally, admins have no capability to issue refunds against paid orders: there is no refund API endpoint, no refund UI, and no path to mark an order as refunded.

These three gaps together block the entire admin-side subscription management workflow: admins cannot view subscriptions in a dedicated page, cannot navigate from a member to their subscription, and cannot refund a paid order.

## What Changes

- Create the `/admin/subscriptions` page (list view with filters by plan, status, and gateway; pagination; expandable inline detail showing subscription info + linked orders + payments).
- Fix `adminMenuRegistry.ts` so the `subscriptions` page_id resolves to `/admin/subscriptions` (the page we now create), rather than leaving the registry pointing at a non-existent page while the DB-seeded `/admin/members` href is overridden.
- Add a "Subscription" tab/section to the member detail page (`/admin/members/[id]/page.tsx`) linking to the existing orphaned `/admin/members/[id]/subscription` page.
- Create the refund API endpoint `POST /api/admin/orders/{id}/refund` (accepts an `amount` param for full or partial refunds), gated by the `payment` RBAC module (from change `add-payment-gateway-foundation`) and the existing `subscriptions` module.
- On successful refund: update `order.status = "refunded"`, create a new `payments` row with `type = "refund"` referencing the original payment, and return the updated order.
- Add a refund UI (modal) in the order detail view, plus a `refund` method in `adminApi.ts` that calls the new endpoint.

## Capabilities

### New Capabilities
- `admin-subscription-management`: Admin-side subscription and order management — dedicated subscriptions list page with filters and inline detail, member-detail-to-subscription navigation, and the refund flow (API + UI) that integrates with `PaymentService.refund_payment` from the payment gateway foundation.

### Modified Capabilities
- `membership-plans`: Admin subscription management is expanded — the previously orphaned member subscription page is now reachable from member detail, and a dedicated `/admin/subscriptions` list page replaces the broken/404 sidebar entry.

## Impact

- **Frontend — admin pages**: New `/admin/subscriptions` list page + inline subscription detail component; update to `/admin/members/[id]/page.tsx` (subscription tab/link); new refund modal component.
- **Frontend — menu registry**: Fix to `adminMenuRegistry.ts` (verify `subscriptions` page_id href resolves to `/admin/subscriptions`).
- **Frontend — API client**: New `refund` method in `adminApi.ts`.
- **Backend**: New `POST /api/admin/orders/{id}/refund` route with `payment` + `subscriptions` RBAC gating; handler calls `PaymentService.refund_payment`, updates `order.status`, and inserts a `payments` row with `type = "refund"`.
- **Dependencies**: Requires change `add-payment-gateway-foundation` for `PaymentService.refund_payment`, the `orders`/`payments` tables, and the `payment` RBAC module.
