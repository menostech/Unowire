from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.folder import Folder
from app.models.upload import Upload
from app.schemas.folder import FolderCreate, FolderUpdate

MAX_FOLDER_DEPTH = 5


class CRUDFolder(CRUDBase[Folder, FolderCreate, FolderUpdate]):
    async def get_depth(self, db: AsyncSession, folder_id: int) -> int:
        """Return depth of folder (1 = top-level). Walks parent chain."""
        depth = 1
        current = await db.get(Folder, folder_id)
        while current and current.parent_id is not None:
            parent = await db.get(Folder, current.parent_id)
            if parent is None:
                break
            depth += 1
            current = parent
            if depth > MAX_FOLDER_DEPTH + 1:
                break
        return depth

    async def has_children(self, db: AsyncSession, folder_id: int) -> bool:
        stmt = select(func.count()).select_from(Folder).where(Folder.parent_id == folder_id)
        result = await db.execute(stmt)
        return (result.scalar() or 0) > 0

    async def has_uploads(self, db: AsyncSession, folder_id: int) -> bool:
        stmt = select(func.count()).select_from(Upload).where(Upload.folder_id == folder_id)
        result = await db.execute(stmt)
        return (result.scalar() or 0) > 0

    async def list_all_with_counts(self, db: AsyncSession) -> list[tuple[Folder, int]]:
        """Return all folders with their direct upload counts."""
        count_stmt = (
            select(Folder.id, func.count(Upload.id).label("cnt"))
            .outerjoin(Upload, Upload.folder_id == Folder.id)
            .group_by(Folder.id)
        )
        count_result = await db.execute(count_stmt)
        counts = {row.id: row.cnt for row in count_result}

        stmt = select(Folder).order_by(Folder.name)
        result = await db.execute(stmt)
        folders = list(result.scalars().all())
        return [(f, counts.get(f.id, 0)) for f in folders]

    async def create_with_depth_check(
        self, db: AsyncSession, *, obj_in: FolderCreate
    ) -> Folder:
        if obj_in.parent_id is not None:
            parent_depth = await self.get_depth(db, obj_in.parent_id)
            if parent_depth >= MAX_FOLDER_DEPTH:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail={"code": 400, "message": f"Max folder depth is {MAX_FOLDER_DEPTH}"},
                )
        # Check for duplicate name within same parent (PostgreSQL NULLs are distinct in UNIQUE)
        dup_stmt = select(Folder).where(Folder.name == obj_in.name)
        if obj_in.parent_id is None:
            dup_stmt = dup_stmt.where(Folder.parent_id.is_(None))
        else:
            dup_stmt = dup_stmt.where(Folder.parent_id == obj_in.parent_id)
        dup_result = await db.execute(dup_stmt)
        if dup_result.scalars().first() is not None:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Folder name already exists"},
            )
        obj_data = obj_in.model_dump()
        db_obj = Folder(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_folder = CRUDFolder(Folder)
