## 1. Fix checkout plan_id resolution

- [x] 1.1 In `frontend/app/member/checkout/page.tsx`, fetch `GET /api/plans` on mount and resolve the `plan_id` by matching `tier_level` against the `?plan=` query param (default `personal`). Store in state.
- [x] 1.2 Use the resolved `plan_id` in the checkout POST body instead of the hardcoded `2`. Disable pay buttons while loading and if no plan matches.
- [x] 1.3 Run `npx tsc --noEmit` in `frontend/` - 0 errors.
- [x] 1.4 Commit.

## 2. Regression verification

- [x] 2.1 Manually verify `GET /api/plans` returns the Personal plan with a valid `id`; confirm the checkout POST now sends that id (no more 404).
- [x] 2.2 Confirm the "Plan not found" error no longer appears for the default `?plan=personal` checkout flow.
