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
    search_limit_daily: int | None
    detail_view_limit_daily: int | None
    download_limit_monthly: int | None
    gateway: str | None = None
    gateway_subscription_id: str | None = None
    grace_period_end: datetime | None = None

    model_config = {"from_attributes": True}


class CheckoutRequest(BaseModel):
    gateway: str  # "stripe" | "paypal"
    plan_id: int
    billing_cycle: str  # "monthly" | "yearly"


class CheckoutResponse(BaseModel):
    redirect_url: str
    order_id: int


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
