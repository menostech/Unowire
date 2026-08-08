# Implementation Tasks

## 1. Database Models & Migration

- [ ] 1.1 Create `backend/app/models/post.py` with `PostCategory` (flat single-level: `id`, `slug` unique, `label`, `description`, `sort_order`, timestamps — NO `parent_id`) and `Post` (string PK, `category_id` FK with `ondelete=RESTRICT` NOT NULL, `title`, `slug`, `content` Text Markdown, `excerpt` Text nullable, `cover_image_url` nullable, `status` default `draft`, `is_visible` default true, `sort_order`, `published_at` nullable, `meta_title`/`meta_description`/`og_image_url` SEO fields, timestamps). `UNIQUE(category_id, slug)` constraint on posts. NO `scope_type`/`scope_id` fields (admin-only). Mirror `page.py` field naming for SEO/status fields.
- [ ] 1.2 Register the new models in `backend/app/models/__init__.py` so Alembic can detect them.
- [ ] 1.3 Create Alembic migration `e1f2a3b4c5d6_add_post_categories_and_posts.py` creating `post_categories` and `posts` tables (with `uq_posts_category_slug` unique constraint on `(category_id, slug)`).
- [ ] 1.4 Create Alembic migration `f2a3b4c5d6e7_seed_admin_posts_menu_and_permissions.py` seeding `admin_menu_items` (Posts group + `posts-list` and `posts-cats` child pages) and seeding `role_permissions` for the `admin` role with `post_cats` and `post_list` module IDs (idempotent via `ON CONFLICT DO NOTHING`).
- [ ] 1.5 Run `alembic upgrade head` and verify the tables and seed data exist.

## 2. Backend Schemas & CRUD

- [ ] 2.1 Create `backend/app/schemas/post.py` with `PostCategoryBase/Read/Create/Update` and `PostBase/Read/Create/Update`. `PostRead` SHALL include the nested `category: PostCategoryRead` field. Use `model_config = {"from_attributes": True}`.
- [ ] 2.2 Create `backend/app/crud/post.py` with `CRUDPostCategory` (`get_all`, `get_by_slug`, `get_with_post_count`) and `CRUDPost` (`get_with_relations`, `get_all_with_relations(db, page, page_size, category_id, q, status, is_visible)`, `get_by_category_and_slug(db, category_slug, post_slug)`, `get_published_list(db, page, page_size, category_slug, q)`). Use `selectinload(Post.category)` for all relation loading. Instantiate `crud_post_category` and `crud_post` at module bottom.

## 3. Backend Public & Admin Routes

- [ ] 3.1 Create `backend/app/api/routes/post_categories.py` with public GET (list all, get by id) and admin CRUD (create, update, delete) gated by `require_operator("post_cats")`. Reject delete-with-posts (409 "Category is in use"). Reject duplicate slug on create (409 "Slug already exists").
- [ ] 3.2 Create `backend/app/api/routes/post.py` with public endpoints: `GET /` (paginated list of published+visible posts with `category_slug` and `q` filters), `GET /{category_slug}/{post_slug}` (single post by composite key, 404 if not found or draft). Admin endpoints gated by `require_operator("post_list")`: `GET /admin` (list all including drafts), `GET /admin/{id}` (single by ID), `POST /admin` (create), `PUT /admin/{id}` (update — auto-set `published_at` when status changes to published), `DELETE /admin/{id}` (delete, 204). **Route ordering: define `/{category_slug}/{post_slug}` as the LAST route to avoid shadowing `/admin` paths.**
- [ ] 3.3 Register both routers in `backend/app/main.py` with prefixes `/api/post-categories` and `/api/posts`.

## 4. Backend Configuration

- [ ] 4.1 Update `backend/app/core/modules.py`: add `{"id": "post_cats", "label": "Post Cats", "scope_aware": False, "scope_type": None}` and `{"id": "post_list", "label": "Post List", "scope_aware": False, "scope_type": None}` (both not scope-aware — admin-only, no portal).
- [ ] 4.2 No changes to `backend/app/api/deps.py` (`_FACTORY_ALLOWED_BY_SCOPE`) — posts are admin-only, no portal access. No changes to `scope_resolvers.py`.

## 5. Frontend API Clients & Registries

- [ ] 5.1 Update `frontend/lib/adminApi.ts`: add `BackendPost` and `BackendPostCategory` interfaces and `adminApi.posts` (`all`, `getById`, `create`, `update`, `remove` → `/api/posts`) and `adminApi.postCategories` (`all`, `getById`, `create`, `update`, `remove` → `/api/post-categories`) namespaces.
- [ ] 5.2 Add a public API client namespace for `posts` public endpoints (`all`, `getByCategoryAndSlug`) used by the public pages. Place in `frontend/lib/api.ts` or equivalent.
- [ ] 5.3 Update `frontend/lib/adminModules.ts`: add `{"id": "post_cats", "label": "Post Cats", "scopeAware": false, "scopeType": null}` and `{"id": "post_list", "label": "Post List", "scopeAware": false, "scopeType": null}`.
- [ ] 5.4 Update `frontend/lib/adminMenuRegistry.ts`: add `ADMIN_PAGES` entries `{ pageId: "posts-list", href: "/admin/posts", defaultLabel: "Posts", defaultIcon: "FileText" }` and `{ pageId: "posts-cats", href: "/admin/posts/categories", defaultLabel: "Categories", defaultIcon: "FileText" }`. Update `PAGE_BY_ID` lookup.

## 6. Frontend Admin Pages

- [ ] 6.1 Create `frontend/app/admin/(dashboard)/posts/page.tsx` — server component listing posts with filters (category, keyword, status) and pagination. Calls `adminApi.posts.all(...)` and `adminApi.postCategories.all()`.
- [ ] 6.2 Create `frontend/app/admin/(dashboard)/posts/new/page.tsx` and `frontend/components/admin/form/PostForm.tsx` — form supporting title, slug, category select, content textarea (Markdown), excerpt, cover_image_url, SEO fields (meta_title, meta_description, og_image_url), status select (draft/published), is_visible toggle, sort_order. Submits to the Next.js proxy.
- [ ] 6.3 Create `frontend/app/admin/(dashboard)/posts/[id]/page.tsx` — edit page loading the existing post and rendering `PostForm` with `initial` data.
- [ ] 6.4 Create `frontend/app/admin/(dashboard)/posts/categories/page.tsx`, `categories/new/page.tsx`, `categories/[...id]/page.tsx` and `frontend/components/admin/form/PostCategoryForm.tsx` — flat category list management (no parent selection — single-level only).

## 7. Frontend Public Pages

- [ ] 7.1 Create `frontend/app/(site)/posts/page.tsx` — public all-posts list page with search box and paginated post list (title, excerpt, cover image, publish date).
- [ ] 7.2 Create `frontend/app/(site)/posts/[category-slug]/page.tsx` — category-filtered list page showing posts in the specified category.
- [ ] 7.3 Convert `frontend/app/(site)/[slug]/page.tsx` to `frontend/app/(site)/[...slugs]/page.tsx` (catch-all route) — **CRITICAL**: Next.js App Router does not allow two different-named dynamic segments at the same level (`[slug]` and `[category-slug]`), so the existing single-segment `[slug]` route MUST be converted to a catch-all `[...slugs]` route. Inside the page: if `slugs.length === 1`, fetch Page by slug (existing behavior); if `slugs.length === 2`, fetch Post by `(slugs[0], slugs[1])` and render via `PostView` component; otherwise `notFound()`. Static routes (`/cables`, `/equipment`, `/posts`, etc.) take priority over catch-all and are unaffected.
- [ ] 7.4 Create `frontend/components/posts/PostView.tsx` — article detail component rendering title, cover image, Markdown content (via `ReactMarkdown + remarkGfm`, reusing the `prose-content` CSS class from `PageView`), excerpt, publish date, and category breadcrumb. Include `generateMetadata` for SEO.

## 8. Frontend Next.js API Proxies

- [ ] 8.1 Create `frontend/app/api/admin/posts/route.ts` (POST create) and `frontend/app/api/admin/posts/[id]/route.ts` (GET, PUT, DELETE) proxying to backend `/api/posts/admin*` endpoints. Forward `admin_token` as `Bearer`.
- [ ] 8.2 Create `frontend/app/api/admin/post-categories/route.ts` and `frontend/app/api/admin/post-categories/[...id]/route.ts` proxying to `/api/post-categories`.

## 9. Frontend Sidebar & Navigation Updates

- [ ] 9.1 Update `frontend/components/admin/layout/AdminSidebar.tsx`: add entries to `PAGE_ID_TO_MODULE_ID` mapping `'posts-list' → 'post_list'` and `'posts-cats' → 'post_cats'`. Verify the Posts menu group renders for admins with the permissions.
- [ ] 9.2 No portal sidebar update needed — posts are admin-only, no portal access.

## 10. Verification

- [ ] 10.1 Verify backend: `cd backend && python -c "from app.models.post import Post, PostCategory"` and `alembic upgrade head` cleanly.
- [ ] 10.2 Verify backend startup: all new routes registered (`/api/posts`, `/api/post-categories`), `/docs` shows the new route groups.
- [ ] 10.3 Verify admin flow: log in as admin, create a category, create a post with Markdown content, publish it, edit it, delete it.
- [ ] 10.4 Verify public flow: as anonymous visitor, open `/posts`, filter by category, open `/{category-slug}/{post-slug}` detail page, confirm Markdown renders correctly.
- [ ] 10.5 Verify URL routing: confirm `/{category-slug}/{post-slug}` (two-segment) does not conflict with `/[slug]` (single-segment Page route via catch-all). Confirm existing Page routes (e.g., `/about`) still work.
- [ ] 10.6 Verify draft/publish: draft posts are invisible on public endpoints; published posts are visible.
