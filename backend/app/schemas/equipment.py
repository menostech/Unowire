from datetime import datetime

from pydantic import BaseModel


class ApplicableSpecRule(BaseModel):
    spec_key: str
    min: float | None = None
    max: float | None = None
    allowed_values: list[str] | None = None


class RecommendedEquipmentRead(BaseModel):
    id: str
    name: str
    slug: str
    brand: str | None = None
    applicable_specs: list[dict] = []
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecommendedEquipmentCreate(BaseModel):
    id: str
    name: str
    slug: str
    brand: str | None = None
    applicable_specs: list[dict] = []
    description: str | None = None


class RecommendedEquipmentUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    brand: str | None = None
    applicable_specs: list[dict] | None = None
    description: str | None = None
