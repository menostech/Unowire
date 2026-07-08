from datetime import datetime

from pydantic import BaseModel, Field


class InquiryCreate(BaseModel):
    recipient_type: str = Field(pattern="^(manufacturer|equipment_manufacturer)$")
    recipient_id: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class InquiryRead(BaseModel):
    id: int
    sender_id: int
    recipient_type: str
    recipient_id: str
    subject: str
    body: str
    reply_body: str | None = None
    replied_at: datetime | None = None
    replied_by: int | None = None
    is_read: bool
    is_member_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class InquiryReply(BaseModel):
    reply_body: str = Field(min_length=1)


class InquiryListItem(BaseModel):
    """Lighter schema for list views."""
    id: int
    subject: str
    recipient_type: str
    recipient_id: str
    reply_body: str | None = None
    replied_at: datetime | None = None
    is_read: bool
    is_member_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
