---
comet_change: add-membership-tiers
role: technical-design
canonical_spec: openspec
archived-with: 2026-08-12-add-membership-tiers
status: final
---

# Design Doc: Membership Tiers

## Overview

Three-tier membership system (Freemium / Personal / Enterprise) with access-quantity-based quota enforcement for the UnoWire platform. This design covers the data model, service layer, API integration, and frontend components. Payment integration (Stripe + PayPal) is explicitly deferred.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                               │
│  /pricing (public)  ·  Member Portal (usage/plan)  ·  Admin  │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
┌──────────────▼──────────────────▼──────────────────▼─────────┐
│                      FastAPI Layer                            │
│  GET /api/plans · GET /api/member/usage · POST /trial        │
│  POST /cancel · POST /inquiries/enterprise                   │
│  Admin: GET/POST/PUT/DELETE /api/admin/plans                 │
│  Admin: POST /api/admin/members/{id}/subscription            │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
     ┌─────────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
     │ require_quota   │ │ Subscription  │ │  Plan CRUD    │
     │ (dependency)    │ │ Service       │ │  Service      │
     │ auth→plan→check │ │ trial/cancel  │ │  admin mgmt   │
     └────────┬────────┘ └───────┬───────┘ └───────┬───────┘
              │                  │                  │
     ┌────────▼──────────────────▼──────────────────▼───────┐
     │                    Usage Service                      │
     │  atomic increment · monthly aggregation · quota check │
     └────────────────────────┬──────────────────────────────┘
                              │
     ┌────────────────────────▼──────────────────────────────┐
     │                   PostgreSQL                           │
     │  subscription_plans · member_subscriptions            │
     │  usage_records · members (modified)                   │
     └───────────────────────────────────────────────────────┘
```

## Data Model

### subscription_plans

Admin-configurable plan definitions. Seed data provides defaults; admins can edit via Settings UI.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInteger PK | Auto-increment |
| name | String(50) | Display name (e.g., "Freemium") |
| tier_level | String(20) | `freemium` / `personal` / `enterprise` |
| price_monthly | Numeric(10,2) | Monthly price USD (0 for freemium) |
| price_yearly | Numeric(10,2) | Yearly price USD (0 for freemium) |
| currency | String(3) | `USD` |
| search_limit_daily | Integer | Daily search limit (0 = unlimited) |
| detail_view_limit_daily | Integer | Daily detail view limit (0 = unlimited) |
| download_limit_monthly | Integer | Monthly download limit (0 = unlimited) |
| is_sales_led | Boolean | True for enterprise (no self-service) |
| is_active | Boolean | Soft delete / disable |
| features | JSONB | Feature list for pricing page display |
| sort_order | Integer | Display order |
| trial_days | Integer | Trial duration (14 for personal, 0 for others) |
| created_at | DateTime | |
| updated_at | DateTime | |

**Seed data:**

| tier_level | price_monthly | price_yearly | search | detail | download | sales_led | trial_days |
|------------|--------------|-------------|--------|--------|----------|-----------|------------|
| freemium | 0 | 0 | 10 | 20 | 0 | false | 0 |
| personal | 15.00 | 149.00 | 0 | 0 | 0 | false | 14 |
| enterprise | 0 | 0 | 0 | 0 | 0 | true | 0 |

### member_subscriptions

Subscription lifecycle with plan config snapshot.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInteger PK | |
| member_id | BigInteger FK → members | |
| plan_id | BigInteger FK → subscription_plans | |
| status | String(20) | `active` / `trialing` / `expired` / `cancelled` |
| billing_cycle | String(10) | `monthly` / `yearly` / null |
| trial_start | DateTime | |
| trial_end | DateTime | trial_start + trial_days |
| current_period_start | DateTime | |
| current_period_end | DateTime | period_start + 1 month/year |
| cancelled_at | DateTime | |
| snapshot_search_limit | Integer | Copied from plan at subscription time |
| snapshot_detail_limit | Integer | Copied from plan at subscription time |
| snapshot_download_limit | Integer | Copied from plan at subscription time |
| created_at | DateTime | |
| updated_at | DateTime | |

**Index**: `CREATE INDEX idx_member_subscriptions_member_id ON member_subscriptions(member_id) WHERE status IN ('active', 'trialing', 'cancelled')`

### usage_records

Daily aggregated usage per member.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInteger PK | |
| member_id | BigInteger FK → members | |
| record_date | Date | UTC date |
| search_count | Integer | Default 0 |
| detail_view_count | Integer | Default 0 |
| download_count | Integer | Default 0 |

**Constraint**: `UNIQUE (member_id, record_date)`

## Service Layer

### SubscriptionService

```python
class SubscriptionService:
    async def get_active_subscription(member_id) -> MemberSubscription | None
        # Returns the member's active/trialing/cancelled subscription
        # If none, member is on default freemium (no subscription record)
    
    async def resolve_effective_plan(member_id) -> tuple[str, dict]
        # Returns (tier_level, quota_limits)
        # Handles: trialing → check trial_end → downgrade if expired
        # Handles: cancelled → check current_period_end → downgrade if passed
        # Returns snapshot limits from subscription, or freemium plan limits
    
    async def start_trial(member_id, plan_id) -> MemberSubscription
        # Creates trialing subscription with trial_end = now + trial_days
        # Copies plan limits as snapshot
        # Raises if member already has active/trialing subscription
    
    async def cancel_subscription(member_id) -> MemberSubscription
        # Sets status = cancelled, cancelled_at = now
        # Subscription remains active until current_period_end
    
    async def create_enterprise_subscription(member_id, period_end) -> MemberSubscription
        # Admin-only: creates active enterprise subscription
        # Sets current_period_end to negotiated date
    
    async def check_and_expire_trial(subscription) -> MemberSubscription
        # Lazy check: if status=trialing and trial_end < now → downgrade to freemium
        # If status=cancelled and current_period_end < now → downgrade to freemium
        # "Downgrade" = create new freemium active subscription, mark old as expired
```

### UsageService

```python
class UsageService:
    async def increment_and_check(member_id, action: str, limit: int) -> bool
        # Atomic conditional increment using ON CONFLICT DO UPDATE ... WHERE
        # Returns True if within limit (incremented), False if exceeded
        # For monthly downloads: checks SUM(download_count) for current month first
    
    async def get_today_usage(member_id) -> UsageRecord
        # Returns today's usage record (or zeros if none exists)
    
    async def get_monthly_download_count(member_id) -> int
        # SUM(download_count) WHERE record_date >= first day of current UTC month
    
    async def get_usage_summary(member_id) -> dict
        # Returns {today: {search: {used, limit}, detail_view: {used, limit}},
        #          this_month: {download: {used, limit}}, plan: "tier_name"}
```

### require_quota Dependency

```python
def require_quota(action: str):
    async def checker(
        member: Member = Depends(get_current_member),
        db: AsyncSession = Depends(get_db),
    ) -> Member:
        # 1. Load subscription + resolve effective plan (lazy trial expiry check)
        tier, limits = await SubscriptionService(db).resolve_effective_plan(member.id)
        
        # 2. Get limit for this action
        limit_map = {
            "search": limits["search_limit_daily"],
            "detail_view": limits["detail_view_limit_daily"],
            "download": limits["download_limit_monthly"],
        }
        limit = limit_map[action]
        
        # 3. If unlimited (0), still record usage but don't block
        if limit == 0:
            await UsageService(db).increment_usage(member.id, action)
            return member
        
        # 4. Atomic conditional increment
        allowed = await UsageService(db).increment_and_check(member.id, action, limit)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={"code": 429, "message": f"{'Daily' if action != 'download' else 'Monthly'} {action} limit exceeded"}
            )
        
        # 5. Set rate limit headers via context
        return member
    
    return checker
```

**Atomic increment SQL (for daily actions):**

```sql
INSERT INTO usage_records (member_id, record_date, {action}_count)
VALUES (:member_id, :today, 1)
ON CONFLICT (member_id, record_date)
DO UPDATE SET {action}_count = usage_records.{action}_count + 1
WHERE usage_records.{action}_count < :limit
RETURNING {action}_count;
-- No row returned = limit exceeded
```

**Monthly download check:** First query `SUM(download_count) WHERE member_id = :id AND record_date >= :month_start`, then check against limit before incrementing.

## Admin Plan Management

Plans are configurable via admin Settings UI, not hardcoded:

- **GET /api/admin/plans** — list all plans (including inactive)
- **POST /api/admin/plans** — create new plan
- **PUT /api/admin/plans/{id}** — update plan config (quota, pricing, features)
- **DELETE /api/admin/plans/{id}** — soft delete (set is_active=false)
- Admin UI page under Settings → Plans with edit forms for each plan

Changing plan config does NOT affect existing subscriptions (snapshot mechanism).

## Frontend

### Pricing Page (`/pricing`)

- Server component fetching `GET /api/plans` (public, no auth)
- Three `PricingCard` components with plan comparison
- CTA buttons: "Sign Up" (freemium), "Start Free Trial" (personal), "Contact Sales" (enterprise)
- Enterprise "Contact Sales" opens modal form → `POST /api/inquiries/enterprise`

### Member Portal

- Usage summary card: progress bars for daily search/detail, monthly download
- Subscription status panel: current plan, trial end date, cancel button
- "Start Free Trial" and "Cancel Subscription" flows with confirmation modals

### Admin

- Plans management page under Settings
- Enterprise subscription management (create/renew/cancel)
- Extended inquiry management with Enterprise sales filter

## Edge Cases

1. **Concurrent quota requests**: Atomic conditional increment prevents over-limit; if two requests arrive simultaneously, only one succeeds when at limit-1
2. **Trial expiry mid-session**: Lazy check on next API call downgrades immediately; frontend should refetch subscription status
3. **Cancelled subscription still active**: `cancelled` status with `current_period_end > now` retains original plan limits
4. **No subscription record**: Member with no subscription record is treated as freemium (default plan)
5. **Admin changes plan limits**: Existing subscriptions use snapshot; new subscriptions use updated values
6. **Monthly download boundary**: Download count sums all records in current UTC month; resets implicitly on the 1st

## Migration Plan

1. Create three new tables with Alembic migration
2. Seed three default plans
3. Data migration: for each existing member, create a freemium subscription record
4. Deploy quota middleware in log-only mode (record usage, don't block) for observation
5. Enable quota enforcement after 1 week of observation
6. Launch pricing page and member portal

**Rollback**: Remove `require_quota` dependencies from routes; tables can remain without impact.

## Test Strategy

- **Unit**: SubscriptionService state transitions, UsageService atomic increment, plan resolution with various statuses
- **Integration**: `require_quota` dependency — allowed, blocked, unlimited, edge cases (trial expiry, cancelled-active)
- **API**: All new endpoints + admin Plans CRUD + enterprise inquiry creation
- **Migration**: Verify existing members receive freemium subscription
- **Frontend**: Pricing page renders for anonymous/authenticated/current-plan users
