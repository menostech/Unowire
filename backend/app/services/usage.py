from datetime import date, datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage_record import UsageRecord


_ACTION_COLUMN = {
    "search": "search_count",
    "detail_view": "detail_view_count",
    "download": "download_count",
}


class UsageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def increment_usage(self, member_id: int, action: str) -> None:
        """Unconditional atomic upsert — used when limit == 0 (unlimited)."""
        col = _ACTION_COLUMN[action]
        today = date.today()
        sql = text(
            f"""
            INSERT INTO usage_records (member_id, record_date, {col})
            VALUES (:member_id, :today, 1)
            ON CONFLICT (member_id, record_date)
            DO UPDATE SET {col} = usage_records.{col} + 1
            """
        )
        await self.db.execute(sql, {"member_id": member_id, "today": today})
        await self.db.commit()

    async def increment_and_check(self, member_id: int, action: str, limit: int) -> bool:
        """Atomic conditional increment. Returns True if allowed (and incremented),
        False if the limit would be exceeded (no increment written)."""
        col = _ACTION_COLUMN[action]
        today = date.today()

        if action == "download":
            # Monthly aggregation: check current-month sum before incrementing.
            used = await self.get_monthly_download_count(member_id)
            if used >= limit:
                return False
            await self.increment_usage(member_id, action)
            return True

        sql = text(
            f"""
            INSERT INTO usage_records (member_id, record_date, {col})
            VALUES (:member_id, :today, 1)
            ON CONFLICT (member_id, record_date)
            DO UPDATE SET {col} = usage_records.{col} + 1
            WHERE usage_records.{col} < :limit
            RETURNING {col}
            """
        )
        result = await self.db.execute(sql, {"member_id": member_id, "today": today, "limit": limit})
        row = result.first()
        await self.db.commit()
        return row is not None

    async def get_today_usage(self, member_id: int) -> UsageRecord | None:
        result = await self.db.execute(
            select(UsageRecord).where(
                UsageRecord.member_id == member_id,
                UsageRecord.record_date == date.today(),
            )
        )
        return result.scalar_one_or_none()

    async def get_monthly_download_count(self, member_id: int) -> int:
        now = datetime.utcnow()
        month_start = now.date().replace(day=1)
        result = await self.db.execute(
            select(func.coalesce(func.sum(UsageRecord.download_count), 0)).where(
                UsageRecord.member_id == member_id,
                UsageRecord.record_date >= month_start,
            )
        )
        return int(result.scalar() or 0)

    async def get_usage_summary(self, member_id: int, limits: dict, tier: str) -> dict:
        today_rec = await self.get_today_usage(member_id)
        s_used = today_rec.search_count if today_rec else 0
        d_used = today_rec.detail_view_count if today_rec else 0
        dl_used = await self.get_monthly_download_count(member_id)
        return {
            "plan": tier,
            "today": {
                "search": {"used": s_used, "limit": limits["search_limit_daily"]},
                "detail_view": {"used": d_used, "limit": limits["detail_view_limit_daily"]},
            },
            "this_month": {
                "download": {"used": dl_used, "limit": limits["download_limit_monthly"]},
            },
        }
