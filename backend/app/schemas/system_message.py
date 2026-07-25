from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RecipientTarget(BaseModel):
    """A single recipient target. `value` is always stored as string in JSONB
    for type consistency with PostgreSQL `@>` containment queries.
    """
    kind: Literal["group", "user", "member"]
    value: str

    @field_validator("value", mode="before")
    @classmethod
    def stringify_value(cls, v: str | int) -> str:
        """Coerce int (from form inputs) to str for JSONB type consistency.
        PostgreSQL `@>` is type-strict: '[{"value":42}]' != '[{"value":"42"}]'.
        """
        return str(v)

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class AdminMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_by: int | None = None
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
