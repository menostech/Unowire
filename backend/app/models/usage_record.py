from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UsageRecord(Base):
    __tablename__ = "usage_records"
    __table_args__ = (
        UniqueConstraint("member_id", "record_date", name="uq_usage_member_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    detail_view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
