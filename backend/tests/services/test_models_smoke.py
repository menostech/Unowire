from app.models.subscription_plan import SubscriptionPlan
from app.models.member_subscription import MemberSubscription
from app.models.usage_record import UsageRecord


def test_models_importable_and_tablenames():
    assert SubscriptionPlan.__tablename__ == "subscription_plans"
    assert MemberSubscription.__tablename__ == "member_subscriptions"
    assert UsageRecord.__tablename__ == "usage_records"


def test_subscription_plan_columns():
    cols = {c.name for c in SubscriptionPlan.__table__.columns}
    expected = {
        "id", "name", "tier_level", "price_monthly", "price_yearly", "currency",
        "search_limit_daily", "detail_view_limit_daily", "download_limit_monthly",
        "is_sales_led", "is_active", "features", "sort_order", "trial_days",
        "created_at", "updated_at",
    }
    missing = expected - cols
    assert not missing, f"Missing columns: {missing}"


def test_member_subscription_snapshot_columns():
    cols = {c.name for c in MemberSubscription.__table__.columns}
    expected = {
        "id", "member_id", "plan_id", "status", "billing_cycle",
        "snapshot_search_limit", "snapshot_detail_limit", "snapshot_download_limit",
        "trial_start", "trial_end", "current_period_start", "current_period_end",
        "cancelled_at", "created_at", "updated_at",
    }
    missing = expected - cols
    assert not missing, f"Missing columns: {missing}"


def test_usage_record_unique_constraint():
    names = set()
    for c in UsageRecord.__table__.constraints:
        if hasattr(c, "name") and c.name:
            names.add(c.name)
    assert any("usage_member_date" in n for n in names), f"Expected unique usage_member_date, got {names}"
