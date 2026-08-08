from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PostCategory(Base):
    __tablename__ = "post_categories"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_post_categories_slug"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    posts: Mapped[list["Post"]] = relationship(back_populates="category")


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (
        UniqueConstraint("category_id", "slug", name="uq_posts_category_slug"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("post_categories.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    slug: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    excerpt: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    meta_title: Mapped[str | None] = mapped_column(String(200))
    meta_description: Mapped[str | None] = mapped_column(String(500))
    og_image_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped[PostCategory] = relationship(back_populates="posts", lazy="selectin")
