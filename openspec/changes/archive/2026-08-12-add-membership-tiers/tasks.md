## 1. Database Models & Migration

- [x] 1.1 Create `subscription_plans` model (id, name, tier_level, price_monthly, price_yearly, currency, search_limit_daily, detail_view_limit_daily, download_limit_monthly, is_sales_led, is_active, features JSONB, sort_order)
- [x] 1.2 Create `member_subscriptions` model (id, member_id FK, plan_id FK, status enum, billing_cycle, trial_start, trial_end, current_period_start, current_period_end, cancelled_at, created_at, updated_at)
- [x] 1.3 Create `usage_records` model (id, member_id FK, record_date date, search_count, detail_view_count, download_count, unique constraint on member_id+record_date)
- [x] 1.4 Generate Alembic migration for the three new tables
- [x] 1.5 Create seed data migration inserting three default plans (freemium/personal/enterprise) with quota configurations
- [x] 1.6 Create data migration assigning freemium subscription to all existing members

## 2. Backend Services

- [x] 2.1 Create `SubscriptionService` — load member's active subscription + plan, resolve effective plan (handle trialing/cancelled/expired states)
- [x] 2.2 Create `UsageService` — get_or_create_today_record, increment_counter (atomic ON CONFLICT DO UPDATE), get_monthly_download_count, check_quota(action)
- [x] 2.3 Create `require_quota(action)` FastAPI dependency factory in deps.py — authenticates member, loads plan, checks quota, increments usage, returns 429 on exceeded
- [x] 2.4 Create subscription management service — start_trial(member_id, plan_id), cancel_subscription(member_id), create_enterprise_subscription(member_id, period_end) for admin
- [x] 2.5 Create scheduled task / cron job to expire trialing subscriptions past trial_end and downgrade to freemium

## 3. Backend API Endpoints

- [x] 3.1 `GET /api/plans` — public endpoint returning all active plans with quota limits and pricing (no auth required)
- [x] 3.2 `GET /api/member/subscription` — return current member's subscription status, plan details, trial info
- [x] 3.3 `GET /api/member/usage` — return today's usage counts + monthly downloads + plan limits
- [x] 3.4 `POST /api/member/subscription/trial` — start Personal tier trial (requires member auth, no active paid subscription)
- [x] 3.5 `POST /api/member/subscription/cancel` — cancel current Personal subscription (remains active until period_end)
- [x] 3.6 `POST /api/inquiries/enterprise` — create Enterprise sales inquiry (recipient_type="enterprise_sales")
- [x] 3.7 `POST /api/admin/members/{id}/subscription` — admin endpoint to create Enterprise subscription for a member
- [x] 3.8 Apply `require_quota("search")` to cable/equipment/terminal search API endpoints
- [x] 3.9 Apply `require_quota("detail_view")` to cable/equipment/terminal detail API endpoints
- [x] 3.10 Apply `require_quota("download")` to PDF/resource download API endpoints

## 4. Frontend — Pricing Page

- [x] 4.1 Create `/pricing` page at `app/(site)/pricing/page.tsx` — fetch plans from `/api/plans`, render three plan cards
- [x] 4.2 Create `PricingCard` component — plan name, price, features list, quota limits, CTA button (Sign Up / Start Trial / Contact Sales)
- [x] 4.3 Add "Pricing" link to top navigation bar
- [x] 4.4 Highlight current plan when authenticated member visits pricing page
- [x] 4.5 Create Enterprise "Contact Sales" modal form (company name, use case) that posts to `/api/inquiries/enterprise`

## 5. Frontend — Member Portal

- [x] 5.1 Create usage summary card component in member portal dashboard — remaining searches/detail_views/downloads with progress bars
- [x] 5.2 Create subscription status panel — current plan, billing cycle, trial end date, next renewal date, cancel button
- [x] 5.3 Create "Start Free Trial" flow — confirm modal → POST trial endpoint → refresh subscription status
- [x] 5.4 Create "Cancel Subscription" flow — confirm modal with downgrade warning → POST cancel endpoint → refresh status
- [x] 5.5 Add quota limit banner/indicator in search results when approaching daily limit

## 6. Admin Backend

- [x] 6.1 Admin CRUD API for subscription plans: `GET/POST /api/admin/plans`, `PUT/DELETE /api/admin/plans/{id}` (soft delete via is_active)
- [x] 6.2 Admin Settings → Plans management UI page with edit forms for quota limits, pricing, features, trial duration
- [x] 6.3 Admin endpoint to view all subscriptions with filtering by plan/status
- [x] 6.4 Admin endpoint to view member usage analytics (aggregate usage per plan tier)
- [x] 6.5 Admin page for managing Enterprise subscriptions (create/renew/cancel)
- [x] 6.6 Extend existing inquiry management to filter and label Enterprise sales inquiries

## 7. Testing & Validation

- [x] 7.1 Unit tests for SubscriptionService — plan resolution, state transitions, trial expiry
- [x] 7.2 Unit tests for UsageService — atomic increment, quota checking, monthly aggregation
- [x] 7.3 Integration tests for `require_quota` dependency — allowed/blocked/edge cases
- [x] 7.4 API tests for all new endpoints (plans, subscription, usage, trial, cancel, enterprise inquiry)
- [x] 7.5 Migration test — verify existing members get freemium subscription correctly
- [x] 7.6 Frontend test — pricing page renders correctly for anonymous/authenticated/current-plan users
