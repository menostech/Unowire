---
archived-with: 2026-08-18-add-paid-subscription-checkout
status: final
---
# Paid Subscription Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paid Personal plan subscription checkout flow (Stripe + PayPal recurring) with automatic renewal, grace-period dunning, and cancellation, building on the `add-payment-gateway-foundation` change #1 substrate.

**Architecture:** `SubscriptionService` gains checkout + lifecycle methods that delegate to the existing `PaymentService`. Stripe uses Checkout Session `mode=subscription` with pre-created Price IDs stored on `SubscriptionPlan`. PayPal uses the Subscriptions API (`/v1/billing/subscriptions`). A new module `payment_webhooks.py` registers 6 handlers (Stripe 3, PayPal 3) via the existing module-level `register_webhook_handler`. A `_renewal_loop` hourly task reconciles subscription state with the gateways. Frontend gains a `/member/checkout` page and extends `SubscriptionPanel` / `PricingCard`.

**Tech Stack:** FastAPI (async), SQLAlchemy 2.0 async, Alembic, stripe Python SDK (wrapped with `asyncio.to_thread`), httpx (PayPal), pytest + pytest-asyncio + respx, Next.js App Router (frontend).

## Global Constraints

- All code, comments, database fields, and docs MUST be in English (project is global-facing).
- All middleware must use async/await (no callback style).
- `MemberSubscription.status` is `String(20)` — NOT a PostgreSQL enum. New values `paid` and `past_due` are written as plain strings. **No `ALTER TYPE` migration.**
- Reuse existing `MemberSubscription.current_period_end` — do NOT add a new `period_end` column.
- Stripe `mode=subscription` requires pre-created recurring Price objects. Price IDs are stored on `SubscriptionPlan` columns.
- All webhook state transitions must be idempotent (keyed on `gateway_subscription_id`).
- Background tasks follow the existing `asyncio.create_task` + `asyncio.sleep(3600)` pattern in `main.py` lifespan (see `_trial_expiry_loop`).
- `datetime.utcnow()` is used for all timestamps (consistent with existing code).
- Grace period is hardcoded as `GRACE_PERIOD_DAYS = 7` constant in `SubscriptionService`.
- A `paid` or `past_due` subscription blocks starting a new trial — member must cancel first.
- Feature-flag checkout with env var `PAID_CHECKOUT_ENABLED` until change #1 confirmed deployed.

## File Structure

### Backend — Modify

| File | Responsibility |
|---|---|
| `backend/app/models/member_subscription.py` | Add 4 nullable columns: `gateway`, `gateway_subscription_id`, `payment_method_id`, `grace_period_end` |
| `backend/app/models/subscription_plan.py` | Add 2 nullable columns: `stripe_price_id_monthly`, `stripe_price_id_yearly` |
| `backend/app/services/subscription.py` | Add checkout/lifecycle methods; extend `resolve_effective_plan` and `cancel_subscription` |
| `backend/app/services/payment.py` | Add `create_subscription_checkout(gateway, ...)` (Stripe + PayPal) |
| `backend/app/api/routes/member_subscription.py` | Add `POST /subscription/checkout`; extend `GET /subscription` and `POST /subscription/cancel` |
| `backend/app/schemas/member_subscription.py` | Add `CheckoutRequest`, `CheckoutResponse`; extend `SubscriptionRead` |
| `backend/app/core/config.py` | Add env vars: `stripe_price_personal_monthly`, `stripe_price_personal_yearly`, `paypal_product_id`, `paypal_plan_personal_monthly`, `paypal_plan_personal_yearly`, `paid_checkout_enabled` |
| `backend/app/main.py` | Add `_renewal_loop` task + call `payment_webhooks.register_all()` in lifespan |

### Backend — Create

| File | Responsibility |
|---|---|
| `backend/alembic/versions/r2s3t4u5v6w7_add_paid_subscription_columns.py` | Alembic migration: add 6 columns across 2 tables |
| `backend/app/services/payment_webhooks.py` | Webhook handler functions + `register_all()` |
| `backend/tests/services/test_subscription_checkout.py` | Unit tests for `SubscriptionService` new methods |
| `backend/tests/api/test_payment_webhooks.py` | Webhook handler tests |
| `backend/tests/api/test_member_subscription_checkout.py` | API endpoint tests |

### Frontend — Create

| File | Responsibility |
|---|---|
| `frontend/app/member/checkout/page.tsx` | Checkout page with gateway selection |
| `frontend/app/api/member/subscription/checkout/route.ts` | Next.js proxy route for checkout POST |

### Frontend — Modify

| File | Responsibility |
|---|---|
| `frontend/components/member/SubscriptionPanel.tsx` | Add paid/past_due UI + Cancel button for paid |
| `frontend/components/pricing/PricingCard.tsx` | Add "Start Paid Subscription" CTA for Personal |
| `frontend/lib/types.ts` | Extend `SubscriptionStatus` type with new fields |

---

## Task 1: Alembic Migration — Add Paid Subscription Columns

**Files:**
- Create: `backend/alembic/versions/r2s3t4u5v6w7_add_paid_subscription_columns.py`
- Reference: `backend/alembic/versions/q7r8s9t0u1v2_add_payment_orders_tables.py` (pattern)

**Interfaces:**
- Consumes: `member_subscriptions`, `subscription_plans` tables (existing)
- Produces: 4 new nullable columns on `member_subscriptions` (`gateway`, `gateway_subscription_id`, `payment_method_id`, `grace_period_end`); 2 new nullable columns on `subscription_plans` (`stripe_price_id_monthly`, `stripe_price_id_yearly`)

- [ ] **Step 1: Create the migration file**

```python
"""add paid subscription columns

Revision ID: r2s3t4u5v6w7
Revises: q7r8s9t0u1v2
Create Date: 2026-08-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "r2s3t4u5v6w7"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # member_subscriptions: paid lifecycle columns
    op.add_column("member_subscriptions", sa.Column("gateway", sa.String(20), nullable=True))
    op.add_column("member_subscriptions", sa.Column("gateway_subscription_id", sa.String(255), nullable=True))
    op.add_column("member_subscriptions", sa.Column("payment_method_id", sa.String(255), nullable=True))
    op.add_column("member_subscriptions", sa.Column("grace_period_end", sa.DateTime(), nullable=True))

    # subscription_plans: pre-created Stripe Price IDs
    op.add_column("subscription_plans", sa.Column("stripe_price_id_monthly", sa.String(255), nullable=True))
    op.add_column("subscription_plans", sa.Column("stripe_price_id_yearly", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("subscription_plans", "stripe_price_id_yearly")
    op.drop_column("subscription_plans", "stripe_price_id_monthly")
    op.drop_column("member_subscriptions", "grace_period_end")
    op.drop_column("member_subscriptions", "payment_method_id")
    op.drop_column("member_subscriptions", "gateway_subscription_id")
    op.drop_column("member_subscriptions", "gateway")
```

- [ ] **Step 2: Run upgrade to verify it applies**

Run: `docker compose --env-file .env.docker exec backend alembic upgrade head`
Expected: `Running upgrade q7r8s9t0u1v2 -> r2s3t4u5v6w7, add paid subscription columns`

- [ ] **Step 3: Run downgrade then upgrade to verify reversibility**

Run: `docker compose --env-file .env.docker exec backend alembic downgrade -1 && docker compose --env-file .env.docker exec backend alembic upgrade head`
Expected: both commands succeed; final state has all 6 columns.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/r2s3t4u5v6w7_add_paid_subscription_columns.py
git commit -m "feat(db): add paid subscription columns migration"
```

---

## Task 2: Update Models — MemberSubscription and SubscriptionPlan

**Files:**
- Modify: `backend/app/models/member_subscription.py`
- Modify: `backend/app/models/subscription_plan.py`

**Interfaces:**
- Consumes: columns added by Task 1 migration
- Produces: Python attributes on `MemberSubscription.gateway`, `.gateway_subscription_id`, `.payment_method_id`, `.grace_period_end`; on `SubscriptionPlan.stripe_price_id_monthly`, `.stripe_price_id_yearly`

- [ ] **Step 1: Add new columns to MemberSubscription model**

In `backend/app/models/member_subscription.py`, after the `cancelled_at` column (line 25), add:

```python
    gateway: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gateway_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    grace_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 2: Add new columns to SubscriptionPlan model**

In `backend/app/models/subscription_plan.py`, after the `trial_days` column (line 26), add:

```python
    stripe_price_id_monthly: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_price_id_yearly: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

- [ ] **Step 3: Verify the app boots and columns are queryable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.models.member_subscription import MemberSubscription; from app.models.subscription_plan import SubscriptionPlan; print(MemberSubscription.gateway, SubscriptionPlan.stripe_price_id_monthly)"`
Expected: prints the mapped column objects without error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/member_subscription.py backend/app/models/subscription_plan.py
git commit -m "feat(models): add paid subscription columns to MemberSubscription and SubscriptionPlan"
```

---

## Task 3: Extend config with gateway Price/Plan IDs and feature flag

**Files:**
- Modify: `backend/app/core/config.py:21`

**Interfaces:**
- Consumes: existing `Settings` class
- Produces: `settings.stripe_price_personal_monthly`, `.stripe_price_personal_yearly`, `.paypal_product_id`, `.paypal_plan_personal_monthly`, `.paypal_plan_personal_yearly`, `.paid_checkout_enabled`

- [ ] **Step 1: Add the new settings fields**

In `backend/app/core/config.py`, after the `payment_mode: str = "test"` line (line 21), add:

```python
    # Pre-created gateway Price/Plan IDs (fallbacks if SubscriptionPlan row is missing the value)
    stripe_price_personal_monthly: str = ""
    stripe_price_personal_yearly: str = ""
    paypal_product_id: str = ""
    paypal_plan_personal_monthly: str = ""
    paypal_plan_personal_yearly: str = ""

    # Feature flag: gate the paid checkout until change #1 is confirmed deployed
    paid_checkout_enabled: bool = False
```

- [ ] **Step 2: Verify the settings load**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.core.config import settings; print(settings.paid_checkout_enabled, settings.stripe_price_personal_monthly)"`
Expected: prints `False ` (the defaults).

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/config.py
git commit -m "feat(config): add gateway Price/Plan IDs and paid_checkout_enabled flag"
```

---

## Task 4: Extend SubscriptionService — resolve_effective_plan and new lifecycle methods

**Files:**
- Modify: `backend/app/services/subscription.py`
- Test: `backend/tests/services/test_subscription_checkout.py` (create)

**Interfaces:**
- Consumes: `MemberSubscription` new columns (Task 2), `PaymentService` (existing)
- Produces: `SubscriptionService.GRACE_PERIOD_DAYS` constant; `SubscriptionService.resolve_effective_plan` extended; new methods `create_checkout_session`, `activate_paid_subscription`, `mark_past_due`, `apply_grace_expiry`, `cancel_until_period_end`; `cancel_subscription` extended to handle `paid`

- [ ] **Step 1: Write the failing tests for resolve_effective_plan paid/past_due**

Create `backend/tests/services/test_subscription_checkout.py`:

```python
import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock

from app.services.subscription import SubscriptionService


@pytest.mark.asyncio
async def test_resolve_effective_plan_paid_returns_personal_quotas(db_session, personal_plan):
    """A paid subscription returns Personal-tier quotas."""
    from app.models.member_subscription import MemberSubscription
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="paid",
        billing_cycle="monthly",
        current_period_end=datetime.now(UTC) + timedelta(days=30),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe", gateway_subscription_id="sub_test_123",
    )
    db_session.add(sub)
    await db_session.commit()

    svc = SubscriptionService(db_session)
    tier, limits = await svc.resolve_effective_plan(1)
    assert tier == "personal"
    assert limits["search_limit_daily"] == personal_plan.search_limit_daily


@pytest.mark.asyncio
async def test_resolve_effective_plan_past_due_in_grace_returns_personal(db_session, personal_plan):
    """past_due within grace period retains Personal-tier access."""
    from app.models.member_subscription import MemberSubscription
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="past_due",
        billing_cycle="monthly",
        current_period_end=datetime.now(UTC) + timedelta(days=20),
        grace_period_end=datetime.now(UTC) + timedelta(days=5),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe", gateway_subscription_id="sub_test_456",
    )
    db_session.add(sub)
    await db_session.commit()

    svc = SubscriptionService(db_session)
    tier, limits = await svc.resolve_effective_plan(1)
    assert tier == "personal"


@pytest.mark.asyncio
async def test_resolve_effective_plan_past_due_grace_expired_returns_freemium(db_session, personal_plan):
    """past_due with grace_period_end in the past downgrades to freemium."""
    from app.models.member_subscription import MemberSubscription
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="past_due",
        billing_cycle="monthly",
        current_period_end=datetime.now(UTC) - timedelta(days=1),
        grace_period_end=datetime.now(UTC) - timedelta(days=1),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe", gateway_subscription_id="sub_test_789",
    )
    db_session.add(sub)
    await db_session.commit()

    svc = SubscriptionService(db_session)
    tier, limits = await svc.resolve_effective_plan(1)
    assert tier == "freemium"
```

Note: Assumes existing `db_session` and `personal_plan` fixtures from `conftest.py`. If `personal_plan` fixture does not exist, add a minimal one to `conftest.py` that inserts a Personal plan row.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py -v`
Expected: FAIL — `resolve_effective_plan` does not yet handle `paid`/`past_due` (returns freemium for paid).

- [ ] **Step 3: Extend resolve_effective_plan to handle paid and past_due**

In `backend/app/services/subscription.py`, replace the body of `resolve_effective_plan` (lines 27-40) with:

```python
    async def resolve_effective_plan(self, member_id: int) -> tuple[str, dict]:
        """Resolve the effective tier + quota limits, applying lazy expiry.

        Returns (tier_level, {"search_limit_daily", "detail_view_limit_daily",
        "download_limit_monthly"}).
        """
        sub = await self.get_active_subscription(member_id)
        if sub is not None:
            sub = await self.check_and_expire_trial(sub)
            now = datetime.utcnow()
            if sub.status in ("active", "trialing", "paid"):
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "past_due" and sub.grace_period_end and sub.grace_period_end > now:
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
            if sub.status == "cancelled" and sub.current_period_end and sub.current_period_end > now:
                return (await self._tier_for_plan(sub.plan_id), self._snapshot_limits(sub))
        return await self._freemium_limits()
```

Also extend `get_active_subscription` query to include `paid` and `past_due` in the status filter (line 20):

```python
            .where(MemberSubscription.status.in_(("active", "trialing", "cancelled", "paid", "past_due")))
```

- [ ] **Step 4: Run tests to verify resolve_effective_plan tests pass**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py -v -k resolve_effective_plan`
Expected: 3 PASS.

- [ ] **Step 5: Add GRACE_PERIOD_DAYS constant and new lifecycle methods**

At the top of `backend/app/services/subscription.py`, after the imports, add:

```python
GRACE_PERIOD_DAYS = 7
```

Add these methods to the `SubscriptionService` class (after `cancel_subscription`):

```python
    async def create_checkout_session(
        self, gateway: str, member_id: int, plan_id: int, billing_cycle: str
    ) -> dict:
        """Create a paid subscription checkout session at the chosen gateway.

        Validates: plan is not sales-led; member has no active paid/past_due
        subscription; billing_cycle in {monthly, yearly}. Persists an Order row,
        returns {"redirect_url": str, "order_id": int}.
        """
        from fastapi import HTTPException
        from app.services.payment import PaymentService

        if billing_cycle not in ("monthly", "yearly"):
            raise HTTPException(status_code=400, detail={"code": 400, "message": "billing_cycle must be monthly or yearly"})
        plan = await self.db.get(SubscriptionPlan, plan_id)
        if plan is None or not plan.is_active:
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Plan not found"})
        if plan.is_sales_led:
            raise HTTPException(status_code=400, detail={"code": 400, "message": "Plan is sales-led; contact sales"})
        existing = await self.get_active_subscription(member_id)
        if existing is not None and existing.status in ("paid", "past_due"):
            raise HTTPException(status_code=409, detail={"code": 409, "message": "Active paid subscription already exists"})
        if existing is not None and existing.status == "trialing":
            # trialing member may upgrade to paid — mark old trialing as expired on activation
            pass

        payment_svc = PaymentService(self.db)
        result = await payment_svc.create_subscription_checkout(
            gateway=gateway,
            member_id=member_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            plan=plan,
        )
        return result

    async def activate_paid_subscription(
        self,
        member_id: int,
        gateway: str,
        gateway_subscription_id: str,
        current_period_end: datetime,
    ) -> MemberSubscription:
        """Idempotently activate a paid subscription from a webhook event.

        If a MemberSubscription with this gateway_subscription_id already exists,
        return it unchanged. Otherwise, mark any prior trialing subscription for
        the member as expired, create a new MemberSubscription(status=paid).
        """
        from sqlalchemy import select

        # Idempotency: already activated?
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.gateway_subscription_id == gateway_subscription_id)
            .limit(1)
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            return existing

        # Expire any prior trialing/active subscription for this member
        prior = await self.get_active_subscription(member_id)
        if prior is not None and prior.status in ("trialing", "active"):
            prior.status = "expired"
            self.db.add(prior)
            await self.db.flush()

        plan = await self._get_plan_by_tier("personal")
        now = datetime.utcnow()
        sub = MemberSubscription(
            member_id=member_id,
            plan_id=plan.id,
            status="paid",
            billing_cycle=None,  # set by webhook if available
            current_period_start=now,
            current_period_end=current_period_end,
            gateway=gateway,
            gateway_subscription_id=gateway_subscription_id,
            snapshot_search_limit=plan.search_limit_daily,
            snapshot_detail_limit=plan.detail_view_limit_daily,
            snapshot_download_limit=plan.download_limit_monthly,
        )
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def mark_past_due(self, subscription_id: int, grace_days: int = GRACE_PERIOD_DAYS) -> MemberSubscription:
        """Mark a paid subscription as past_due and start the grace window."""
        sub = await self.db.get(MemberSubscription, subscription_id)
        if sub is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": 404, "message": "Subscription not found"})
        sub.status = "past_due"
        sub.grace_period_end = datetime.utcnow() + timedelta(days=grace_days)
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def apply_grace_expiry(self) -> int:
        """Batch-downgrade past_due subscriptions whose grace period has elapsed.

        Marks each as expired and creates a new freemium subscription for the
        member. Returns the count downgraded.
        """
        now = datetime.utcnow()
        stmt = (
            select(MemberSubscription)
            .where(MemberSubscription.status == "past_due")
            .where(MemberSubscription.grace_period_end < now)
        )
        result = await self.db.execute(stmt)
        count = 0
        for sub in result.scalars().all():
            sub.status = "expired"
            self.db.add(sub)
            await self.db.flush()

            freemium = await self._get_plan_by_tier("freemium")
            new_sub = MemberSubscription(
                member_id=sub.member_id,
                plan_id=freemium.id,
                status="active",
                snapshot_search_limit=freemium.search_limit_daily,
                snapshot_detail_limit=freemium.detail_view_limit_daily,
                snapshot_download_limit=freemium.download_limit_monthly,
            )
            self.db.add(new_sub)
            count += 1
        if count > 0:
            await self.db.commit()
        return count

    async def cancel_until_period_end(self, member_id: int) -> MemberSubscription:
        """Cancel a paid subscription at the gateway; retain access until period_end.

        Calls the gateway API (Stripe subscriptions.cancel with prorate=False,
        PayPal subscriptions.suspend) then marks the local subscription cancelled.
        """
        from fastapi import HTTPException
        from app.services.payment import PaymentService

        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("paid", "past_due"):
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No paid subscription to cancel"})
        if sub.gateway_subscription_id and sub.gateway:
            payment_svc = PaymentService(self.db)
            await payment_svc.cancel_gateway_subscription(sub.gateway, sub.gateway_subscription_id)
        now = datetime.utcnow()
        sub.status = "cancelled"
        sub.cancelled_at = now
        if sub.current_period_end is None:
            sub.current_period_end = now
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
```

Also extend the existing `cancel_subscription` method (lines 102-118) to dispatch to `cancel_until_period_end` when the subscription is `paid`:

```python
    async def cancel_subscription(self, member_id: int) -> MemberSubscription:
        sub = await self.get_active_subscription(member_id)
        if sub is None or sub.status not in ("active", "trialing", "paid", "past_due"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail={"code": 400, "message": "No active subscription to cancel"})
        if sub.status in ("paid", "past_due"):
            return await self.cancel_until_period_end(member_id)
        now = datetime.utcnow()
        sub.status = "cancelled"
        sub.cancelled_at = now
        if sub.current_period_end is None:
            sub.current_period_end = sub.trial_end if sub.trial_end else now
        self.db.add(sub)
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
```

- [ ] **Step 6: Write failing tests for activate_paid_subscription, mark_past_due, apply_grace_expiry**

Append to `backend/tests/services/test_subscription_checkout.py`:

```python
@pytest.mark.asyncio
async def test_activate_paid_subscription_idempotent(db_session, personal_plan, freemium_plan):
    """Activating with the same gateway_subscription_id twice is a no-op the second time."""
    from app.services.subscription import SubscriptionService
    svc = SubscriptionService(db_session)
    period_end = datetime.now(UTC) + timedelta(days=30)
    sub1 = await svc.activate_paid_subscription(
        member_id=1, gateway="stripe",
        gateway_subscription_id="sub_idem_1",
        current_period_end=period_end,
    )
    assert sub1.status == "paid"
    sub2 = await svc.activate_paid_subscription(
        member_id=1, gateway="stripe",
        gateway_subscription_id="sub_idem_1",
        current_period_end=period_end,
    )
    assert sub2.id == sub1.id  # same row, no duplicate


@pytest.mark.asyncio
async def test_mark_past_due_sets_grace(db_session, personal_plan):
    """mark_past_due flips paid to past_due and sets grace_period_end."""
    from app.models.member_subscription import MemberSubscription
    from app.services.subscription import SubscriptionService, GRACE_PERIOD_DAYS
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="paid",
        billing_cycle="monthly",
        current_period_end=datetime.now(UTC) + timedelta(days=30),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe", gateway_subscription_id="sub_pd_1",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    before = datetime.utcnow()
    svc = SubscriptionService(db_session)
    updated = await svc.mark_past_due(sub.id)
    assert updated.status == "past_due"
    assert updated.grace_period_end is not None
    # grace_period_end should be ~7 days from now
    delta = updated.grace_period_end - before
    assert timedelta(days=GRACE_PERIOD_DAYS - 1) <= delta <= timedelta(days=GRACE_PERIOD_DAYS + 1)


@pytest.mark.asyncio
async def test_apply_grace_expiry_downgrades_past_due(db_session, personal_plan, freemium_plan):
    """apply_grace_expiry downgrades past_due subscriptions whose grace expired."""
    from app.models.member_subscription import MemberSubscription
    from app.services.subscription import SubscriptionService
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="past_due",
        billing_cycle="monthly",
        current_period_end=datetime.now(UTC) - timedelta(days=1),
        grace_period_end=datetime.now(UTC) - timedelta(days=1),
        snapshot_search_limit=personal_plan.search_limit_daily,
        snapshot_detail_limit=personal_plan.detail_view_limit_daily,
        snapshot_download_limit=personal_plan.download_limit_monthly,
        gateway="stripe", gateway_subscription_id="sub_ge_1",
    )
    db_session.add(sub)
    await db_session.commit()

    svc = SubscriptionService(db_session)
    count = await svc.apply_grace_expiry()
    assert count == 1
    await db_session.refresh(sub)
    assert sub.status == "expired"
```

- [ ] **Step 7: Run all tests in the file**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py -v`
Expected: 6 PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/subscription.py backend/tests/services/test_subscription_checkout.py
git commit -m "feat(subscription): add paid/past_due lifecycle methods and extend resolve_effective_plan"
```

---

## Task 5: Extend PaymentService — create_subscription_checkout and cancel_gateway_subscription

**Files:**
- Modify: `backend/app/services/payment.py`

**Interfaces:**
- Consumes: `SubscriptionPlan` (for `stripe_price_id_monthly` / `stripe_price_id_yearly`), `settings` (for PayPal plan IDs)
- Produces: `PaymentService.create_subscription_checkout(gateway, member_id, plan_id, billing_cycle, plan) -> {"redirect_url": str, "order_id": int}`; `PaymentService.cancel_gateway_subscription(gateway, gateway_subscription_id)`

- [ ] **Step 1: Write failing test for create_subscription_checkout (Stripe)**

Append to `backend/tests/services/test_subscription_checkout.py`:

```python
@pytest.mark.asyncio
async def test_create_subscription_checkout_stripe(db_session, personal_plan, monkeypatch):
    """Stripe checkout uses mode=subscription with the plan's price ID and returns a redirect URL."""
    from app.services.payment import PaymentService

    personal_plan.stripe_price_id_monthly = "price_test_monthly"
    db_session.add(personal_plan)
    await db_session.commit()

    fake_session = MagicMock()
    fake_session.id = "cs_test_123"
    fake_session.url = "https://checkout.stripe.com/c/pay/cs_test_123"

    async def fake_create(*args, **kwargs):
        return fake_session

    monkeypatch.setattr("stripe.checkout.Session.create", fake_create)

    svc = PaymentService(db_session)
    result = await svc.create_subscription_checkout(
        gateway="stripe", member_id=1, plan_id=personal_plan.id,
        billing_cycle="monthly", plan=personal_plan,
    )
    assert "redirect_url" in result
    assert result["redirect_url"].startswith("https://checkout.stripe.com/")
    # Order row was persisted
    from app.models.order import Order
    from sqlalchemy import select
    stmt = select(Order).where(Order.gateway == "stripe").where(Order.member_id == 1)
    order = (await db_session.execute(stmt)).scalar_one()
    assert order.status == "pending"
    assert order.gateway_order_id == "cs_test_123"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py::test_create_subscription_checkout_stripe -v`
Expected: FAIL — `PaymentService` has no `create_subscription_checkout` method.

- [ ] **Step 3: Add create_subscription_checkout and cancel_gateway_subscription to PaymentService**

In `backend/app/services/payment.py`, add these methods to the `PaymentService` class (after the existing `refund_payment` method, before the Stripe provider section):

```python
    async def create_subscription_checkout(
        self,
        gateway: str,
        member_id: int,
        plan_id: int,
        billing_cycle: str,
        plan,
    ) -> dict:
        """Create a recurring subscription checkout at the gateway.

        Persists an Order row (status=pending) and returns
        {"redirect_url": str, "order_id": int}.
        """
        if gateway == "stripe":
            intent_id, redirect_url = await self._stripe_create_subscription_session(
                member_id, plan_id, billing_cycle, plan
            )
        elif gateway == "paypal":
            intent_id, redirect_url = await self._paypal_create_subscription(
                member_id, plan_id, billing_cycle
            )
        else:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
            )

        order = Order(
            member_id=member_id,
            plan_id=plan_id,
            billing_cycle=billing_cycle,
            gateway=gateway,
            gateway_order_id=intent_id,
            amount_cents=0,  # recurring; amount determined by gateway price
            currency="usd",
            status="pending",
        )
        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(order)
        return {"redirect_url": redirect_url, "order_id": order.id}

    async def cancel_gateway_subscription(self, gateway: str, gateway_subscription_id: str) -> None:
        """Cancel a subscription at the gateway (at period end)."""
        if gateway == "stripe":
            await self._stripe_cancel_subscription(gateway_subscription_id)
        elif gateway == "paypal":
            await self._paypal_suspend_subscription(gateway_subscription_id)
        else:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": f"Unsupported gateway: {gateway}"},
            )
```

Then add the provider helper methods in the Stripe provider section:

```python
    async def _stripe_create_subscription_session(
        self, member_id: int, plan_id: int, billing_cycle: str, plan
    ) -> tuple[str, str]:
        self._init_stripe()
        price_id = plan.stripe_price_id_monthly if billing_cycle == "monthly" else plan.stripe_price_id_yearly
        if not price_id:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=502,
                detail={"code": 502, "message": f"Stripe Price ID for {billing_cycle} not configured on plan"},
            )
        success_url = settings.public_base_url + "/member/billing?status=success"
        cancel_url = settings.public_base_url + "/member/checkout?status=cancelled"
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(member_id),
        )
        return session.id, session.url

    async def _stripe_cancel_subscription(self, subscription_id: str) -> None:
        self._init_stripe()
        await asyncio.to_thread(
            stripe.Subscription.delete,
            subscription_id,
            prorate=False,
        )

    async def _stripe_retrieve_subscription(self, subscription_id: str) -> dict:
        self._init_stripe()
        sub = await asyncio.to_thread(stripe.Subscription.retrieve, subscription_id)
        return {
            "status": getattr(sub, "status", ""),
            "current_period_end": getattr(sub, "current_period_end", None),
        }
```

And in the PayPal provider section:

```python
    async def _paypal_create_subscription(
        self, member_id: int, plan_id: int, billing_cycle: str
    ) -> tuple[str, str]:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        plan_id_pp = (
            settings.paypal_plan_personal_monthly
            if billing_cycle == "monthly"
            else settings.paypal_plan_personal_yearly
        )
        if not plan_id_pp:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=502,
                detail={"code": 502, "message": f"PayPal Plan ID for {billing_cycle} not configured"},
            )
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions"
        body = {
            "plan_id": plan_id_pp,
            "custom_id": str(member_id),
            "application_context": {
                "return_url": settings.public_base_url + "/member/billing?status=success",
                "cancel_url": settings.public_base_url + "/member/checkout?status=cancelled",
                "user_action": "SUBSCRIBE_NOW",
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        sub_id = data["id"]
        approve_url = ""
        for link in data.get("links", []):
            if link.get("rel") == "approve":
                approve_url = link.get("href", "")
                break
        return sub_id, approve_url

    async def _paypal_suspend_subscription(self, subscription_id: str) -> None:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions/{subscription_id}/suspend"
        body = {"reason": "User requested cancellation"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=self._paypal_headers(token))
            # 204 is success; 422 UNPROCESSABLE_ENTITY often means already suspended
            if resp.status_code not in (204, 422):
                resp.raise_for_status()

    async def _paypal_retrieve_subscription(self, subscription_id: str) -> dict:
        self._require_paypal_config()
        token = await self._get_paypal_access_token()
        url = f"{self._paypal_base_url()}/v1/billing/subscriptions/{subscription_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._paypal_headers(token))
            resp.raise_for_status()
            data = resp.json()
        next_billing_time = (data.get("billing_info") or {}).get("next_billing_time")
        return {
            "status": data.get("status", ""),
            "current_period_end": next_billing_time,
        }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py::test_create_subscription_checkout_stripe -v`
Expected: PASS.

- [ ] **Step 5: Write and run a PayPal checkout test using respx**

Append to `backend/tests/services/test_subscription_checkout.py`:

```python
@pytest.mark.asyncio
async def test_create_subscription_checkout_paypal(db_session, personal_plan, monkeypatch):
    """PayPal checkout creates a subscription via /v1/billing/subscriptions and returns the approve URL."""
    import respx
    from app.services.payment import PaymentService

    async def fake_token(self):
        return "fake_token"
    monkeypatch.setattr(PaymentService, "_get_paypal_access_token", fake_token)

    with respx.mock(base_url="https://api-m.sandbox.paypal.com") as mock:
        mock.post("/v1/billing/subscriptions").respond(
            201,
            json={
                "id": "I-TESTSUB123",
                "links": [
                    {"rel": "approve", "href": "https://www.sandbox.paypal.com/approve?token=abc"},
                ],
            },
        )
        svc = PaymentService(db_session)
        result = await svc.create_subscription_checkout(
            gateway="paypal", member_id=1, plan_id=personal_plan.id,
            billing_cycle="monthly", plan=personal_plan,
        )
    assert result["redirect_url"] == "https://www.sandbox.paypal.com/approve?token=abc"
    from app.models.order import Order
    from sqlalchemy import select
    stmt = select(Order).where(Order.gateway == "paypal").where(Order.member_id == 1)
    order = (await db_session.execute(stmt)).scalar_one()
    assert order.gateway_order_id == "I-TESTSUB123"
```

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py::test_create_subscription_checkout_paypal -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/payment.py backend/tests/services/test_subscription_checkout.py
git commit -m "feat(payment): add create_subscription_checkout and cancel_gateway_subscription"
```

---

## Task 6: Schemas — CheckoutRequest, CheckoutResponse, extended SubscriptionRead

**Files:**
- Modify: `backend/app/schemas/member_subscription.py`

**Interfaces:**
- Consumes: existing `SubscriptionRead` schema
- Produces: `CheckoutRequest`, `CheckoutResponse`; `SubscriptionRead` with `gateway`, `gateway_subscription_id`, `grace_period_end`

- [ ] **Step 1: Read the existing schema file to find SubscriptionRead**

Run: read `backend/app/schemas/member_subscription.py` and locate the `SubscriptionRead` class and imports.

- [ ] **Step 2: Add new schemas and extend SubscriptionRead**

Add to `backend/app/schemas/member_subscription.py`:

```python
class CheckoutRequest(BaseModel):
    gateway: str  # "stripe" | "paypal"
    plan_id: int
    billing_cycle: str  # "monthly" | "yearly"


class CheckoutResponse(BaseModel):
    redirect_url: str
    order_id: int
```

Extend the existing `SubscriptionRead` class to add (preserve all existing fields):

```python
    gateway: str | None = None
    gateway_subscription_id: str | None = None
    grace_period_end: datetime | None = None
```

- [ ] **Step 3: Verify schemas import and validate**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.schemas.member_subscription import CheckoutRequest, CheckoutResponse, SubscriptionRead; print(SubscriptionRead.model_fields.keys())"`
Expected: includes `gateway`, `gateway_subscription_id`, `grace_period_end` among the keys.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/member_subscription.py
git commit -m "feat(schemas): add CheckoutRequest/CheckoutResponse and extend SubscriptionRead"
```

---

## Task 7: API Endpoint — POST /api/member/subscription/checkout

**Files:**
- Modify: `backend/app/api/routes/member_subscription.py`

**Interfaces:**
- Consumes: `SubscriptionService.create_checkout_session` (Task 4), `CheckoutRequest`/`CheckoutResponse` (Task 6)
- Produces: `POST /api/member/subscription/checkout` endpoint

- [ ] **Step 1: Write failing API test**

Create `backend/tests/api/test_member_subscription_checkout.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_checkout_stripe_returns_redirect_url(client, member_token, personal_plan):
    """POST /api/member/subscription/checkout returns redirect_url for stripe."""
    with patch("app.services.payment.PaymentService.create_subscription_checkout", new=AsyncMock(return_value={"redirect_url": "https://checkout.stripe.com/x", "order_id": 1})):
        res = await client.post(
            "/api/member/subscription/checkout",
            headers={"Authorization": f"Bearer {member_token}"},
            json={"gateway": "stripe", "plan_id": personal_plan.id, "billing_cycle": "monthly"},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["redirect_url"] == "https://checkout.stripe.com/x"
    assert "order_id" in data


@pytest.mark.asyncio
async def test_checkout_sales_led_plan_returns_400(client, member_token, enterprise_plan):
    """Sales-led plan (Enterprise) returns 400."""
    res = await client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": enterprise_plan.id, "billing_cycle": "monthly"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_checkout_invalid_billing_cycle_returns_400(client, member_token, personal_plan):
    """Invalid billing_cycle returns 400."""
    res = await client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": personal_plan.id, "billing_cycle": "weekly"},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_checkout_conflict_when_already_paid(client, member_token, paid_subscription):
    """Member with an existing paid subscription returns 409."""
    res = await client.post(
        "/api/member/subscription/checkout",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"gateway": "stripe", "plan_id": paid_subscription.plan_id, "billing_cycle": "monthly"},
    )
    assert res.status_code == 409
```

Note: Assumes `client`, `member_token`, `personal_plan`, `enterprise_plan`, `paid_subscription` fixtures. Add `paid_subscription` to `conftest.py` if missing — it should create a `MemberSubscription(status="paid")` for the test member.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_member_subscription_checkout.py -v`
Expected: FAIL — endpoint does not exist (404).

- [ ] **Step 3: Add the checkout endpoint**

In `backend/app/api/routes/member_subscription.py`, add imports at the top:

```python
from app.schemas.member_subscription import (
    CancelResponse,
    CheckoutRequest,
    CheckoutResponse,
    EnterpriseInquiryCreate,
    SubscriptionRead,
    TrialRequest,
)
```

Then add the endpoint (after the `/subscription/trial` route):

```python
@router.post("/subscription/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    """Create a paid subscription checkout session at the chosen gateway.

    Returns {redirect_url, order_id}. The frontend redirects to redirect_url.
    """
    svc = SubscriptionService(db)
    result = await svc.create_checkout_session(
        gateway=body.gateway,
        member_id=member.id,
        plan_id=body.plan_id,
        billing_cycle=body.billing_cycle,
    )
    return CheckoutResponse(**result)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_member_subscription_checkout.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/member_subscription.py backend/tests/api/test_member_subscription_checkout.py
git commit -m "feat(api): add POST /api/member/subscription/checkout endpoint"
```

---

## Task 8: Extend GET /subscription and cancel endpoint to surface new fields

**Files:**
- Modify: `backend/app/api/routes/member_subscription.py`
- Test: `backend/tests/api/test_member_subscription_checkout.py` (append)

**Interfaces:**
- Consumes: new `SubscriptionRead` fields (Task 6)
- Produces: `GET /subscription` returns gateway/gateway_subscription_id/grace_period_end; `POST /subscription/cancel` works for paid

- [ ] **Step 1: Write failing test for GET /subscription with paid status**

Append to `backend/tests/api/test_member_subscription_checkout.py`:

```python
@pytest.mark.asyncio
async def test_get_subscription_returns_paid_fields(client, member_token, paid_subscription):
    """GET /api/member/subscription returns gateway and grace_period_end fields for paid subs."""
    res = await client.get(
        "/api/member/subscription",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "paid"
    assert data["gateway"] == "stripe"
    assert data["gateway_subscription_id"] == paid_subscription.gateway_subscription_id


@pytest.mark.asyncio
async def test_cancel_paid_subscription_keeps_access(client, member_token, paid_subscription):
    """POST /api/member/subscription/cancel marks paid as cancelled but retains period_end."""
    with patch("app.services.payment.PaymentService.cancel_gateway_subscription", new=AsyncMock(return_value=None)):
        res = await client.post(
            "/api/member/subscription/cancel",
            headers={"Authorization": f"Bearer {member_token}"},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "cancelled"
    # current_period_end should be unchanged (in the future)
    from datetime import datetime
    assert data["current_period_end"] is not None
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_member_subscription_checkout.py::test_get_subscription_returns_paid_fields tests/api/test_member_subscription_checkout.py::test_cancel_paid_subscription_keeps_access -v`
Expected: FAIL — `_to_subscription_read` does not include the new fields; cancel does not yet handle paid.

- [ ] **Step 3: Extend _to_subscription_read to surface new fields**

In `backend/app/api/routes/member_subscription.py`, update the `_to_subscription_read` function to add the new fields:

```python
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
        gateway=sub.gateway,
        gateway_subscription_id=sub.gateway_subscription_id,
        grace_period_end=sub.grace_period_end,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_member_subscription_checkout.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/member_subscription.py backend/tests/api/test_member_subscription_checkout.py
git commit -m "feat(api): surface gateway/grace_period_end in GET /subscription and support cancel of paid"
```

---

## Task 9: Webhook Handlers Module

**Files:**
- Create: `backend/app/services/payment_webhooks.py`
- Test: `backend/tests/api/test_payment_webhooks.py` (create)

**Interfaces:**
- Consumes: `register_webhook_handler` (from `app.services.payment`), `SubscriptionService` (Task 4), `PaymentService._stripe_retrieve_subscription` (Task 5)
- Produces: `register_all()` function registering 6 handlers; handler functions for the 6 webhook event types

- [ ] **Step 1: Write failing test for the Stripe checkout.session.completed handler**

Create `backend/tests/api/test_payment_webhooks.py`:

```python
import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_stripe_checkout_completed_activates_subscription(db_session, personal_plan, freemium_plan):
    """The checkout.session.completed handler creates a paid MemberSubscription."""
    from app.services.payment_webhooks import _handle_stripe_checkout_completed

    event = {
        "id": "evt_test_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "client_reference_id": "1",
                "subscription": "sub_test_1",
            }
        },
    }
    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())

    with patch("app.services.payment_webhooks.PaymentService._stripe_retrieve_subscription", new=AsyncMock(return_value={"status": "active", "current_period_end": period_end})):
        await _handle_stripe_checkout_completed(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == "sub_test_1")
    sub = (await db_session.execute(stmt)).scalar_one()
    assert sub.status == "paid"
    assert sub.gateway == "stripe"
    assert sub.member_id == 1


@pytest.mark.asyncio
async def test_stripe_payment_failed_marks_past_due(db_session, paid_subscription):
    """The invoice.payment_failed handler flips paid to past_due with a grace window."""
    from app.services.payment_webhooks import _handle_stripe_payment_failed

    event = {
        "id": "evt_test_2",
        "type": "invoice.payment_failed",
        "data": {"object": {"subscription": paid_subscription.gateway_subscription_id}},
    }
    await _handle_stripe_payment_failed(event, event, db_session)

    await db_session.refresh(paid_subscription)
    assert paid_subscription.status == "past_due"
    assert paid_subscription.grace_period_end is not None


@pytest.mark.asyncio
async def test_stripe_payment_succeeded_clears_past_due(db_session, past_due_subscription):
    """The invoice.payment_succeeded handler rolls back past_due to paid."""
    from app.services.payment_webhooks import _handle_stripe_payment_succeeded

    new_period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    event = {
        "id": "evt_test_3",
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "subscription": past_due_subscription.gateway_subscription_id,
                "period_end": new_period_end,
            }
        },
    }
    await _handle_stripe_payment_succeeded(event, event, db_session)

    await db_session.refresh(past_due_subscription)
    assert past_due_subscription.status == "paid"
    assert past_due_subscription.grace_period_end is None


@pytest.mark.asyncio
async def test_paypal_subscription_activated(db_session, personal_plan):
    """The BILLING.SUBSCRIPTION.ACTIVATED handler creates a paid MemberSubscription."""
    from app.services.payment_webhooks import _handle_paypal_subscription_activated

    next_billing = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    event = {
        "id": "evt_pp_1",
        "event_type": "BILLING.SUBSCRIPTION.ACTIVATED",
        "resource": {
            "id": "I-PAYPALSUB1",
            "custom_id": "1",
            "billing_info": {"next_billing_time": next_billing},
        },
    }
    await _handle_paypal_subscription_activated(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == "I-PAYPALSUB1")
    sub = (await db_session.execute(stmt)).scalar_one()
    assert sub.status == "paid"
    assert sub.gateway == "paypal"


@pytest.mark.asyncio
async def test_webhook_idempotency_duplicate_event(db_session, paid_subscription):
    """Replaying the same checkout.session.completed event is a no-op (idempotent)."""
    from app.services.payment_webhooks import _handle_stripe_checkout_completed

    event = {
        "id": "evt_dup_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_dup_1",
                "client_reference_id": str(paid_subscription.member_id),
                "subscription": paid_subscription.gateway_subscription_id,
            }
        },
    }
    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())

    with patch("app.services.payment_webhooks.PaymentService._stripe_retrieve_subscription", new=AsyncMock(return_value={"status": "active", "current_period_end": period_end})):
        await _handle_stripe_checkout_completed(event, event, db_session)

    from app.models.member_subscription import MemberSubscription
    from sqlalchemy import select
    stmt = select(MemberSubscription).where(MemberSubscription.gateway_subscription_id == paid_subscription.gateway_subscription_id)
    subs = (await db_session.execute(stmt)).scalars().all()
    assert len(subs) == 1  # no duplicate created
```

Note: Add `past_due_subscription` and `paid_subscription` fixtures to `conftest.py`.

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_payment_webhooks.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the payment_webhooks module**

Create `backend/app/services/payment_webhooks.py`:

```python
"""Webhook handlers for paid subscription lifecycle events.

Registers handlers for Stripe and PayPal events via the module-level
``register_webhook_handler`` API in ``app.services.payment``. The route
layer in ``app/api/routes/payments.py`` is unchanged — handlers are
dispatched by ``dispatch_webhook_event``.

All handlers are idempotent: ``activate_paid_subscription`` keys on
``gateway_subscription_id``, and the payments table deduplicates on
``gateway_event_id`` before dispatch.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.services.payment import PaymentService, register_webhook_handler
from app.services.subscription import SubscriptionService

logger = logging.getLogger(__name__)


def _to_datetime(value) -> datetime | None:
    """Convert a Stripe (unix epoch) or PayPal (ISO 8601) timestamp to datetime."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


async def _find_subscription_by_gateway_id(
    db: AsyncSession, gateway_subscription_id: str
) -> MemberSubscription | None:
    stmt = (
        select(MemberSubscription)
        .where(MemberSubscription.gateway_subscription_id == gateway_subscription_id)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Stripe handlers
# ---------------------------------------------------------------------------

async def _handle_stripe_checkout_completed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """checkout.session.completed → activate_paid_subscription."""
    obj = event.get("data", {}).get("object", {})
    member_id_str = obj.get("client_reference_id")
    gateway_subscription_id = obj.get("subscription")
    if not member_id_str or not gateway_subscription_id:
        logger.warning("stripe checkout.session.completed missing member_id or subscription id")
        return
    try:
        member_id = int(member_id_str)
    except ValueError:
        logger.warning("stripe checkout.session.completed client_reference_id not int: %s", member_id_str)
        return

    # The session object does not expose current_period_end — fetch the subscription
    payment_svc = PaymentService(db)
    sub_info = await payment_svc._stripe_retrieve_subscription(gateway_subscription_id)
    period_end_ts = sub_info.get("current_period_end")
    period_end = _to_datetime(period_end_ts)
    if period_end is None:
        from datetime import timedelta
        period_end = datetime.utcnow() + timedelta(days=30)

    svc = SubscriptionService(db)
    await svc.activate_paid_subscription(
        member_id=member_id,
        gateway="stripe",
        gateway_subscription_id=gateway_subscription_id,
        current_period_end=period_end,
    )


async def _handle_stripe_payment_succeeded(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """invoice.payment_succeeded → extend period_end, clear past_due."""
    obj = event.get("data", {}).get("object", {})
    gateway_subscription_id = obj.get("subscription")
    period_end_ts = obj.get("period_end")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        logger.warning("stripe payment_succeeded for unknown subscription %s", gateway_subscription_id)
        return
    period_end = _to_datetime(period_end_ts)
    if period_end is not None:
        sub.current_period_end = period_end
    if sub.status == "past_due":
        sub.status = "paid"
        sub.grace_period_end = None
    db.add(sub)
    await db.commit()


async def _handle_stripe_payment_failed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """invoice.payment_failed → mark past_due."""
    obj = event.get("data", {}).get("object", {})
    gateway_subscription_id = obj.get("subscription")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        logger.warning("stripe payment_failed for unknown subscription %s", gateway_subscription_id)
        return
    svc = SubscriptionService(db)
    await svc.mark_past_due(sub.id)


# ---------------------------------------------------------------------------
# PayPal handlers
# ---------------------------------------------------------------------------

async def _handle_paypal_subscription_activated(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """BILLING.SUBSCRIPTION.ACTIVATED → activate_paid_subscription."""
    resource = event.get("resource", {})
    member_id_str = resource.get("custom_id")
    gateway_subscription_id = resource.get("id")
    if not member_id_str or not gateway_subscription_id:
        return
    try:
        member_id = int(member_id_str)
    except ValueError:
        return
    next_billing = (resource.get("billing_info") or {}).get("next_billing_time")
    period_end = _to_datetime(next_billing)
    if period_end is None:
        from datetime import timedelta
        period_end = datetime.utcnow() + timedelta(days=30)

    svc = SubscriptionService(db)
    await svc.activate_paid_subscription(
        member_id=member_id,
        gateway="paypal",
        gateway_subscription_id=gateway_subscription_id,
        current_period_end=period_end,
    )


async def _handle_paypal_payment_completed(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """PAYMENT.SALE.COMPLETED → extend period_end, clear past_due."""
    resource = event.get("resource", {})
    gateway_subscription_id = resource.get("billing_agreement_id") or resource.get("id")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        return
    # Fetch the subscription to get next_billing_time
    payment_svc = PaymentService(db)
    try:
        sub_info = await payment_svc._paypal_retrieve_subscription(gateway_subscription_id)
        period_end = _to_datetime(sub_info.get("current_period_end"))
        if period_end is not None:
            sub.current_period_end = period_end
    except Exception:
        logger.exception("paypal retrieve_subscription failed for %s", gateway_subscription_id)
    if sub.status == "past_due":
        sub.status = "paid"
        sub.grace_period_end = None
    db.add(sub)
    await db.commit()


async def _handle_paypal_subscription_cancelled(event: dict, raw_payload: dict, db: AsyncSession) -> None:
    """BILLING.SUBSCRIPTION.CANCELLED → mark cancelled, retain access until period_end."""
    resource = event.get("resource", {})
    gateway_subscription_id = resource.get("id")
    if not gateway_subscription_id:
        return
    sub = await _find_subscription_by_gateway_id(db, gateway_subscription_id)
    if sub is None:
        return
    if sub.status in ("paid", "past_due"):
        sub.status = "cancelled"
        sub.cancelled_at = datetime.utcnow()
        db.add(sub)
        await db.commit()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register_all() -> None:
    """Register all webhook handlers with the module-level registry.

    Called from app.main lifespan startup.
    """
    register_webhook_handler("stripe", "checkout.session.completed", _handle_stripe_checkout_completed)
    register_webhook_handler("stripe", "invoice.payment_succeeded", _handle_stripe_payment_succeeded)
    register_webhook_handler("stripe", "invoice.payment_failed", _handle_stripe_payment_failed)
    register_webhook_handler("paypal", "BILLING.SUBSCRIPTION.ACTIVATED", _handle_paypal_subscription_activated)
    register_webhook_handler("paypal", "PAYMENT.SALE.COMPLETED", _handle_paypal_payment_completed)
    register_webhook_handler("paypal", "BILLING.SUBSCRIPTION.CANCELLED", _handle_paypal_subscription_cancelled)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose --env-file .env.docker exec backend pytest tests/api/test_payment_webhooks.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/payment_webhooks.py backend/tests/api/test_payment_webhooks.py
git commit -m "feat(webhooks): add paid subscription lifecycle webhook handlers"
```

---

## Task 10: Register webhook handlers and add _renewal_loop in main.py

**Files:**
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `payment_webhooks.register_all()` (Task 9), `SubscriptionService.apply_grace_expiry` (Task 4), `PaymentService._stripe_retrieve_subscription` / `_paypal_retrieve_subscription` (Task 5)
- Produces: webhook handlers registered at startup; `_renewal_loop` background task running hourly

- [ ] **Step 1: Write failing test for _renewal_loop grace expiry**

Append to `backend/tests/services/test_subscription_checkout.py`:

```python
@pytest.mark.asyncio
async def test_renewal_loop_extends_period_end(db_session, paid_subscription, monkeypatch):
    """_renewal_loop's reconciliation step extends period_end from gateway state."""
    from app.services.payment import PaymentService
    from datetime import datetime, timedelta, UTC

    new_period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    async def fake_retrieve(self, sub_id):
        return {"status": "active", "current_period_end": new_period_end}
    monkeypatch.setattr(PaymentService, "_stripe_retrieve_subscription", fake_retrieve)

    # Import the reconciliation function (extracted for testability)
    from app.services.subscription_renewal import reconcile_paid_subscriptions
    await reconcile_paid_subscriptions(db_session)

    await db_session.refresh(paid_subscription)
    assert paid_subscription.status == "paid"
    # period_end was extended
    assert paid_subscription.current_period_end is not None


@pytest.mark.asyncio
async def test_renewal_loop_marks_past_due_on_failure(db_session, paid_subscription, monkeypatch):
    """When the gateway reports the subscription is past_due/ unpaid, reconcile marks it past_due."""
    from app.services.payment import PaymentService

    async def fake_retrieve(self, sub_id):
        return {"status": "past_due", "current_period_end": None}
    monkeypatch.setattr(PaymentService, "_stripe_retrieve_subscription", fake_retrieve)

    from app.services.subscription_renewal import reconcile_paid_subscriptions
    await reconcile_paid_subscriptions(db_session)

    await db_session.refresh(paid_subscription)
    assert paid_subscription.status == "past_due"
    assert paid_subscription.grace_period_end is not None


@pytest.mark.asyncio
async def test_apply_grace_expiry_in_renewal_loop(db_session, past_due_subscription):
    """_renewal_loop calls apply_grace_expiry to downgrade expired past_due subs."""
    from app.services.subscription_renewal import reconcile_paid_subscriptions
    # Force grace_period_end into the past
    past_due_subscription.grace_period_end = datetime.utcnow() - timedelta(days=1)
    db_session.add(past_due_subscription)
    await db_session.commit()

    count = await reconcile_paid_subscriptions(db_session, apply_grace=True)
    await db_session.refresh(past_due_subscription)
    assert past_due_subscription.status == "expired"
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py -v -k renewal_loop`
Expected: FAIL — `subscription_renewal` module does not exist.

- [ ] **Step 3: Create the subscription_renewal module**

Create `backend/app/services/subscription_renewal.py`:

```python
"""Subscription renewal reconciliation.

The gateways (Stripe and PayPal) perform auto-renewals on their side. This
module reconciles local state with the gateway state once per hour to catch
missed webhooks and to expire past_due grace windows.

Exported for testability; called from ``app.main._renewal_loop``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member_subscription import MemberSubscription
from app.services.payment import PaymentService
from app.services.subscription import SubscriptionService

logger = logging.getLogger(__name__)

# Subscriptions with period_end within this window are reconciled.
RENEWAL_WINDOW = timedelta(hours=1)


async def reconcile_paid_subscriptions(db: AsyncSession, apply_grace: bool = True) -> int:
    """Reconcile paid subscriptions with the gateway and expire grace windows.

    Returns the count of grace-expiry downgrades performed.
    """
    now = datetime.utcnow()
    svc = SubscriptionService(db)
    payment_svc = PaymentService(db)

    # 1. Reconcile paid subscriptions nearing period_end
    stmt = (
        select(MemberSubscription)
        .where(MemberSubscription.status == "paid")
        .where(MemberSubscription.current_period_end.isnot(None))
        .where(MemberSubscription.current_period_end < now + RENEWAL_WINDOW)
    )
    result = await db.execute(stmt)
    for sub in result.scalars().all():
        if not sub.gateway_subscription_id or not sub.gateway:
            continue
        try:
            if sub.gateway == "stripe":
                info = await payment_svc._stripe_retrieve_subscription(sub.gateway_subscription_id)
            elif sub.gateway == "paypal":
                info = await payment_svc._paypal_retrieve_subscription(sub.gateway_subscription_id)
            else:
                continue
        except Exception:
            logger.exception("reconcile: gateway retrieve failed for sub %s", sub.id)
            continue

        gw_status = info.get("status", "").lower()
        period_end = info.get("current_period_end")
        if period_end is not None:
            # Stripe returns epoch int; PayPal returns ISO string
            if isinstance(period_end, (int, float)):
                sub.current_period_end = datetime.fromtimestamp(period_end)
            elif isinstance(period_end, str):
                try:
                    sub.current_period_end = datetime.fromisoformat(period_end.replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    pass
        if gw_status in ("past_due", "unpaid", "suspended"):
            await svc.mark_past_due(sub.id)
        db.add(sub)
    await db.commit()

    # 2. Expire past_due grace windows
    if apply_grace:
        return await svc.apply_grace_expiry()
    return 0
```

- [ ] **Step 4: Run the renewal tests**

Run: `docker compose --env-file .env.docker exec backend pytest tests/services/test_subscription_checkout.py -v -k renewal_loop`
Expected: 3 PASS.

- [ ] **Step 5: Wire up _renewal_loop and register_all in main.py**

In `backend/app/main.py`, add the renewal loop function (after `_trial_expiry_loop`):

```python
async def _renewal_loop():
    """Hourly reconciliation of paid subscriptions and grace-window expiry.

    The gateways (Stripe, PayPal) auto-renew; this loop reconciles local
    state with the gateway to catch missed webhooks and to downgrade
    past_due subscriptions whose grace has elapsed.
    """
    from app.core.database import async_session
    from app.services.subscription_renewal import reconcile_paid_subscriptions
    while True:
        try:
            async with async_session() as s:
                await reconcile_paid_subscriptions(s)
        except Exception:
            logging.getLogger(__name__).exception("renewal loop failed")
        await asyncio.sleep(3600)
```

In the `lifespan` function, after `task = asyncio.create_task(_trial_expiry_loop())` (line 60), add:

```python
    # Register webhook handlers for paid subscription lifecycle
    try:
        from app.services.payment_webhooks import register_all as register_payment_webhooks
        register_payment_webhooks()
        logger.info("payment webhook handlers registered")
    except Exception:
        logging.getLogger(__name__).exception("payment webhook registration failed")

    renewal_task = asyncio.create_task(_renewal_loop())
    try:
        yield
    finally:
        task.cancel()
        renewal_task.cancel()
        for t in (task, renewal_task):
            try:
                await t
            except asyncio.CancelledError:
                pass
```

(Replace the existing `try: yield / finally: task.cancel()...` block at lines 61-68.)

- [ ] **Step 6: Verify the app boots without error**

Run: `docker compose --env-file .env.docker restart backend && docker compose --env-file .env.docker logs --tail 30 backend`
Expected: logs show `PAYMENT_MODE=...`, `payment webhook handlers registered`, no tracebacks.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/subscription_renewal.py backend/app/main.py backend/tests/services/test_subscription_checkout.py
git commit -m "feat(renewal): add _renewal_loop background task and webhook handler registration"
```

---

## Task 11: Frontend — Next.js proxy route for checkout

**Files:**
- Create: `frontend/app/api/member/subscription/checkout/route.ts`
- Reference: `frontend/app/api/member/subscription/cancel/route.ts` (pattern)

**Interfaces:**
- Consumes: backend `POST /api/member/subscription/checkout`
- Produces: frontend proxy at `/api/member/subscription/checkout`

- [ ] **Step 1: Create the proxy route**

Create `frontend/app/api/member/subscription/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('member_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/member/subscription/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/api/member/subscription/checkout/route.ts
git commit -m "feat(frontend): add checkout proxy route"
```

---

## Task 12: Frontend — /member/checkout page

**Files:**
- Create: `frontend/app/member/checkout/page.tsx`
- Modify: `frontend/lib/types.ts` (extend `SubscriptionStatus`)

**Interfaces:**
- Consumes: `/api/member/subscription/checkout` proxy (Task 11), `SubscriptionStatus` type
- Produces: `/member/checkout` page with gateway selection

- [ ] **Step 1: Extend the SubscriptionStatus type**

In `frontend/lib/types.ts`, extend the `SubscriptionStatus` type to add:

```typescript
  gateway?: string | null;
  gateway_subscription_id?: string | null;
  grace_period_end?: string | null;
```

(Add these alongside the existing fields — do not remove any.)

- [ ] **Step 2: Create the checkout page**

Create `frontend/app/member/checkout/page.tsx`:

```tsx
'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function CheckoutInner() {
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get('plan') || 'personal';
  const cycle = params.get('cycle') || 'monthly';
  const status = params.get('status');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(status === 'cancelled' ? 'Payment was cancelled. Please try again.' : null);

  async function startCheckout(gateway: 'stripe' | 'paypal') {
    setBusy(gateway);
    setError(null);
    try {
      const res = await fetch('/api/member/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway, plan_id: 2, billing_cycle: cycle }),  // plan_id 2 = Personal
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || 'Failed to start checkout');
        setBusy(null);
        return;
      }
      // Redirect to the gateway-hosted page
      window.location.href = body.redirect_url;
    } catch (e) {
      setError('Network error — please try again');
      setBusy(null);
    }
  }

  const priceLabel = cycle === 'monthly' ? '$15/month' : '$149/year';

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Subscribe to Personal</h1>
      <p className="mt-2 text-muted-foreground">
        {plan.charAt(0).toUpperCase() + plan.slice(1)} plan, billed {cycle}.
      </p>
      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex justify-between text-sm">
          <span>Plan</span><span className="font-medium capitalize">{plan}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span>Billing</span><span className="font-medium capitalize">{cycle}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span>Price</span><span className="font-medium">{priceLabel}</span>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-medium">Choose a payment method</h2>
      <div className="mt-2 flex flex-col gap-2">
        <button
          onClick={() => startCheckout('stripe')}
          disabled={busy !== null}
          className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy === 'stripe' ? 'Redirecting…' : 'Pay with Stripe'}
        </button>
        <button
          onClick={() => startCheckout('paypal')}
          disabled={busy !== null}
          className="rounded-md border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy === 'paypal' ? 'Redirecting…' : 'Pay with PayPal'}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-xs text-muted-foreground">
        <Link href="/pricing" className="underline">Back to pricing</Link>
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12">Loading…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify the page compiles**

Run: `cd frontend && npm run build` (or the project's build command)
Expected: no compile errors; `/member/checkout` route listed in output.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/member/checkout/page.tsx frontend/lib/types.ts
git commit -m "feat(frontend): add /member/checkout page with gateway selection"
```

---

## Task 13: Frontend — Extend PricingCard and SubscriptionPanel

**Files:**
- Modify: `frontend/components/pricing/PricingCard.tsx`
- Modify: `frontend/components/member/SubscriptionPanel.tsx`

**Interfaces:**
- Consumes: existing components, new `SubscriptionStatus` fields (Task 12)
- Produces: "Start Paid Subscription" CTA on PricingCard; paid/past_due UI on SubscriptionPanel

- [ ] **Step 1: Add "Start Paid Subscription" CTA to PricingCard**

In `frontend/components/pricing/PricingCard.tsx`, update the `cta` definition (lines 28-33) to add a second CTA for the Personal plan:

```tsx
  const cta =
    plan.tier_level === 'freemium'
      ? { label: memberToken ? 'Current Plan' : 'Sign Up', href: memberToken ? null : '/register' }
      : plan.tier_level === 'personal'
        ? { label: isCurrent ? 'Current Plan' : 'Start Free Trial', href: isCurrent ? null : '/member/subscription' }
        : { label: 'Contact Sales', href: null };
```

After the existing CTA button block (inside the `plan.tier_level !== 'enterprise'` branch, before the closing `</div>`), add a second button for the Personal plan:

```tsx
        ) : cta.href ? (
          <>
            <Link href={cta.href}
              className="inline-flex w-full justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              {cta.label}
            </Link>
            {!isCurrent && memberToken && (
              <Link href="/member/checkout?plan=personal&cycle=monthly"
                className="mt-2 inline-flex w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95">
                Start Paid Subscription
              </Link>
            )}
          </>
        ) : (
```

- [ ] **Step 2: Extend SubscriptionPanel with paid/past_due UI**

In `frontend/components/member/SubscriptionPanel.tsx`, replace the `<dl>` block and the button row with the following (preserve the existing state hooks):

```tsx
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Plan</dt><dd>{sub.plan_name}</dd>
        <dt className="text-muted-foreground">Status</dt><dd className="capitalize">{sub.status}</dd>
        {sub.billing_cycle && <><dt className="text-muted-foreground">Billing</dt><dd className="capitalize">{sub.billing_cycle}</dd></>}
        {sub.trial_end && <><dt className="text-muted-foreground">Trial ends</dt><dd>{new Date(sub.trial_end).toLocaleDateString()}</dd></>}
        {sub.current_period_end && <><dt className="text-muted-foreground">Period ends</dt><dd>{new Date(sub.current_period_end).toLocaleDateString()}</dd></>}
        {sub.gateway && <><dt className="text-muted-foreground">Payment</dt><dd className="capitalize">{sub.gateway}</dd></>}
      </dl>

      {sub.status === 'paid' && sub.current_period_end && (
        <p className="mt-2 text-sm text-muted-foreground">
          Active — renews on {new Date(sub.current_period_end).toLocaleDateString()}.
        </p>
      )}

      {sub.status === 'past_due' && sub.grace_period_end && (
        <div className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Payment failed.</strong> Update your payment method before {new Date(sub.grace_period_end).toLocaleDateString()} to keep your subscription.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {sub.tier_level === 'freemium' && (
          <>
            <button onClick={startTrial} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              Start Free Trial
            </button>
            <Link href="/member/checkout?plan=personal&cycle=monthly"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground text-center hover:brightness-95">
              Start Paid Subscription
            </Link>
          </>
        )}
        {sub.status === 'trialing' && (
          <Link href="/member/checkout?plan=personal&cycle=monthly"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground text-center hover:brightness-95">
            Upgrade to Paid
          </Link>
        )}
        {(sub.status === 'active' || sub.status === 'trialing' || sub.status === 'paid' || sub.status === 'past_due') && (
          <button onClick={cancel} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
            Cancel Subscription
          </button>
        )}
      </div>
```

Add `import Link from 'next/link';` at the top of the file if not already present.

- [ ] **Step 3: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: no compile errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/pricing/PricingCard.tsx frontend/components/member/SubscriptionPanel.tsx
git commit -m "feat(frontend): add paid CTA to PricingCard and paid/past_due UI to SubscriptionPanel"
```

---

## Task 14: Regression — run full backend test suite

**Files:** none modified

- [ ] **Step 1: Run the full backend test suite**

Run: `docker compose --env-file .env.docker exec backend pytest -v`
Expected: all tests pass, including the new tests from Tasks 4, 5, 7, 8, 9, 10 and existing tests from prior changes.

- [ ] **Step 2: If any failures, investigate and fix**

Common likely failures:
- Missing fixtures (`paid_subscription`, `past_due_subscription`, `personal_plan`, `enterprise_plan`) — add to `conftest.py`.
- Async mock signature mismatches — verify `AsyncMock` vs `MagicMock` usage.
- Import path errors — verify module paths in patches match actual file locations.

- [ ] **Step 3: Commit any test fixture additions**

```bash
git add backend/tests/conftest.py
git commit -m "test: add paid/past_due/personal_plan fixtures for subscription checkout tests"
```

---

## Task 15: Update tasks.md and record build check

**Files:**
- Modify: `openspec/changes/add-paid-subscription-checkout/tasks.md`

- [ ] **Step 1: Mark all tasks in tasks.md as complete**

In `openspec/changes/add-paid-subscription-checkout/tasks.md`, replace all `- [ ]` with `- [x]`.

- [ ] **Step 2: Record the build check command via comet state**

Run: `$env:COMET_SCRIPTS_DIR = "C:/Users/pc261/.trae-cn/skills/comet/scripts"; node "$env:COMET_SCRIPTS_DIR\comet-state.mjs" record-check add-paid-subscription-checkout "pytest -v backend tests" "docker compose --env-file .env.docker exec backend pytest -v"`

- [ ] **Step 3: Commit**

```bash
git add openspec/changes/add-paid-subscription-checkout/tasks.md
git commit -m "chore: mark all tasks complete for add-paid-subscription-checkout"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Covered By |
|---|---|
| Data model (4 + 2 columns) | Task 1, 2 |
| Checkout flow (Stripe + PayPal) | Task 5, 7 |
| Subscription lifecycle (paid/past_due/cancelled) | Task 4, 8 |
| Renewal loop | Task 10 |
| Webhook handlers (6 events) | Task 9 |
| API endpoints (3) | Task 7, 8 |
| Schemas | Task 6 |
| Frontend checkout page | Task 12 |
| Frontend PricingCard/SubscriptionPanel | Task 13 |
| Frontend proxy routes | Task 11 |
| Tests (unit + webhook + API) | Task 4, 5, 7, 8, 9, 10 |
| Config / env vars | Task 3 |
| Feature flag | Task 3 (`paid_checkout_enabled`) |
| Regression | Task 14 |
| tasks.md completion | Task 15 |

### Placeholder Scan

No TBD/TODO/"implement later"/"add appropriate error handling" found. All code blocks are complete.

### Type Consistency

- `create_subscription_checkout` signature consistent across Task 5 (implementation) and Task 7 (caller in `SubscriptionService.create_checkout_session`).
- `activate_paid_subscription` signature consistent across Task 4 (definition) and Task 9 (callers in webhook handlers).
- `mark_past_due` consistent across Task 4 and Task 9.
- `cancel_gateway_subscription` consistent across Task 5 (definition) and Task 4 (`cancel_until_period_end` caller).
- `reconcile_paid_subscriptions` consistent across Task 10 (definition) and `_renewal_loop` caller.
- `CheckoutRequest`/`CheckoutResponse` consistent across Task 6 (definition) and Task 7 (endpoint).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-17-paid-subscription-checkout.md`.

Per the user's standing preference (Subagent-Driven Development), I will dispatch a fresh subagent per task with two-stage review between tasks. Proceeding to `/comet-build` execution.
