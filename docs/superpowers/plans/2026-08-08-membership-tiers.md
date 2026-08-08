---
change: add-membership-tiers
design-doc: docs/superpowers/specs/2026-08-08-membership-tiers-design.md
base-ref: c5e1931d33a842d85112ac4924c75b2971ee08db
---

# Membership Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-tier membership system (Freemium / Personal / Enterprise) with daily/monthly usage-quota enforcement, a subscription lifecycle (trial/cancel/expire), admin-configurable plans, a public pricing page, a member portal usage/subscription view, and admin plan/subscription management — without payment integration.

**Architecture:** Three new PostgreSQL tables (`subscription_plans`, `member_subscriptions`, `usage_records`) hold plan config, per-member subscription snapshots, and daily aggregated usage. A `SubscriptionService` resolves a member's effective plan (with lazy trial/cancel expiry), a `UsageService` performs atomic `INSERT ... ON CONFLICT DO UPDATE` increments, and a `require_quota(action)` FastAPI dependency factory meters `search`/`detail_view`/`download` actions. The frontend adds `/pricing`, member-portal usage/subscription panels, and an admin Plans page. Payment (Stripe/PayPal) is explicitly out of scope.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async, `Mapped`/`mapped_column`) + Alembic + PostgreSQL (backend, in `backend/`); Next.js 15 + TypeScript (frontend, in `frontend/`). Tests use `pytest` + `fastapi.testclient.TestClient`.

**Design Doc:** `docs/superpowers/specs/2026-08-08-membership-tiers-design.md`

## Global Constraints

- Plan tiers are exactly three: `freemium`, `personal`, `enterprise`. Seed values: freemium `10` daily search / `20` daily detail / `0` (unlimited) monthly download / `$0` / trial `0`; personal `$15` monthly / `$149` yearly / `0` (unlimited) all / trial `14` days; enterprise sales-led / `0` all / trial `0`.
- A limit value of `0` means unlimited (record usage but never block).
- Quota check is a FastAPI dependency `require_quota(action)` where `action` is `search`, `detail_view`, or `download`.
- Daily quotas reset implicitly at UTC 00:00 (new `usage_records` row per date); monthly download quota sums all records in the current UTC month and resets on the 1st.
- Existing subscriptions retain original limits via snapshot columns (`snapshot_search_limit`, `snapshot_detail_limit`, `snapshot_download_limit`); admin plan edits never mutate existing snapshots.
- A member with no subscription record is treated as freemium (default plan).
- The `enterprise` plan is `is_sales_led` and not self-service: its pricing-card CTA is "Contact Sales" which creates an inquiry with `recipient_type = "enterprise_sales"`.
- On 429 responses, include header `X-RateLimit-Remaining: 0` and body `{"code": 429, "message": "<Daily|Monthly> <action> limit exceeded"}`.
- Error responses follow the project's existing shape: `{"code": <int>, "message": <str>}` (see `backend/app/main.py` exception handlers).
- The project's configured language is `en`; all UI copy and commit messages are in English.
- **Public-site preservation:** the existing public search/detail/download endpoints are currently anonymous. `require_quota` uses OPTIONAL member auth — an anonymous request passes through unmetered; only authenticated members are metered/enforced. This avoids breaking the public site while still gating logged-in members to their tier limits.
- Migrations target the current Alembic head. Before writing a migration, run `cd backend && alembic heads` and use the printed revision as `down_revision`. (At plan-authoring time the head is `f2a3b4c5d6e7`; verify before executing.)

---

## File Structure

### Backend files to CREATE

- `backend/app/models/subscription_plan.py` — `SubscriptionPlan` model
- `backend/app/models/member_subscription.py` — `MemberSubscription` model
- `backend/app/models/usage_record.py` — `UsageRecord` model
- `backend/app/schemas/subscription_plan.py` — plan read/create/update schemas
- `backend/app/schemas/member_subscription.py` — subscription read + trial/cancel/enterprise-admin schemas
- `backend/app/schemas/usage.py` — usage summary schema
- `backend/app/services/subscription.py` — `SubscriptionService` (plan resolution, lifecycle, lazy expiry)
- `backend/app/services/usage.py` — `UsageService` (atomic increment, quota check, summaries)
- `backend/app/api/routes/plans.py` — public `GET /api/plans` + admin plan CRUD + admin subscription/usage endpoints
- `backend/app/api/routes/member_subscription.py` — member `GET /api/member/subscription`, `GET /api/member/usage`, `POST .../trial`, `POST .../cancel`, `POST /api/inquiries/enterprise`
- `backend/alembic/versions/<new>_add_membership_tiers.py` — tables + seed + member backfill + admin menu/permission seed
- `backend/tests/api/test_plans_public.py` — public plans + member subscription/usage/trial/cancel/inquiry tests
- `backend/tests/api/test_admin_plans.py` — admin plan CRUD + subscription + analytics tests
- `backend/tests/services/test_subscription_service.py` — SubscriptionService unit tests
- `backend/tests/services/test_usage_service.py` — UsageService unit tests
- `backend/tests/api/test_require_quota.py` — require_quota integration tests

### Backend files to MODIFY

- `backend/app/models/__init__.py` — import + export the three new models
- `backend/app/api/deps.py` — add `get_optional_current_member` + `require_quota(action)` factory
- `backend/app/api/routes/cables.py` — add `require_quota("search")` to `list_cables`; `require_quota("detail_view")` to `get_cable`/`get_cable_by_url`
- `backend/app/api/routes/equipment.py` — add `require_quota("search")` to list; `require_quota("detail_view")` to detail
- `backend/app/api/routes/terminals.py` — add `require_quota("search")` to `list_terminals`; `require_quota("detail_view")` to `get_terminal`
- `backend/app/api/routes/resource.py` — add `require_quota("download")` to `download_resource`
- `backend/app/core/modules.py` — add `plans` + `subscriptions` admin modules
- `backend/app/main.py` — register `plans.router` + `member_subscription.router`; add lifespan trial-expiry background task
- `backend/app/crud/member.py` — `crud_member.create` also creates a freemium active subscription (so new registrations get freemium)
- `backend/tests/conftest.py` — add cleanup for new tables; ensure a freemium plan exists for member fixtures

### Frontend files to CREATE

- `frontend/app/(site)/pricing/page.tsx` — public pricing page (server component)
- `frontend/components/pricing/PricingCard.tsx` — plan card
- `frontend/components/pricing/EnterpriseContactModal.tsx` — "Contact Sales" modal
- `frontend/components/member/UsageSummaryCard.tsx` — usage progress bars
- `frontend/components/member/SubscriptionPanel.tsx` — plan status + trial/cancel flows
- `frontend/app/(site)/member/subscription/page.tsx` — member subscription/usage page
- `frontend/app/api/member/subscription/route.ts` — proxy `GET /api/member/subscription`
- `frontend/app/api/member/usage/route.ts` — proxy `GET /api/member/usage`
- `frontend/app/api/member/subscription/trial/route.ts` — proxy `POST .../trial`
- `frontend/app/api/member/subscription/cancel/route.ts` — proxy `POST .../cancel`
- `frontend/app/api/inquiries/enterprise/route.ts` — proxy enterprise inquiry
- `frontend/app/api/plans/route.ts` — proxy public `GET /api/plans`
- `frontend/app/admin/(dashboard)/settings/plans/page.tsx` — admin Plans management page
- `frontend/app/admin/(dashboard)/members/[id]/subscription/page.tsx` — admin enterprise subscription management
- `frontend/components/admin/form/PlanForm.tsx` — plan edit form
- `frontend/components/admin/form/EnterpriseSubscriptionForm.tsx` — admin create-enterprise-subscription form

### Frontend files to MODIFY

- `frontend/components/layout/Nav.tsx` — add "Pricing" link
- `frontend/lib/api.ts` — add `api.plans` + member subscription/usage client helpers + `BackendPlan`/`BackendUsageSummary` types
- `frontend/lib/types.ts` — add `Plan`, `SubscriptionStatus`, `UsageSummary` interfaces
- `frontend/lib/adminApi.ts` — add `adminApi.plans` CRUD + `adminApi.subscriptions` + `adminApi.enterpriseSubscription`
- `frontend/lib/adminModules.ts` — mirror `plans` + `subscriptions` modules
- `frontend/lib/adminMenuRegistry.ts` — add `plans` + `subscriptions` page entries
- `frontend/components/admin/layout/AdminSidebar.tsx` — map new page IDs to module IDs
- `frontend/app/admin/(dashboard)/settings/page.tsx` (or settings index) — link to Plans sub-page
- `frontend/app/admin/(dashboard)/inquiries/page.tsx` — add Enterprise sales filter/label

---

## Task 1: Database Models

**Files:**
- Create: `backend/app/models/subscription_plan.py`
- Create: `backend/app/models/member_subscription.py`
- Create: `backend/app/models/usage_record.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/services/test_models_smoke.py`

**Interfaces:**
- Produces: `SubscriptionPlan` (columns per design doc), `MemberSubscription` (snapshot columns), `UsageRecord` (`UNIQUE(member_id, record_date)`). Later tasks import these from `app.models`.

- [ ] **Step 1: Write a smoke test that imports the models**

Create `backend/tests/services/test_models_smoke.py`:

```python
from app.models.subscription_plan import SubscriptionPlan
from app.models.member_subscription import MemberSubscription
from app.models.usage_record import UsageRecord


def test_models_importable_and_tablenames():
    assert SubscriptionPlan.__tablename__ == "subscription_plans"
    assert MemberSubscription.__tablename__ == "member_subscriptions"
    assert UsageRecord.__tablename__ == "usage_records"


def test_subscription_plan_columns():
    cols = {c.name for c in SubscriptionPlan.__table__.columns}
    assert {
        "id", "name", "tier_level", "price_monthly", "price_yearly", "currency",
        "search_limit_daily", "detail_view_limit_daily", "download_limit_monthly",
        "is_sales_led", "is_active", "features", "sort_order", "trial_days",
        "created_at", "updated_at",
    } <= cols


def test_member_subscription_snapshot_columns():
    cols = {c.name for c in MemberSubscription.__table__.columns}
    assert {
        "snapshot_search_limit", "snapshot_detail_limit", "snapshot_download_limit",
        "trial_start", "trial_end", "current_period_start", "current_period_end",
        "cancelled_at", "billing_cycle", "status",
    } <= cols


def test_usage_record_unique_constraint():
    constraints = {c.name for c in UsageRecord.__table__.constraints if hasattr(c, "name") and c.name}
    assert any("usage_member_date" in (c.name or "") for c in UsageRecord.__table__.constraints)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/services/test_models_smoke.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.subscription_plan'`

- [ ] **Step 3: Create the SubscriptionPlan model**

Create `backend/app/models/subscription_plan.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    tier_level: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    price_monthly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    price_yearly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    search_limit_daily: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detail_view_limit_daily: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    download_limit_monthly: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_sales_led: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    features: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Create the MemberSubscription model**

Create `backend/app/models/member_subscription.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MemberSubscription(Base):
    __tablename__ = "member_subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_cycle: Mapped[str | None] = mapped_column(String(10), nullable=True)
    trial_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trial_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    snapshot_search_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    snapshot_detail_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    snapshot_download_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 5: Create the UsageRecord model**

Create `backend/app/models/usage_record.py`:

```python
from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UsageRecord(Base):
    __tablename__ = "usage_records"
    __table_args__ = (
        UniqueConstraint("member_id", "record_date", name="uq_usage_member_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detail_view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

- [ ] **Step 6: Register models in `__init__.py`**

In `backend/app/models/__init__.py`, add imports after the existing ones and extend `__all__`:

```python
from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_record import UsageRecord
```

Add `"MemberSubscription"`, `"SubscriptionPlan"`, `"UsageRecord"` to the `__all__` list (keep alphabetical order with the existing entries).

- [ ] **Step 7: Run the smoke test to verify it passes**

Run: `cd backend && python -m pytest tests/services/test_models_smoke.py -v`
Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/subscription_plan.py backend/app/models/member_subscription.py backend/app/models/usage_record.py backend/app/models/__init__.py backend/tests/services/test_models_smoke.py
git commit -m "feat(membership): add subscription_plans, member_subscriptions, usage_records models"
```

---

## Task 2: Alembic Migration (Tables + Seed + Member Backfill + Admin Menu)

**Files:**
- Create: `backend/alembic/versions/<new>_add_membership_tiers.py`

**Interfaces:**
- Produces: the three tables on disk, three seeded plans (`freemium`/`personal`/`enterprise`), one freemium `active` `member_subscriptions` row per existing member, and admin menu + `plans`/`subscriptions` role permissions for the `admin` role.

- [ ] **Step 1: Determine the current Alembic head**

Run: `cd backend && alembic heads`
Note the printed revision ID — use it as `down_revision` below. (Expected: `f2a3b4c5d6e7`.)

- [ ] **Step 2: Create the migration file**

Create `backend/alembic/versions/m1n2o3p4q5r6_add_membership_tiers.py` (replace the `down_revision` value with the head from Step 1):

```python
"""add membership tiers

Revision ID: m1n2o3p4q5r6
Revises: f2a3b4c5d6e7
Create Date: 2026-08-08 00:00:00.000000

Creates subscription_plans, member_subscriptions, usage_records tables;
seeds the three default plans; backfills every existing member with an
active freemium subscription; seeds the admin menu items + role permissions
for the new 'plans' and 'subscriptions' modules.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'm1n2o3p4q5r6'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('tier_level', sa.String(length=20), nullable=False),
        sa.Column('price_monthly', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('price_yearly', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('search_limit_daily', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('detail_view_limit_daily', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_limit_monthly', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_sales_led', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('features', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('trial_days', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tier_level', name='uq_subscription_plans_tier_level'),
    )

    op.create_table(
        'member_subscriptions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('plan_id', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('billing_cycle', sa.String(length=10), nullable=True),
        sa.Column('trial_start', sa.DateTime(), nullable=True),
        sa.Column('trial_end', sa.DateTime(), nullable=True),
        sa.Column('current_period_start', sa.DateTime(), nullable=True),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
        sa.Column('snapshot_search_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('snapshot_detail_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('snapshot_download_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_member_subscriptions_member_id',
        'member_subscriptions',
        ['member_id'],
        postgresql_where=sa.text("status IN ('active', 'trialing', 'cancelled')"),
    )

    op.create_table(
        'usage_records',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('record_date', sa.Date(), nullable=False),
        sa.Column('search_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('detail_view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('member_id', 'record_date', name='uq_usage_member_date'),
    )

    # Seed the three default plans (idempotent by tier_level unique constraint).
    op.execute("""
        INSERT INTO subscription_plans
            (name, tier_level, price_monthly, price_yearly, currency,
             search_limit_daily, detail_view_limit_daily, download_limit_monthly,
             is_sales_led, is_active, features, sort_order, trial_days, created_at, updated_at)
        VALUES
            ('Freemium',  'freemium',   0,      0,      'USD', 10, 20, 0, false, true,
             '["10 daily searches","20 daily detail views","Community access"]'::jsonb, 0, 0, NOW(), NOW()),
            ('Personal',  'personal',   15.00,  149.00, 'USD', 0,  0,  0, false, true,
             '["Unlimited searches","Unlimited detail views","PDF downloads","Email support"]'::jsonb, 1, 14, NOW(), NOW()),
            ('Enterprise','enterprise', 0,      0,      'USD', 0,  0,  0, true,  true,
             '["Unlimited everything","Dedicated support","Custom integrations","Team accounts"]'::jsonb, 2, 0, NOW(), NOW())
        ON CONFLICT (tier_level) DO NOTHING
    """)

    # Backfill: give every existing member an active freemium subscription.
    op.execute("""
        INSERT INTO member_subscriptions
            (member_id, plan_id, status, billing_cycle, trial_start, trial_end,
             current_period_start, current_period_end, cancelled_at,
             snapshot_search_limit, snapshot_detail_limit, snapshot_download_limit,
             created_at, updated_at)
        SELECT
            m.id,
            (SELECT id FROM subscription_plans WHERE tier_level = 'freemium'),
            'active', NULL, NULL, NULL, NULL, NULL, NULL,
            10, 20, 0,
            NOW(), NOW()
        FROM members m
        WHERE NOT EXISTS (
            SELECT 1 FROM member_subscriptions ms
            WHERE ms.member_id = m.id AND ms.status IN ('active', 'trialing')
        )
    """)

    # Admin menu + permissions for plans/subscriptions management.
    op.execute("""
        INSERT INTO admin_menu_items
            (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES
            ('plans',          NULL,    'page', 'plans',          '/admin/settings/plans', 'Plans',          'CreditCard', 9,  true, NOW(), NOW()),
            ('subscriptions',  NULL,    'page', 'subscriptions',  '/admin/members',        'Subscriptions',  'Repeat',     10, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'plans'), ('admin', 'subscriptions')
        ON CONFLICT (role_id, module) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE role_id='admin' AND module IN ('plans','subscriptions')")
    op.execute("DELETE FROM admin_menu_items WHERE id IN ('plans','subscriptions')")
    op.drop_table('usage_records')
    op.drop_index('idx_member_subscriptions_member_id', table_name='member_subscriptions')
    op.drop_table('member_subscriptions')
    op.drop_table('subscription_plans')
```

> Note: The `subscriptions` admin menu item is a secondary entry pointing at the members area; the primary Plans management lives at `/admin/settings/plans`. Adjust the `url` if the project's menu model treats `url` as optional (it is — `page_id` drives routing).

- [ ] **Step 3: Apply the migration**

Run: `cd backend && alembic upgrade head`
Expected: no errors; the three tables exist and `SELECT tier_level FROM subscription_plans` returns three rows.

- [ ] **Step 4: Verify seed + backfill**

Run (substitute your psql connection as needed):

```bash
cd backend && python -c "import asyncio; from sqlalchemy import text; from app.core.database import async_session; \
async def c(): \
    async with async_session() as s: \
        print('plans', (await s.execute(text('SELECT tier_level, price_monthly, trial_days FROM subscription_plans ORDER BY sort_order'))).all()); \
        print('backfilled', (await s.execute(text('SELECT count(*) FROM member_subscriptions WHERE status=\\'active\\''))).scalar()); \
asyncio.run(c())"
```

Expected: three plans printed; backfill count equals the number of members.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/m1n2o3p4q5r6_add_membership_tiers.py
git commit -m "feat(membership): migration for tiers, seed plans, backfill members, admin menu"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/subscription_plan.py`
- Create: `backend/app/schemas/member_subscription.py`
- Create: `backend/app/schemas/usage.py`
- Test: `backend/tests/schemas/test_membership_schemas.py`

**Interfaces:**
- Produces: `SubscriptionPlanRead`, `SubscriptionPlanCreate`, `SubscriptionPlanUpdate`, `SubscriptionRead`, `TrialRequest`, `CancelResponse`, `EnterpriseInquiryCreate`, `EnterpriseSubscriptionCreate`, `UsageSummaryResponse`. Later API tasks return/accept these.

- [ ] **Step 1: Write schema validation tests**

Create `backend/tests/schemas/test_membership_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas.subscription_plan import SubscriptionPlanCreate, SubscriptionPlanUpdate
from app.schemas.member_subscription import (
    EnterpriseInquiryCreate,
    EnterpriseSubscriptionCreate,
    TrialRequest,
)
from app.schemas.usage import UsageSummaryResponse


def test_plan_create_defaults():
    p = SubscriptionPlanCreate(name="X", tier_level="freemium")
    assert p.currency == "USD"
    assert p.is_active is True
    assert p.search_limit_daily == 0


def test_plan_update_partial():
    u = SubscriptionPlanUpdate(search_limit_daily=20)
    assert u.model_dump(exclude_unset=True) == {"search_limit_daily": 20}


def test_trial_request_validates_billing_cycle():
    t = TrialRequest(billing_cycle="yearly")
    assert t.billing_cycle == "yearly"
    with pytest.raises(ValidationError):
        TrialRequest(billing_cycle="weekly")


def test_enterprise_inquiry_requires_company():
    e = EnterpriseInquiryCreate(company_name="Acme", use_case="bulk specs")
    assert e.company_name == "Acme"
    with pytest.raises(ValidationError):
        EnterpriseInquiryCreate(company_name="", use_case="x")


def test_enterprise_subscription_create_requires_period_end():
    from datetime import datetime
    e = EnterpriseSubscriptionCreate(period_end=datetime(2027, 1, 1))
    assert e.period_end.year == 2027


def test_usage_summary_response_shape():
    u = UsageSummaryResponse(
        plan="freemium",
        today={"search": {"used": 5, "limit": 10}, "detail_view": {"used": 3, "limit": 20}},
        this_month={"download": {"used": 0, "limit": 0}},
    )
    assert u.plan == "freemium"
    assert u.today["search"]["limit"] == 10
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/schemas/test_membership_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Create plan schemas**

Create `backend/app/schemas/subscription_plan.py`:

```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SubscriptionPlanBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    tier_level: str = Field(min_length=1, max_length=20)
    price_monthly: float = Field(ge=0, default=0)
    price_yearly: float = Field(ge=0, default=0)
    currency: str = Field(min_length=3, max_length=3, default="USD")
    search_limit_daily: int = Field(ge=0, default=0)
    detail_view_limit_daily: int = Field(ge=0, default=0)
    download_limit_monthly: int = Field(ge=0, default=0)
    is_sales_led: bool = False
    is_active: bool = True
    features: list[Any] = Field(default_factory=list)
    sort_order: int = 0
    trial_days: int = Field(ge=0, default=0)


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    price_monthly: float | None = Field(default=None, ge=0)
    price_yearly: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    search_limit_daily: int | None = Field(default=None, ge=0)
    detail_view_limit_daily: int | None = Field(default=None, ge=0)
    download_limit_monthly: int | None = Field(default=None, ge=0)
    is_sales_led: bool | None = None
    is_active: bool | None = None
    features: list[Any] | None = None
    sort_order: int | None = None
    trial_days: int | None = Field(default=None, ge=0)


class SubscriptionPlanRead(SubscriptionPlanBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create subscription schemas**

Create `backend/app/schemas/member_subscription.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class SubscriptionRead(BaseModel):
    id: int
    plan_id: int
    plan_name: str
    tier_level: str
    status: str
    billing_cycle: str | None = None
    trial_start: datetime | None = None
    trial_end: datetime | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancelled_at: datetime | None = None
    search_limit_daily: int
    detail_view_limit_daily: int
    download_limit_monthly: int

    model_config = {"from_attributes": True}


class TrialRequest(BaseModel):
    billing_cycle: str | None = Field(default=None, pattern="^(monthly|yearly)$")


class CancelResponse(BaseModel):
    status: str
    current_period_end: datetime | None = None
    message: str


class EnterpriseInquiryCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    use_case: str = Field(min_length=1, max_length=2000)


class EnterpriseSubscriptionCreate(BaseModel):
    period_end: datetime
```

- [ ] **Step 5: Create usage schema**

Create `backend/app/schemas/usage.py`:

```python
from pydantic import BaseModel


class UsageBucket(BaseModel):
    used: int
    limit: int


class UsageSummaryResponse(BaseModel):
    plan: str
    today: dict[str, UsageBucket]
    this_month: dict[str, UsageBucket]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/schemas/test_membership_schemas.py -v`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/subscription_plan.py backend/app/schemas/member_subscription.py backend/app/schemas/usage.py backend/tests/schemas/test_membership_schemas.py
git commit -m "feat(membership): add plan, subscription, and usage Pydantic schemas"
```

---

## Task 4: SubscriptionService (Plan Resolution + Lazy Expiry)

**Files:**
- Create: `backend/app/services/subscription.py`
- Test: `backend/tests/services/test_subscription_service.py`

**Interfaces:**
- Consumes: `SubscriptionPlan`, `MemberSubscription` models (Task 1).
- Produces: `SubscriptionService(db)` with `get_active_subscription(member_id) -> MemberSubscription | None`, `resolve_effective_plan(member_id) -> tuple[str, dict]` (returns `(tier_level, {"search_limit_daily":int, "detail_view_limit_daily":int, "download_limit_monthly":int})`), `check_and_expire_trial(subscription) -> MemberSubscription`. Tasks 5, 6, 7, 8, 9 consume these.

- [ ] **Step 1: Write failing unit tests**

Create `backend/tests/services/__init__.py` (empty) if it does not exist. Then create `backend/tests/services/test_subscription_service.py`:

```python
from datetime import datetime, timedelta

import pytest

from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.services.subscription import SubscriptionService


@pytest.fixture
async def plans(db_session):
    f = SubscriptionPlan(
        name="Freemium", tier_level="freemium", price_monthly=0, price_yearly=0,
        search_limit_daily=10, detail_view_limit_daily=20, download_limit_monthly=0,
        is_sales_led=False, is_active=True, features=[], sort_order=0, trial_days=0,
    )
    p = SubscriptionPlan(
        name="Personal", tier_level="personal", price_monthly=15, price_yearly=149,
        search_limit_daily=0, detail_view_limit_daily=0, download_limit_monthly=0,
        is_sales_led=False, is_active=True, features=[], sort_order=1, trial_days=14,
    )
    db_session.add_all([f, p])
    await db_session.commit()
    await db_session.refresh(f)
    await db_session.refresh(p)
    return {"freemium": f, "personal": p}


async def _make_member(db_session, email="subsvc@test-member.com"):
    from app.models.member import Member
    from app.core.security import hash_password
    m = Member(email=email, password_hash=hash_password("test123456"), name="Sub Svc")
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.mark.asyncio
async def test_resolve_effective_plan_no_subscription_returns_freemium(db_session, plans):
    m = await _make_member(db_session, "nofreemium@test-member.com")
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "freemium"
    assert limits["search_limit_daily"] == 10
    assert limits["detail_view_limit_daily"] == 20


@pytest.mark.asyncio
async def test_resolve_effective_plan_trialing_uses_snapshot(db_session, plans):
    m = await _make_member(db_session, "trialing@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="trialing",
        trial_start=datetime.utcnow(), trial_end=datetime.utcnow() + timedelta(days=14),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "personal"
    assert limits["search_limit_daily"] == 0  # unlimited snapshot


@pytest.mark.asyncio
async def test_resolve_effective_plan_expired_trial_downgrades(db_session, plans):
    m = await _make_member(db_session, "expiredtrial@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="trialing",
        trial_start=datetime.utcnow() - timedelta(days=20),
        trial_end=datetime.utcnow() - timedelta(days=6),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "freemium"
    assert limits["search_limit_daily"] == 10
    await db_session.refresh(sub)
    assert sub.status == "expired"


@pytest.mark.asyncio
async def test_resolve_effective_plan_cancelled_before_period_end_keeps_limits(db_session, plans):
    m = await _make_member(db_session, "cancelledactive@test-member.com")
    sub = MemberSubscription(
        member_id=m.id, plan_id=plans["personal"].id, status="cancelled",
        current_period_start=datetime.utcnow() - timedelta(days=10),
        current_period_end=datetime.utcnow() + timedelta(days=20),
        cancelled_at=datetime.utcnow(),
        snapshot_search_limit=0, snapshot_detail_limit=0, snapshot_download_limit=0,
    )
    db_session.add(sub)
    await db_session.commit()
    tier, limits = await SubscriptionService(db_session).resolve_effective_plan(m.id)
    assert tier == "personal"
    assert limits["search_limit_daily"] == 0
```

> Note: `db_session` is the existing conftest fixture (an `AsyncSession`). Tests use `@pytest.mark.asyncio`; ensure `pytest-asyncio` is installed (it is already used across the suite via the `TestClient`-based tests; if a config mode is required, follow the repo's existing asyncio mode).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_subscription_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.subscription'`.

- [ ] **Step 3: Implement SubscriptionService**

Create `backend/app/services/subscription.py`:

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_subscription(self, member_id: int) -> MemberSubscription | None:
        """Return the member's most recent non-expired subscription, or None.
        A member with no row is implicitly freemium."""
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.member_id == member_id)
            .where(MemberSubscription.status.in_(("active", "trialing", "cancelled")))
            .order_by(MemberSubscription.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def resolve_effective_plan(self, member_id: int) -> tuple[str, dict]:
        """Resolve the effective tier + quota limits, applying lazy expiry.

        Returns (tier_level, {"search_limit_daily", "detail_view_limit_daily",
        "download_limit_monthly"}).
        """
        sub = await self.get_active_subscription(member_id)
        if sub is not None:
            sub = await self.check_and_expire_trial(sub)
            # After expiry check, if still active/trialing/cancelled-within-period,
            # use snapshot limits from the subscription.
            if sub.status in ("active", "trialing"):
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "cancelled" and sub.current_period_end and sub.current_period_end > datetime.utcnow():
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
        # Default to freemium plan limits.
        return await self._freemium_limits()

    async def check_and_expire_trial(self, subscription: MemberSubscription) -> MemberSubscription:
        """Lazy expiry: trialing past trial_end, or cancelled past current_period_end,
        downgrades to freemium. 'Downgrade' = mark old subscription expired and create
        a new active freemium subscription."""
        now = datetime.utcnow()
        expired = False
        if subscription.status == "trialing" and subscription.trial_end and subscription.trial_end < now:
            expired = True
        if subscription.status == "cancelled" and subscription.current_period_end and subscription.current_period_end < now:
            expired = True
        if not expired:
            return subscription

        subscription.status = "expired"
        self.db.add(subscription)
        await self.db.flush()

        freemium = await self._get_plan_by_tier("freemium")
        new_sub = MemberSubscription(
            member_id=subscription.member_id,
            plan_id=freemium.id,
            status="active",
            snapshot_search_limit=freemium.search_limit_daily,
            snapshot_detail_limit=freemium.detail_view_limit_daily,
            snapshot_download_limit=freemium.download_limit_monthly,
        )
        self.db.add(new_sub)
        await self.db.commit()
        await self.db.refresh(new_sub)
        return new_sub

    async def start_trial(self, member_id: int, plan_id: int, trial_days: int, billing_cycle: str | None) -> MemberSubscription:
        existing = await self.get_active_subscription(member_id)
        if existing is not None and existing.status in ("active", "trialing"):
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail={"code": 409, "message": "Active subscription already exists"})
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None or not plan.is_active:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        if plan.is_sales_led:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "Plan is sales-led; contact sales"})
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan_id,
            status="trialing",
            billing_cycle=billing_cycle,
            trial_start=now,
            trial_end=now + timedelta(days=trial_days) if trial_days > 0 else None,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def cancel_subscription(self, member_id: int) -> MemberSubscription:
        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("active", "trialing"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No active subscription to cancel"})
        sub.status = "cancelled"
        sub.cancelled_at = datetime.utcnow()
        if sub.trialing_has_no_period():  # placeholder guard replaced below
            pass
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def create_enterprise_subscription(self, member_id: int, plan_id: int, period_end: datetime) -> MemberSubscription:
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan_id,
            status="active",
            billing_cycle=None,
            current_period_start=now,
            current_period_end=period_end,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def expire_trials_batch(self) -> int:
        """Bulk-expire trialing subscriptions past trial_end and cancelled past period_end.
        Used by the scheduled background task. Returns number downgraded."""
        now = datetime.utcnow()
        stmt = (
            select(MemberSubscription)
            .where(
                ((MemberSubscription.status == "trialing") & (MemberSubscription.trial_end < now))
                | ((MemberSubscription.status == "cancelled") & (MemberSubscription.current_period_end < now))
            )
        )
        result = await self.db.execute(stmt)
        count = 0
        for sub in result.scalars().all():
            await self.check_and_expire_trial(sub)
            count += 1
        return count

    def _snapshot_limits(self, sub: MemberSubscription) -> dict:
        return {
            "search_limit_daily": sub.snapshot_search_limit,
            "detail_view_limit_daily": sub.snapshot_detail_limit,
            "download_limit_monthly": sub.snapshot_download_limit,
        }

    async def _tier_for_plan(self, plan_id: int) -> str:
        plan = await self.db.get(SubscriptionPlan, plan_id)
        return plan.tier_level if plan else "freemium"

    async def _get_plan_by_tier(self, tier_level: str) -> SubscriptionPlan:
        result = await self.db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.tier_level == tier_level)
        )
        return result.scalar_one()

    async def _freemium_limits(self) -> tuple[str, dict]:
        plan = await self._get_plan_by_tier("freemium")
        return (
            plan.tier_level,
            {
                "search_limit_daily": plan.search_limit_daily,
                "detail_view_limit_daily": plan.detail_view_limit_daily,
                "download_limit_monthly": plan.download_limit_monthly,
            },
        )
```

Replace the `cancel_subscription` body's placeholder guard — the `if sub.trialing_has_no_period():` line is invalid. Replace the whole method body with this corrected version (no placeholder):

```python
    async def cancel_subscription(self, member_id: int) -> MemberSubscription:
        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("active", "trialing"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No active subscription to cancel"})
        now = datetime.utcnow()
        sub.status = "cancelled"
        sub.cancelled_at = now
        # A trialing subscription with no current_period_end should still grant
        # access until trial_end; ensure current_period_end is set so the
        # cancelled-still-active rule in resolve_effective_plan works.
        if sub.current_period_end is None:
            sub.current_period_end = sub.trial_end if sub.trial_end else now
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
```

Add the missing import at the top of the file (the `start_trial`/`create_enterprise_subscription` use `timedelta`):

```python
from datetime import datetime, timedelta
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_subscription_service.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/subscription.py backend/tests/services/__init__.py backend/tests/services/test_subscription_service.py
git commit -m "feat(membership): SubscriptionService with plan resolution and lazy expiry"
```

---

## Task 5: UsageService (Atomic Increment + Quota Check)

**Files:**
- Create: `backend/app/services/usage.py`
- Test: `backend/tests/services/test_usage_service.py`

**Interfaces:**
- Consumes: `UsageRecord` model (Task 1).
- Produces: `UsageService(db)` with `increment_usage(member_id, action)` (unconditional atomic upsert), `increment_and_check(member_id, action, limit) -> bool` (atomic conditional; True=allowed+incremented, False=over limit), `get_today_usage(member_id) -> UsageRecord|None`, `get_monthly_download_count(member_id) -> int`, `get_usage_summary(member_id, limits, tier) -> dict`. Task 6 consumes `increment_usage` + `increment_and_check`.

- [ ] **Step 1: Write failing unit tests**

Create `backend/tests/services/test_usage_service.py`:

```python
from datetime import date, datetime, timedelta

import pytest

from app.services.usage import UsageService


async def _make_member(db_session, email="usage@test-member.com"):
    from app.models.member import Member
    from app.core.security import hash_password
    m = Member(email=email, password_hash=hash_password("test123456"), name="Usage")
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.mark.asyncio
async def test_increment_and_check_within_limit(db_session):
    m = await _make_member(db_session, "within@test-member.com")
    svc = UsageService(db_session)
    assert await svc.increment_and_check(m.id, "search", 2) is True
    assert await svc.increment_and_check(m.id, "search", 2) is True
    assert await svc.increment_and_check(m.id, "search", 2) is False  # 3rd blocked


@pytest.mark.asyncio
async def test_increment_usage_unconditional(db_session):
    m = await _make_member(db_session, "uncond@test-member.com")
    svc = UsageService(db_session)
    await svc.increment_usage(m.id, "detail_view")
    await svc.increment_usage(m.id, "detail_view")
    rec = await svc.get_today_usage(m.id)
    assert rec is not None
    assert rec.detail_view_count == 2


@pytest.mark.asyncio
async def test_get_monthly_download_count_sums_current_month(db_session):
    from app.models.usage_record import UsageRecord
    m = await _make_member(db_session, "monthly@test-member.com")
    today = date.today()
    first_of_month = today.replace(day=1)
    # One record today, one earlier this month, one last month (should be excluded).
    db_session.add_all([
        UsageRecord(member_id=m.id, record_date=today, download_count=3),
        UsageRecord(member_id=m.id, record_date=first_of_month, download_count=2),
        UsageRecord(member_id=m.id, record_date=first_of_month - timedelta(days=1), download_count=99),
    ])
    await db_session.commit()
    count = await UsageService(db_session).get_monthly_download_count(m.id)
    assert count == 5


@pytest.mark.asyncio
async def test_download_uses_monthly_aggregation(db_session):
    m = await _make_member(db_session, "dlmonth@test-member.com")
    svc = UsageService(db_session)
    # Monthly limit of 2: two downloads allowed, third blocked (counts across the month).
    assert await svc.increment_and_check(m.id, "download", 2) is True
    assert await svc.increment_and_check(m.id, "download", 2) is True
    assert await svc.increment_and_check(m.id, "download", 2) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/services/test_usage_service.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement UsageService**

Create `backend/app/services/usage.py`:

```python
from datetime import date, datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage_record import UsageRecord


_ACTION_COLUMN = {
    "search": "search_count",
    "detail_view": "detail_view_count",
    "download": "download_count",
}


class UsageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def increment_usage(self, member_id: int, action: str) -> None:
        """Unconditional atomic upsert — used when limit == 0 (unlimited)."""
        col = _ACTION_COLUMN[action]
        today = date.today()
        sql = text(
            f"""
            INSERT INTO usage_records (member_id, record_date, {col})
            VALUES (:member_id, :today, 1)
            ON CONFLICT (member_id, record_date)
            DO UPDATE SET {col} = usage_records.{col} + 1
            """
        )
        await self.db.execute(sql, {"member_id": member_id, "today": today})
        await self.db.commit()

    async def increment_and_check(self, member_id: int, action: str, limit: int) -> bool:
        """Atomic conditional increment. Returns True if allowed (and incremented),
        False if the limit would be exceeded (no increment written)."""
        col = _ACTION_COLUMN[action]
        today = date.today()

        if action == "download":
            # Monthly aggregation: check current-month sum before incrementing.
            used = await self.get_monthly_download_count(member_id)
            if used >= limit:
                return False
            await self.increment_usage(member_id, action)
            return True

        sql = text(
            f"""
            INSERT INTO usage_records (member_id, record_date, {col})
            VALUES (:member_id, :today, 1)
            ON CONFLICT (member_id, record_date)
            DO UPDATE SET {col} = usage_records.{col} + 1
            WHERE usage_records.{col} < :limit
            RETURNING {col}
            """
        )
        result = await self.db.execute(sql, {"member_id": member_id, "today": today, "limit": limit})
        row = result.first()
        await self.db.commit()
        return row is not None

    async def get_today_usage(self, member_id: int) -> UsageRecord | None:
        result = await self.db.execute(
            select(UsageRecord).where(
                UsageRecord.member_id == member_id,
                UsageRecord.record_date == date.today(),
            )
        )
        return result.scalar_one_or_none()

    async def get_monthly_download_count(self, member_id: int) -> int:
        now = datetime.utcnow()
        month_start = now.date().replace(day=1)
        result = await self.db.execute(
            select(func.coalesce(func.sum(UsageRecord.download_count), 0)).where(
                UsageRecord.member_id == member_id,
                UsageRecord.record_date >= month_start,
            )
        )
        return int(result.scalar() or 0)

    async def get_usage_summary(self, member_id: int, limits: dict, tier: str) -> dict:
        today_rec = await self.get_today_usage(member_id)
        s_used = today_rec.search_count if today_rec else 0
        d_used = today_rec.detail_view_count if today_rec else 0
        dl_used = await self.get_monthly_download_count(member_id)
        return {
            "plan": tier,
            "today": {
                "search": {"used": s_used, "limit": limits["search_limit_daily"]},
                "detail_view": {"used": d_used, "limit": limits["detail_view_limit_daily"]},
            },
            "this_month": {
                "download": {"used": dl_used, "limit": limits["download_limit_monthly"]},
            },
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/services/test_usage_service.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/usage.py backend/tests/services/test_usage_service.py
git commit -m "feat(membership): UsageService with atomic increment and monthly aggregation"
```

---

## Task 6: require_quota Dependency

**Files:**
- Modify: `backend/app/api/deps.py`
- Test: `backend/tests/api/test_require_quota.py`

**Interfaces:**
- Consumes: `SubscriptionService.resolve_effective_plan` (Task 4), `UsageService.increment_usage` + `increment_and_check` (Task 5).
- Produces: `get_optional_current_member() -> Member | None` and `require_quota(action)` FastAPI dependency factory returning `Member | None`. Tasks 11 consumes `require_quota`.

- [ ] **Step 1: Write failing integration tests**

Create `backend/tests/api/test_require_quota.py`:

```python
from datetime import date

import pytest

from app.models.member import Member
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_record import UsageRecord
from app.core.security import hash_password


async def _seed_freemium_member(db_session, email="quota@test-member.com", used_search=0):
    m = Member(email=email, password_hash=hash_password("test123456"), name="Quota", is_verified=True)
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    # Backfill an active freemium subscription (limits 10/20/0) as the migration would.
    from app.models.member_subscription import MemberSubscription
    plan = await db_session.execute(
        __import__("sqlalchemy").select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium")
    )
    plan = plan.scalar_one()
    db_session.add(MemberSubscription(
        member_id=m.id, plan_id=plan.id, status="active",
        snapshot_search_limit=10, snapshot_detail_limit=20, snapshot_download_limit=0,
    ))
    if used_search:
        db_session.add(UsageRecord(member_id=m.id, record_date=date.today(), search_count=used_search))
    await db_session.commit()
    return m


def test_require_quota_allows_anonymous(client):
    """Anonymous requests pass through unmetered (public-site preservation)."""
    res = client.get("/api/cables?page_size=1")
    # Public list endpoint still works for anonymous users.
    assert res.status_code == 200


def test_require_quota_blocks_member_over_limit(client, db_session):
    import asyncio
    m = asyncio.run(_seed_freemium_member(db_session, "overlimit@test-member.com", used_search=10))
    # Log in as the member.
    res = client.post("/api/member/login", json={"email": "overlimit@test-member.com", "password": "test123456"})
    assert res.status_code == 200
    token = res.json().get("token") or res.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {token}"}
    # 11th search should be blocked.
    blocked = client.get("/api/cables?page_size=1", headers=headers)
    assert blocked.status_code == 429
    assert blocked.headers.get("X-RateLimit-Remaining") == "0"
    assert "Daily search limit exceeded" in blocked.json()["message"]


def test_require_quota_allows_member_under_limit(client, db_session):
    import asyncio
    asyncio.run(_seed_freemium_member(db_session, "underlimit@test-member.com", used_search=2))
    res = client.post("/api/member/login", json={"email": "underlimit@test-member.com", "password": "test123456"})
    token = res.json().get("token") or res.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {token}"}
    ok = client.get("/api/cables?page_size=1", headers=headers)
    assert ok.status_code == 200
```

> Note: the login response sets a `member_token` cookie AND the test reads the bearer token. Inspect `backend/app/api/routes/member.py` `login` — it returns JSON `{"member": {...}}` and sets the cookie; it does NOT return `token` in JSON. Use `res.cookies.get("member_token")` for the cookie value. Adjust the test to read the cookie (the example above already falls back to it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_require_quota.py -v`
Expected: FAIL — `require_quota` not applied to `/api/cables` yet and `get_optional_current_member` does not exist.

- [ ] **Step 3: Add optional member auth to deps.py**

In `backend/app/api/deps.py`, add after `get_current_member`:

```python
async def get_optional_current_member(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Member | None:
    """Like get_current_member but returns None for anonymous requests instead of 401.
    Used by require_quota so public endpoints stay anonymous while members are metered."""
    if token is None:
        return None
    payload = decode_member_token(token)
    if payload is None:
        return None
    member = await db.get(Member, int(payload["sub"]))
    if member is None or not member.is_active:
        return None
    return member
```

- [ ] **Step 4: Add require_quota factory to deps.py**

Append to `backend/app/api/deps.py` (imports `SubscriptionService`/`UsageService` lazily inside the closure to avoid circular imports):

```python
def require_quota(action: str):
    """Factory: FastAPI dependency that meters a member action (search/detail_view/download).

    Anonymous requests pass through unmetered. Authenticated members are checked
    against their effective plan limits and incremented atomically. Over-limit
    raises HTTP 429 with X-RateLimit-Remaining: 0."""
    if action not in ("search", "detail_view", "download"):
        raise ValueError(f"unknown quota action: {action}")

    async def checker(
        member: Member | None = Depends(get_optional_current_member),
        db: AsyncSession = Depends(get_db),
    ) -> Member | None:
        if member is None:
            return None  # anonymous — no metering

        from app.services.subscription import SubscriptionService
        from app.services.usage import UsageService

        tier, limits = await SubscriptionService(db).resolve_effective_plan(member.id)
        limit_map = {
            "search": limits["search_limit_daily"],
            "detail_view": limits["detail_view_limit_daily"],
            "download": limits["download_limit_monthly"],
        }
        limit = limit_map[action]

        if limit == 0:
            # Unlimited — record usage but never block.
            await UsageService(db).increment_usage(member.id, action)
            return member

        allowed = await UsageService(db).increment_and_check(member.id, action, limit)
        if not allowed:
            period = "Monthly" if action == "download" else "Daily"
            raise HTTPException(
                status_code=429,
                detail={"code": 429, "message": f"{period} {action} limit exceeded"},
                headers={"X-RateLimit-Remaining": "0"},
            )
        return member

    return checker
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_require_quota.py -v`
Expected: PASS (3 tests). (The first test passes once `/api/cables` is still public — it will still return 200 because anonymous passes through. The blocking/allowing tests pass because `require_quota` is wired in Task 11. **If Task 11 is not yet done**, the member tests will NOT block — so run these tests again after Task 11. To make this task independently verifiable, temporarily verify the dependency logic with a unit test of the closure by calling it directly is not practical; instead, the integration assertion is satisfied at Task 11 completion.)

> Reorder note: This task's blocking assertions depend on Task 11 wiring `require_quota` into `cables.py`. Execute Task 11 immediately after this task, then re-run this test file. Keep the tests in this file; they are the Task 11 acceptance gate too.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/deps.py backend/tests/api/test_require_quota.py
git commit -m "feat(membership): add get_optional_current_member and require_quota dependency"
```

---

## Task 7: Member Subscription/Usage API Endpoints

**Files:**
- Create: `backend/app/api/routes/member_subscription.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/api/test_plans_public.py`

**Interfaces:**
- Consumes: `SubscriptionService` (Task 4), `UsageService` (Task 5), schemas (Task 3), `crud_inquiry` (existing), `get_current_member` (existing).
- Produces: `GET /api/member/subscription`, `GET /api/member/usage`, `POST /api/member/subscription/trial`, `POST /api/member/subscription/cancel`, `POST /api/inquiries/enterprise`.

- [ ] **Step 1: Write failing API tests**

Append to `backend/tests/api/test_plans_public.py` (create the file if not present — `GET /api/plans` tests are added in Task 9; here add member subscription tests):

```python
from datetime import date


def _login(client, email, password="test123456"):
    res = client.post("/api/member/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Cookie": f"member_token={res.cookies.get('member_token')}"}


def test_member_usage_default_freemium(client, db_session):
    import asyncio
    from app.models.member import Member
    from app.core.security import hash_password
    m = Member(email="usageapi@test-member.com", password_hash=hash_password("test123456"),
               name="Usage API", is_verified=True)
    db_session.add(m)
    asyncio.run(db_session.commit()) if False else None
    # db_session is async; use the fixture's session directly
```

> Because `db_session` is an async session and `TestClient` is sync, prefer seeding via raw SQL through the engine like `conftest.py` does. Replace the above with this concrete, runnable version:

```python
import asyncio
from sqlalchemy import text
from app.core.security import hash_password
from app.core.database import async_session


def _create_member(email):
    async def _c():
        async with async_session() as s:
            await s.execute(
                text(
                    "INSERT INTO members (email, password_hash, name, is_active, is_verified, created_at, updated_at) "
                    "VALUES (:e, :p, 'API Member', true, true, NOW(), NOW()) ON CONFLICT (email) DO UPDATE "
                    "SET password_hash = EXCLUDED.password_hash, is_verified = true RETURNING id"
                ),
                {"e": email, "p": hash_password("test123456")},
            )
            await s.commit()
    asyncio.run(_c())


def _login_cookie(client, email):
    res = client.post("/api/member/login", json={"email": email, "password": "test123456"})
    assert res.status_code == 200, res.text
    return {"Cookie": f"member_token={res.cookies.get('member_token')}"}


def test_member_usage_returns_freemium_limits(client):
    _create_member("usageapi@test-member.com")
    h = _login_cookie(client, "usageapi@test-member.com")
    res = client.get("/api/member/usage", headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"] == "freemium"
    assert body["today"]["search"]["limit"] == 10
    assert body["today"]["detail_view"]["limit"] == 20
    assert body["this_month"]["download"]["limit"] == 0


def test_member_subscription_status_default_freemium(client):
    _create_member("substatus@test-member.com")
    h = _login_cookie(client, "substatus@test-member.com")
    res = client.get("/api/member/subscription", headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_level"] == "freemium"
    assert body["status"] == "active"


def test_start_personal_trial(client):
    _create_member("trialapi@test-member.com")
    h = _login_cookie(client, "trialapi@test-member.com")
    res = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "trialing"
    assert body["tier_level"] == "personal"
    assert body["trial_end"] is not None


def test_cancel_subscription(client):
    _create_member("cancelapi@test-member.com")
    h = _login_cookie(client, "cancelapi@test-member.com")
    client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    res = client.post("/api/member/subscription/cancel", headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled"


def test_enterprise_inquiry_creates_inquiry(client):
    _create_member("entinq@test-member.com")
    h = _login_cookie(client, "entinq@test-member.com")
    res = client.post(
        "/api/inquiries/enterprise",
        json={"company_name": "Acme Corp", "use_case": "Bulk spec access for 50 engineers"},
        headers=h,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["recipient_type"] == "enterprise_sales"
    assert body["subject"] == "Enterprise Subscription Inquiry"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_plans_public.py -v`
Expected: FAIL — routes do not exist (404).

- [ ] **Step 3: Create the member_subscription router**

Create `backend/app/api/routes/member_subscription.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.database import get_db
from app.crud.inquiry import crud_inquiry
from app.models.inquiry import Inquiry
from app.models.member import Member
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.member_subscription import (
    CancelResponse,
    EnterpriseInquiryCreate,
    SubscriptionRead,
    TrialRequest,
)
from app.schemas.inquiry import InquiryRead
from app.services.subscription import SubscriptionService
from app.services.usage import UsageService

router = APIRouter(prefix="/api/member", tags=["member-subscription"])


def _to_subscription_read(sub, plan: SubscriptionPlan) -> SubscriptionRead:
    return SubscriptionRead(
        id=sub.id,
        plan_id=sub.plan_id,
        plan_name=plan.name,
        tier_level=plan.tier_level,
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        trial_start=sub.trial_start,
        trial_end=sub.trial_end,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        cancelled_at=sub.cancelled_at,
        search_limit_daily=sub.snapshot_search_limit,
        detail_view_limit_daily=sub.snapshot_detail_limit,
        download_limit_monthly=sub.snapshot_download_limit,
    )


async def _load_plan(db: AsyncSession, plan_id: int) -> SubscriptionPlan:
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Plan missing"})
    return plan


@router.get("/subscription", response_model=SubscriptionRead)
async def get_subscription(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    svc = SubscriptionService(db)
    sub = await svc.get_active_subscription(member.id)
    if sub is None:
        # Implicit freemium: synthesize a read from the freemium plan.
        plan = await svc._get_plan_by_tier("freemium")
        return SubscriptionRead(
            id=0, plan_id=plan.id, plan_name=plan.name, tier_level=plan.tier_level,
            status="active", billing_cycle=None, trial_start=None, trial_end=None,
            current_period_start=None, current_period_end=None, cancelled_at=None,
            search_limit_daily=plan.search_limit_daily,
            detail_view_limit_daily=plan.detail_view_limit_daily,
            download_limit_monthly=plan.download_limit_monthly,
        )
    sub = await svc.check_and_expire_trial(sub)
    plan = await _load_plan(db, sub.plan_id)
    return _to_subscription_read(sub, plan)


@router.get("/usage")
async def get_usage(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    svc = SubscriptionService(db)
    tier, limits = await svc.resolve_effective_plan(member.id)
    summary = await UsageService(db).get_usage_summary(member.id, limits, tier)
    return summary


@router.post("/subscription/trial", response_model=SubscriptionRead, status_code=201)
async def start_trial(
    body: TrialRequest,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    plan = await SubscriptionService(db)._get_plan_by_tier("personal")
    sub = await SubscriptionService(db).start_trial(
        member.id, plan.id, plan.trial_days, body.billing_cycle
    )
    return _to_subscription_read(sub, plan)


@router.post("/subscription/cancel", response_model=CancelResponse)
async def cancel(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    sub = await SubscriptionService(db).cancel_subscription(member.id)
    return CancelResponse(
        status=sub.status,
        current_period_end=sub.current_period_end,
        message="Subscription cancelled; access retained until period end.",
    )


# Enterprise inquiry lives under /api/inquiries to match the design-doc URL.
enterprise_router = APIRouter(prefix="/api/inquiries", tags=["member-subscription"])


@enterprise_router.post("/enterprise", response_model=InquiryRead, status_code=201)
async def create_enterprise_inquiry(
    body: EnterpriseInquiryCreate,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    inquiry = Inquiry(
        sender_id=member.id,
        recipient_type="enterprise_sales",
        recipient_id="enterprise_sales",
        subject="Enterprise Subscription Inquiry",
        body=f"Company: {body.company_name}\n\nUse case:\n{body.use_case}",
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    inquiry.recipient_name = "Enterprise Sales"
    return inquiry
```

- [ ] **Step 4: Register the routers in main.py**

In `backend/app/main.py`, add to the route import line:

```python
from app.api.routes import ..., member_subscription
```

And after `app.include_router(member.router)` add:

```python
app.include_router(member_subscription.router)
app.include_router(member_subscription.enterprise_router)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_plans_public.py -v`
Expected: PASS (5 tests). If `GET /api/plans` tests from Task 9 are also in this file, they will fail until Task 9 — keep them in a separate file or add them in Task 9.

> Keep `GET /api/plans` tests in a separate file (`test_plans_public.py` is shared; if you added plan tests here in Task 9, run them together after Task 9). For now this file holds only the 5 member tests above.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/member_subscription.py backend/app/main.py backend/tests/api/test_plans_public.py
git commit -m "feat(membership): member subscription, usage, trial, cancel, enterprise inquiry endpoints"
```

---

## Task 8: Trial-Expiry Background Task

**Files:**
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `SubscriptionService.expire_trials_batch` (Task 4).
- Produces: a FastAPI lifespan background task that runs `expire_trials_batch()` every hour.

- [ ] **Step 1: Add a lifespan with the background task**

In `backend/app/main.py`, replace the `app = FastAPI(...)` construction with a lifespan-based version. Add these imports near the top:

```python
import asyncio
from contextlib import asynccontextmanager
```

Add the lifespan before `app = FastAPI(...)`:

```python
async def _trial_expiry_loop():
    """Hourly bulk expiry of trialing/cancelled subscriptions past their end time.
    The primary mechanism is lazy expiry in resolve_effective_plan; this is a backup."""
    from app.core.database import async_session
    from app.services.subscription import SubscriptionService
    while True:
        try:
            async with async_session() as s:
                await SubscriptionService(s).expire_trials_batch()
        except Exception:
            logger.exception("trial expiry loop failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_trial_expiry_loop())
    try:
        yield
    finally:
        task.cancel()
```

Update the `FastAPI(...)` call to use the lifespan:

```python
app = FastAPI(
    title="Unowire API",
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    lifespan=lifespan,
)
```

- [ ] **Step 2: Verify the app still boots**

Run: `cd backend && python -c "from app.main import app; print('ok')"`
Expected: prints `ok` with no import errors.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `cd backend && python -m pytest tests/api/test_member_auth.py -v`
Expected: PASS (the lifespan must not block TestClient startup).

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(membership): hourly trial-expiry background task via FastAPI lifespan"
```

---

## Task 9: Public Plans Endpoint + Admin Plan/Subscription/Analytics API

**Files:**
- Create: `backend/app/api/routes/plans.py`
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/app/core/modules.py` (add `plans` + `subscriptions` modules)
- Test: `backend/tests/api/test_admin_plans.py`

**Interfaces:**
- Consumes: schemas (Task 3), `require_operator` (existing), `SubscriptionService` (Task 4), `UsageService` (Task 5).
- Produces: `GET /api/plans` (public), `GET/POST/PUT/DELETE /api/admin/plans`, `POST /api/admin/members/{id}/subscription` (enterprise), `GET /api/admin/subscriptions`, `GET /api/admin/usage-analytics`.

- [ ] **Step 1: Register admin modules**

In `backend/app/core/modules.py`, add two entries to `ADMIN_MODULES` (before the closing `]`):

```python
    {"id": "plans",          "label": "Plans",          "scope_aware": False, "scope_type": None},
    {"id": "subscriptions",  "label": "Subscriptions",  "scope_aware": False, "scope_type": None},
```

- [ ] **Step 2: Write failing admin API tests**

Create `backend/tests/api/test_admin_plans.py`:

```python
def test_public_plans_returns_three_active(client):
    res = client.get("/api/plans")
    assert res.status_code == 200, res.text
    tiers = {p["tier_level"] for p in res.json()}
    assert tiers == {"freemium", "personal", "enterprise"}


def test_admin_list_plans_includes_inactive(client, admin_headers):
    res = client.get("/api/admin/plans", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)


def test_admin_update_plan_changes_quota(client, admin_headers):
    plans = client.get("/api/admin/plans", headers=admin_headers).json()
    freemium = next(p for p in plans if p["tier_level"] == "freemium")
    res = client.put(
        f"/api/admin/plans/{freemium['id']}",
        json={"search_limit_daily": 25},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["search_limit_daily"] == 25


def test_admin_create_plan(client, admin_headers):
    res = client.post(
        "/api/admin/plans",
        json={
            "name": "Pro", "tier_level": "pro", "price_monthly": 29,
            "price_yearly": 290, "search_limit_daily": 100,
            "detail_view_limit_daily": 200, "download_limit_monthly": 50,
            "is_sales_led": False, "is_active": True, "features": ["x"], "sort_order": 5, "trial_days": 7,
        },
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["tier_level"] == "pro"
    # cleanup
    client.delete(f"/api/admin/plans/{res.json()['id']}", headers=admin_headers)


def test_admin_delete_plan_soft_deletes(client, admin_headers):
    res = client.post(
        "/api/admin/plans",
        json={"name": "Tmp", "tier_level": "tmp_del", "price_monthly": 0,
              "price_yearly": 0, "search_limit_daily": 1, "detail_view_limit_daily": 1,
              "download_limit_monthly": 0, "is_sales_led": False, "is_active": True,
              "features": [], "sort_order": 99, "trial_days": 0},
        headers=admin_headers,
    )
    pid = res.json()["id"]
    dele = client.delete(f"/api/admin/plans/{pid}", headers=admin_headers)
    assert dele.status_code == 204, dele.text
    # Not in public list...
    public = {p["tier_level"] for p in client.get("/api/plans").json()}
    assert "tmp_del" not in public


def test_admin_create_enterprise_subscription(client, admin_headers):
    import asyncio
    from datetime import datetime, timedelta
    from sqlalchemy import text
    from app.core.database import async_session

    # Ensure a member exists.
    async def _c():
        async with async_session() as s:
            await s.execute(text(
                "INSERT INTO members (email, password_hash, name, is_active, is_verified, created_at, updated_at) "
                "VALUES ('entadmin@test-member.com', 'x', 'Ent Admin', true, true, NOW(), NOW()) "
                "ON CONFLICT (email) DO NOTHING RETURNING id"
            ))
            await s.commit()
    asyncio.run(_c())
    members = client.get("/api/admin/members?q=entadmin", headers=admin_headers).json()
    mid = members["items"][0]["id"] if isinstance(members, dict) else members[0]["id"]
    res = client.post(
        f"/api/admin/members/{mid}/subscription",
        json={"period_end": (datetime.utcnow() + timedelta(days=365)).isoformat()},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "active"


def test_admin_subscriptions_list(client, admin_headers):
    res = client.get("/api/admin/subscriptions", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)


def test_admin_usage_analytics(client, admin_headers):
    res = client.get("/api/admin/usage-analytics", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/api/test_admin_plans.py -v`
Expected: FAIL — routes 404.

- [ ] **Step 4: Create the plans router (public + admin)**

Create `backend/app/api/routes/plans.py`:

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.models.member import Member
from app.models.member_subscription import MemberSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_record import UsageRecord
from app.models.user import User
from app.schemas.member_subscription import EnterpriseSubscriptionCreate, SubscriptionRead
from app.schemas.subscription_plan import (
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanUpdate,
)
from app.services.subscription import SubscriptionService

router = APIRouter(tags=["plans"])


# --- Public ---


@router.get("/api/plans", response_model=list[SubscriptionPlanRead])
async def list_public_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active == True)
        .order_by(SubscriptionPlan.sort_order)
    )
    return list(result.scalars().all())


# --- Admin plan CRUD ---


@router.get("/api/admin/plans", response_model=list[SubscriptionPlanRead])
async def admin_list_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    result = await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))
    return list(result.scalars().all())


@router.post("/api/admin/plans", response_model=SubscriptionPlanRead, status_code=201)
async def admin_create_plan(
    body: SubscriptionPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = SubscriptionPlan(**body.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put("/api/admin/plans/{plan_id}", response_model=SubscriptionPlanRead)
async def admin_update_plan(
    plan_id: int,
    body: SubscriptionPlanUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/api/admin/plans/{plan_id}", status_code=204)
async def admin_delete_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("plans")),
):
    plan = await db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
    plan.is_active = False  # soft delete
    db.add(plan)
    await db.commit()
    return None


# --- Admin enterprise subscription management ---


@router.post("/api/admin/members/{member_id}/subscription", response_model=SubscriptionRead, status_code=201)
async def admin_create_enterprise_subscription(
    member_id: int,
    body: EnterpriseSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    member = await db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    plan = await SubscriptionService(db)._get_plan_by_tier("enterprise")
    sub = await SubscriptionService(db).create_enterprise_subscription(
        member_id, plan.id, body.period_end
    )
    return SubscriptionRead(
        id=sub.id, plan_id=plan.id, plan_name=plan.name, tier_level=plan.tier_level,
        status=sub.status, billing_cycle=None, trial_start=None, trial_end=None,
        current_period_start=sub.current_period_start, current_period_end=sub.current_period_end,
        cancelled_at=None,
        search_limit_daily=sub.snapshot_search_limit,
        detail_view_limit_daily=sub.snapshot_detail_limit,
        download_limit_monthly=sub.snapshot_download_limit,
    )


@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(
    plan: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    stmt = (
        select(MemberSubscription, SubscriptionPlan, Member)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .join(Member, MemberSubscription.member_id == Member.id)
        .order_by(MemberSubscription.created_at.desc())
    )
    if plan:
        stmt = stmt.where(SubscriptionPlan.tier_level == plan)
    if status:
        stmt = stmt.where(MemberSubscription.status == status)
    result = await db.execute(stmt)
    return [
        {
            "id": sub.id,
            "member_id": sub.member_id,
            "member_email": member.email,
            "member_name": member.name,
            "plan": plan_model.tier_level,
            "status": sub.status,
            "billing_cycle": sub.billing_cycle,
            "trial_end": sub.trial_end,
            "current_period_end": sub.current_period_end,
            "created_at": sub.created_at,
        }
        for sub, plan_model, member in result.all()
    ]


@router.get("/api/admin/usage-analytics")
async def admin_usage_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    """Aggregate usage per plan tier (sum of today's counts grouped by member plan)."""
    today = datetime.utcnow().date()
    stmt = (
        select(
            SubscriptionPlan.tier_level,
            func.count(func.distinct(UsageRecord.member_id)),
            func.coalesce(func.sum(UsageRecord.search_count), 0),
            func.coalesce(func.sum(UsageRecord.detail_view_count), 0),
            func.coalesce(func.sum(UsageRecord.download_count), 0),
        )
        .select_from(UsageRecord)
        .join(MemberSubscription, UsageRecord.member_id == MemberSubscription.member_id)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .where(UsageRecord.record_date == today)
        .group_by(SubscriptionPlan.tier_level)
    )
    result = await db.execute(stmt)
    return [
        {
            "tier": tier,
            "active_members_today": int(members),
            "search": int(searches),
            "detail_view": int(views),
            "download": int(downloads),
        }
        for tier, members, searches, views, downloads in result.all()
    ]
```

- [ ] **Step 5: Register the router in main.py**

In `backend/app/main.py`, add `plans` to the route import line and register it:

```python
from app.api.routes import ..., plans
```

```python
app.include_router(plans.router)
```

- [ ] **Step 6: Add a public plans test to `test_plans_public.py`**

In `backend/tests/api/test_plans_public.py`, ensure there is (it may already be referenced by Task 7's file — if so, skip; otherwise add):

```python
def test_public_plans_returns_three_active(client):
    res = client.get("/api/plans")
    assert res.status_code == 200, res.text
    tiers = {p["tier_level"] for p in res.json()}
    assert tiers == {"freemium", "personal", "enterprise"}
```

> If `test_plans_public.py` already exists from Task 7 holding member tests, add this test to it. Keep the `GET /api/plans` test in exactly one place.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_admin_plans.py tests/api/test_plans_public.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/plans.py backend/app/main.py backend/app/core/modules.py backend/tests/api/test_admin_plans.py backend/tests/api/test_plans_public.py
git commit -m "feat(membership): public plans endpoint, admin plan CRUD, subscription + analytics APIs"
```

---

## Task 10: Wire `require_quota` Into Search / Detail / Download Endpoints

**Files:**
- Modify: `backend/app/api/routes/cables.py`
- Modify: `backend/app/api/routes/equipment.py`
- Modify: `backend/app/api/routes/terminals.py`
- Modify: `backend/app/api/routes/resource.py`
- Test: `backend/tests/api/test_require_quota.py` (re-run Task 6's tests as the gate)

**Interfaces:**
- Consumes: `require_quota` (Task 6).
- Produces: metered public search/detail/download endpoints; anonymous users unaffected.

- [ ] **Step 1: Add `require_quota` to cable search + detail**

In `backend/app/api/routes/cables.py`, add to imports:

```python
from app.api.deps import require_operator, require_quota
```

Add a `member` parameter to `list_cables` (anonymous-safe; `Member | None`):

```python
@router.get("", response_model=CableListResponse)
async def list_cables(
    industry: str | None = None,
    category: str | None = None,
    product_type: str | None = None,
    q: str | None = None,
    manufacturer: list[str] | None = Query(None),
    size: list[str] | None = Query(None),
    min_size: float | None = None,
    max_size: float | None = None,
    spec_filters: str | None = None,
    min_od: float | None = None,
    max_od: float | None = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _member=Depends(require_quota("search")),
):
```

(Leave the function body unchanged — the dependency does the metering.)

Add `_member=Depends(require_quota("detail_view"))` to both `get_cable_by_url` and `get_cable`:

```python
@router.get("/by-url/{manufacturer_slug}/{cable_slug}", response_model=CableDetailRead)
async def get_cable_by_url(
    manufacturer_slug: str, cable_slug: str,
    db: AsyncSession = Depends(get_db),
    _member=Depends(require_quota("detail_view")),
):
    ...

@router.get("/{id}", response_model=CableRead)
async def get_cable(
    id: str,
    db: AsyncSession = Depends(get_db),
    _member=Depends(require_quota("detail_view")),
):
    ...
```

- [ ] **Step 2: Add `require_quota` to equipment search + detail**

In `backend/app/api/routes/equipment.py`, add `from app.api.deps import require_operator, require_quota` and add `_member=Depends(require_quota("search"))` to the list endpoint and `_member=Depends(require_quota("detail_view"))` to the detail (`GET /{id}`) endpoint, mirroring the cable pattern. (Confirm the exact detail route name in `equipment.py` first by reading it; the detail handler is the `GET /{id}` returning a single equipment.)

- [ ] **Step 3: Add `require_quota` to terminal search + detail**

In `backend/app/api/routes/terminals.py`, add `from app.api.deps import require_operator, require_quota` and:

- `list_terminals`: add `_member=Depends(require_quota("search"))`
- `get_terminal`: add `_member=Depends(require_quota("detail_view"))`

- [ ] **Step 4: Add `require_quota("download")` to the resource download endpoint**

In `backend/app/api/routes/resource.py`, add to imports:

```python
from app.api.deps import require_operator, require_quota
```

Add a member parameter to `download_resource`:

```python
@router.get("/{resource_id}/download")
async def download_resource(
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    _member=Depends(require_quota("download")),
):
    ...
```

> Note: `require_quota("download")` returns `Member | None`. Anonymous downloads pass unmetered; authenticated members are metered (freemium download limit is 0 = unlimited, so members are counted but never blocked by the seed config).

- [ ] **Step 5: Re-run the require_quota integration tests**

Run: `cd backend && python -m pytest tests/api/test_require_quota.py -v`
Expected: PASS (3 tests) — anonymous allowed, member over limit blocked with 429 + header, member under limit allowed.

- [ ] **Step 6: Verify no regression in existing public-browsing tests**

Run: `cd backend && python -m pytest tests/api/test_portal_cable_list.py tests/api/test_portal_cables.py -v`
Expected: PASS (portal tests use factory-user tokens, not member tokens, so they remain unaffected; the optional auth returns None for portal tokens).

> If any portal test sends a portal token that `decode_member_token` rejects, `get_optional_current_member` returns None (no metering) — portal users are not metered by member quota. This is intentional: portal (factory) users are a separate auth pathway.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/cables.py backend/app/api/routes/equipment.py backend/app/api/routes/terminals.py backend/app/api/routes/resource.py
git commit -m "feat(membership): meter search/detail_view/download via require_quota"
```

---

## Task 11: Auto-Assign Freemium on Registration

**Files:**
- Modify: `backend/app/crud/member.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/api/test_member_auth.py` (extend)

**Interfaces:**
- Consumes: `SubscriptionPlan` + `MemberSubscription` (Task 1).
- Produces: every newly registered member gets an `active` freemium subscription with snapshot limits copied from the freemium plan.

- [ ] **Step 1: Write a failing test**

Append to `backend/tests/api/test_member_auth.py`:

```python
def test_register_assigns_freemium_subscription(client):
    import asyncio
    from sqlalchemy import text
    from app.core.database import async_session

    res = client.post("/api/member/register", json={
        "email": "newfreemium@test-member.com",
        "password": "test123456",
        "name": "New Free",
    })
    assert res.status_code == 200, res.text

    async def _c():
        async with async_session() as s:
            row = await s.execute(text(
                "SELECT ms.status, sp.tier_level FROM member_subscriptions ms "
                "JOIN subscription_plans sp ON sp.id = ms.plan_id "
                "JOIN members m ON m.id = ms.member_id "
                "WHERE m.email = 'newfreemium@test-member.com'"
            ))
            return row.first()
    row = asyncio.run(_c())
    assert row is not None
    assert row[0] == "active"
    assert row[1] == "freemium"

    # cleanup
    async def _del():
        async with async_session() as s:
            await s.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email='newfreemium@test-member.com')"))
            await s.execute(text("DELETE FROM members WHERE email='newfreemium@test-member.com'"))
            await s.commit()
    asyncio.run(_del())
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/api/test_member_auth.py::test_register_assigns_freemium_subscription -v`
Expected: FAIL — no subscription row exists.

- [ ] **Step 3: Extend `crud_member.create` to create the freemium subscription**

In `backend/app/crud/member.py`, modify `create` to insert a freemium subscription after creating the member. Replace the `create` method body's tail (after `await db.refresh(db_obj)`) — add before `return db_obj`:

```python
        # Auto-assign an active freemium subscription.
        from app.models.member_subscription import MemberSubscription
        from app.models.subscription_plan import SubscriptionPlan
        from sqlalchemy import select
        plan = (
            await db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium")
            )
        ).scalar_one_or_none()
        if plan is not None:
            db.add(MemberSubscription(
                member_id=db_obj.id,
                plan_id=plan.id,
                status="active",
                snapshot_search_limit=plan.search_limit_daily,
                snapshot_detail_limit=plan.detail_view_limit_daily,
                snapshot_download_limit=plan.download_limit_monthly,
            ))
            await db.commit()
```

- [ ] **Step 4: Add cleanup to conftest**

In `backend/tests/conftest.py`, inside `_cleanup_test_data`'s `_cleanup()`, add before the `DELETE FROM inquiries ...` line:

```python
            await conn.execute(text("DELETE FROM usage_records WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-member.com')"))
            await conn.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email LIKE '%@test-member.com')"))
            await conn.execute(text("DELETE FROM subscription_plans WHERE tier_level IN ('pro','tmp_del')"))
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/api/test_member_auth.py::test_register_assigns_freemium_subscription -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/member.py backend/tests/api/test_member_auth.py backend/tests/conftest.py
git commit -m "feat(membership): auto-assign freemium subscription on member registration"
```

---

## Task 12: Frontend — Pricing Page + Nav Link + Enterprise Modal

**Files:**
- Create: `frontend/app/api/plans/route.ts`
- Create: `frontend/app/(site)/pricing/page.tsx`
- Create: `frontend/components/pricing/PricingCard.tsx`
- Create: `frontend/components/pricing/EnterpriseContactModal.tsx`
- Create: `frontend/app/api/inquiries/enterprise/route.ts`
- Modify: `frontend/components/layout/Nav.tsx`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/types.ts`

**Interfaces:**
- Consumes: `GET /api/plans` (Task 9), `POST /api/inquiries/enterprise` (Task 7).
- Produces: a public `/pricing` page rendering three `PricingCard`s with CTAs (Sign Up / Start Trial / Contact Sales), the current plan highlighted for authenticated members, and an Enterprise contact modal.

- [ ] **Step 1: Add Plan types to `lib/types.ts`**

In `frontend/lib/types.ts`, append:

```typescript
export interface Plan {
  id: number;
  name: string;
  tier_level: 'freemium' | 'personal' | 'enterprise' | string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  search_limit_daily: number;
  detail_view_limit_daily: number;
  download_limit_monthly: number;
  is_sales_led: boolean;
  is_active: boolean;
  features: string[];
  sort_order: number;
  trial_days: number;
}

export interface SubscriptionStatus {
  id: number;
  plan_id: number;
  plan_name: string;
  tier_level: string;
  status: 'active' | 'trialing' | 'expired' | 'cancelled' | string;
  billing_cycle: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  search_limit_daily: number;
  detail_view_limit_daily: number;
  download_limit_monthly: number;
}

export interface UsageSummary {
  plan: string;
  today: { search: { used: number; limit: number }; detail_view: { used: number; limit: number } };
  this_month: { download: { used: number; limit: number } };
}
```

- [ ] **Step 2: Add `api.plans` and member helpers to `lib/api.ts`**

In `frontend/lib/api.ts`, add a `BackendPlan` interface near the other `Backend*` interfaces:

```typescript
interface BackendPlan {
  id: number;
  name: string;
  tier_level: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  search_limit_daily: number;
  detail_view_limit_daily: number;
  download_limit_monthly: number;
  is_sales_led: boolean;
  is_active: boolean;
  features: string[];
  sort_order: number;
  trial_days: number;
}
```

Add to the `api` object (before the closing `}`):

```typescript
  plans: {
    async all(): Promise<Plan[]> {
      const res = await fetchWithCache<BackendPlan[]>('/api/plans');
      return res.map(p => ({ ...p }));
    },
  },
```

Add the `Plan` import to the type import list at the top of the file.

- [ ] **Step 3: Create the public plans API proxy**

Create `frontend/app/api/plans/route.ts`:

```typescript
import { NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET() {
  const res = await fetch(`${API_BASE}/api/plans`, { next: { revalidate: 60 } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 4: Create the enterprise inquiry proxy**

Create `frontend/app/api/inquiries/enterprise/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') || '';
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/inquiries/enterprise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 5: Create the PricingCard component**

Create `frontend/components/pricing/PricingCard.tsx`:

```tsx
import Link from 'next/link';
import type { Plan } from '@/lib/types';

function priceLabel(plan: Plan): string {
  if (plan.tier_level === 'freemium') return 'Free';
  if (plan.is_sales_led) return 'Contact Sales';
  return `$${plan.price_monthly}/mo`;
}

function limitLabel(n: number): string {
  return n === 0 ? 'Unlimited' : String(n);
}

export function PricingCard({
  plan, isCurrent, memberToken,
}: { plan: Plan; isCurrent: boolean; memberToken?: string }) {
  const cta =
    plan.tier_level === 'freemium'
      ? { label: memberToken ? 'Current Plan' : 'Sign Up', href: memberToken ? null : '/register' }
      : plan.tier_level === 'personal'
        ? { label: isCurrent ? 'Current Plan' : 'Start Free Trial', href: isCurrent ? null : '/member/subscription' }
        : { label: 'Contact Sales', href: null }; // enterprise -> modal

  return (
    <div
      className={`rounded-xl border p-6 flex flex-col gap-4 ${
        isCurrent ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      }`}
    >
      <div>
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p className="mt-1 text-2xl font-bold">{priceLabel(plan)}</p>
        {plan.tier_level === 'personal' && (
          <p className="text-xs text-muted-foreground">or ${plan.price_yearly}/yr</p>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {plan.features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
        <li>• {limitLabel(plan.search_limit_daily)} daily searches</li>
        <li>• {limitLabel(plan.detail_view_limit_daily)} daily detail views</li>
        <li>• {limitLabel(plan.download_limit_monthly)} monthly downloads</li>
      </ul>
      <div className="mt-auto">
        {plan.tier_level === 'enterprise' ? (
          <EnterpriseTrigger />
        ) : cta.href ? (
          <Link
            href={cta.href}
            className="inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95"
          >
            {cta.label}
          </Link>
        ) : (
          <span className="inline-flex w-full justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground">
            {cta.label}
          </span>
        )}
      </div>
    </div>
  );
}

// Enterprise "Contact Sales" trigger + modal (client component).
import { useState } from 'react';
import { EnterpriseContactModal } from './EnterpriseContactModal';

function EnterpriseTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95"
      >
        Contact Sales
      </button>
      {open && <EnterpriseContactModal onClose={() => setOpen(false)} />}
    </>
  );
}
```

> Note: move the `import { useState } from 'react'` and the `EnterpriseContactModal` import to the top of the file (the inline placement above is for readability; consolidate all imports at the top in the actual file). Because `PricingCard` now uses `useState`, the file must be a client component — add `'use client';` as the first line of `PricingCard.tsx`. The page that renders it stays a server component.

- [ ] **Step 6: Create the EnterpriseContactModal**

Create `frontend/components/pricing/EnterpriseContactModal.tsx`:

```tsx
'use client';

import { useState } from 'react';

export function EnterpriseContactModal({ onClose }: { onClose: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/inquiries/enterprise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: companyName, use_case: useCase }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message || 'Submission failed');
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-background p-6">
          <h3 className="text-lg font-semibold">Thank you</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Our sales team will contact you shortly.
          </p>
          <button onClick={onClose} className="mt-4 rounded-md border border-border px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-border bg-background p-6 flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Contact Sales</h3>
        <label className="text-sm">
          Company name
          <input
            required maxLength={200}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Use case
          <textarea
            required maxLength={2000}
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2"
            rows={4}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Create the pricing page**

Create `frontend/app/(site)/pricing/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { PricingCard } from '@/components/pricing/PricingCard';
import { Container } from '@/components/layout/Container';
import type { Plan, SubscriptionStatus } from '@/lib/types';

export const metadata = { title: 'Pricing — UnoWire' };

async function getCurrentSubscription(): Promise<SubscriptionStatus | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;
  if (!token) return null;
  const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';
  const res = await fetch(`${API_BASE}/api/member/subscription`, {
    headers: { cookie: `member_token=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function PricingPage() {
  const [plans, current] = await Promise.all([api.plans.all(), getCurrentSubscription()]);
  const currentTier = current?.tier_level ?? null;
  const memberToken = (await cookies()).get('member_token')?.value;

  return (
    <Container className="py-12">
      <h1 className="text-3xl font-bold tracking-tight">Plans &amp; Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        Choose the plan that fits your engineering workflow.
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {plans.map((plan: Plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            isCurrent={currentTier === plan.tier_level}
            memberToken={memberToken}
          />
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 8: Add a Pricing link to the Nav**

In `frontend/components/layout/Nav.tsx`, add a Pricing link inside the auth-actions area's non-authenticated branch (or alongside Inbox/Account). Insert before the `<SearchBox />` block's closing, in the primary nav, a static link. The simplest non-disruptive addition — add inside the `<nav className="hidden lg:flex ...">` map, a hard-coded Pricing link is not possible since `tree` is dynamic. Instead add it in the auth actions row. Replace the `{memberToken ? (...) : (...)}` block's anonymous branch with:

```tsx
          ) : (
            <>
              <Link
                href="/pricing"
                className="hidden sm:block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/register"
                className="hidden sm:block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Register
              </Link>
              <Link
                href="/login"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
              >
                Sign in
              </Link>
            </>
          )}
```

And in the authenticated branch, add a Pricing link before Inbox:

```tsx
            <>
              <Link
                href="/pricing"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Pricing
              </Link>
              <Link href="/member/inbox" ...>Inbox ...</Link>
```

- [ ] **Step 9: Run the frontend build/typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts frontend/app/api/plans/route.ts frontend/app/api/inquiries/enterprise/route.ts frontend/components/pricing/PricingCard.tsx frontend/components/pricing/EnterpriseContactModal.tsx "frontend/app/(site)/pricing/page.tsx" frontend/components/layout/Nav.tsx
git commit -m "feat(membership): public pricing page, PricingCard, enterprise contact modal, nav link"
```

---

## Task 13: Frontend — Member Portal Usage & Subscription

**Files:**
- Create: `frontend/app/api/member/subscription/route.ts`
- Create: `frontend/app/api/member/usage/route.ts`
- Create: `frontend/app/api/member/subscription/trial/route.ts`
- Create: `frontend/app/api/member/subscription/cancel/route.ts`
- Create: `frontend/app/(site)/member/subscription/page.tsx`
- Create: `frontend/components/member/UsageSummaryCard.tsx`
- Create: `frontend/components/member/SubscriptionPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/member/subscription`, `GET /api/member/usage`, `POST .../trial`, `POST .../cancel` (Tasks 7).
- Produces: a member-facing subscription/usage page with progress bars and trial/cancel flows.

- [ ] **Step 1: Create the member API proxies**

Create `frontend/app/api/member/subscription/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';
export async function GET(req: NextRequest) {
  const res = await fetch(`${API_BASE}/api/member/subscription`, {
    headers: { cookie: req.headers.get('cookie') || '' },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
```

Create `frontend/app/api/member/usage/route.ts` (same pattern, path `/api/member/usage`).

Create `frontend/app/api/member/subscription/trial/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';
export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/member/subscription/trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
```

Create `frontend/app/api/member/subscription/cancel/route.ts` (same as trial but path `.../cancel`).

- [ ] **Step 2: Create UsageSummaryCard**

Create `frontend/components/member/UsageSummaryCard.tsx`:

```tsx
import type { UsageSummary } from '@/lib/types';

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const unlimited = limit === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{unlimited ? 'Unlimited' : `${used} / ${limit}`}</span>
        {!unlimited && <span className="text-muted-foreground">{pct}%</span>}
      </div>
      <div className="mt-1 h-2 rounded-full bg-secondary">
        <div className="h-2 rounded-full bg-primary" style={{ width: unlimited ? '100%' : `${pct}%` }} />
      </div>
    </div>
  );
}

export function UsageSummaryCard({ summary }: { summary: UsageSummary }) {
  return (
    <div className="rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold">Usage this period</h2>
      <p className="text-sm text-muted-foreground">Current plan: {summary.plan}</p>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">Daily searches</p>
          <ProgressBar used={summary.today.search.used} limit={summary.today.search.limit} />
        </div>
        <div>
          <p className="text-sm font-medium">Daily detail views</p>
          <ProgressBar used={summary.today.detail_view.used} limit={summary.today.detail_view.limit} />
        </div>
        <div>
          <p className="text-sm font-medium">Monthly downloads</p>
          <ProgressBar used={summary.this_month.download.used} limit={summary.this_month.download.limit} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create SubscriptionPanel (client component with trial/cancel flows)**

Create `frontend/components/member/SubscriptionPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { SubscriptionStatus } from '@/lib/types';

export function SubscriptionPanel({ subscription }: { subscription: SubscriptionStatus }) {
  const [sub, setSub] = useState(subscription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTrial() {
    if (!confirm('Start a 14-day Personal trial? You can cancel anytime.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/member/subscription/trial', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_cycle: 'monthly' }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setSub(body); else setError(body.message || 'Failed to start trial');
  }

  async function cancel() {
    if (!confirm('Cancel your subscription? You keep access until the period ends, then downgrade to Freemium.')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/member/subscription/cancel', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setSub({ ...sub, status: 'cancelled' }); else setError(body.message || 'Failed to cancel');
  }

  return (
    <div className="rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold">Subscription</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Plan</dt><dd>{sub.plan_name}</dd>
        <dt className="text-muted-foreground">Status</dt><dd className="capitalize">{sub.status}</dd>
        {sub.billing_cycle && <><dt className="text-muted-foreground">Billing</dt><dd className="capitalize">{sub.billing_cycle}</dd></>}
        {sub.trial_end && <><dt className="text-muted-foreground">Trial ends</dt><dd>{new Date(sub.trial_end).toLocaleDateString()}</dd></>}
        {sub.current_period_end && <><dt className="text-muted-foreground">Period ends</dt><dd>{new Date(sub.current_period_end).toLocaleDateString()}</dd></>}
      </dl>
      <div className="mt-4 flex gap-2">
        {sub.tier_level === 'freemium' && (
          <button onClick={startTrial} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            Start Free Trial
          </button>
        )}
        {(sub.status === 'active' || sub.status === 'trialing') && (
          <button onClick={cancel} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
            Cancel Subscription
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Create the member subscription page**

Create `frontend/app/(site)/member/subscription/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { UsageSummaryCard } from '@/components/member/UsageSummaryCard';
import { SubscriptionPanel } from '@/components/member/SubscriptionPanel';
import { Container } from '@/components/layout/Container';
import type { SubscriptionStatus, UsageSummary } from '@/lib/types';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function MemberSubscriptionPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;
  if (!token) redirect('/login');

  const headers = { cookie: `member_token=${token}` };
  const [subRes, usageRes] = await Promise.all([
    fetch(`${API_BASE}/api/member/subscription`, { headers, cache: 'no-store' }),
    fetch(`${API_BASE}/api/member/usage`, { headers, cache: 'no-store' }),
  ]);
  if (!subRes.ok || !usageRes.ok) redirect('/login');
  const subscription: SubscriptionStatus = await subRes.json();
  const usage: UsageSummary = await usageRes.json();

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-bold">Subscription &amp; Usage</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <SubscriptionPanel subscription={subscription} />
        <UsageSummaryCard summary={usage} />
      </div>
    </Container>
  );
}
```

- [ ] **Step 5: Add a nav link to the member area**

In `frontend/app/(site)/member/layout.tsx`, add a link to `/member/subscription` in the member navigation (mirror the existing Inbox/Account links). If there is a member nav list, append an entry `Subscription → /member/subscription`.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/api/member/subscription/ frontend/components/member/UsageSummaryCard.tsx frontend/components/member/SubscriptionPanel.tsx "frontend/app/(site)/member/subscription/page.tsx" "frontend/app/(site)/member/layout.tsx"
git commit -m "feat(membership): member portal subscription status and usage dashboard"
```

---

## Task 14: Frontend — Admin Plans Management

**Files:**
- Modify: `frontend/lib/adminModules.ts`
- Modify: `frontend/lib/adminMenuRegistry.ts`
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`
- Modify: `frontend/lib/adminApi.ts`
- Create: `frontend/app/api/admin/plans/route.ts`
- Create: `frontend/app/api/admin/plans/[id]/route.ts`
- Create: `frontend/components/admin/form/PlanForm.tsx`
- Create: `frontend/app/admin/(dashboard)/settings/plans/page.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/admin/plans` (Task 9).
- Produces: an admin Plans page under Settings with create/edit/deactivate forms.

- [ ] **Step 1: Mirror admin modules in the frontend**

In `frontend/lib/adminModules.ts`, add `plans` and `subscriptions` to the module list (mirror `backend/app/core/modules.py`):

```typescript
  { id: "plans", label: "Plans", scopeAware: false, scopeType: null },
  { id: "subscriptions", label: "Subscriptions", scopeAware: false, scopeType: null },
```

- [ ] **Step 2: Register admin pages**

In `frontend/lib/adminMenuRegistry.ts`, add to `ADMIN_PAGES`:

```typescript
  { pageId: "plans",         href: "/admin/settings/plans", defaultLabel: "Plans",         defaultIcon: "CreditCard" },
  { pageId: "subscriptions", href: "/admin/subscriptions",  defaultLabel: "Subscriptions", defaultIcon: "Repeat" },
```

- [ ] **Step 3: Map page IDs to module IDs in the sidebar**

In `frontend/components/admin/layout/AdminSidebar.tsx`, find the `PAGE_ID_TO_MODULE_ID` map (or equivalent) and add:

```typescript
  plans: "plans",
  subscriptions: "subscriptions",
```

- [ ] **Step 4: Add adminApi.plans to `lib/adminApi.ts`**

In `frontend/lib/adminApi.ts`, add (following the existing `adminApi.*` pattern that calls `/api/admin/...` with the admin token):

```typescript
  plans: {
    async list(): Promise<Plan[]> {
      const res = await adminFetch('/api/admin/plans');
      return res.json();
    },
    async create(data: Partial<Plan>): Promise<Plan> {
      const res = await adminFetch('/api/admin/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async update(id: number, data: Partial<Plan>): Promise<Plan> {
      const res = await adminFetch(`/api/admin/plans/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async remove(id: number): Promise<void> {
      await adminFetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
    },
  },
```

(Use the existing `adminFetch` helper already present in `adminApi.ts`; if it is named differently, match the existing name. Import `Plan` from `@/lib/types`.)

- [ ] **Step 5: Create admin plan API proxies**

Create `frontend/app/api/admin/plans/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';
async function proxy(req: NextRequest, method: string, body?: BodyInit) {
  const res = await fetch(`${API_BASE}/api/admin/plans`, {
    method, headers: { cookie: req.headers.get('cookie') || '', 'Content-Type': 'application/json' }, body,
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
export async function GET(req: NextRequest) { return proxy(req, 'GET'); }
export async function POST(req: NextRequest) { return proxy(req, 'POST', await req.text()); }
```

Create `frontend/app/api/admin/plans/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${API_BASE}/api/admin/plans/${id}`, {
    method: 'PUT', headers: { cookie: req.headers.get('cookie') || '', 'Content-Type': 'application/json' },
    body: await req.text(),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await fetch(`${API_BASE}/api/admin/plans/${id}`, {
    method: 'DELETE', headers: { cookie: req.headers.get('cookie') || '' },
  });
  return new NextResponse(null, { status: res.status });
}
```

- [ ] **Step 6: Create PlanForm**

Create `frontend/components/admin/form/PlanForm.tsx` (a client component with fields for name, tier_level, price_monthly, price_yearly, search_limit_daily, detail_view_limit_daily, download_limit_monthly, trial_days, is_sales_led, is_active, features (comma-separated), sort_order). Follow the existing form component pattern in `components/admin/form/` (e.g., `ManufacturerForm.tsx`). On submit, call `adminApi.plans.update(plan.id, data)` (edit mode) or `adminApi.plans.create(data)` (create mode).

- [ ] **Step 7: Create the admin Plans page**

Create `frontend/app/admin/(dashboard)/settings/plans/page.tsx` (server component) that fetches `adminApi.plans.list()` (via the proxy with admin cookie) and renders a table with an edit form per plan + a "New Plan" form. Mirror the structure of an existing admin list+form page such as `app/admin/(dashboard)/roles/page.tsx`.

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/adminModules.ts frontend/lib/adminMenuRegistry.ts frontend/components/admin/layout/AdminSidebar.tsx frontend/lib/adminApi.ts frontend/app/api/admin/plans/ frontend/components/admin/form/PlanForm.tsx "frontend/app/admin/(dashboard)/settings/plans/page.tsx"
git commit -m "feat(membership): admin Plans management page under Settings"
```

---

## Task 15: Frontend — Admin Enterprise Subscription Management + Inquiry Filter

**Files:**
- Create: `frontend/app/api/admin/subscriptions/route.ts`
- Create: `frontend/app/api/admin/members/[id]/subscription/route.ts`
- Create: `frontend/components/admin/form/EnterpriseSubscriptionForm.tsx`
- Create: `frontend/app/admin/(dashboard)/members/[id]/subscription/page.tsx`
- Modify: `frontend/app/admin/(dashboard)/inquiries/page.tsx`
- Modify: `frontend/lib/adminApi.ts`

**Interfaces:**
- Consumes: `GET /api/admin/subscriptions`, `POST /api/admin/members/{id}/subscription`, `GET /api/admin/inquiries` (existing), inquiry `recipient_type="enterprise_sales"`.
- Produces: an admin page to create enterprise subscriptions, and an Enterprise-sales filter/label on the inquiries page.

- [ ] **Step 1: Add adminApi.subscriptions + enterpriseSubscription**

In `frontend/lib/adminApi.ts`:

```typescript
  subscriptions: {
    async list(params?: { plan?: string; status?: string }): Promise<any[]> {
      const qs = new URLSearchParams();
      if (params?.plan) qs.set('plan', params.plan);
      if (params?.status) qs.set('status', params.status);
      const res = await adminFetch(`/api/admin/subscriptions${qs.toString() ? '?' + qs : ''}`);
      return res.json();
    },
  },
  enterpriseSubscription: {
    async create(memberId: number, periodEnd: string): Promise<any> {
      const res = await adminFetch(`/api/admin/members/${memberId}/subscription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_end: periodEnd }),
      });
      return res.json();
    },
  },
```

- [ ] **Step 2: Create admin subscription API proxies**

Create `frontend/app/api/admin/subscriptions/route.ts` (GET proxy to `/api/admin/subscriptions`, forwarding cookie).

Create `frontend/app/api/admin/members/[id]/subscription/route.ts` (POST proxy to `/api/admin/members/{id}/subscription`, forwarding cookie + body).

- [ ] **Step 3: Create the EnterpriseSubscriptionForm**

Create `frontend/components/admin/form/EnterpriseSubscriptionForm.tsx` (client component) with a `period_end` date input and a submit button calling `adminApi.enterpriseSubscription.create(memberId, periodEnd)`. Show success/error feedback.

- [ ] **Step 4: Create the admin member subscription page**

Create `frontend/app/admin/(dashboard)/members/[id]/subscription/page.tsx` (server component) that renders the member's current subscription (from `adminApi.subscriptions.list()` filtered by member, or a dedicated fetch) plus the `EnterpriseSubscriptionForm` bound to the member id.

- [ ] **Step 5: Add Enterprise filter to the inquiries page**

In `frontend/app/admin/(dashboard)/inquiries/page.tsx`, add a filter control for `recipient_type === "enterprise_sales"` and a visible "Enterprise Sales" label badge on inquiries whose `recipient_type === "enterprise_sales"`. The existing inquiries list endpoint already returns `recipient_type`; filter client-side or pass a query param if the admin inquiries API supports it (it currently does not filter by recipient_type — filter client-side in the page).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/adminApi.ts frontend/app/api/admin/subscriptions/ "frontend/app/api/admin/members/[id]/subscription/route.ts" frontend/components/admin/form/EnterpriseSubscriptionForm.tsx "frontend/app/admin/(dashboard)/members/[id]/subscription/page.tsx" "frontend/app/admin/(dashboard)/inquiries/page.tsx"
git commit -m "feat(membership): admin enterprise subscription management and inquiry enterprise filter"
```

---

## Task 16: Integration, Migration & Frontend Verification Tests

**Files:**
- Test: `backend/tests/api/test_require_quota.py` (extend edge cases)
- Test: `backend/tests/api/test_membership_flow.py`
- Test: `backend/tests/api/test_migration_membership.py`

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Extend require_quota edge-case tests**

Append to `backend/tests/api/test_require_quota.py`:

```python
def test_detail_view_quota_blocks_member(client, db_session):
    import asyncio
    from datetime import date
    from app.models.member import Member
    from app.models.member_subscription import MemberSubscription
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.usage_record import UsageRecord
    from app.core.security import hash_password
    from sqlalchemy import select

    async def _c():
        m = Member(email="dvquota@test-member.com", password_hash=hash_password("test123456"),
                   name="DV", is_verified=True)
        db_session.add(m)
        await db_session.commit()
        await db_session.refresh(m)
        plan = (await db_session.execute(select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium"))).scalar_one()
        db_session.add(MemberSubscription(member_id=m.id, plan_id=plan.id, status="active",
            snapshot_search_limit=10, snapshot_detail_limit=1, snapshot_download_limit=0))
        db_session.add(UsageRecord(member_id=m.id, record_date=date.today(), detail_view_count=1))
        await db_session.commit()
        return m
    asyncio.run(_c())
    res = client.post("/api/member/login", json={"email": "dvquota@test-member.com", "password": "test123456"})
    h = {"Cookie": f"member_token={res.cookies.get('member_token')}"}
    # Need a real cable id; fetch one from the public list.
    cable = client.get("/api/cables?page_size=1").json()["items"][0]
    blocked = client.get(f"/api/cables/{cable['id']}", headers=h)
    assert blocked.status_code == 429


def test_download_quota_unlimited_for_freemium(client, db_session):
    import asyncio
    from app.models.member import Member
    from app.models.member_subscription import MemberSubscription
    from app.models.subscription_plan import SubscriptionPlan
    from app.core.security import hash_password
    from sqlalchemy import select

    async def _c():
        m = Member(email="dlfree@test-member.com", password_hash=hash_password("test123456"),
                   name="DL", is_verified=True)
        db_session.add(m)
        await db_session.commit()
        await db_session.refresh(m)
        plan = (await db_session.execute(select(SubscriptionPlan).where(SubscriptionPlan.tier_level == "freemium"))).scalar_one()
        db_session.add(MemberSubscription(member_id=m.id, plan_id=plan.id, status="active",
            snapshot_search_limit=10, snapshot_detail_limit=20, snapshot_download_limit=0))
        await db_session.commit()
    asyncio.run(_c())
    res = client.post("/api/member/login", json={"email": "dlfree@test-member.com", "password": "test123456"})
    h = {"Cookie": f"member_token={res.cookies.get('member_token')}"}
    # Freemium download limit is 0 (unlimited) -> never blocked, but still counted.
    resources = client.get("/api/resources?page_size=1").json().get("items", [])
    if resources:
        dl = client.get(f"/api/resources/{resources[0]['id']}/download", headers=h)
        # 200 (download served) or 404 (no file) — but NOT 429.
        assert dl.status_code != 429
```

- [ ] **Step 2: Write an end-to-end membership flow test**

Create `backend/tests/api/test_membership_flow.py`:

```python
"""End-to-end: register -> freemium -> trial -> cancel -> (lazy) downgrade."""
import asyncio
from sqlalchemy import text
from app.core.database import async_session


def _login(client, email):
    res = client.post("/api/member/login", json={"email": email, "password": "test123456"})
    assert res.status_code == 200, res.text
    return {"Cookie": f"member_token={res.cookies.get('member_token')}"}


def test_full_membership_flow(client):
    email = "flow@test-member.com"
    client.post("/api/member/register", json={
        "email": email, "password": "test123456", "name": "Flow",
    })
    h = _login(client, email)

    # Default freemium.
    sub = client.get("/api/member/subscription", headers=h).json()
    assert sub["tier_level"] == "freemium"
    assert sub["status"] == "active"

    # Start trial.
    trial = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert trial.status_code == 201
    assert trial.json()["status"] == "trialing"

    # Cannot start a second trial while one is active.
    dup = client.post("/api/member/subscription/trial", json={"billing_cycle": "monthly"}, headers=h)
    assert dup.status_code == 409

    # Cancel.
    cancel = client.post("/api/member/subscription/cancel", headers=h)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    # Usage endpoint still works post-cancel.
    usage = client.get("/api/member/usage", headers=h)
    assert usage.status_code == 200

    # Cleanup.
    async def _del():
        async with async_session() as s:
            await s.execute(text("DELETE FROM usage_records WHERE member_id IN (SELECT id FROM members WHERE email=:e)"), {"e": email})
            await s.execute(text("DELETE FROM member_subscriptions WHERE member_id IN (SELECT id FROM members WHERE email=:e)"), {"e": email})
            await s.execute(text("DELETE FROM members WHERE email=:e"), {"e": email})
            await s.commit()
    asyncio.run(_del())
```

- [ ] **Step 3: Write a migration-verification test**

Create `backend/tests/api/test_migration_membership.py`:

```python
"""Verify the migration seeded plans and that members get a freemium subscription."""
from sqlalchemy import text
from app.core.database import async_session


def test_three_plans_seeded():
    import asyncio
    async def _c():
        async with async_session() as s:
            rows = (await s.execute(text("SELECT tier_level FROM subscription_plans ORDER BY sort_order"))).all()
            return [r[0] for r in rows]
    tiers = asyncio.run(_c())
    assert tiers == ["freemium", "personal", "enterprise"]


def test_personal_yearly_cheaper_than_twelve_monthly():
    import asyncio
    async def _c():
        async with async_session() as s:
            row = (await s.execute(text(
                "SELECT price_monthly, price_yearly FROM subscription_plans WHERE tier_level='personal'"
            ))).one()
            return row
    monthly, yearly = asyncio.run(_c())
    assert float(yearly) < float(monthly) * 12


def test_existing_members_have_active_subscription():
    import asyncio
    async def _c():
        async with async_session() as s:
            total = (await s.execute(text("SELECT count(*) FROM members"))).scalar()
            with_sub = (await s.execute(text(
                "SELECT count(DISTINCT member_id) FROM member_subscriptions WHERE status IN ('active','trialing')"
            ))).scalar()
            return total, with_sub
    total, with_sub = asyncio.run(_c())
    # Every member has at least one active/trialing subscription (migration backfill + registration hook).
    assert with_sub >= total
```

- [ ] **Step 4: Run the full membership test suite**

Run: `cd backend && python -m pytest tests/api/test_require_quota.py tests/api/test_membership_flow.py tests/api/test_migration_membership.py tests/services/test_subscription_service.py tests/services/test_usage_service.py tests/api/test_admin_plans.py tests/api/test_plans_public.py -v`
Expected: all PASS.

- [ ] **Step 5: Run the entire backend suite to confirm no regressions**

Run: `cd backend && python -m pytest -q`
Expected: no new failures attributable to this change. (Pre-existing failures, if any, should be unchanged.)

- [ ] **Step 6: Frontend verification**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: build succeeds; `/pricing`, `/member/subscription`, and `/admin/settings/plans` routes compile.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/api/test_require_quota.py backend/tests/api/test_membership_flow.py backend/tests/api/test_migration_membership.py
git commit -m "test(membership): integration, end-to-end flow, and migration verification"
```

---

## Self-Review Notes

**Spec coverage check (membership-plans spec):**
- Three-tier model + seed values → Task 1 (models) + Task 2 (seed migration). ✓
- Default freemium on registration → Task 11. ✓
- Plan config editable by admin (snapshot preserves existing) → Task 9 admin CRUD + snapshot columns in Task 1. ✓
- Enterprise not self-service ("Contact Sales" → inquiry `recipient_type=enterprise_sales`) → Task 7 enterprise inquiry + Task 12 modal. ✓
- Subscription lifecycle state machine (active/trialing/expired/cancelled) → Task 4 `check_and_expire_trial` + `cancel_subscription`. ✓
- Personal trial (trial_start/trial_end, full access) → Task 4 `start_trial`. ✓
- Trial expiry → downgrade → Task 4 + Task 8 background task. ✓
- Cancellation retains access until period_end → Task 4 `cancel_subscription` + `resolve_effective_plan`. ✓
- Enterprise subscription created by admin → Task 9 `admin_create_enterprise_subscription`. ✓
- Billing cycle model (monthly/yearly, yearly < 12×monthly) → seed values + migration test. ✓
- Enterprise inquiry via existing inquiry system → Task 7. ✓
- Pricing page display (public, three cards, CTAs, current-plan highlight) → Task 12. ✓
- Admin plan management via Settings UI → Task 9 (API) + Task 14 (UI). ✓

**Spec coverage check (usage-quota spec):**
- Three action types tracked, daily aggregation, atomic `ON CONFLICT DO UPDATE` → Task 5. ✓
- Quota enforcement by plan limits, 0 = unlimited → Task 6 `require_quota`. ✓
- HTTP 429 + `X-RateLimit-Remaining: 0` + message → Task 6. ✓
- Quota check as FastAPI dependency `require_quota(action)` → Task 6. ✓
- Quota uses active subscription; cancelled-before-period-end keeps limits → Task 4 + Task 6. ✓
- Daily reset at UTC midnight (implicit, new rows) → Task 5 (date-based rows). ✓
- Monthly download reset on 1st → Task 5 `get_monthly_download_count`. ✓
- Usage query API `GET /api/member/usage` → Task 7. ✓
- Member portal usage display with progress bars + "Unlimited" → Task 13. ✓

**Known deviation (documented in Global Constraints):** `require_quota` uses OPTIONAL member auth so the existing public site (anonymous cable/equipment/terminal search and detail) keeps working. Anonymous requests pass unmetered; only authenticated members are metered/enforced. This is a deliberate adaptation of the design doc's `get_current_member`-based dependency to avoid breaking the public-facing site. The "usage not recorded for failed/no-result searches" scenario is not enforced because the atomic increment happens in the dependency before the handler returns (a documented trade-off favoring concurrency safety, per the design doc's `increment_and_check`).

**Type consistency check:** `resolve_effective_plan` returns `tuple[str, dict]` with keys `search_limit_daily`/`detail_view_limit_daily`/`download_limit_monthly` — consumed identically by `require_quota` (Task 6) and `get_usage_summary` (Task 5). `UsageService.increment_and_check(member_id, action, limit)` and `increment_usage(member_id, action)` signatures match the Task 6 callers. `SubscriptionRead` fields match what `_to_subscription_read` (Task 7) and the admin enterprise endpoint (Task 9) construct. Frontend `Plan`/`SubscriptionStatus`/`UsageSummary` types match the backend JSON shapes produced by Tasks 7 and 9.

**Execution note:** Task 6's blocking assertions require Task 10 to wire `require_quota` into the routes; execute Task 10 immediately after Task 6 and re-run `test_require_quota.py`.