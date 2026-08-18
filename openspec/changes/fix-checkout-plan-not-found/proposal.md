# Proposal: fix-checkout-plan-not-found

## Problem

When a member attempts to pay for a subscription via the checkout page (`/member/checkout`), the backend returns `404 Plan not found` and the checkout fails before redirecting to the payment gateway.

## Root Cause

`frontend/app/member/checkout/page.tsx` line 23 hardcodes the request body as:

```js
body: JSON.stringify({ gateway, plan_id: 2, billing_cycle: cycle }),  // plan_id 2 = Personal
```

The `plan_id` is assumed to be `2` for the Personal tier, but actual plan primary-key IDs are NOT stable integers seeded as 1/2/3. The current seeded IDs (verified via `GET /api/plans`) are:

- Freemium: id=743
- Personal: id=744
- Enterprise: id=745

So `plan_id: 2` resolves to a non-existent `SubscriptionPlan` row. In `SubscriptionService.create_checkout_session` (`backend/app/services/subscription.py:141-143`):

```python
plan = await self.db.get(SubscriptionPlan, plan_id)
if plan is None or not plan.is_active:
    raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
```

`db.get(SubscriptionPlan, 2)` returns `None` -> 404 "Plan not found".

The page already reads the intended tier from the URL query param (`params.get('plan') || 'personal'`) but then ignores it and sends the hardcoded `2`.

## Fix Goal

Resolve the `plan_id` dynamically from the `?plan=<tier_level>` query param by fetching `GET /api/plans` (public endpoint returning active plans with `id` + `tier_level`) and matching the tier. Remove the hardcoded `plan_id: 2`.

## Reproduction Evidence

- `GET /api/plans` returns `Personal` with `id=744` (not 2); no plan with `id=2` exists.
- The checkout page sends `plan_id: 2` for all checkouts -> backend 404 "Plan not found".
