from datetime import datetime

from pydantic import BaseModel, RootModel


class TaxonomyFilterSchema(BaseModel):
    spec_key: str
    label: str
    control: str
    unit: str | None = None

    model_config = {"from_attributes": True}


class ProductTypeRead(BaseModel):
    id: str
    label: str
    slug: str
    size_system: str
    filters: list[TaxonomyFilterSchema] = []
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategoryRead(BaseModel):
    id: str
    industry_id: str
    label: str
    slug: str
    description: str | None = None
    product_types: list[ProductTypeRead] = []
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IndustryRead(BaseModel):
    id: str
    label: str
    slug: str
    description: str | None = None
    categories: list[CategoryRead] = []
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductTypeCreate(BaseModel):
    id: str
    label: str
    slug: str
    size_system: str
    filters: list[TaxonomyFilterSchema] = []
    sort_order: int = 0


class ProductTypeUpdate(BaseModel):
    label: str | None = None
    slug: str | None = None
    size_system: str | None = None
    filters: list[TaxonomyFilterSchema] | None = None
    sort_order: int | None = None


class CategoryCreate(BaseModel):
    id: str
    label: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    sort_order: int | None = None


class IndustryCreate(BaseModel):
    id: str
    label: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class IndustryUpdate(BaseModel):
    label: str | None = None
    slug: str | None = None
    description: str | None = None
    sort_order: int | None = None


# Taxonomy tree aggregation (mirrors frontend Taxonomy type)
class TaxonomyTree(RootModel[dict[str, IndustryRead]]):
    """Full taxonomy tree as returned by GET /api/taxonomy."""
