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
    recipient_type: Literal["broadcast", "targeted"] = "broadcast"
    recipient_targets: list[RecipientTarget] | None = None

    @model_validator(mode="after")
    def validate_recipient_targets(self) -> "MessageCreate":
        valid_groups = {"cable_managers", "equipment_managers", "members"}
        if self.recipient_type == "broadcast":
            if self.recipient_targets is not None and len(self.recipient_targets) > 0:
                raise ValueError(
                    "recipient_targets must be null/empty when recipient_type is 'broadcast'"
                )
        elif self.recipient_type == "targeted":
            if not self.recipient_targets or len(self.recipient_targets) == 0:
                raise ValueError(
                    "recipient_targets must be a non-empty array when recipient_type is 'targeted'"
                )
            for t in self.recipient_targets:
                if t.kind == "group" and t.value not in valid_groups:
                    raise ValueError(
                        f"Invalid group value: {t.value}. Must be one of {sorted(valid_groups)}"
                    )
        return self


class AdminMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_by: int | None = None
    created_by_email: str | None = None
    created_at: datetime
    updated_at: datetime
    recipient_type: str = "broadcast"
    recipient_targets: list[RecipientTarget] | None = None

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
