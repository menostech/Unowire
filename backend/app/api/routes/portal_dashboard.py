"""Portal dashboard: aggregates stats, trends, recent inquiries for factory user's scope."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.cable import crud_cable
from app.crud.equipment import crud_equipment
from app.crud.inquiry import crud_inquiry
from app.crud.page_view import crud_page_view
from app.models.manufacturer import Manufacturer
from app.models.equipment import EquipmentManufacturer
from app.models.user import User
from sqlalchemy import select

router = APIRouter(prefix="/api/portal/dashboard", tags=["portal-dashboard"])


async def _resolve_factory_name(db: AsyncSession, scope_type: str, scope_id: str) -> str:
    if scope_type == "manufacturer":
        result = await db.execute(select(Manufacturer.name).where(Manufacturer.id == scope_id))
        return result.scalar_one_or_none() or "Unknown"
    elif scope_type == "equipment_manufacturer":
        result = await db.execute(select(EquipmentManufacturer.name).where(EquipmentManufacturer.id == scope_id))
        return result.scalar_one_or_none() or "Unknown"
    return "Unknown"


@router.get("")
async def get_dashboard(
    user: User = Depends(require_factory_module("dashboard")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type
    scope_id = user.scope_id

    factory_name = await _resolve_factory_name(db, scope_type, scope_id)
    inquiries_unread = await crud_inquiry.unread_count_for_staff(db, scope_type, scope_id)
    inquiries_total = await crud_inquiry.count_for_staff(db, scope_type, scope_id)
    inquiry_trend = await crud_inquiry.daily_trend_for_staff(db, scope_type, scope_id, days=30)
    recent_inquiries = await crud_inquiry.recent_for_staff(db, scope_type, scope_id, limit=5)
    views_total = await crud_page_view.count_by_scope(db, scope_type, scope_id)
    views_trend_30d = await crud_page_view.count_by_scope_since(db, scope_type, scope_id, days=30)
    views_trend = await crud_page_view.daily_trend_by_scope(db, scope_type, scope_id, days=30)

    # Build stats dict based on scope_type
    stats = {
        "views_total": views_total,
        "views_trend_30d": views_trend_30d,
        "inquiries_total": inquiries_total,
        "inquiries_unread": inquiries_unread,
    }
    if scope_type == "manufacturer":
        stats["cables_count"] = await crud_cable.count_by_manufacturer(db, scope_id=scope_id)
    elif scope_type == "equipment_manufacturer":
        stats["equipment_count"] = await crud_equipment.count_by_manufacturer(db, scope_id=scope_id)

    return {
        "factory_name": factory_name,
        "scope_type": scope_type,
        "stats": stats,
        "inquiry_trend": inquiry_trend,
        "views_trend": views_trend,
        "recent_inquiries": [
            {
                "id": inq.id,
                "subject": inq.subject,
                "created_at": inq.created_at.isoformat() + "Z" if inq.created_at else None,
                "is_read": inq.is_read,
            }
            for inq in recent_inquiries
        ],
    }
