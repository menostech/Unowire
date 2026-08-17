from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=True
    )
    gateway: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gateway_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="payment")
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
