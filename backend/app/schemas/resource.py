from datetime import datetime

from pydantic import BaseModel


class ResourceCategoryBase(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0


class ResourceCategoryRead(ResourceCategoryBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResourceCategoryTreeRead(ResourceCategoryRead):
    """Two-level tree schema. `children` uses the flat schema to avoid recursive
    lazy-loading of grandchildren in async contexts (MissingGreenlet)."""

    children: list[ResourceCategoryRead] = []


class ResourceCategoryCreate(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0


class ResourceCategoryUpdate(BaseModel):
    parent_id: str | None = None
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    sort_order: int | None = None


class ResourceBase(BaseModel):
    id: str
    category_id: str
    title: str
    slug: str
    description: str | None = None
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    file_url_path: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    scope_type: str | None = None
    scope_id: str | None = None
    download_count: int = 0
    sort_order: int = 0
    is_published: bool = True


class ResourceRead(ResourceBase):
    category: ResourceCategoryRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResourceCreate(BaseModel):
    id: str
    category_id: str
    title: str
    slug: str
    description: str | None = None
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    file_url_path: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    scope_type: str | None = None
    scope_id: str | None = None
    sort_order: int = 0
    is_published: bool = True


class ResourceUpdate(BaseModel):
    category_id: str | None = None
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    file_url_path: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    scope_type: str | None = None
    scope_id: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None


class PortalResourceCreate(BaseModel):
    """Portal-specific resource create schema.

    Omits `id` (server-generated), `scope_type`/`scope_id` (server-forced from
    the authenticated user), and `is_published` (portal users cannot unpublish).
    """

    category_id: str
    title: str
    slug: str
    description: str | None = None
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    file_url_path: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    sort_order: int = 0


class PortalResourceUpdate(BaseModel):
    """Portal-specific resource update schema. Same omissions as create."""

    category_id: str | None = None
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    file_filename: str | None = None
    file_content_type: str | None = None
    file_size_bytes: int | None = None
    file_url_path: str | None = None
    external_url: str | None = None
    thumbnail_url: str | None = None
    sort_order: int | None = None
