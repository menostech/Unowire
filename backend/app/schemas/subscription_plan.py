from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SubscriptionPlanBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    tier_level: str = Field(min_length=1, max_length=20)
    price_monthly: float = Field(ge=0, default=0)
    price_yearly: float = Field(ge=0, default=0)
    currency: str = Field(min_length=3, max_length=3, default="USD")
    search_limit_daily: int | None = Field(default=0, ge=0)
    detail_view_limit_daily: int | None = Field(default=0, ge=0)
    download_limit_monthly: int | None = Field(default=0, ge=0)
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
