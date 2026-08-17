from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    billing_cycle: Mapped[str | None] = mapped_column(String(10), nullable=True)
    gateway: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="usd")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
