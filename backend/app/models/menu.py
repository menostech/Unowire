from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AdminMenuItem(Base):
    __tablename__ = "admin_menu_items"
    __table_args__ = (
        CheckConstraint(
            "type IN ('page', 'link', 'group')",
            name="ck_admin_menu_items_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100),
        ForeignKey("admin_menu_items.id", ondelete="CASCADE"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    page_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    parent: Mapped["AdminMenuItem | None"] = relationship(
        "AdminMenuItem",
        back_populates="children",
        remote_side="AdminMenuItem.id",
    )
    children: Mapped[list["AdminMenuItem"]] = relationship(
        "AdminMenuItem",
        back_populates="parent",
        order_by="AdminMenuItem.sort_order",
        cascade="all, delete-orphan",
    )
