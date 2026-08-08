from datetime import datetime

from pydantic import BaseModel


class PostCategoryBase(BaseModel):
    id: str
    slug: str
    label: str
    description: str | None = None
    sort_order: int = 0


class PostCategoryRead(PostCategoryBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PostCategoryCreate(BaseModel):
    id: str
    slug: str
    label: str
    description: str | None = None
    sort_order: int = 0


class PostCategoryUpdate(BaseModel):
    slug: str | None = None
    label: str | None = None
    description: str | None = None
    sort_order: int | None = None


class PostBase(BaseModel):
    id: str
    category_id: str
    title: str
    slug: str
    content: str = ""
    excerpt: str | None = None
    cover_image_url: str | None = None
    status: str = "draft"
    is_visible: bool = True
    sort_order: int = 0
    published_at: datetime | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    og_image_url: str | None = None


class PostRead(PostBase):
    category: PostCategoryRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PostCreate(BaseModel):
    id: str
    category_id: str
    title: str
    slug: str
    content: str = ""
    excerpt: str | None = None
    cover_image_url: str | None = None
    status: str = "draft"
    is_visible: bool = True
    sort_order: int = 0
    meta_title: str | None = None
    meta_description: str | None = None
    og_image_url: str | None = None


class PostUpdate(BaseModel):
    category_id: str | None = None
    title: str | None = None
    slug: str | None = None
    content: str | None = None
    excerpt: str | None = None
    cover_image_url: str | None = None
    status: str | None = None
    is_visible: bool | None = None
    sort_order: int | None = None
    published_at: datetime | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    og_image_url: str | None = None
