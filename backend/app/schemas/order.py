from datetime import datetime

from pydantic import BaseModel, Field


class OrderCreate(BaseModel):
    member_id: int
    plan_id: int
    billing_cycle: str | None = None
    gateway: str = Field(min_length=1, max_length=20)
    gateway_order_id: str | None = None
    amount_cents: int = Field(ge=0)
    currency: str = Field(default="usd", min_length=1, max_length=8)
    status: str = Field(default="pending", min_length=1, max_length=20)


class OrderRead(BaseModel):
    id: int
    member_id: int
    plan_id: int
    billing_cycle: str | None
    gateway: str
    gateway_order_id: str | None
    amount_cents: int
    currency: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=20)
