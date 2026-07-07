from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator


class MenuItemRead(BaseModel):
    """Flat item, no children. Used by editor list and single-item endpoints."""

    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MenuItemTreeRead(BaseModel):
    """Tree item for sidebar rendering. children is flat (no recursion)."""

    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    children: list[MenuItemRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MenuItemCreate(BaseModel):
    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.type == "page":
            if not self.page_id:
                raise ValueError("page_id is required when type is 'page'")
            if self.url is not None:
                raise ValueError("url must be null when type is 'page'")
        elif self.type == "link":
            if not self.url:
                raise ValueError("url is required when type is 'link'")
            if self.page_id is not None:
                raise ValueError("page_id must be null when type is 'link'")
        elif self.type == "group":
            if self.page_id is not None:
                raise ValueError("page_id must be null when type is 'group'")
            if self.url is not None:
                raise ValueError("url must be null when type is 'group'")
        return self


class MenuItemUpdate(BaseModel):
    parent_id: str | None = None
    type: Literal["page", "link", "group"] | None = None
    page_id: str | None = None
    url: str | None = None
    label: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class MenuItemSort(BaseModel):
    direction: Literal["up", "down"]
