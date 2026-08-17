import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

from app.services.subscription import SubscriptionService


@pytest.mark.asyncio
async def test_resolve_effective_plan_paid_returns_personal_quotas(db_session, personal_plan):
    """A paid subscription returns Personal-tier quotas."""
    from app.models.member_subscription import MemberSubscription
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="paid",
        billing_cycle="monthly",
        current_period_end=datetime.utcnow() + timedelta(days=30),
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
        current_period_end=datetime.utcnow() + timedelta(days=20),
        grace_period_end=datetime.utcnow() + timedelta(days=5),
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
async def test_resolve_effective_plan_past_due_grace_expired_returns_freemium(db_session, personal_plan, freemium_plan):
    """past_due with grace_period_end in the past downgrades to freemium."""
    from app.models.member_subscription import MemberSubscription
    sub = MemberSubscription(
        member_id=1, plan_id=personal_plan.id, status="past_due",
        billing_cycle="monthly",
        current_period_end=datetime.utcnow() - timedelta(days=1),
        grace_period_end=datetime.utcnow() - timedelta(days=1),
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


@pytest.mark.asyncio
async def test_activate_paid_subscription_idempotent(db_session, personal_plan, freemium_plan):
    """Activating with the same gateway_subscription_id twice is a no-op the second time."""
    from app.services.subscription import SubscriptionService
    svc = SubscriptionService(db_session)
    period_end = datetime.utcnow() + timedelta(days=30)
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
        current_period_end=datetime.utcnow() + timedelta(days=30),
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
        current_period_end=datetime.utcnow() - timedelta(days=1),
        grace_period_end=datetime.utcnow() - timedelta(days=1),
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


@pytest.mark.asyncio
async def test_create_subscription_checkout_stripe(db_session, personal_plan, monkeypatch):
    """Stripe checkout uses mode=subscription with the plan's price ID and returns a redirect URL."""
    from app.core.config import settings
    from app.services.payment import PaymentService

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_sub_checkout")

    personal_plan.stripe_price_id_monthly = "price_test_monthly"
    db_session.add(personal_plan)
    await db_session.commit()

    fake_session = MagicMock()
    fake_session.id = "cs_test_123"
    fake_session.url = "https://checkout.stripe.com/c/pay/cs_test_123"

    def fake_create(*args, **kwargs):
        return fake_session

    monkeypatch.setattr("stripe.checkout.Session.create", fake_create)

    try:
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
    finally:
        # Clean up the Order row so it doesn't block subscription_plans cleanup
        # in subsequent tests (Order.plan_id has ondelete=RESTRICT).
        from sqlalchemy import delete
        from app.models.order import Order
        await db_session.execute(
            delete(Order).where(Order.member_id == 1).where(Order.gateway == "stripe")
        )
        await db_session.commit()


@pytest.mark.asyncio
async def test_create_subscription_checkout_paypal(db_session, personal_plan, monkeypatch):
    """PayPal checkout creates a subscription via /v1/billing/subscriptions and returns the approve URL."""
    import respx
    from app.core.config import settings
    from app.services.payment import PaymentService

    monkeypatch.setattr(settings, "paypal_client_id", "test_id")
    monkeypatch.setattr(settings, "paypal_client_secret", "test_secret")
    monkeypatch.setattr(settings, "paypal_plan_personal_monthly", "P-TESTPLAN")

    async def fake_token(self):
        return "fake_token"
    monkeypatch.setattr(PaymentService, "_get_paypal_access_token", fake_token)

    try:
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
    finally:
        # Clean up the Order row so it doesn't block subscription_plans cleanup
        # in subsequent tests (Order.plan_id has ondelete=RESTRICT).
        from sqlalchemy import delete
        from app.models.order import Order
        await db_session.execute(
            delete(Order).where(Order.member_id == 1).where(Order.gateway == "paypal")
        )
        await db_session.commit()
