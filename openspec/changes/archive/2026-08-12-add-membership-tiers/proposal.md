## Why

UnoWire currently offers unrestricted access to all content for all members with no monetization mechanism. A three-tier membership system (Freemium / Personal / Enterprise) is needed to generate revenue through access-quantity-based tiering while preserving a free tier for user acquisition. Enterprise tier follows a sales-led flow; Personal tier supports self-service subscription with a free trial. This change establishes the membership tier model and quota enforcement first; payment integration (Stripe + PayPal) is deferred to a separate change.

## What Changes

- Add three-tier subscription plan model: Freemium (free/limited access), Personal (self-service/unlimited/trial), Enterprise (sales-led/custom contract)
- Add access-quantity metering system: daily search, daily detail view, and monthly download quota tracking
- Add plan-based access control middleware: API-layer quota checking and limit enforcement
- Add Enterprise inquiry flow: reuse existing inquiry system, members can initiate Enterprise subscription consultation
- Add Personal tier trial support: 7-14 day free trial with full Personal access during trial
- Add billing cycle model: monthly + yearly (annual discount), USD pricing
- Add public pricing page: display three-tier plan comparison and feature differences
- Add member portal view: current plan, usage statistics, upgrade options
- Modify Member model: associate with subscription and usage records

## Capabilities

### New Capabilities

- `membership-plans`: Subscription plan definitions and lifecycle management — three tiers (freemium/personal/enterprise) with quota configuration, member subscription state machine (active/trialing/expired/cancelled), billing cycles (monthly/yearly), trial management, Enterprise inquiry trigger
- `usage-quota`: Access-quantity metering and quota enforcement — search/detail-view/download usage tracking, daily/monthly quota checking, over-limit interception, quota reset cycles, usage query API

### Modified Capabilities

None. Existing `portal-claim` and inquiry systems do not require spec-level requirement changes; Enterprise inquiry reuses the existing inquiry data model.

## Impact

- **Backend models**: New `subscription_plans`, `member_subscriptions`, `usage_records` tables; modify `members` table to associate with subscriptions
- **Backend API**: New quota check middleware affects all metered API endpoints (search, detail view, download)
- **Backend services**: New subscription management, usage tracking, quota checking service modules
- **Frontend**: New `/pricing` page, member portal plan/usage display components
- **Dependencies**: No new external dependencies (payment integration in subsequent change)
- **Existing data**: Data migration needed to create default Freemium subscriptions for existing members
