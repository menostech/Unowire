from datetime import datetime

from pydantic import BaseModel

from app.schemas.manufacturer import ManufacturerRead


class BrandBase(BaseModel):
    id: str
    name: str
    slug: str
    manufacturer_id: str
    image_url: str | None = None


class BrandRead(BrandBase):
    manufacturer: ManufacturerRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BrandCreate(BaseModel):
    id: str
    name: str
    slug: str
    manufacturer_id: str
    image_url: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    manufacturer_id: str | None = None
    image_url: str | None = None
