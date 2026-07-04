from datetime import datetime

from pydantic import BaseModel


class ManufacturerBase(BaseModel):
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
    featured_cable_ids: list[str] = []
    featured_image: bool = False
    featured_image_sort: int = 0
    featured_text: bool = False
    featured_text_sort: int = 0


class ManufacturerRead(ManufacturerBase):
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManufacturerCreate(BaseModel):
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
    featured_cable_ids: list[str] = []
    featured_image: bool = False
    featured_image_sort: int = 0
    featured_text: bool = False
    featured_text_sort: int = 0


class ManufacturerUpdate(BaseModel):
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
    featured_cable_ids: list[str] | None = None
    featured_image: bool | None = None
    featured_image_sort: int | None = None
    featured_text: bool | None = None
    featured_text_sort: int | None = None
