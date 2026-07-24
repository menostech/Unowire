"""Public page-view tracking endpoint. Unauthenticated — called fire-and-forget
during SSR of cable/equipment detail pages."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.page_view import crud_page_view
from app.schemas.page_view import PageViewCreate

router = APIRouter(prefix="/api/page-views", tags=["page-views"])


@router.post("")
async def record_page_view(body: PageViewCreate, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    # Fire-and-forget semantics: never raise to the caller. Silently drop on dedup or not-found.
    try:
        await crud_page_view.record(
            db, entity_type=body.entity_type, entity_id=body.entity_id, request_ip=ip
        )
    except Exception:
        pass  # never block page render
    return {"ok": True}
