# Design: fix-checkout-plan-not-found

## Fix Solution

Modify `frontend/app/member/checkout/page.tsx` to resolve the `plan_id` dynamically instead of hardcoding `2`.

### Approach

1. On mount, fetch `GET /api/plans` (public, no auth) to get the list of active plans.
2. Match the plan by `tier_level` against the `?plan=` query param (default `personal`).
3. Store the resolved `plan_id` in state; use it in the checkout POST body.
4. Handle the not-found/empty case: if no plan matches the requested tier, show a clear error ("Plan unavailable") and disable the pay buttons.
5. While plans are loading, disable the pay buttons (show "Loading…").

### Why this approach

- `GET /api/plans` is an existing public endpoint returning `SubscriptionPlanRead` (with `id`, `tier_level`, `is_active`, etc.). No new backend route needed.
- Resolving by `tier_level` (not by a hardcoded ID) is robust to DB re-seeding / ID shifts — the root cause.
- Minimal surface: only one frontend file changes. No backend, schema, API, or cross-module changes.

### Out of scope

- The checkout page currently only supports the Personal tier UI (hardcoded `$15/month` / `$149/year` labels). Generalizing to other paid tiers is a separate enhancement, not part of this hotfix.
