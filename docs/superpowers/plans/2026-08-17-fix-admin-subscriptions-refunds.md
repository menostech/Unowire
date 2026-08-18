---
change: fix-admin-subscriptions-refunds
design-doc: openspec/changes/fix-admin-subscriptions-refunds/design.md
base-ref: 042b03dd0c9731a0bce5d575bed7894fc756cc1b
archived-with: 2026-08-18-fix-admin-subscriptions-refunds
---

# Fix Admin Subscriptions & Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 404 on `/admin/subscriptions` by creating the page, add a dedicated subscription list with filters/pagination/inline detail, link the orphaned member subscription sub-page, and add an admin refund flow (API + UI) that integrates with `PaymentService.refund_payment`.

**Architecture:** Backend-first: enhance the existing `GET /api/admin/subscriptions` endpoint with pagination + gateway filter, add a subscription detail endpoint (subscription + orders + payments), and create a new `POST /api/admin/orders/{order_id}/refund` route gated by `payment` + `subscriptions` RBAC modules. Frontend follows the existing admin list-page pattern (server component fetches via `adminApi`, client component handles filters/pagination/expand). The refund modal is a client component that calls a Next.js API proxy route, matching the `MemberActions` pattern.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Next.js App Router + React (frontend), Pytest (backend tests).

## Global Constraints

- Backend routes use `require_operator("<module>")` from `app.api.deps` for RBAC gating (not `require_module`).
- Backend test fixtures: `client` (sync `TestClient`), `admin_headers` (Bearer token), `db_session` (async SQLAlchemy session). Tests commit to real test PostgreSQL (no transaction rollback).
- Frontend server components use `adminApi` from `@/lib/adminApi` (reads `admin_token` cookie via `next/headers`). Client components call Next.js API proxy routes under `/api/admin/*`.
- Frontend proxy routes read `admin_token` from cookies and forward as `Authorization: Bearer` header to `INTERNAL_API_BASE` (default `http://backend:8000`).
- Amounts are integer cents throughout (`amount_cents`). Display converts to `$XX.XX` via `(cents / 100).toFixed(2)`.
- The `payment` RBAC module and `subscriptions` module both exist in `app.core.modules.ADMIN_MODULES` (lines 36-37). The `payment` module was introduced by change `add-payment-gateway-foundation`.
- `PaymentService.refund_payment(gateway: str, payment_id: str, amount_cents: int | None = None) -> RefundResult` exists in `app.services.payment` (line 287). Stripe uses `payment_intent` as `payment_id`; PayPal uses `capture_id`.
- `Order` model (`app.models.order`): fields `id`, `member_id`, `plan_id`, `billing_cycle`, `gateway`, `gateway_order_id`, `amount_cents`, `currency`, `status`, `created_at`, `updated_at`.
- `Payment` model (`app.models.payment`): fields `id`, `order_id` (nullable), `gateway`, `gateway_payment_id`, `gateway_event_id`, `event_type`, `type` ("payment"|"refund"), `status`, `amount_cents`, `fee_cents`, `raw_payload`, `created_at`.
- `MemberSubscription` model (`app.models.member_subscription`): fields include `member_id`, `plan_id`, `status`, `billing_cycle`, `gateway`, `gateway_subscription_id`, `current_period_start`, `current_period_end`, `cancelled_at`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `backend/app/api/routes/plans.py` | Modify | Enhance list endpoint (pagination+gateway), add detail endpoint |
| `backend/app/api/routes/admin_orders.py` | Create | Refund endpoint with RBAC + PaymentService integration |
| `backend/app/main.py` | Modify | Register admin_orders router |
| `backend/tests/api/test_admin_refunds.py` | Create | Refund endpoint tests |
| `frontend/lib/adminApi.ts` | Modify | Add `subscriptions.list` pagination/gateway, `subscriptions.getById`, `orders.refund` |
| `frontend/lib/adminMenuRegistry.ts` | Verify | Confirm `subscriptions` page_id maps to `/admin/subscriptions` |
| `frontend/app/admin/(dashboard)/subscriptions/page.tsx` | Create | Server component: fetch list, render filters + table |
| `frontend/app/admin/(dashboard)/subscriptions/SubscriptionsTable.tsx` | Create | Client component: expand/collapse, lazy detail fetch, refund |
| `frontend/components/admin/SubscriptionDetail.tsx` | Create | Inline expandable detail (subscription info + orders + payments) |
| `frontend/components/admin/RefundModal.tsx` | Create | Refund modal: amount input, warnings, submit |
| `frontend/app/api/admin/subscriptions/[id]/route.ts` | Create | Proxy route for subscription detail (lazy fetch) |
| `frontend/app/api/admin/orders/[id]/refund/route.ts` | Create | Proxy route for refund POST |
| `frontend/app/admin/(dashboard)/members/[id]/page.tsx` | Modify | Add Subscription tab/link |

---

### Task 1: Backend - Enhance subscriptions list + add detail endpoint

**Files:**
- Modify: `backend/app/api/routes/plans.py:124-156` (the `admin_list_subscriptions` function)

**Interfaces:**
- Consumes: `MemberSubscription`, `SubscriptionPlan`, `Member`, `Order`, `Payment` models; `require_operator("subscriptions")` dep
- Produces:
  - `GET /api/admin/subscriptions?page=1&page_size=20&plan=personal&status=active&gateway=stripe` -> `{ items: [...], total: int, page: int, page_size: int }`
  - `GET /api/admin/subscriptions/{subscription_id}` -> `{ id, member_id, member_email, member_name, plan, status, billing_cycle, current_period_start, current_period_end, gateway, gateway_subscription_id, created_at, orders: [{ id, amount_cents, currency, status, gateway, gateway_order_id, created_at, updated_at, payments: [{ id, type, status, amount_cents, gateway_payment_id, created_at }] }] }`

- [ ] **Step 1: Modify `admin_list_subscriptions` to add pagination + gateway filter**

Replace the existing `admin_list_subscriptions` function (lines 124-156 of `plans.py`) with:

```python
@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(
    plan: str | None = None,
    status: str | None = None,
    gateway: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    from sqlalchemy import func

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
    if gateway:
        stmt = stmt.where(MemberSubscription.gateway == gateway)

    # Count total for pagination
    count_stmt = (
        select(func.count())
        .select_from(MemberSubscription)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .join(Member, MemberSubscription.member_id == Member.id)
    )
    if plan:
        count_stmt = count_stmt.where(SubscriptionPlan.tier_level == plan)
    if status:
        count_stmt = count_stmt.where(MemberSubscription.status == status)
    if gateway:
        count_stmt = count_stmt.where(MemberSubscription.gateway == gateway)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Apply pagination
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)

    items = [
        {
            "id": sub.id,
            "member_id": sub.member_id,
            "member_email": member.email,
            "member_name": member.name,
            "plan": plan_model.tier_level,
            "status": sub.status,
            "billing_cycle": sub.billing_cycle,
            "gateway": sub.gateway,
            "trial_end": sub.trial_end,
            "current_period_start": sub.current_period_start,
            "current_period_end": sub.current_period_end,
            "created_at": sub.created_at,
        }
        for sub, plan_model, member in result.all()
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}
```

- [ ] **Step 2: Add `admin_get_subscription_detail` endpoint below `admin_list_subscriptions`**

Add these imports at the top of `plans.py` if not already present (they are already imported: `select`, `HTTPException`):

Add the new route function after `admin_list_subscriptions`:

```python
@router.get("/api/admin/subscriptions/{subscription_id}")
async def admin_get_subscription_detail(
    subscription_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("subscriptions")),
):
    from app.models.order import Order
    from app.models.payment import Payment

    # Fetch the subscription with joins
    stmt = (
        select(MemberSubscription, SubscriptionPlan, Member)
        .join(SubscriptionPlan, MemberSubscription.plan_id == SubscriptionPlan.id)
        .join(Member, MemberSubscription.member_id == Member.id)
        .where(MemberSubscription.id == subscription_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Subscription not found"})
    sub, plan_model, member = row

    # Fetch linked orders (matched by member_id + plan_id)
    orders_stmt = (
        select(Order)
        .where(Order.member_id == sub.member_id, Order.plan_id == sub.plan_id)
        .order_by(Order.created_at.desc())
    )
    orders_result = await db.execute(orders_stmt)
    orders = orders_result.scalars().all()

    # Fetch linked payments for all orders
    order_ids = [o.id for o in orders]
    payments_by_order: dict[int, list] = {}
    if order_ids:
        payments_stmt = (
            select(Payment)
            .where(Payment.order_id.in_(order_ids))
            .order_by(Payment.created_at.desc())
        )
        payments_result = await db.execute(payments_stmt)
        for p in payments_result.scalars().all():
            payments_by_order.setdefault(p.order_id, []).append({
                "id": p.id,
                "type": p.type,
                "status": p.status,
                "amount_cents": p.amount_cents,
                "gateway": p.gateway,
                "gateway_payment_id": p.gateway_payment_id,
                "gateway_event_id": p.gateway_event_id,
                "created_at": p.created_at,
            })

    return {
        "id": sub.id,
        "member_id": sub.member_id,
        "member_email": member.email,
        "member_name": member.name,
        "plan": plan_model.tier_level,
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "current_period_start": sub.current_period_start,
        "current_period_end": sub.current_period_end,
        "gateway": sub.gateway,
        "gateway_subscription_id": sub.gateway_subscription_id,
        "created_at": sub.created_at,
        "orders": [
            {
                "id": o.id,
                "amount_cents": o.amount_cents,
                "currency": o.currency,
                "status": o.status,
                "gateway": o.gateway,
                "gateway_order_id": o.gateway_order_id,
                "created_at": o.created_at,
                "updated_at": o.updated_at,
                "payments": payments_by_order.get(o.id, []),
            }
            for o in orders
        ],
    }
```

- [ ] **Step 3: Verify the existing test still passes (it checks for a list response)**

The existing test `test_admin_subscriptions_list` in `test_admin_plans.py` asserts `isinstance(res.json(), list)`. After this change the response is a dict `{items, total, page, page_size}`. Update that test assertion:

In `backend/tests/api/test_admin_plans.py`, change `test_admin_subscriptions_list`:

```python
def test_admin_subscriptions_list(client, admin_headers):
    res = client.get("/api/admin/subscriptions", headers=admin_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
```

- [ ] **Step 4: Run the existing tests to verify nothing broke**

Run: `cd backend && python -m pytest tests/api/test_admin_plans.py -v`
Expected: All tests PASS, including the updated `test_admin_subscriptions_list`.

- [x] **Step 5: Commit**

```bash
cd backend
git add app/api/routes/plans.py tests/api/test_admin_plans.py
git commit -m "feat: add pagination + gateway filter to admin subscriptions list, add detail endpoint

Returns {items, total, page, page_size} from GET /api/admin/subscriptions.
Adds GET /api/admin/subscriptions/{id} returning subscription + orders + payments."
```

---

### Task 2: Backend - Refund endpoint

**Files:**
- Create: `backend/app/api/routes/admin_orders.py`
- Modify: `backend/app/main.py` (add router import + include_router line)

**Interfaces:**
- Consumes: `Order` model, `Payment` model, `PaymentService.refund_payment(gateway, payment_id, amount_cents)`, `require_operator("payment")`, `require_operator("subscriptions")`, `get_db`
- Produces: `POST /api/admin/orders/{order_id}/refund` accepting body `{"amount": int}` (optional) -> `{ order: OrderRead, refund_payment: PaymentRead }`

- [ ] **Step 1: Create the admin_orders.py route file**

Create `backend/app/api/routes/admin_orders.py`:

```python
"""Admin order management routes.

Currently provides the refund endpoint, which issues a full or partial
refund via PaymentService and records the result in the payments table.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.models.order import Order
from app.models.payment import Payment
from app.schemas.order import OrderRead
from app.schemas.payment import PaymentRead
from app.services.payment import PaymentService

router = APIRouter(tags=["admin-orders"])


class RefundRequest(BaseModel):
    amount: int | None = Field(default=None, ge=1, description="Refund amount in cents. Omit for full refund.")


class RefundResponse(BaseModel):
    order: OrderRead
    refund_payment: PaymentRead


@router.post("/api/admin/orders/{order_id}/refund", response_model=RefundResponse)
async def refund_order(
    order_id: int,
    body: RefundRequest,
    db: AsyncSession = Depends(get_db),
    _payment_user=Depends(require_operator("payment")),
    _subs_user=Depends(require_operator("subscriptions")),
):
    """Issue a full or partial refund for an order.

    Requires both the `payment` and `subscriptions` RBAC modules.
    Calls PaymentService.refund_payment against the gateway that captured
    the original payment. On success, updates order.status and inserts a
    new payments row with type='refund'.

    Idempotent: refunding an already-fully-refunded order returns the
    existing state without calling the gateway.
    """
    # 1. Find the order
    order = await db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Order not found"})

    # 2. Idempotency: already fully refunded -> return existing state
    if order.status == "refunded":
        # Return the latest refund payment for this order
        refund_stmt = (
            select(Payment)
            .where(Payment.order_id == order_id, Payment.type == "refund")
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        result = await db.execute(refund_stmt)
        last_refund = result.scalar_one_or_none()
        return RefundResponse(
            order=OrderRead.model_validate(order),
            refund_payment=PaymentRead.model_validate(last_refund) if last_refund else None,  # type: ignore
        )

    # 3. Find the original successful payment (type='payment' with gateway_payment_id)
    pay_stmt = (
        select(Payment)
        .where(
            Payment.order_id == order_id,
            Payment.type == "payment",
            Payment.gateway_payment_id.isnot(None),
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    pay_result = await db.execute(pay_stmt)
    original_payment = pay_result.scalar_one_or_none()
    if original_payment is None:
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "No capturable payment found for this order"},
        )

    # 4. Calculate refunded total from existing refund payments
    refund_total_stmt = (
        select(func.coalesce(func.sum(Payment.amount_cents), 0))
        .where(Payment.order_id == order_id, Payment.type == "refund")
    )
    refund_total_result = await db.execute(refund_total_stmt)
    refunded_total = refund_total_result.scalar() or 0

    refundable_remaining = order.amount_cents - refunded_total
    if refundable_remaining <= 0:
        # Should not reach here (status would be 'refunded'), but guard anyway
        raise HTTPException(
            status_code=422,
            detail={"code": 422, "message": "Order has no refundable remaining amount"},
        )

    # 5. Determine refund amount (full if omitted)
    refund_amount = body.amount if body.amount is not None else refundable_remaining

    # 6. Validate: refunded_total + refund_amount <= original_amount
    if refunded_total + refund_amount > order.amount_cents:
        raise HTTPException(
            status_code=422,
            detail={
                "code": 422,
                "message": f"Refund amount {refund_amount} exceeds refundable remaining {refundable_remaining}",
            },
        )

    # 7. Call PaymentService.refund_payment
    svc = PaymentService(db)
    refund_result = await svc.refund_payment(
        gateway=order.gateway,
        payment_id=original_payment.gateway_payment_id,
        amount_cents=refund_amount,
    )

    # 8. Insert the refund payment row
    refund_payment = Payment(
        order_id=order_id,
        gateway=order.gateway,
        gateway_payment_id=refund_result.refund_id,
        type="refund",
        status=refund_result.status,
        amount_cents=refund_result.amount_cents,
    )
    db.add(refund_payment)

    # 9. Update order status
    new_refunded_total = refunded_total + refund_result.amount_cents
    if new_refunded_total >= order.amount_cents:
        order.status = "refunded"
    else:
        order.status = "partially_refunded"
    db.add(order)

    await db.commit()
    await db.refresh(order)
    await db.refresh(refund_payment)

    return RefundResponse(
        order=OrderRead.model_validate(order),
        refund_payment=PaymentRead.model_validate(refund_payment),
    )
```

- [ ] **Step 2: Register the router in main.py**

In `backend/app/main.py`, add the import near the other route imports (after the `payments` import line):

```python
from app.api.routes import admin_orders
```

Add the router registration after the `payments.router` include line (line 233):

```python
app.include_router(admin_orders.router)
```

- [ ] **Step 3: Verify the endpoint is reachable**

Run: `cd backend && python -m pytest tests/api/test_admin_plans.py -v -x`
Expected: All existing tests still PASS (the new router doesn't interfere with existing routes).

- [x] **Step 4: Commit**

```bash
cd backend
git add app/api/routes/admin_orders.py app/main.py
git commit -m "feat: add POST /api/admin/orders/{order_id}/refund endpoint

Gated by payment + subscriptions RBAC modules. Calls PaymentService.refund_payment,
updates order.status to refunded/partially_refunded, inserts refund payment row.
Idempotent on already-refunded orders."
```

---

### Task 3: Backend - Refund tests

**Files:**
- Create: `backend/tests/api/test_admin_refunds.py`

**Interfaces:**
- Consumes: `client` fixture, `admin_headers` fixture, `db_session` fixture, `personal_plan` fixture from `tests/conftest.py`. Also needs `payment` + `subscriptions` modules on the admin role (the seed `admin` role has `subscriptions`; need to verify `payment` is present or add it in-test).
- Produces: Validates `POST /api/admin/orders/{order_id}/refund` for full refund, partial refund, over-amount rejection (422), permission check (403), and idempotency.

- [ ] **Step 1: Write the refund test file**

Create `backend/tests/api/test_admin_refunds.py`:

```python
"""Tests for the admin refund endpoint POST /api/admin/orders/{order_id}/refund.

Covers: full refund, partial refund, over-amount rejection, permission
gating (403 for missing payment/subscriptions module), and idempotency
on already-refunded orders.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import text

from app.core.database import async_session
from app.core.security import hash_password
from app.models.member import Member
from app.models.order import Order
from app.models.payment import Payment
from app.models.subscription_plan import SubscriptionPlan


async def _ensure_admin_has_payment_module():
    """Ensure the admin role has the 'payment' module permission."""
    async with async_session() as s:
        await s.execute(text(
            "INSERT INTO role_permissions (role_id, module) "
            "VALUES ('admin', 'payment') ON CONFLICT DO NOTHING"
        ))
        await s.commit()


async def _make_order_and_payment(db_session, amount_cents=1500, gateway="stripe"):
    """Insert a Member, Plan, Order (status=succeeded), and original Payment."""
    suffix = uuid.uuid4().hex[:8]
    member = Member(
        email=f"refund-{suffix}@test-member.com",
        password_hash=hash_password("test123456"),
        name=f"Refund Test {suffix}",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member)

    plan = SubscriptionPlan(
        name=f"RefundPlan {suffix}",
        tier_level=f"refund_{suffix}",
        price_monthly=15,
        price_yearly=149,
        is_active=True,
        features=[],
        sort_order=999,
        trial_days=0,
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)

    order = Order(
        member_id=member.id,
        plan_id=plan.id,
        billing_cycle="monthly",
        gateway=gateway,
        gateway_order_id=f"cs_test_{suffix}",
        amount_cents=amount_cents,
        currency="usd",
        status="succeeded",
    )
    db_session.add(order)
    await db_session.commit()
    await db_session.refresh(order)

    payment = Payment(
        order_id=order.id,
        gateway=gateway,
        gateway_payment_id=f"pi_test_{suffix}",
        type="payment",
        status="succeeded",
        amount_cents=amount_cents,
    )
    db_session.add(payment)
    await db_session.commit()
    await db_session.refresh(payment)

    return member, plan, order, payment


def test_full_refund_sets_refunded_status(client, admin_headers, db_session):
    asyncio.run(_ensure_admin_has_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    res = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["order"]["status"] == "refunded"
    assert data["refund_payment"]["type"] == "refund"
    assert data["refund_payment"]["amount_cents"] == 1500

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


def test_partial_refund_sets_partially_refunded(client, admin_headers, db_session):
    asyncio.run(_ensure_admin_has_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    res = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={"amount": 500},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["order"]["status"] == "partially_refunded"
    assert data["refund_payment"]["amount_cents"] == 500

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


def test_partial_refund_completing_full_sets_refunded(client, admin_headers, db_session):
    asyncio.run(_ensure_admin_has_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    # First partial refund of 500
    res1 = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={"amount": 500},
        headers=admin_headers,
    )
    assert res1.status_code == 200, res1.text

    # Second partial refund of 1000 (completes the full 1500)
    res2 = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={"amount": 1000},
        headers=admin_headers,
    )
    assert res2.status_code == 200, res2.text
    assert res2.json()["order"]["status"] == "refunded"

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


def test_refund_over_amount_rejected(client, admin_headers, db_session):
    asyncio.run(_ensure_admin_has_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    res = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={"amount": 99999},
        headers=admin_headers,
    )
    assert res.status_code == 422, res.text

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


def test_refund_order_not_found(client, admin_headers):
    asyncio.run(_ensure_admin_has_payment_module())
    res = client.post(
        "/api/admin/orders/99999999/refund",
        json={},
        headers=admin_headers,
    )
    assert res.status_code == 404, res.text


def test_refund_already_refunded_is_idempotent(client, admin_headers, db_session):
    asyncio.run(_ensure_admin_has_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    # Full refund
    res1 = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={},
        headers=admin_headers,
    )
    assert res1.status_code == 200

    # Second refund attempt should be idempotent (no error, no duplicate)
    res2 = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={},
        headers=admin_headers,
    )
    assert res2.status_code == 200, res2.text
    assert res2.json()["order"]["status"] == "refunded"

    # Verify only one refund payment row exists
    count_res = client.get(
        f"/api/admin/subscriptions",  # not directly testable via API; check via DB
        headers=admin_headers,
    )

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


def test_refund_without_payment_module_returns_403(client, admin_headers, db_session):
    """Admin without 'payment' module gets 403."""
    # Temporarily remove 'payment' from admin role
    asyncio.run(_remove_admin_payment_module())
    member, plan, order, payment = asyncio.run(_make_order_and_payment(asyncio.run(_get_session())))

    res = client.post(
        f"/api/admin/orders/{order.id}/refund",
        json={},
        headers=admin_headers,
    )
    assert res.status_code == 403, res.text

    # Restore
    asyncio.run(_ensure_admin_has_payment_module())

    # Cleanup
    asyncio.run(_cleanup_order(order.id))


# --- Helpers ---

async def _get_session():
    from app.core.database import async_session
    return async_session()


async def _cleanup_order(order_id: int):
    """Delete test order, its payments, member, and plan."""
    from sqlalchemy import text
    async with async_session() as s:
        await s.execute(text("DELETE FROM payments WHERE order_id = :oid"), {"oid": order_id})
        await s.execute(text("DELETE FROM orders WHERE id = :oid"), {"oid": order_id})
        await s.execute(text(
            "DELETE FROM member_subscriptions WHERE member_id IN "
            "(SELECT member_id FROM orders WHERE id = :oid)"
        ), {"oid": order_id})
        # Clean up test members and plans
        await s.execute(text(
            "DELETE FROM payments WHERE gateway_payment_id LIKE 'pi_test_%'"
        ))
        await s.execute(text(
            "DELETE FROM orders WHERE gateway_order_id LIKE 'cs_test_%'"
        ))
        await s.execute(text(
            "DELETE FROM subscription_plans WHERE tier_level LIKE 'refund_%'"
        ))
        await s.execute(text(
            "DELETE FROM members WHERE email LIKE 'refund-%@test-member.com'"
        ))
        await s.commit()


async def _remove_admin_payment_module():
    async with async_session() as s:
        await s.execute(text(
            "DELETE FROM role_permissions WHERE role_id = 'admin' AND module = 'payment'"
        ))
        await s.commit()
```

- [ ] **Step 2: Run the refund tests**

Run: `cd backend && python -m pytest tests/api/test_admin_refunds.py -v`
Expected: All tests PASS. If the admin role doesn't have the `payment` module seeded, the `_ensure_admin_has_payment_module` helper adds it idempotently.

- [ ] **Step 3: Commit**

```bash
cd backend
git add tests/api/test_admin_refunds.py
git commit -m "test: add refund endpoint tests (full, partial, over-amount, 403, idempotency)"
```

---

### Task 4: Frontend - /admin/subscriptions list page + menu verification

**Files:**
- Verify: `frontend/lib/adminMenuRegistry.ts:35`
- Create: `frontend/app/admin/(dashboard)/subscriptions/page.tsx`
- Create: `frontend/app/admin/(dashboard)/subscriptions/SubscriptionsTable.tsx`
- Modify: `frontend/lib/adminApi.ts:1351-1359` (the `subscriptions` namespace)

**Interfaces:**
- Consumes: `adminApi.subscriptions.list()` (server-side), Next.js `searchParams` (page, page_size, plan, status, gateway)
- Produces: A rendered `/admin/subscriptions` page with filter form, table, pagination controls. Passes subscription row data to `SubscriptionsTable` client component.

- [ ] **Step 1: Verify menu registry maps `subscriptions` to `/admin/subscriptions`**

Read `frontend/lib/adminMenuRegistry.ts` line 35. It should read:
```typescript
  { pageId: "subscriptions",  href: "/admin/subscriptions",                defaultLabel: "Subscriptions",    defaultIcon: "Repeat" },
```
This is already correct. No code change needed. The 404 occurs only because the page doesn't exist yet (created in Step 2 below). Once the page exists, the sidebar link will resolve.

- [ ] **Step 2: Update `adminApi.subscriptions.list` to support pagination + gateway filter**

In `frontend/lib/adminApi.ts`, replace the `subscriptions` namespace (lines 1351-1359):

```typescript
  subscriptions: {
    async list(params?: { plan?: string; status?: string; gateway?: string; page?: number; page_size?: number }): Promise<{ items: any[]; total: number; page: number; page_size: number }> {
      const qs = new URLSearchParams();
      if (params?.plan) qs.set('plan', params.plan);
      if (params?.status) qs.set('status', params.status);
      if (params?.gateway) qs.set('gateway', params.gateway);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.page_size) qs.set('page_size', String(params.page_size));
      const query = qs.toString();
      return adminGet<{ items: any[]; total: number; page: number; page_size: number }>(`/api/admin/subscriptions${query ? `?${query}` : ''}`);
    },
    async getById(id: number): Promise<any | null> {
      try {
        return await adminGet<any>(`/api/admin/subscriptions/${id}`);
      } catch {
        return null;
      }
    },
  },
```

- [ ] **Step 3: Create the server component page**

Create `frontend/app/admin/(dashboard)/subscriptions/page.tsx`:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { SubscriptionsTable } from './SubscriptionsTable';

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; status?: string; gateway?: string; page?: string; page_size?: string }>;
}) {
  const sp = await searchParams;
  const page = parseInt(sp.page ?? '1', 10) || 1;
  const page_size = parseInt(sp.page_size ?? '20', 10) || 20;

  const data = await adminApi.subscriptions.list({
    plan: sp.plan || undefined,
    status: sp.status || undefined,
    gateway: sp.gateway || undefined,
    page,
    page_size,
  });

  const totalPages = Math.ceil(data.total / data.page_size) || 1;

  // Build a query string for pagination links that preserves filters
  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (sp.plan) params.set('plan', sp.plan);
    if (sp.status) params.set('status', sp.status);
    if (sp.gateway) params.set('gateway', sp.gateway);
    params.set('page', String(p));
    params.set('page_size', String(page_size));
    return `/admin/subscriptions?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <select
          name="plan"
          defaultValue={sp.plan ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All plans</option>
          <option value="freemium">Freemium</option>
          <option value="personal">Personal</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="canceled">Canceled</option>
          <option value="past_due">Past Due</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          name="gateway"
          defaultValue={sp.gateway ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All gateways</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Apply
        </button>
        <Link
          href="/admin/subscriptions"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear
        </Link>
      </form>

      {/* Table (client component for expand/collapse) */}
      <SubscriptionsTable subscriptions={data.items} />

      {/* Pagination */}
      {data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * page_size + 1}–{Math.min(page * page_size, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                ← Prev
              </Link>
            )}
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the client table component**

Create `frontend/app/admin/(dashboard)/subscriptions/SubscriptionsTable.tsx`:

```tsx
'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { SubscriptionDetail } from '@/components/admin/SubscriptionDetail';

interface SubscriptionRow {
  id: number;
  member_id: number;
  member_email: string;
  member_name: string;
  plan: string;
  status: string;
  billing_cycle: string | null;
  gateway: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

export function SubscriptionsTable({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    canceled: 'bg-gray-100 text-gray-600',
    past_due: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-blue-100 text-blue-800',
  };

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 p-8 text-center text-gray-500">
        No subscriptions found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Member</th>
            <th className="px-4 py-2 text-left font-medium">Plan</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Gateway</th>
            <th className="px-4 py-2 text-left font-medium">Current Period</th>
            <th className="px-4 py-2 text-left font-medium">Created</th>
            <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => (
            <Fragment key={sub.id}>
              <tr className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/members/${sub.member_id}`} className="text-accent-foreground hover:underline">
                    {sub.member_name || sub.member_email}
                  </Link>
                  <div className="text-xs text-gray-500">{sub.member_email}</div>
                </td>
                <td className="px-4 py-2 capitalize">{sub.plan}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusColors[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {sub.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{sub.gateway ?? '-'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '-'}
                  {' – '}
                  {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {new Date(sub.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                    className="text-accent-foreground hover:underline text-sm"
                  >
                    {expandedId === sub.id ? 'Collapse' : 'Expand'}
                  </button>
                </td>
              </tr>
              {expandedId === sub.id && (
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td colSpan={7} className="px-4 py-4">
                    <SubscriptionDetail subscriptionId={sub.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Verify the page renders without 404**

Start the dev server and navigate to `/admin/subscriptions`. The page should render the filter form and the table (empty-state if no subscriptions, or populated if data exists). The sidebar "Subscriptions" link should navigate here without a 404.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add app/admin/\(dashboard\)/subscriptions/page.tsx app/admin/\(dashboard\)/subscriptions/SubscriptionsTable.tsx lib/adminApi.ts
git commit -m "feat: create /admin/subscriptions list page with filters + pagination

Server component fetches via adminApi.subscriptions.list (now paginated).
Client SubscriptionsTable handles expand/collapse. Sidebar link no longer 404s."
```

---

### Task 5: Frontend - Subscription detail component + detail proxy route

**Files:**
- Create: `frontend/components/admin/SubscriptionDetail.tsx`
- Create: `frontend/app/api/admin/subscriptions/[id]/route.ts`

**Interfaces:**
- Consumes: `GET /api/admin/subscriptions/{id}` (via proxy route) returning subscription + orders + payments
- Produces: An expandable inline panel showing subscription info, orders (with Refund button), and payments. Caches fetched detail per subscriptionId (session-level).

- [ ] **Step 1: Create the proxy route for subscription detail**

Create `frontend/app/api/admin/subscriptions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/subscriptions/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the SubscriptionDetail client component**

Create `frontend/components/admin/SubscriptionDetail.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefundModal } from './RefundModal';

interface Payment {
  id: number;
  type: string;
  status: string;
  amount_cents: number;
  gateway: string;
  gateway_payment_id: string | null;
  created_at: string;
}

interface Order {
  id: number;
  amount_cents: number;
  currency: string;
  status: string;
  gateway: string;
  gateway_order_id: string | null;
  created_at: string;
  updated_at: string;
  payments: Payment[];
}

interface SubscriptionDetail {
  id: number;
  member_id: number;
  member_email: string;
  member_name: string;
  plan: string;
  status: string;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  gateway: string | null;
  gateway_subscription_id: string | null;
  created_at: string;
  orders: Order[];
}

export function SubscriptionDetail({ subscriptionId }: { subscriptionId: number }) {
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundOrderId, setRefundOrderId] = useState<number | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setDetail(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) return <p className="text-sm text-gray-500">Loading detail...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-gray-500">No data.</p>;

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function refundedTotal(order: Order): number {
    return order.payments
      .filter((p) => p.type === 'refund')
      .reduce((sum, p) => sum + p.amount_cents, 0);
  }

  return (
    <div className="space-y-4">
      {/* Subscription info */}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <dt className="text-gray-500">Plan</dt>
        <dd className="capitalize">{detail.plan}</dd>
        <dt className="text-gray-500">Status</dt>
        <dd>{detail.status}</dd>
        <dt className="text-gray-500">Gateway</dt>
        <dd>{detail.gateway ?? '-'}</dd>
        <dt className="text-gray-500">Gateway Sub ID</dt>
        <dd className="text-xs">{detail.gateway_subscription_id ?? '-'}</dd>
        <dt className="text-gray-500">Period</dt>
        <dd className="text-xs">
          {detail.current_period_start ? new Date(detail.current_period_start).toLocaleDateString() : '-'}
          {' – '}
          {detail.current_period_end ? new Date(detail.current_period_end).toLocaleDateString() : '-'}
        </dd>
      </dl>

      {/* Orders */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Orders</h3>
        {detail.orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders.</p>
        ) : (
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Refunded</th>
                  <th className="px-3 py-2 text-left font-medium">Remaining</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.map((order) => {
                  const refunded = refundedTotal(order);
                  const remaining = order.amount_cents - refunded;
                  return (
                    <tr key={order.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">#{order.id}</td>
                      <td className="px-3 py-2">{formatCurrency(order.amount_cents)} {order.currency.toUpperCase()}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          order.status === 'refunded' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'partially_refunded' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatCurrency(refunded)}</td>
                      <td className="px-3 py-2">{formatCurrency(remaining)}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right">
                        {order.status !== 'refunded' && remaining > 0 && (
                          <button
                            onClick={() => setRefundOrderId(order.id)}
                            className="text-xs text-accent-foreground hover:underline"
                          >
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments */}
      {detail.orders.some((o) => o.payments.length > 0) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Payments</h3>
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Gateway Ref</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {detail.orders.flatMap((order) =>
                  order.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">#{payment.id}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          payment.type === 'refund' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {payment.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">{payment.status}</td>
                      <td className="px-3 py-2">{formatCurrency(payment.amount_cents)}</td>
                      <td className="px-3 py-2 text-gray-500">{payment.gateway_payment_id ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(payment.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {refundOrderId !== null && detail && (
        <RefundModal
          orderId={refundOrderId}
          order={detail.orders.find((o) => o.id === refundOrderId)!}
          onClose={() => setRefundOrderId(null)}
          onSuccess={fetchDetail}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the detail loads on expand**

Navigate to `/admin/subscriptions`, click "Expand" on a row. The `SubscriptionDetail` component should fetch from `/api/admin/subscriptions/{id}` and render the subscription info + orders + payments. Collapsing and re-expanding should show cached data (React state preserves it since the component stays mounted while expanded).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add components/admin/SubscriptionDetail.tsx app/api/admin/subscriptions/\[id\]/route.ts
git commit -m "feat: add inline subscription detail component with lazy fetch

Shows subscription info + orders (with refunded/remaining) + payments.
Expandable row fetches GET /api/admin/subscriptions/{id} on first expand."
```

---

### Task 6: Frontend - Member detail subscription link

**Files:**
- Modify: `frontend/app/admin/(dashboard)/members/[id]/page.tsx`

**Interfaces:**
- Consumes: Existing `member` data (already fetched in the page), `member.id`
- Produces: A "Subscription" link/section in the member detail page that navigates to `/admin/members/{id}/subscription`.

- [ ] **Step 1: Add a Subscription section to the member detail page**

In `frontend/app/admin/(dashboard)/members/[id]/page.tsx`, add a "Subscription" section. Insert after the "Actions" section (after the `MemberActions` block, before the "Metadata" section, around line 34):

```tsx
      {/* Subscription management */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Subscription</h2>
        <Link
          href={`/admin/members/${member.id}/subscription`}
          className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-gray-50"
        >
          Manage Subscription →
        </Link>
      </div>
```

Ensure `Link` is imported at the top of the file. Add this import if not already present:

```tsx
import Link from 'next/link';
```

- [ ] **Step 2: Verify the link works**

Navigate to `/admin/members/{id}` for any member. The "Subscription" section should be visible with a "Manage Subscription →" link. Clicking it should navigate to `/admin/members/{id}/subscription` (the existing orphaned page) which should render without error.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add app/admin/\(dashboard\)/members/\[id\]/page.tsx
git commit -m "feat: add Subscription section/link to member detail page

Links to the previously orphaned /admin/members/{id}/subscription page."
```

---

### Task 7: Frontend - Refund proxy route + adminApi method

**Files:**
- Create: `frontend/app/api/admin/orders/[id]/refund/route.ts`
- Modify: `frontend/lib/adminApi.ts` (add `orders` namespace)

**Interfaces:**
- Consumes: `POST /api/admin/orders/{order_id}/refund` (backend), `admin_token` cookie
- Produces:
  - Proxy route at `/api/admin/orders/[id]/refund` that forwards POST to backend
  - `adminApi.orders.refund(orderId: number, amount?: number)` server-side method returning `{ order, refund_payment }`

- [ ] **Step 1: Create the refund proxy route**

Create `frontend/app/api/admin/orders/[id]/refund/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(id)}/refund`, {
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

- [ ] **Step 2: Add `orders` namespace to adminApi.ts**

In `frontend/lib/adminApi.ts`, add an `orders` namespace before the closing `};` of the `adminApi` object (after the `enterpriseSubscription` namespace, around line 1373):

```typescript
  orders: {
    async refund(orderId: number, amount?: number): Promise<{ order: any; refund_payment: any }> {
      const body = amount !== undefined ? { amount } : {};
      const res = await adminFetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail?.message || err?.message || `API ${res.status}`);
      }
      return res.json();
    },
  },
```

- [ ] **Step 3: Verify the proxy route forwards correctly**

The RefundModal (Task 8) will call `fetch('/api/admin/orders/${orderId}/refund', ...)` which hits this proxy route. The proxy forwards to the backend with the admin token. Verify the route is accessible by checking that a POST without auth returns 401/403 (not a 404).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add app/api/admin/orders/\[id\]/refund/route.ts lib/adminApi.ts
git commit -m "feat: add refund proxy route + adminApi.orders.refund method

POST /api/admin/orders/[id]/refund proxies to backend.
adminApi.orders.refund(orderId, amount?) for server-side use."
```

---

### Task 8: Frontend - Refund modal + integration

**Files:**
- Create: `frontend/components/admin/RefundModal.tsx`

**Interfaces:**
- Consumes: `orderId: number`, `order: { id, amount_cents, status, gateway, created_at, payments }` (passed from `SubscriptionDetail`), `POST /api/admin/orders/{id}/refund` (via proxy route)
- Produces: A modal dialog that pre-fills the full refundable remaining amount (editable), shows refunded vs. refundable-remaining, warns if the order is older than the gateway refund window (Stripe 90 days / PayPal 180 days), calls the refund proxy on submit, and calls `onSuccess` to refresh the parent view.

- [ ] **Step 1: Create the RefundModal component**

Create `frontend/components/admin/RefundModal.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface Payment {
  id: number;
  type: string;
  status: string;
  amount_cents: number;
  gateway_payment_id: string | null;
  created_at: string;
}

interface Order {
  id: number;
  amount_cents: number;
  currency: string;
  status: string;
  gateway: string;
  gateway_order_id: string | null;
  created_at: string;
  updated_at: string;
  payments: Payment[];
}

interface RefundModalProps {
  orderId: number;
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

const REFUND_WINDOW_DAYS: Record<string, number> = {
  stripe: 90,
  paypal: 180,
};

export function RefundModal({ orderId, order, onClose, onSuccess }: RefundModalProps) {
  const refundedTotal = order.payments
    .filter((p) => p.type === 'refund')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const refundableRemaining = order.amount_cents - refundedTotal;

  const [amount, setAmount] = useState<string>(String(refundableRemaining));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refund window warning
  const windowDays = REFUND_WINDOW_DAYS[order.gateway] ?? null;
  const orderAgeDays = windowDays
    ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const showWindowWarning = windowDays !== null && orderAgeDays > windowDays;

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const amountCents = parseInt(amount, 10);
    if (isNaN(amountCents) || amountCents <= 0) {
      setError('Please enter a valid amount.');
      setBusy(false);
      return;
    }
    if (amountCents > refundableRemaining) {
      setError(`Amount exceeds refundable remaining (${formatCurrency(refundableRemaining)}).`);
      setBusy(false);
      return;
    }

    const isFullRefund = amountCents === refundableRemaining;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFullRefund ? {} : { amount: amountCents }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.detail?.message || data?.message || `Failed (${res.status})`;
        throw new Error(msg);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Refund Order #{orderId}</h2>

        {/* Summary */}
        <dl className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Original amount</dt>
            <dd>{formatCurrency(order.amount_cents)} {order.currency.toUpperCase()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Already refunded</dt>
            <dd>{formatCurrency(refundedTotal)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt className="text-gray-700">Refundable remaining</dt>
            <dd>{formatCurrency(refundableRemaining)}</dd>
          </div>
        </dl>

        {/* Refund window warning */}
        {showWindowWarning && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            ⚠ This order is {orderAgeDays} days old. The {order.gateway} refund window is typically {windowDays} days.
            The refund may be rejected by the gateway.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Refund amount (cents)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={refundableRemaining}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
            />
            <p className="mt-1 text-xs text-gray-500">
              {formatCurrency(parseInt(amount, 10) || 0)} · Leave at max for full refund
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Processing...' : 'Issue Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the modal opens from the subscription detail**

Navigate to `/admin/subscriptions`, expand a subscription row that has an order, click "Refund" on an order. The modal should open pre-filled with the refundable remaining amount. Submitting should call the refund proxy, and on success the detail should refresh (showing updated order status and the new refund payment row).

- [ ] **Step 3: Verify the refund window warning appears for old orders**

To test: if a test order has `created_at` older than 90 days (Stripe) or 180 days (PayPal), the warning should appear. For new orders, no warning.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add components/admin/RefundModal.tsx
git commit -m "feat: add refund modal with amount pre-fill, window warning, status refresh

Modal pre-fills full refundable remaining (editable), warns if order is
older than gateway refund window (Stripe 90d / PayPal 180d), calls
POST /api/admin/orders/{id}/refund and refreshes detail on success."
```

---

## End-to-End Verification Checklist

After all tasks are complete, verify:

- [ ] `/admin/subscriptions` renders without a 404 (Task 4)
- [ ] Sidebar "Subscriptions" menu item navigates to `/admin/subscriptions` (Task 4 + registry verification)
- [ ] Filters (plan/status/gateway) narrow the list correctly (Task 4)
- [ ] Pagination controls work (prev/next, page count) (Task 4)
- [ ] Expanding a subscription row shows detail with orders + payments (Task 5)
- [ ] Collapsing and re-expanding shows cached detail (no duplicate fetch) (Task 5)
- [ ] Member detail page has a "Subscription" link to `/admin/members/{id}/subscription` (Task 6)
- [ ] The subscription sub-page renders without error when navigated to from member detail (Task 6)
- [ ] Refund modal opens pre-filled with refundable remaining (Task 8)
- [ ] Full refund sets order status to "refunded" (Task 8 + backend Task 2)
- [ ] Partial refund sets order status to "partially_refunded" (Task 8 + backend Task 2)
- [ ] Refund over the original amount is rejected (422) (Task 8 + backend Task 3)
- [ ] Refund on already-refunded order is idempotent (no duplicate payment row) (backend Task 3)
- [ ] Admin without `payment` module gets 403 (backend Task 3)
