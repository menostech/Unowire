from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.member import crud_member
from app.models.user import User
from app.schemas.admin_member import (
    AdminMemberActivate,
    AdminMemberRead,
    AdminMemberUpdate,
)

router = APIRouter(prefix="/api/admin/members", tags=["admin-members"])


def _member_to_read(member, inquiry_count: int) -> AdminMemberRead:
    return AdminMemberRead(
        id=member.id,
        email=member.email,
        name=member.name,
        company=member.company,
        phone=member.phone,
        is_active=member.is_active,
        is_verified=member.is_verified,
        created_at=member.created_at,
        inquiry_count=inquiry_count,
    )


@router.get("", response_model=list[AdminMemberRead])
async def list_members(
    q: str | None = None,
    is_verified: bool | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    members = await crud_member.list_with_filters(
        db, q=q, is_verified=is_verified, is_active=is_active
    )
    result = []
    for m in members:
        count = await crud_member.count_inquiries(db, m.id)
        result.append(_member_to_read(m, count))
    return result


@router.get("/{member_id}", response_model=AdminMemberRead)
async def get_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}", response_model=AdminMemberRead)
async def update_member(
    member_id: int,
    obj_in: AdminMemberUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.update_profile(
        db, member, name=obj_in.name, company=obj_in.company, phone=obj_in.phone
    )
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}/activate", response_model=AdminMemberRead)
async def activate_member(
    member_id: int,
    obj_in: AdminMemberActivate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.set_active(db, member, obj_in.is_active)
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}/verify", response_model=AdminMemberRead)
async def verify_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.set_verified(db, member)
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.delete("/{member_id}", status_code=204)
async def delete_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    if await crud_member.has_inquiries(db, member_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete member with inquiries. Deactivate instead."},
        )
    await crud_member.remove(db, id=member_id)
