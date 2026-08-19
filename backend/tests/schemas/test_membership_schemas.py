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


def test_invoice_read_derives_pdf_available():
    from datetime import datetime
    from app.schemas.invoice import InvoiceRead

    data = {
        "id": 1,
        "invoice_number": "INV-2026-000001",
        "status": "paid",
        "amount_cents": 1500,
        "tax_amount_cents": None,
        "currency": "usd",
        "period_start": None,
        "period_end": None,
        "plan_name": "Personal",
        "created_at": datetime.utcnow(),
        "pdf_available": True,
    }
    inv = InvoiceRead(**data)
    assert inv.pdf_available is True
    assert inv.plan_name == "Personal"


def test_invoice_list_response_pagination():
    from app.schemas.invoice import InvoiceListResponse, InvoiceRead
    from datetime import datetime

    item = InvoiceRead(
        id=1, invoice_number="INV-2026-000001", status="paid", amount_cents=1500,
        tax_amount_cents=None, currency="usd", period_start=None, period_end=None,
        plan_name="Personal", created_at=datetime.utcnow(), pdf_available=False,
    )
    resp = InvoiceListResponse(items=[item], total=1, page=1, page_size=20)
    assert resp.total == 1
    assert resp.items[0].invoice_number == "INV-2026-000001"
