from datetime import date, datetime

from pydantic import BaseModel, Field


class InvoiceCreate(BaseModel):
    """Internal schema for invoice creation parameters."""
    order_id: int
    member_id: int
    plan_id: int
    amount_cents: int = Field(ge=0)
    tax_amount_cents: int | None = None
    currency: str = Field(default="usd", min_length=1, max_length=8)
    period_start: date | None = None
    period_end: date | None = None


class InvoiceRead(BaseModel):
    id: int
    invoice_number: str
    status: str
    amount_cents: int
    tax_amount_cents: int | None
    currency: str
    period_start: date | None
    period_end: date | None
    plan_name: str
    created_at: datetime
    pdf_available: bool

    model_config = {"from_attributes": True}


class InvoiceListResponse(BaseModel):
    items: list[InvoiceRead]
    total: int
    page: int
    page_size: int
