from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator


class SiteMenuItemBase(BaseModel):
    location: Literal["header", "footer"]
    parent_id: str | None = None
    type: Literal["link", "group"]
    label: str
    url: str | None = None
    sort_order: int = 0
    is_visible: bool = True


class SiteMenuItemCreate(SiteMenuItemBase):
    id: str

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.type == "link":
            if not self.url:
                raise ValueError("url is required when type is 'link'")
        elif self.type == "group":
            if self.url is not None:
                raise ValueError("url must be null when type is 'group'")
        return self


class SiteMenuItemUpdate(BaseModel):
    location: Literal["header", "footer"] | None = None
    parent_id: str | None = None
    type: Literal["link", "group"] | None = None
    label: str | None = None
    url: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class SiteMenuItemRead(SiteMenuItemBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SiteMenuTreeRead(BaseModel):
    """Recursive tree node for public rendering."""
    id: str
    type: Literal["link", "group"]
    label: str
    url: str | None
    children: list["SiteMenuTreeRead"] = []

    model_config = {"from_attributes": True}


class SiteMenuSortRequest(BaseModel):
    direction: Literal["up", "down"]
