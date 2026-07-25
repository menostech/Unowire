from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.system_message import crud_system_message
from app.models.user import User
from app.schemas.system_message import (
    AdminMessageRead,
    MessageCreate,
    MessageListResponse,
)

router = APIRouter(prefix="/api/admin/messages", tags=["admin-messages"])


def _to_admin_read(msg, publisher_email: str | None) -> AdminMessageRead:
    return AdminMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_by=msg.created_by,
        created_by_email=publisher_email,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
        recipient_type=msg.recipient_type,
        recipient_targets=msg.recipient_targets,
    )


@router.get("", response_model=MessageListResponse)
async def list_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_operator("messages")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_system_message.list_for_admin(
        db, page=page, page_size=page_size
    )
    return MessageListResponse(
        items=[_to_admin_read(m, email) for m, email in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{message_id}", response_model=AdminMessageRead)
async def get_message(
    message_id: int,
    user: User = Depends(require_operator("messages")),
    db: AsyncSession = Depends(get_db),
):
    result = await crud_system_message.get_for_admin(db, message_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, email = result
    return _to_admin_read(msg, email)


@router.post("", response_model=AdminMessageRead, status_code=201)
async def create_message(
    body: MessageCreate,
    user: User = Depends(require_operator("messages")),
    db: AsyncSession = Depends(get_db),
):
    msg = await crud_system_message.create_message(
        db, obj_in=body, created_by=user.id
    )
    return _to_admin_read(msg, user.email)


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    user: User = Depends(require_operator("messages")),
    db: AsyncSession = Depends(get_db),
):
    deleted = await crud_system_message.delete_message(db, message_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    return None
