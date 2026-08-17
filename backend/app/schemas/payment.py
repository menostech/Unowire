from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaymentRead(BaseModel):
    id: int
    order_id: int
    gateway: str
    gateway_payment_id: str | None
    gateway_event_id: str | None
    event_type: str | None
    type: str
    status: str
    amount_cents: int
    fee_cents: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentResult(BaseModel):
    status: str
    amount_cents: int
    currency: str
    gateway_payment_id: str | None = None


class RefundResult(BaseModel):
    status: str
    refund_id: str | None = None
    amount_cents: int = Field(ge=0)


class WebhookEvent(BaseModel):
    gateway: str
    event_type: str
    raw_payload: dict[str, Any]
