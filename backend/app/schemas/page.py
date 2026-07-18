from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PageBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(default="", max_length=500_000)
    status: Literal["draft", "published"] = "draft"
    is_visible: bool = True
    sort_order: int = Field(default=0, ge=0)
    meta_title: str | None = Field(default=None, max_length=200)
    meta_description: str | None = Field(default=None, max_length=500)
    og_image_url: str | None = Field(default=None, max_length=500)


class PageCreate(PageBase):
    id: str = Field(..., min_length=1, max_length=100)


class PageUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=500_000)
    status: Literal["draft", "published"] | None = None
    is_visible: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)
    meta_title: str | None = Field(default=None, max_length=200)
    meta_description: str | None = Field(default=None, max_length=500)
    og_image_url: str | None = Field(default=None, max_length=500)


class PageRead(PageBase):
    id: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageListItem(BaseModel):
    id: str
    slug: str
    title: str
    status: str
    is_visible: bool
    sort_order: int
    published_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageListResponse(BaseModel):
    items: list[PageListItem]
    total: int
    page: int
    page_size: int


class PagePublicRead(BaseModel):
    slug: str
    title: str
    content: str
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None

    model_config = {"from_attributes": True}


class PageSitemapItem(BaseModel):
    slug: str
    updated_at: datetime

    model_config = {"from_attributes": True}
