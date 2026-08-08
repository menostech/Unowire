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
