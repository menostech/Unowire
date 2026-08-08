from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_operator
from app.core.database import get_db
from app.crud.post import crud_post
from app.models.post import Post as PostModel
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.post import PostCreate, PostRead, PostUpdate

router = APIRouter()


# ---------------------------------------------------------------------------
# Public list endpoint
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedResponse[PostRead])
async def list_posts(
    page: int = 1,
    page_size: int = 20,
    category_slug: str | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_post.get_published_list(
        db,
        page=page,
        page_size=page_size,
        category_slug=category_slug,
        q=q,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Admin endpoints (must be defined before /{category_slug}/{post_slug} to avoid route shadowing)
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=PaginatedResponse[PostRead])
async def admin_list_posts(
    page: int = 1,
    page_size: int = 20,
    category_id: str | None = None,
    q: str | None = None,
    status: str | None = None,
    is_visible: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_list")),
):
    items, total = await crud_post.get_all_with_relations(
        db,
        page=page,
        page_size=page_size,
        category_id=category_id,
        q=q,
        status=status,
        is_visible=is_visible,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/{post_id}", response_model=PostRead)
async def admin_get_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_list")),
):
    post = await crud_post.get_with_relations(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post not found"})
    return post


@router.post("/admin", response_model=PostRead, status_code=201)
async def admin_create_post(
    obj_in: PostCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_list")),
):
    post = PostModel(
        id=obj_in.id,
        category_id=obj_in.category_id,
        title=obj_in.title,
        slug=obj_in.slug,
        content=obj_in.content,
        excerpt=obj_in.excerpt,
        cover_image_url=obj_in.cover_image_url,
        status=obj_in.status,
        is_visible=obj_in.is_visible,
        sort_order=obj_in.sort_order,
        meta_title=obj_in.meta_title,
        meta_description=obj_in.meta_description,
        og_image_url=obj_in.og_image_url,
    )
    if obj_in.status == "published":
        post.published_at = datetime.utcnow()
    db.add(post)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})
    return await crud_post.get_with_relations(db, obj_in.id)


@router.put("/admin/{post_id}", response_model=PostRead)
async def admin_update_post(
    post_id: str,
    obj_in: PostUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_list")),
):
    post = await crud_post.get_with_relations(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post not found"})

    for field in {
        "category_id",
        "title",
        "slug",
        "content",
        "excerpt",
        "cover_image_url",
        "status",
        "is_visible",
        "sort_order",
        "meta_title",
        "meta_description",
        "og_image_url",
    }:
        value = getattr(obj_in, field)
        if value is not None:
            setattr(post, field, value)

    if obj_in.status == "published":
        if post.status != "published" or post.published_at is None:
            post.published_at = datetime.utcnow()
    elif obj_in.status == "draft":
        post.published_at = None

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "Slug already exists"})
    return await crud_post.get_with_relations(db, post_id)


@router.delete("/admin/{post_id}", status_code=204)
async def admin_delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_operator("post_list")),
):
    post = await crud_post.get_with_relations(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post not found"})
    await db.delete(post)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Public detail endpoint (must be LAST — /{category_slug}/{post_slug} catches any two segments)
# ---------------------------------------------------------------------------


@router.get("/{category_slug}/{post_slug}", response_model=PostRead)
async def get_post(
    category_slug: str,
    post_slug: str,
    db: AsyncSession = Depends(get_db),
):
    post = await crud_post.get_by_category_and_slug(db, category_slug, post_slug)
    if not post or post.status != "published":
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Post not found"})
    return post
