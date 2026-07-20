from datetime import datetime

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class AdminMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_by: int
    created_by_email: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    items: list[AdminMessageRead]
    total: int
    page: int
    page_size: int


class MemberMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime
    is_read: bool

    model_config = {"from_attributes": True}


class MemberMessageListResponse(BaseModel):
    items: list[MemberMessageRead]
    total: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    unread: int
