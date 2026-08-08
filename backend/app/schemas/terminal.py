from datetime import datetime

from pydantic import BaseModel


class TerminalManufacturerBase(BaseModel):
    id: str
    name: str
    slug: str
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    sort_order: int = 0


class TerminalManufacturerRead(TerminalManufacturerBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TerminalManufacturerCreate(BaseModel):
    id: str
    name: str
    slug: str
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    sort_order: int = 0


class TerminalManufacturerUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    country: str | None = None
    website: str | None = None
    image_url: str | None = None
    description: str | None = None
    founded_year: int | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    sort_order: int | None = None


class TerminalCategoryRead(BaseModel):
    """Flat category schema. Safe for async serialization — no recursive children."""

    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TerminalCategoryTreeNode(BaseModel):
    """Two-level tree schema. `children` uses the flat schema to avoid recursive
    lazy-loading of grandchildren in async contexts (MissingGreenlet)."""

    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    children: list[TerminalCategoryRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TerminalCategoryCreate(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0


class TerminalCategoryUpdate(BaseModel):
    parent_id: str | None = None
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    sort_order: int | None = None


class TerminalRead(BaseModel):
    id: str
    manufacturer_id: str
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] = []
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0
    manufacturer: TerminalManufacturerRead | None = None
    category: TerminalCategoryRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TerminalCreate(BaseModel):
    id: str
    manufacturer_id: str
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] = []
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0


class TerminalUpdate(BaseModel):
    manufacturer_id: str | None = None
    category_id: str | None = None
    model: str | None = None
    slug: str | None = None
    applicable_specs: list[dict] | None = None
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int | None = None


class PortalTerminalCreate(BaseModel):
    """Portal-specific terminal create schema.

    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
    Optional `applicable_specs` field allows portal users to enter spec data
    via a raw-JSON textarea. Persisted directly to the JSONB column.
    """
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] | None = None
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0

    model_config = {"from_attributes": True}
