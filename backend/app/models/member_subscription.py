from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MemberSubscription(Base):
    __tablename__ = "member_subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_cycle: Mapped[str | None] = mapped_column(String(10), nullable=True)
    trial_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trial_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    snapshot_search_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    snapshot_detail_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    snapshot_download_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
