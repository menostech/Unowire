## Context

UnoWire is a global-facing engineering reference platform for cables, equipment, and terminals. The `members` table stores front-end member information (email/password/name/company), and all members currently have unlimited access to all content. The platform needs a three-tier membership system to enable monetization.

Existing auth dependency chain: `get_current_member` (deps.py) → decode member token → return Member object. Quota checking will be integrated as an extension layer on this dependency. The existing `inquiries` table already supports member-initiated inquiries (sender_id → members.id), which the Enterprise tier can reuse.

Tech stack: FastAPI + SQLAlchemy (async) + PostgreSQL + Next.js App Router.

## Goals / Non-Goals

**Goals:**
- Establish three-tier subscription plan data model (Freemium / Personal / Enterprise)
- Implement access-quantity-based quota system (search/detail-view/download)
- Automatically enforce quota checks at the API layer, returning HTTP 429 when exceeded
- Support Personal tier trial period (7-14 days)
- Support monthly/yearly billing cycle model (USD)
- Enable Enterprise tier sales-led flow via the inquiry system
- Provide frontend pricing page and member portal usage display

**Non-Goals:**
- Stripe / PayPal payment gateway integration (subsequent change)
- Actual payment processing and automatic subscription renewal logic
- Enterprise contract/quote management system
- Team/sub-account management (Enterprise future expansion)
- API access tokens (Enterprise API access future expansion)

## Decisions

### 1. Data Model: Three-Table Separation (plans / subscriptions / usage_records)

**Choice**: Create three new tables instead of adding fields to the members table.

**Rationale**:
- `subscription_plans`: Plan configuration stored independently, allowing admins to adjust quotas without affecting existing subscriptions
- `member_subscriptions`: Subscription lifecycle (state machine) independent from the member itself, supporting historical records
- `usage_records`: Daily aggregated usage, avoiding full log scans on every request

**Alternative**: Add `plan_tier` and `quota_used` fields to members table — rejected, because subscription history and usage detail cannot be recorded.

### 2. Quota Checking: FastAPI Dependency Factory Pattern

**Choice**: Create a `require_quota(action)` dependency factory, similar to the existing `require_module(module)` pattern.

**Rationale**: Consistent with existing code style; declarative usage keeps route handlers clean; composable (authenticate first, then check quota).

**Implementation**:
```
get_current_member → load member + active subscription → check today's usage → if not exceeded, increment and allow
```

**Alternative**: Global middleware interception — rejected, because different endpoints have different metering actions (search/detail/download), which middleware cannot precisely match.

### 3. Usage Records: Daily Aggregation with Atomic Increment

**Choice**: `usage_records` table aggregates by (member_id, record_date), each row storing daily counts for three action types.

**Rationale**: High query efficiency (single-row read for daily usage); writes use `INSERT ... ON CONFLICT DO UPDATE` for atomic increment.

**Alternative**: One log row per request — rejected, due to high data volume and aggregation overhead for quota queries.

### 4. Subscription State Machine

**Choice**: Status enum `active | trialing | expired | cancelled`.

**State transitions**:
- New registration → `freemium` plan, no subscription record (default plan)
- Personal subscription → `trialing` → (trial ends) → `active` or `expired`
- Cancellation → `cancelled` (remains active until period_end, then downgrades to freemium)
- Enterprise → admin manually creates `active` subscription

### 5. Enterprise Inquiry: Reuse Existing Inquiry System

**Choice**: Enterprise tier does not offer self-service subscription; members click "Contact Sales" to create an inquiry record.

**Rationale**: The existing inquiry system already has a complete initiate-reply-read workflow; no need to build a new contract/quote system.

**Implementation**: Inquiry `recipient_type` set to `"enterprise_sales"`; admins handle it through the existing inquiry management interface.

### 6. Quota Reset: Natural Day/Month (UTC)

**Choice**: Daily quotas reset at UTC 00:00; download quotas reset on the first day of each UTC month.

**Rationale**: Simple and unambiguous; consistent with server-side UTC time.

## Risks / Trade-offs

- **[Quota check performance overhead]** Each metered API request adds one DB read+write → use `ON CONFLICT DO UPDATE` for atomic single-roundtrip; Redis cache layer can be added later
- **[Freemium user migration]** Existing members need migration to Freemium → migration script creates freemium subscription for all members without one
- **[Trial expiry without payment]** Trial ends but no payment integration → trial auto-downgrades to freemium via scheduled task
- **[Enterprise manual management]** Admins must manually create/renew Enterprise subscriptions → acceptable for MVP, admin automation can be added later
- **[Quota precision]** Daily aggregation cannot prevent burst requests within a short window → no rate limiting in MVP, can add rate limiter later

## Migration Plan

1. Create three new tables (subscription_plans, member_subscriptions, usage_records)
2. Insert three default plan records (freemium/personal/enterprise configurations)
3. Create freemium subscription records for all existing members
4. Deploy quota check middleware (initially log-only without enforcement — observe for one week before enabling)
5. Launch pricing page and member portal usage display
6. Rollback strategy: remove quota check dependency to restore unlimited access; data tables remain without impact

## Open Questions

- Personal tier specific pricing? (awaiting user confirmation on price points)
- Freemium tier specific quota values? (e.g., 10 daily searches?)
- Trial duration? (7 days or 14 days?)
- Annual discount percentage? (e.g., 20% off?)
