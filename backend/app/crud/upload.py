from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.upload import Upload
from app.schemas.upload import UploadCreate, UploadUpdate


class CRUDUpload(CRUDBase[Upload, UploadCreate, UploadUpdate]):
    async def get_by_entity(self, db: AsyncSession, entity_type: str, entity_id: str) -> Upload | None:
        stmt = select(Upload).where(
            Upload.entity_type == entity_type,
            Upload.entity_id == entity_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_orphans(self, db: AsyncSession) -> list[Upload]:
        stmt = select(Upload).where(Upload.entity_id.is_(None)).order_by(Upload.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def list_paginated(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20
    ) -> tuple[list[Upload], int]:
        offset = (page - 1) * page_size
        total_stmt = select(func.count()).select_from(Upload)
        total_result = await db.execute(total_stmt)
        total = total_result.scalar_one()

        stmt = (
            select(Upload)
            .order_by(Upload.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all()), total


crud_upload = CRUDUpload(Upload)