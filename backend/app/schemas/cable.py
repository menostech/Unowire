from datetime import datetime

from pydantic import BaseModel

from app.schemas.brand import BrandRead
from app.schemas.equipment import RecommendedEquipmentRead
from app.schemas.manufacturer import ManufacturerRead


class SpecItemRead(BaseModel):
    spec_key: str
    label: str
    value_string: str | None = None
    value_number: float | None = None
    unit: str | None = None
    spec_type: str
    filterable: bool = False
    sort_order: int = 0

    model_config = {"from_attributes": True}


class CableVariantRead(BaseModel):
    id: int
    slug: str
    sort_order: int = 0
    specs: list[SpecItemRead] = []

    model_config = {"from_attributes": True}


class CableRead(BaseModel):
    id: str
    model: str
    slug: str
    brand_id: str
    product_type_id: str
    industry_id: str
    category_id: str
    size_system: str
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    brand: BrandRead | None = None
    common_specs: list[SpecItemRead] = []
    variants: list[CableVariantRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CableDetailRead(CableRead):
    """Cable detail with manufacturer + recommended equipments."""
    manufacturer: ManufacturerRead | None = None
    recommended_equipments: list[RecommendedEquipmentRead] = []


# Facet schemas
class ManufacturerFacet(BaseModel):
    id: str
    name: str
    count: int


class BrandFacet(BaseModel):
    id: str
    name: str
    count: int


class SizeFacet(BaseModel):
    value: str
    count: int


class SizeRangeFacet(BaseModel):
    min: float
    max: float


class SpecFacetValue(BaseModel):
    value: str
    count: int


class OuterDiameterFacet(BaseModel):
    min: float
    max: float


class FilterFacets(BaseModel):
    manufacturers: list[ManufacturerFacet] = []
    brands: list[BrandFacet] = []
    size: list[SizeFacet] = []
    size_range: SizeRangeFacet | None = None
    spec_facets: dict[str, list[SpecFacetValue]] = {}
    outer_diameter: OuterDiameterFacet | None = None


class CableListResponse(BaseModel):
    items: list[CableRead]
    total: int
    page: int
    page_size: int
    facets: FilterFacets


# Create / Update schemas
class SpecItemCreate(BaseModel):
    spec_key: str
    label: str
    value_string: str | None = None
    value_number: float | None = None
    unit: str | None = None
    spec_type: str
    filterable: bool = False
    sort_order: int = 0


class CableVariantCreate(BaseModel):
    slug: str
    sort_order: int = 0
    specs: list[SpecItemCreate] = []


class CableCreate(BaseModel):
    id: str
    brand_id: str
    product_type_id: str
    industry_id: str
    category_id: str
    model: str
    slug: str
    size_system: str
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    category_ids: list[str] = []
    common_specs: list[SpecItemCreate] = []
    variants: list[CableVariantCreate] = []


class CableVariantUpdate(BaseModel):
    slug: str | None = None
    sort_order: int | None = None
    specs: list[SpecItemCreate] = []


class CableUpdate(BaseModel):
    brand_id: str | None = None
    product_type_id: str | None = None
    industry_id: str | None = None
    category_id: str | None = None
    model: str | None = None
    slug: str | None = None
    size_system: str | None = None
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    category_ids: list[str] | None = None
    common_specs: list[SpecItemCreate] | None = None
    variants: list[CableVariantUpdate] | None = None


# Cable list filter params
class CableFilterParams(BaseModel):
    industry: str | None = None
    category: str | None = None
    product_type: str | None = None
    q: str | None = None
    manufacturer: list[str] | None = None
    brand: list[str] | None = None
    size: list[str] | None = None
    min_size: float | None = None
    max_size: float | None = None
    spec_filters: dict[str, list[str]] | None = None
    min_od: float | None = None
    max_od: float | None = None
    page: int = 1
    page_size: int = 20
