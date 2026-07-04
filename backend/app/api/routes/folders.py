from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.crud.folder import crud_folder
from app.models.folder import Folder
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
    _: dict = Depends(get_current_admin),
):
    rows = await crud_folder.list_all_with_counts(db)
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
    _: dict = Depends(get_current_admin),
):
    return await crud_folder.create_with_depth_check(db, obj_in=obj_in)


@router.put("/{folder_id}", response_model=FolderRead)
async def rename_folder(
    folder_id: int,
    obj_in: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})
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
    _: dict = Depends(get_current_admin),
):
    folder = await db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Folder not found"})
    if await crud_folder.has_children(db, folder_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete folder with subfolders"},
        )
    if await crud_folder.has_uploads(db, folder_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete non-empty folder"},
        )
    await db.delete(folder)
    await db.commit()
