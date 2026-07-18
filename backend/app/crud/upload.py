from typing import Literal

from sqlalchemy import func, select
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
        page_size: int = 20,
        folder_id: int | None | Literal["none"] = None,
        *,
        scope_type: str | None = None,
        scope_id: str | None = None,
    ) -> tuple[list[Upload], int]:
        offset = (page - 1) * page_size
        base = select(Upload)
        count_base = select(func.count()).select_from(Upload)

        # Scope filtering: scoped users only see uploads in their folders
        if scope_type is not None:
            from app.models.folder import Folder
            folder_ids_subq = select(Folder.id).where(
                Folder.scope_type == scope_type,
                Folder.scope_id == scope_id,
            )
            base = base.where(Upload.folder_id.in_(folder_ids_subq))
            count_base = count_base.where(Upload.folder_id.in_(folder_ids_subq))

        if folder_id == "none":
            base = base.where(Upload.folder_id.is_(None))
            count_base = count_base.where(Upload.folder_id.is_(None))
        elif folder_id is not None:
            base = base.where(Upload.folder_id == folder_id)
            count_base = count_base.where(Upload.folder_id == folder_id)

        total = (await db.execute(count_base)).scalar_one()
        stmt = base.order_by(Upload.created_at.desc()).offset(offset).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total


crud_upload = CRUDUpload(Upload)
