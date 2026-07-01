from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.taxonomy import Category, Industry, ProductType
from app.schemas.taxonomy import (
    CategoryCreate,
    CategoryUpdate,
    IndustryCreate,
    IndustryUpdate,
    ProductTypeCreate,
    ProductTypeUpdate,
)


class CRUDIndustry(CRUDBase[Industry, IndustryCreate, IndustryUpdate]):
    async def get_with_children(self, db: AsyncSession, id: str) -> Industry | None:
        stmt = select(Industry).where(Industry.id == id).options(
            selectinload(Industry.categories).selectinload(Category.product_types)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_children(self, db: AsyncSession) -> list[Industry]:
        stmt = select(Industry).options(
            selectinload(Industry.categories).selectinload(Category.product_types)
        ).order_by(Industry.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


class CRUDCategory(CRUDBase[Category, CategoryCreate, CategoryUpdate]):
    async def get_by_industry(self, db: AsyncSession, industry_id: str) -> list[Category]:
        stmt = select(Category).where(Category.industry_id == industry_id).options(
            selectinload(Category.product_types)
        ).order_by(Category.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_with_product_types(self, db: AsyncSession, id: str) -> Category | None:
        stmt = select(Category).where(Category.id == id).options(
            selectinload(Category.product_types)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()


class CRUDProductType(CRUDBase[ProductType, ProductTypeCreate, ProductTypeUpdate]):
    async def get_by_category(self, db: AsyncSession, category_id: str) -> list[ProductType]:
        stmt = select(ProductType).where(
            ProductType.category_id == category_id
        ).order_by(ProductType.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())


crud_industry = CRUDIndustry(Industry)
crud_category = CRUDCategory(Category)
crud_product_type = CRUDProductType(ProductType)
