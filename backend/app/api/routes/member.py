from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.config import settings
from app.core.database import get_db
from app.core.email import send_email_background
from app.core.security import create_member_token, hash_password, verify_password
from app.crud.inquiry import crud_inquiry
from app.crud.member import crud_member
from app.crud.system_message import crud_system_message
from app.models.equipment import EquipmentManufacturer
from app.models.inquiry import Inquiry
from app.models.manufacturer import Manufacturer
from app.models.member import Member
from app.schemas.inquiry import InquiryCreate, InquiryRead
from app.schemas.member import MemberLogin, MemberRead, MemberRegister, MemberVerify
from app.schemas.system_message import (
    MemberMessageListResponse,
    MemberMessageRead,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/member", tags=["member"])

VERIFICATION_TOKEN_HOURS = 24


@router.post("/register")
async def register(body: MemberRegister, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await crud_member.get_by_email(db, body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Email already registered"})

    member = await crud_member.create(db, obj_in=body)

    # Send verification email (best-effort)
    verify_url = f"{settings.public_base_url}/verify?token={member.verification_token}"
    send_email_background(
        member.email,
        "verify_email",
        {"name": member.name, "verify_url": verify_url, "from_name": "Unowire"},
    )

    return {"message": "Registration successful. Please check your email to verify your account."}


@router.post("/verify")
async def verify_email(body: MemberVerify, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Member).where(Member.verification_token == body.token)
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Invalid verification token"})

    # Check token age (use created_at as proxy for token issuance time)
    token_age = datetime.utcnow() - member.created_at
    if token_age > timedelta(hours=VERIFICATION_TOKEN_HOURS):
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Verification token expired"})

    member.is_verified = True
    member.verification_token = None
    db.add(member)
    await db.commit()

    return {"message": "Email verified successfully. You can now log in."}


@router.post("/login")
async def login(body: MemberLogin, db: AsyncSession = Depends(get_db)):
    member = await crud_member.get_by_email(db, body.email)
    if member is None or not verify_password(body.password, member.password_hash):
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Invalid email or password"})
    if not member.is_active:
        raise HTTPException(status_code=401, detail={"code": 401, "message": "Account disabled"})
    if not member.is_verified:
        raise HTTPException(status_code=403, detail={"code": 403, "message": "Please verify your email first"})

    token = create_member_token(member.id, member.email)
    response = JSONResponse(
        content={"member": {"id": member.id, "email": member.email, "name": member.name}}
    )
    response.set_cookie(
        "member_token",
        token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=28800,
        path="/",
    )
    return response


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out"})
    response.set_cookie("member_token", "", max_age=0, path="/")
    return response


@router.get("/me", response_model=MemberRead)
async def me(member: Member = Depends(get_current_member)):
    return member


# --- Inquiry endpoints (member-side) ---


def _attach_recipient_name(inquiry: Inquiry, name: str | None) -> Inquiry:
    """Attach the resolved recipient name to an Inquiry instance so
    Pydantic's from_attributes=True can read it during serialization."""
    inquiry.recipient_name = name
    return inquiry


@router.post("/inquiries", response_model=InquiryRead, status_code=201)
async def create_inquiry(
    body: InquiryCreate,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    # Validate recipient exists
    if body.recipient_type == "manufacturer":
        result = await db.execute(select(Manufacturer.id).where(Manufacturer.id == body.recipient_id))
    else:
        result = await db.execute(
            select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == body.recipient_id)
        )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Recipient not found"})

    inquiry = await crud_inquiry.create_for_member(db, obj_in=body, sender_id=member.id)

    # Notify staff (best-effort)
    await _notify_staff_of_inquiry(db, inquiry, member)

    # Re-query to attach the resolved recipient name
    row = await crud_inquiry.get_with_recipient_name(db, inquiry.id)
    if row is None:
        # Should not happen — we just created it
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Inquiry disappeared after create"})
    inquiry, name = row
    return _attach_recipient_name(inquiry, name)


async def _notify_staff_of_inquiry(db: AsyncSession, inquiry: Inquiry, member: Member):
    """Send email to all staff users bound to the recipient manufacturer."""
    from app.models.user import User
    from app.models.role import Role

    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(User.scope_id == inquiry.recipient_id)
        .where(Role.scope_type == inquiry.recipient_type)
        .where(User.is_active == True)
    )
    result = await db.execute(stmt)
    staff_users = list(result.scalars().all())

    inquiry_url = f"{settings.public_base_url}/admin/inquiries/{inquiry.id}"
    for staff in staff_users:
        send_email_background(
            staff.email,
            "inquiry_received",
            {
                "staff_name": staff.email.split("@")[0],
                "member_name": member.name,
                "member_company": member.company or "",
                "subject": inquiry.subject,
                "body": inquiry.body,
                "inquiry_url": inquiry_url,
            },
        )


@router.get("/inquiries", response_model=list[InquiryRead])
async def list_my_inquiries(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    rows = await crud_inquiry.list_by_member(db, member.id)
    return [_attach_recipient_name(inq, name) for inq, name in rows]


@router.get("/inquiries/unread-count")
async def unread_count(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    count = await crud_inquiry.unread_count_for_member(db, member.id)
    return {"count": count}


@router.get("/inquiries/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    row = await crud_inquiry.get_with_recipient_name(db, inquiry_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    inquiry, name = row
    if inquiry.sender_id != member.id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    # Mark as read by member (if there's a reply)
    if inquiry.reply_body is not None and not inquiry.is_member_read:
        await crud_inquiry.mark_read_for_member(db, inquiry)
    return _attach_recipient_name(inquiry, name)


# --- System message endpoints (member-side) ---

@router.get("/messages", response_model=MemberMessageListResponse)
async def list_my_messages(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    items, total = await crud_system_message.list_for_member(
        db, member_id=member.id, page=page, page_size=page_size
    )
    return MemberMessageListResponse(
        items=[
            MemberMessageRead(
                id=msg.id,
                title=msg.title,
                body=msg.body,
                created_at=msg.created_at,
                is_read=is_read,
            )
            for msg, is_read in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/messages/unread-count", response_model=UnreadCountResponse)
async def my_messages_unread_count(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    count = await crud_system_message.unread_count_for_member(db, member.id)
    return UnreadCountResponse(unread=count)


@router.get("/messages/{message_id}", response_model=MemberMessageRead)
async def get_my_message(
    message_id: int,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    result = await crud_system_message.get_for_member(
        db, member_id=member.id, message_id=message_id
    )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, is_read = result
    # Mark as read on first view (idempotent)
    if not is_read:
        await crud_system_message.mark_read(
            db, member_id=member.id, message_id=message_id
        )
    return MemberMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_at=msg.created_at,
        is_read=True,
    )
