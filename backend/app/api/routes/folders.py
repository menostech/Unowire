from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_media_scope, require_module
from app.models.user import User
from app.core.database import get_db
from app.crud.folder import crud_folder
from app.schemas.folder import (
    FolderCreate,
    FolderRead,
    FolderTreeResponse,
    FolderUpdate,
)

router = APIRouter()


@router.get("", response_model=FolderTreeResponse)
async def list_folders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    rows = await crud_folder.list_all_with_counts(
        db, scope_type=scope[0], scope_id=scope[1]
    )
    folders = [
        FolderRead(
            id=f.id,
            name=f.name,
            parent_id=f.parent_id,
            created_at=f.created_at,
            upload_count=count,
        )
        for f, count in rows
    ]
    return FolderTreeResponse(folders=folders)


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
async def create_folder(
    obj_in: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    # Scoped users must provide a parent_id within their scope
    if scope[0] is not None:
        if obj_in.parent_id is None:
            raise HTTPException(
                status_code=400,
                detail={"code": 400, "message": "Scoped users must create folders inside their manufacturer folder"},
            )
        await crud_folder.assert_folder_in_scope(db, obj_in.parent_id, scope[0], scope[1])

    folder = await crud_folder.create_with_depth_check(db, obj_in=obj_in)
    # Set scope on newly created folder to match parent (or NULL for global admin root)
    if scope[0] is not None:
        folder.scope_type = scope[0]
        folder.scope_id = scope[1]
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
    return FolderRead(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        upload_count=0,
    )


@router.put("/{folder_id}", response_model=FolderRead)
async def rename_folder(
    folder_id: int,
    obj_in: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    folder = await crud_folder.assert_folder_in_scope(db, folder_id, scope[0], scope[1])
    folder.name = obj_in.name
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderRead(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        upload_count=0,
    )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    folder = await crud_folder.assert_folder_in_scope(db, folder_id, scope[0], scope[1])
    # validate_deletion checks protected sub-folders + children + uploads
    await crud_folder.validate_deletion(db, folder_id)
    await db.delete(folder)
    await db.commit()
