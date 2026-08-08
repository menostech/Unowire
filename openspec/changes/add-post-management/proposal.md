## Why

The platform currently has a `Page` model for static CMS pages (About, Contact, etc.) accessed via `/[slug]`, but lacks a categorized article/news publishing system. Users need a way to publish time-sensitive content (news, technical articles, case studies, tutorials) organized by categories, with SEO-friendly URLs structured as `/{category-slug}/{post-slug}`. The existing `Page` model has no category dimension and cannot scale to a multi-category content workflow.

## What Changes

- New `post_categories` table — single-level categories (e.g., `news`, `tutorials`, `case-studies`) with unique slug
- New `posts` table — article records with `title`, `slug` (unique within category), `category_id`, Markdown `content`, `excerpt`, `cover_image_url`, SEO metadata (`meta_title`, `meta_description`, `og_image_url`), `status` (draft/published), `published_at`, `sort_order`
- Backend public routes: `GET /api/posts` (paginated list of published posts), `GET /api/posts/category/{category_slug}` (posts filtered by category), `GET /api/posts/{category_slug}/{post_slug}` (single post by category+slug composite lookup)
- Backend admin routes: CRUD for posts and categories, gated by `require_operator("post_list")` and `require_operator("post_cats")`
- Frontend public pages: `/posts` (all posts list), `/{category-slug}` (category-filtered list), `/{category-slug}/{post-slug}` (article detail with Markdown rendering)
- Frontend admin pages: `/admin/posts` (list, new, edit) and `/admin/posts/categories` (category CRUD)
- New admin modules: `post_cats` (global) and `post_list` (scope-aware=False — admin-only, no portal access)
- Admin menu group "Posts" with child pages for Posts and Categories
- Alembic migration creating tables + seeding admin menu items and role_permissions

## Capabilities

### New Capabilities
- `post-article-module`: Full article/post management — single-level categories, post CRUD with Markdown content, public browsing with SEO-friendly `/{category-slug}/{post-slug}` URLs, admin CRUD, draft/publish workflow, SEO metadata

### Modified Capabilities
<!-- No existing capabilities are modified at the spec level -->

## Impact

- **Backend**: New models (`post.py`), schemas, CRUD, routes (public + admin), new admin modules in `modules.py`, Next.js API proxies
- **Frontend**: New admin pages (`/admin/posts/*`), public pages (`/posts`, `/{category-slug}`, `/{category-slug}/{post-slug}`), API client namespaces, admin menu registry entries
- **Database**: New Alembic migration creating `post_categories` and `posts` tables + seeding admin menu items and permissions
- **Existing systems**: No breaking changes; the existing `Page` model and `/[slug]` route remain untouched. The new `/{category-slug}/{post-slug}` two-segment route does not conflict with the existing `/[slug]` single-segment route in Next.js (Next.js matches more specific multi-segment routes first)
