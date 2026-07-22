"""Portal inquiries routes: list, unread-count, detail, reply. Scope-filtered."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.config import settings
from app.core.database import get_db
from app.core.email import send_email_background
from app.crud.inquiry import crud_inquiry
from app.models.inquiry import Inquiry
from app.models.member import Member
from app.models.user import User
from app.schemas.inquiry import InquiryRead, InquiryReply

router = APIRouter(prefix="/api/portal/inquiries", tags=["portal-inquiries"])


def _attach_recipient_name(inquiry: Inquiry, name: str | None) -> Inquiry:
    inquiry.recipient_name = name
    return inquiry


def _check_inquiry_scope(user: User, inquiry: Inquiry) -> None:
    """Raise 404 if inquiry is None or not in user's scope."""
    if inquiry is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    if inquiry.recipient_type != user.role.scope_type or inquiry.recipient_id != user.scope_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})


@router.get("", response_model=list[InquiryRead])
async def list_inquiries(
    user: User = Depends(require_factory_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    rows = await crud_inquiry.list_for_staff(
        db, scope_type=user.role.scope_type, scope_id=user.scope_id
    )
    return [_attach_recipient_name(inq, name) for inq, name in rows]


@router.get("/unread-count")
async def unread_count(
    user: User = Depends(require_factory_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    count = await crud_inquiry.unread_count_for_staff(db, user.role.scope_type, user.scope_id)
    return {"count": count}


@router.get("/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    user: User = Depends(require_factory_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    row = await crud_inquiry.get_with_recipient_name(db, inquiry_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    inquiry, name = row
    _check_inquiry_scope(user, inquiry)
    if not inquiry.is_read:
        await crud_inquiry.mark_read_for_staff(db, inquiry)
    return _attach_recipient_name(inquiry, name)


@router.post("/{inquiry_id}/reply", response_model=InquiryRead)
async def reply_inquiry(
    inquiry_id: int,
    body: InquiryReply,
    user: User = Depends(require_factory_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    inquiry = await crud_inquiry.get(db, inquiry_id)
    _check_inquiry_scope(user, inquiry)

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

    row = await crud_inquiry.get_with_recipient_name(db, inquiry.id)
    if row is None:
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Inquiry disappeared after reply"})
    inquiry, name = row
    return _attach_recipient_name(inquiry, name)
