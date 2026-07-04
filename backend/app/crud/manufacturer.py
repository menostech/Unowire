from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.manufacturer import Manufacturer
from app.schemas.manufacturer import ManufacturerCreate, ManufacturerUpdate


class CRUDManufacturer(CRUDBase[Manufacturer, ManufacturerCreate, ManufacturerUpdate]):
    async def get_by_slug(self, db: AsyncSession, slug: str) -> Manufacturer | None:
        result = await db.execute(select(Manufacturer).where(Manufacturer.slug == slug))
        return result.scalar_one_or_none()


crud_manufacturer = CRUDManufacturer(Manufacturer)
