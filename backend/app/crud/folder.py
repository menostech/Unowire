import logging

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.folder import Folder
from app.models.upload import Upload
from app.schemas.folder import FolderCreate, FolderUpdate

logger = logging.getLogger(__name__)

MAX_FOLDER_DEPTH = 5

PROTECTED_SUBFOLDERS = ("logos", "products", "docs")
CONTAINER_NAMES = {
    "manufacturer": "Cable Manufacturers",
    "equipment_manufacturer": "Equipment Manufacturers",
}


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

    async def list_all_with_counts(
        self,
        db: AsyncSession,
        *,
        scope_type: str | None = None,
        scope_id: str | None = None,
    ) -> list[tuple[Folder, int]]:
        """Return all folders with their direct upload counts.
        If scope_type is provided, only returns folders matching that scope
        (scoped users do not see global container folders).
        """
        count_stmt = (
            select(Folder.id, func.count(Upload.id).label("cnt"))
            .outerjoin(Upload, Upload.folder_id == Folder.id)
            .group_by(Folder.id)
        )
        count_result = await db.execute(count_stmt)
        counts = {row.id: row.cnt for row in count_result}

        stmt = select(Folder).order_by(Folder.name)
        if scope_type is not None:
            stmt = stmt.where(
                Folder.scope_type == scope_type,
                Folder.scope_id == scope_id,
            )
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

    async def provision_for_manufacturer(
        self, db: AsyncSession, *, scope_type: str, scope_id: str, name: str
    ) -> Folder:
        """Create a manufacturer root folder + 3 protected sub-folders.
        Idempotent: if folder already exists for this scope, returns existing.
        """
        # Find global container
        container_stmt = select(Folder).where(
            Folder.scope_type.is_(None),
            Folder.name == CONTAINER_NAMES[scope_type],
        )
        container_result = await db.execute(container_stmt)
        container = container_result.scalar_one()

        # Check if manufacturer root already exists (idempotent)
        existing_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
            Folder.parent_id == container.id,
        )
        existing_result = await db.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()
        if existing:
            return existing

        # Create manufacturer root folder
        root = Folder(
            name=name,
            parent_id=container.id,
            scope_type=scope_type,
            scope_id=scope_id,
        )
        db.add(root)
        await db.flush()  # get root.id without committing

        # Create 3 protected sub-folders
        for sub_name in PROTECTED_SUBFOLDERS:
            sub = Folder(
                name=sub_name,
                parent_id=root.id,
                scope_type=scope_type,
                scope_id=scope_id,
            )
            db.add(sub)

        await db.commit()
        await db.refresh(root)
        return root

    async def assert_folder_in_scope(
        self, db: AsyncSession, folder_id: int, scope_type: str | None, scope_id: str | None
    ) -> Folder:
        """Returns folder if it belongs to the given scope, raises 403 otherwise.
        Global admin (scope_type=None) can access any folder.
        """
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Folder not found"},
            )
        if scope_type is not None:
            if folder.scope_type != scope_type or folder.scope_id != scope_id:
                raise HTTPException(
                    status_code=403,
                    detail={"code": 403, "message": "Folder outside your scope"},
                )
        return folder

    async def validate_deletion(
        self, db: AsyncSession, folder_id: int
    ) -> Folder:
        """Validate that a folder can be deleted. Returns the folder if OK.
        Raises 403 for protected sub-folders, 409 for folders with children/uploads.
        """
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise HTTPException(
                status_code=404,
                detail={"code": 404, "message": "Folder not found"},
            )
        if folder.name in PROTECTED_SUBFOLDERS and folder.scope_type is not None:
            raise HTTPException(
                status_code=403,
                detail={"code": 403, "message": "Cannot delete protected sub-folder (logos/products/docs)"},
            )
        if await self.has_children(db, folder_id):
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete folder with subfolders"},
            )
        if await self.has_uploads(db, folder_id):
            raise HTTPException(
                status_code=409,
                detail={"code": 409, "message": "Cannot delete non-empty folder"},
            )
        return folder

    async def cleanup_for_manufacturer(
        self, db: AsyncSession, *, scope_type: str, scope_id: str
    ) -> None:
        """Delete all folders + uploads for a manufacturer scope.
        Called when a manufacturer is deleted. Also deletes disk files.
        """
        import os

        # Find all folders in this scope
        folders_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
        )
        folders_result = await db.execute(folders_stmt)
        folders = list(folders_result.scalars().all())
        if not folders:
            return

        folder_ids = [f.id for f in folders]

        # Delete disk files for uploads in these folders
        uploads_stmt = select(Upload).where(Upload.folder_id.in_(folder_ids))
        uploads_result = await db.execute(uploads_stmt)
        uploads = list(uploads_result.scalars().all())

        media_dir = os.environ.get("MEDIA_DIR", "/app/media")
        for upload in uploads:
            file_path = os.path.join(media_dir, "uploads", upload.filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError as e:
                    logger.warning("Failed to delete manufacturer media file %s: %s", file_path, e)

        # Delete uploads (DB records)
        for upload in uploads:
            await db.delete(upload)

        # Delete folders (CASCADE handles sub-folders, but we already have all of them)
        for folder in folders:
            await db.delete(folder)

        await db.commit()

    async def rename_manufacturer_root(
        self, db: AsyncSession, *, scope_type: str, scope_id: str, new_name: str
    ) -> None:
        """Rename the manufacturer root folder (sub-folders keep their names)."""
        # Find the container
        container_name = CONTAINER_NAMES.get(scope_type)
        if container_name is None:
            return
        container_stmt = select(Folder).where(
            Folder.scope_type.is_(None),
            Folder.name == container_name,
        )
        container_result = await db.execute(container_stmt)
        container = container_result.scalar_one_or_none()
        if container is None:
            return

        # Find the manufacturer root (direct child of container with matching scope)
        root_stmt = select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
            Folder.parent_id == container.id,
        )
        root_result = await db.execute(root_stmt)
        root = root_result.scalar_one_or_none()
        if root is None or root.name == new_name:
            return

        root.name = new_name
        db.add(root)
        await db.commit()


crud_folder = CRUDFolder(Folder)
