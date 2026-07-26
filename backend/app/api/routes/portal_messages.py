"""Portal staff inbox routes: list, unread-count, detail.
Guarded by require_factory_module('messages'). Auto-marks read on detail view.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.system_message import crud_system_message
from app.models.user import User
from app.schemas.system_message import (
    PortalMessageRead,
    PortalMessageListResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/portal/messages", tags=["portal-messages"])


def _to_portal_read(msg, is_read: bool) -> PortalMessageRead:
    return PortalMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_at=msg.created_at,
        is_read=is_read,
    )


@router.get("", response_model=PortalMessageListResponse)
async def list_portal_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """List targeted messages visible to the calling staff user.
    Broadcast messages are excluded (member-only).
    """
    items, total = await crud_system_message.list_for_staff_user(
        db,
        user_id=user.id,
        scope_type=user.role.scope_type,
        page=page,
        page_size=page_size,
    )
    return PortalMessageListResponse(
        items=[_to_portal_read(m, r) for m, r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def portal_unread_count(
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """Return unread count for the calling staff user.
    NOTE: This route MUST be registered BEFORE GET /{message_id} to avoid
    FastAPI matching "unread-count" as a path-param.
    """
    count = await crud_system_message.unread_count_for_staff_user(
        db, user_id=user.id, scope_type=user.role.scope_type
    )
    return UnreadCountResponse(unread=count)


@router.get("/{message_id}", response_model=PortalMessageRead)
async def get_portal_message(
    message_id: int,
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single message. Auto-marks as read on first view (idempotent).
    Returns 404 if the message is not targeted to the caller.
    """
    result = await crud_system_message.get_for_staff_user(
        db,
        user_id=user.id,
        scope_type=user.role.scope_type,
        message_id=message_id,
    )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, is_read = result
    # Auto-mark read (idempotent via ON CONFLICT DO NOTHING)
    if not is_read:
        await crud_system_message.mark_read_for_user(
            db, user_id=user.id, message_id=message_id
        )
    return _to_portal_read(msg, True)
