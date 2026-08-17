from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    tier_level: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    price_monthly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    price_yearly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    search_limit_daily: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    detail_view_limit_daily: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    download_limit_monthly: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    is_sales_led: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    features: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stripe_price_id_monthly: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_price_id_yearly: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
