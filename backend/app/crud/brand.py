from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.brand import Brand
from app.schemas.brand import BrandCreate, BrandUpdate


class CRUDBrand(CRUDBase[Brand, BrandCreate, BrandUpdate]):
    async def list_by_manufacturer(
        self, db: AsyncSession, *, scope_id: str, skip: int = 0, limit: int = 50
    ) -> list[Brand]:
        """List brands where manufacturer_id == scope_id. For portal routes."""
        stmt = (
            select(Brand)
            .where(Brand.manufacturer_id == scope_id)
            .order_by(Brand.name.asc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_manufacturer(self, db: AsyncSession, *, scope_id: str) -> int:
        stmt = select(func.count()).select_from(Brand).where(Brand.manufacturer_id == scope_id)
        result = await db.execute(stmt)
        return result.scalar() or 0


crud_brand = CRUDBrand(Brand)
