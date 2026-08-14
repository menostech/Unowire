## Context

The platform has a `Page` model for static CMS pages (About, Contact) accessed via `/[slug]`, with Markdown content rendered via `ReactMarkdown + remarkGfm`. Pages have no category dimension — they are flat, standalone documents. The platform needs a categorized article publishing system for news, technical articles, case studies, and tutorials, with SEO-friendly URLs structured as `/{category-slug}/{post-slug}`.

The existing module pattern (Cable, Equipment, Terminal, Resource) uses separate tables per domain with a categories table + items table. The `Resource` module (just built) is the most recent reference: `resource_categories` (2-level tree) + `resources` (items with file metadata). Posts differ from Resources in that posts are inline Markdown content (not file downloads), are admin-only (no portal access), and use single-level categories (not 2-level).

## Goals / Non-Goals

**Goals:**
- Single-level post categories with unique slugs (e.g., `news`, `tutorials`, `case-studies`)
- Post CRUD with Markdown content, excerpt, cover image, and SEO metadata
- Public browsing: all-posts list, category-filtered list, article detail
- SEO-friendly URLs: `/{category-slug}/{post-slug}` for detail pages
- Draft/publish workflow with `published_at` timestamp
- Admin-only management (no portal user access)

**Non-Goals:**
- Multi-level categories (single-level only for MVP)
- Portal user post creation (admin-only)
- Comments or user-generated content
- Tags (use categories for organization)
- Rich text editor (Markdown only, consistent with Page)
- Full-text search (title/excerpt LIKE search only)
- Post versioning or revision history

## Decisions

### D1: Separate tables, not extending Page
**Decision:** Create `post_categories` and `posts` as separate tables, mirroring the Resource module pattern.
**Rationale:** Consistent with Cable/Equipment/Terminal/Resource pattern. Extending `Page` with a nullable `category_id` would mix two use cases (static pages vs. categorized articles) and require conditional routing logic. A separate `posts` table keeps the concerns clean and allows category-specific fields (excerpt, cover_image) without polluting the Page schema.
**Alternatives considered:**
- Add `category_id` to `pages` table: rejected — mixes static pages with categorized articles, complicates `/[slug]` routing.

### D2: Single-level categories
**Decision:** `post_categories` is a flat table with no `parent_id` — just `id`, `slug`, `label`, `description`, `sort_order`.
**Rationale:** User request specifies "slug named by category name" — implies a flat namespace. Single-level is simpler for MVP and matches the URL pattern `/{category-slug}/{post-slug}` (one category segment). Multi-level would require `/{parent-slug}/{child-slug}/{post-slug}` which is a different URL contract.
**Alternatives considered:**
- 2-level tree (like Resource categories): rejected — over-engineered for MVP, complicates URL structure.

### D3: Markdown content (consistent with Page)
**Decision:** Post `content` field stores Markdown text. Frontend renders via `ReactMarkdown + remarkGfm`, reusing the existing `PageView` component pattern.
**Rationale:** The existing `Page` module already uses Markdown with `ReactMarkdown + remarkGfm` and has a proven `prose-content` CSS class. Reusing this approach ensures consistency and avoids introducing a rich text editor dependency.

### D4: URL structure — detail at `/{category-slug}/{post-slug}`, list at `/posts`
**Decision:**
- All-posts list: `/posts`
- Category-filtered list: `/posts/{category-slug}`
- Article detail: `/{category-slug}/{post-slug}`

**Rationale:** User explicitly requires `/{category-slug}/{post-slug}` for detail pages. Next.js route matching prioritizes more specific (multi-segment) routes, so the two-segment `/{category-slug}/{post-slug}` dynamic route does NOT conflict with the existing single-segment `/[slug]` Page route — Next.js matches two segments before falling back to one.

However, a category list page at `/{category-slug}` WOULD conflict with `/[slug]` (both are single-segment dynamic routes — Next.js does not allow two single-segment dynamic routes at the same level). Therefore, category list pages use the `/posts/{category-slug}` prefix to avoid the conflict, while detail pages use the user-requested `/{category-slug}/{post-slug}` pattern.

**Route resolution order in Next.js `app/(site)/`:**
```
/posts                        → posts list page (static)
/posts/[category-slug]        → category-filtered list (dynamic, under /posts prefix)
/[category-slug]/[post-slug]  → article detail (dynamic, two segments)
/[slug]                       → Page fallback (dynamic, one segment — existing, untouched)
```

### D5: Slug uniqueness — unique within category, not globally
**Decision:** `posts` table has a `UNIQUE(category_id, slug)` constraint, not `UNIQUE(slug)`. Different categories can have posts with the same slug (e.g., `/news/overview` and `/tutorials/overview`).
**Rationale:** The URL `/{category-slug}/{post-slug}` already disambiguates posts by category. Global slug uniqueness would be unnecessarily restrictive for a multi-category content system.

### D6: Admin-only, no portal access
**Decision:** Posts have no `scope_type`/`scope_id` fields. Only admin users with `post_list`/`post_cats` permissions can manage posts. No portal routes.
**Rationale:** User request specifies "admin backend" management. Unlike Resources (which allow portal manufacturer uploads), posts are editorial content managed by platform administrators. Adding portal support would introduce scope complexity that is not needed.

### D7: Reuse Page's SEO and status field pattern
**Decision:** Posts include `meta_title`, `meta_description`, `og_image_url` (SEO), `status` (`draft`/`published`), `published_at`, `is_visible` — mirroring the `Page` model's field names and semantics.
**Rationale:** Consistency with existing `Page` model. The admin UI and frontend rendering can reuse the same patterns. SEO fields are critical for a content publishing system.

## Risks / Trade-offs

- **[URL collision with future top-level routes]** → Mitigation: The `/{category-slug}/{post-slug}` pattern reserves the two-segment namespace. If a future feature needs a two-segment static route (e.g., `/foo/bar`), it must be added as a static route in Next.js (which takes priority over dynamic routes). Category slugs should avoid colliding with existing top-level static routes (`cables`, `equipment`, `terminals`, `resources`, `posts`, `manufacturers`, `categories`, `member`, `login`, `register`, `verify`).
- **[No full-text search]** → Mitigation: MVP uses `ILIKE` on title and excerpt. Post-MVP can add PostgreSQL full-text search or tsvector column.
- **[Markdown XSS risk]** → Mitigation: `ReactMarkdown` does not render raw HTML by default (safe). No `rehype-raw` plugin is used.
- **[Category slug collision with Page slugs]** → Mitigation: Category list pages use `/posts/{category-slug}` prefix (not `/{category-slug}`), so they never collide with `/[slug]` Page routes. Detail pages at `/{category-slug}/{post-slug}` are two segments and don't collide with single-segment Page routes.
