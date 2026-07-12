from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminMemberRead(BaseModel):
    id: int
    email: EmailStr
    name: str
    company: str | None
    phone: str | None
    is_active: bool
    is_verified: bool
    created_at: datetime
    inquiry_count: int  # total inquiries sent by this member

    model_config = {"from_attributes": True}


class AdminMemberUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    company: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)


class AdminMemberActivate(BaseModel):
    is_active: bool
