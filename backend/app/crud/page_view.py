"""CRUD for page_views: recording (with dedup) + scope-filtered aggregation."""
import time
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.cable import Cable
from app.models.equipment import EquipmentManufacturer
from app.models.equipment import RecommendedEquipment
from app.models.manufacturer import Manufacturer
from app.models.page_view import PageView
from app.schemas.page_view import PageViewCreate  # minimal schema, see below


# In-process dedup: {key: timestamp}
# Key format: f"{ip}:{entity_type}:{entity_id}"
# TTL: 60 seconds (same IP + entity within 1 minute → ignore)
_dedup_cache: dict[str, float] = {}
_DEDUP_TTL = 60  # seconds


class CRUDPageView(CRUDBase[PageView, PageViewCreate, PageViewCreate]):
    async def record(
        self,
        db: AsyncSession,
        *,
        entity_type: str,
        entity_id: str,
        request_ip: str,
    ) -> PageView | None:
        """Record a page view. Returns None if deduplicated (same IP+entity within 1 min)
        or if the entity can't be resolved to a scope (entity not found — silently dropped)."""
        # Dedup check
        key = f"{request_ip}:{entity_type}:{entity_id}"
        now = time.time()
        last = _dedup_cache.get(key)
        if last is not None and now - last < _DEDUP_TTL:
            return None
        _dedup_cache[key] = now

        # Periodic cleanup of expired entries (every ~1000 records, do a sweep)
        if len(_dedup_cache) > 1000:
            cutoff = now - _DEDUP_TTL
            for k in list(_dedup_cache.keys()):
                if _dedup_cache[k] < cutoff:
                    del _dedup_cache[k]

        # Resolve scope_type + scope_id from the entity
        scope_type, scope_id = await self._resolve_scope(db, entity_type, entity_id)
        if scope_type is None:
            return None  # entity not found — silently drop

        page_view = PageView(
            entity_type=entity_type,
            entity_id=entity_id,
            scope_type=scope_type,
            scope_id=scope_id,
            viewed_at=datetime.utcnow(),
        )
        db.add(page_view)
        await db.commit()
        await db.refresh(page_view)
        return page_view

    async def _resolve_scope(
        self, db: AsyncSession, entity_type: str, entity_id: str
    ) -> tuple[str | None, str | None]:
        """Resolve (scope_type, scope_id) for an entity. Returns (None, None) if not found."""
        if entity_type == "cable":
            # Cable -> Manufacturer (direct FK)
            stmt = (
                select(Manufacturer.id)
                .select_from(Cable)
                .join(Manufacturer, Cable.manufacturer_id == Manufacturer.id)
                .where(Cable.id == entity_id)
            )
            result = await db.execute(stmt)
            mfr_id = result.scalar_one_or_none()
            if mfr_id is None:
                return (None, None)
            return ("manufacturer", str(mfr_id))
        elif entity_type == "equipment":
            # RecommendedEquipment -> EquipmentManufacturer
            # NOTE: RecommendedEquipment.manufacturer_id (not equipment_manufacturer_id)
            # is the FK to equipment_manufacturers.id — verified against the model.
            stmt = (
                select(EquipmentManufacturer.id)
                .select_from(RecommendedEquipment)
                .join(EquipmentManufacturer, RecommendedEquipment.manufacturer_id == EquipmentManufacturer.id)
                .where(RecommendedEquipment.id == entity_id)
            )
            result = await db.execute(stmt)
            mfr_id = result.scalar_one_or_none()
            if mfr_id is None:
                return (None, None)
            return ("equipment_manufacturer", str(mfr_id))
        return (None, None)

    async def count_by_scope(
        self, db: AsyncSession, scope_type: str, scope_id: str
    ) -> int:
        result = await db.execute(
            select(func.count()).select_from(PageView).where(
                PageView.scope_type == scope_type,
                PageView.scope_id == scope_id,
            )
        )
        return result.scalar() or 0

    async def count_by_scope_since(
        self, db: AsyncSession, scope_type: str, scope_id: str, days: int
    ) -> int:
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await db.execute(
            select(func.count()).select_from(PageView).where(
                PageView.scope_type == scope_type,
                PageView.scope_id == scope_id,
                PageView.viewed_at >= cutoff,
            )
        )
        return result.scalar() or 0

    async def daily_trend_by_scope(
        self, db: AsyncSession, scope_type: str, scope_id: str, days: int = 30
    ) -> list[dict]:
        """Return daily view counts for the last N days, zero-filled."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(
                func.date(PageView.viewed_at).label("date"),
                func.count().label("count"),
            )
            .where(
                PageView.scope_type == scope_type,
                PageView.scope_id == scope_id,
                PageView.viewed_at >= cutoff,
            )
            .group_by(func.date(PageView.viewed_at))
            .order_by(func.date(PageView.viewed_at))
        )
        result = await db.execute(stmt)
        rows = {str(row.date): row.count for row in result.all()}

        # Zero-fill missing days
        trend = []
        today = datetime.utcnow().date()
        for i in range(days - 1, -1, -1):
            day = today - timedelta(days=i)
            day_str = day.isoformat()
            trend.append({"date": day_str, "count": rows.get(day_str, 0)})
        return trend


crud_page_view = CRUDPageView(PageView)
