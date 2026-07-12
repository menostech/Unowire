from datetime import datetime

from pydantic import BaseModel


class EquipmentManufacturerBase(BaseModel):
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


class EquipmentManufacturerRead(EquipmentManufacturerBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EquipmentManufacturerCreate(BaseModel):
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


class EquipmentManufacturerUpdate(BaseModel):
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


class EquipmentCategoryRead(BaseModel):
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


class EquipmentCategoryTreeRead(BaseModel):
    """Two-level tree schema. `children` uses the flat schema to avoid recursive
    lazy-loading of grandchildren in async contexts (MissingGreenlet)."""

    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0
    children: list[EquipmentCategoryRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EquipmentCategoryCreate(BaseModel):
    id: str
    parent_id: str | None = None
    label: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int = 0


class EquipmentCategoryUpdate(BaseModel):
    parent_id: str | None = None
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    sort_order: int | None = None


class RecommendedEquipmentRead(BaseModel):
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
    manufacturer: EquipmentManufacturerRead | None = None
    category: EquipmentCategoryRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecommendedEquipmentCreate(BaseModel):
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


class RecommendedEquipmentUpdate(BaseModel):
    manufacturer_id: str | None = None
    category_id: str | None = None
    model: str | None = None
    slug: str | None = None
    applicable_specs: list[dict] | None = None
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int | None = None
