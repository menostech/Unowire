from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_module
from app.core.config import settings
from app.core.database import get_db
from app.core.email import send_email_background
from app.crud.inquiry import crud_inquiry
from app.models.inquiry import Inquiry
from app.models.member import Member
from app.models.user import User
from app.schemas.inquiry import InquiryRead, InquiryReply
from sqlalchemy import select

router = APIRouter(prefix="/api/admin/inquiries", tags=["admin-inquiries"])


def _check_scope_access(user: User, inquiry: Inquiry) -> None:
    """Raise 403 if user's scope does not cover this inquiry."""
    if user.role is None:
        raise HTTPException(status_code=403, detail={"code": 403, "message": "No access"})
    scope_type = user.role.scope_type
    if scope_type is None:
        return  # admin/global — full access
    if scope_type != inquiry.recipient_type or user.scope_id != inquiry.recipient_id:
        raise HTTPException(status_code=403, detail={"code": 403, "message": "Out of scope"})


@router.get("", response_model=list[InquiryRead])
async def list_inquiries(
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type if user.role else None
    scope_id = user.scope_id
    return await crud_inquiry.list_for_staff(
        db, scope_type=scope_type, scope_id=scope_id
    )


@router.get("/unread-count")
async def unread_count(
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type if user.role else None
    scope_id = user.scope_id
    count = await crud_inquiry.unread_count_for_staff(db, scope_type, scope_id)
    return {"count": count}


@router.get("/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    inquiry = await crud_inquiry.get(db, inquiry_id)
    if inquiry is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    _check_scope_access(user, inquiry)
    # Mark as read by staff
    if not inquiry.is_read:
        await crud_inquiry.mark_read_for_staff(db, inquiry)
    return inquiry


@router.post("/{inquiry_id}/reply", response_model=InquiryRead)
async def reply_inquiry(
    inquiry_id: int,
    body: InquiryReply,
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    inquiry = await crud_inquiry.get(db, inquiry_id)
    if inquiry is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    _check_scope_access(user, inquiry)

    if inquiry.reply_body is not None:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Inquiry already replied"})

    inquiry = await crud_inquiry.reply(
        db, inquiry, reply_body=body.reply_body, replied_by=user.id
    )

    # Notify member (best-effort)
    member = await db.get(Member, inquiry.sender_id)
    if member is not None:
        inquiry_url = f"{settings.public_base_url}/member/inquiries/{inquiry.id}"
        send_email_background(
            member.email,
            "inquiry_replied",
            {
                "member_name": member.name,
                "subject": inquiry.subject,
                "reply_body": inquiry.reply_body,
                "inquiry_url": inquiry_url,
            },
        )

    return inquiry
