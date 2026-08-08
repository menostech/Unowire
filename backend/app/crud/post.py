from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.post import Post, PostCategory
from app.schemas.post import (
    PostCategoryCreate,
    PostCategoryUpdate,
    PostCreate,
    PostUpdate,
)


class CRUDPostCategory(CRUDBase[PostCategory, PostCategoryCreate, PostCategoryUpdate]):
    async def get_all(self, db: AsyncSession) -> list[PostCategory]:
        stmt = select(PostCategory).order_by(PostCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_slug(self, db: AsyncSession, slug: str) -> PostCategory | None:
        stmt = select(PostCategory).where(PostCategory.slug == slug)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()


class CRUDPost(CRUDBase[Post, PostCreate, PostUpdate]):
    async def get_with_relations(self, db: AsyncSession, id: str) -> Post | None:
        stmt = select(Post).where(Post.id == id).options(
            selectinload(Post.category),
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_with_relations(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
        category_id: str | None = None,
        q: str | None = None,
        status: str | None = None,
        is_visible: bool | None = None,
    ) -> tuple[list[Post], int]:
        """Paginated list of all posts (including drafts) with optional filters."""
        stmt = select(Post)
        if q:
            stmt = stmt.where(
                or_(
                    Post.title.ilike(f"%{q}%"),
                    Post.excerpt.ilike(f"%{q}%"),
                )
            )
        if category_id is not None:
            stmt = stmt.where(Post.category_id == category_id)
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if is_visible is not None:
            stmt = stmt.where(Post.is_visible == is_visible)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = stmt.options(
            selectinload(Post.category),
        ).order_by(Post.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_by_category_and_slug(
        self, db: AsyncSession, category_slug: str, post_slug: str
    ) -> Post | None:
        stmt = (
            select(Post)
            .join(PostCategory, Post.category_id == PostCategory.id)
            .where(
                PostCategory.slug == category_slug,
                Post.slug == post_slug,
            )
            .options(selectinload(Post.category))
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_published_list(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
        category_slug: str | None = None,
        q: str | None = None,
    ) -> tuple[list[Post], int]:
        """Paginated list of published + visible posts for the public site."""
        stmt = select(Post).where(
            Post.status == "published",
            Post.is_visible == True,
        )
        if category_slug:
            stmt = stmt.join(PostCategory, Post.category_id == PostCategory.id).where(
                PostCategory.slug == category_slug
            )
        if q:
            stmt = stmt.where(
                or_(
                    Post.title.ilike(f"%{q}%"),
                    Post.excerpt.ilike(f"%{q}%"),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = stmt.options(
            selectinload(Post.category),
        ).order_by(Post.published_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total


crud_post_category = CRUDPostCategory(PostCategory)
crud_post = CRUDPost(Post)
