# CMS Pages Module Design

**Date**: 2026-07-18
**Branch**: TBD (new feature branch from `feat/media-picker-modal` or `master`)
**Status**: Approved (pending user spec review)

## Goal

Add a CMS-style static pages module to unowire: admin users with the `pages` module permission can create, edit, publish, and delete Markdown pages in the admin dashboard; public visitors access these pages at `/{slug}` (no `/pages` prefix) on the frontend.

## Scope

**In scope**:
- New `pages` table with slug, title, Markdown content, draft/published status, visibility toggle, sort order, SEO fields
- Backend CRUD API + public read endpoint
- Admin dashboard UI: list / new / edit pages with Markdown editor + live preview
- Frontend single-level dynamic route `/{slug}` rendering published+visible pages
- RBAC: new `pages` module registered in `ADMIN_MODULES`, granted per-role via `/admin/roles`
- Menu integration via existing `type=link` menu items (no ALLOWED_PAGE_IDS change)
- sitemap.xml integration

**Out of scope**:
- Multi-level slugs (single-level only; DB design does not include parent_id)
- WYSIWYG rich-text editor (Markdown only)
- Structured/block-based content editing
- Scheduled publishing (published_at is a timestamp, not a trigger)
- Batch operations (bulk publish/delete)
- Soft delete (hard delete only)
- Breadcrumb navigation on CMS pages
- Pre-set role permissions for `pages` module (admin grants manually per role)
- Frontend automated tests (per project convention)

## Architecture

- **Backend**: FastAPI + SQLAlchemy 2.0 async + PostgreSQL + Alembic
- **Frontend**: Next.js 16 App Router + react-markdown + remark-gfm
- **Routing**: Next.js static-route priority resolves conflicts with existing routes (`/cables`, `/manufacturers`, `/admin`, etc.); CMS pages served via single-level dynamic route `/[slug]`
- **RBAC**: `pages` module registered with `scope_aware=False` (global content, not manufacturer-scoped)
- **Menu integration**: Pure string references via `type=link` menu items (URL like `/about`); no FK to pages table

## Section 1: Data Model

### New table `pages`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | VARCHAR | PRIMARY KEY | Business ID (e.g. `page-about`) |
| `slug` | VARCHAR | UNIQUE NOT NULL | Single-level, lowercase + digits + hyphens |
| `title` | VARCHAR | NOT NULL | Page H1 title |
| `content` | TEXT | NOT NULL DEFAULT '' | Markdown content |
| `status` | VARCHAR | NOT NULL DEFAULT 'draft' | `draft` / `published` |
| `is_visible` | BOOLEAN | NOT NULL DEFAULT true | Hidden toggle; false = admin-only preview even if published |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | Admin list ordering |
| `published_at` | TIMESTAMPTZ | NULL | Set when status transitions draft → published (only if currently NULL) |
| `meta_title` | VARCHAR | NULL | SEO title |
| `meta_description` | VARCHAR | NULL | SEO description |
| `og_image_url` | VARCHAR | NULL | OpenGraph image URL (selected from media library) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

### Indexes

- `idx_pages_slug` UNIQUE on `slug`
- `idx_pages_status_visible` on `(status, is_visible)` — supports public endpoint filter

### Reserved slug blacklist

Stored as a Python set constant in `app/crud/page.py`:

```python
RESERVED_SLUGS = frozenset({
    "admin", "api", "cables", "cable", "categories",
    "manufacturers", "member", "login", "register", "verify",
    "sitemap",  # reserved for /api/pages/sitemap endpoint and sitemap.xml
})
```

These are Next.js dynamic route segments. If a CMS page were created with one of these slugs, the static route would win and the CMS page would be unreachable. Static files (`favicon.ico`, `robots.txt`, `sitemap.xml`) are not in the blacklist because they are matched by static routes before `[slug]` and cannot conflict.

Enforced by `assert_slug_not_reserved(slug)` in CRUD layer, called on every create/update where slug changes. Violation raises `ValueError("Slug '{slug}' is reserved")`, which the route layer converts to HTTP 400.

### Slug validation rules

- Regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (lowercase letters, digits, single hyphens between segments)
- Length: 1-100 characters
- Uniqueness: DB query on create and on slug change
- Blacklist: `RESERVED_SLUGS`

### Alembic migration

File: `backend/alembic/versions/{rev}_add_pages_table.py`

Operations:
1. `CREATE TABLE pages (...)` with all columns + constraints
2. `CREATE UNIQUE INDEX idx_pages_slug ON pages (slug)`
3. `CREATE INDEX idx_pages_status_visible ON pages (status, is_visible)`

Downgrade: drop both indexes, drop `pages` table.

No seed data (pages are created by admins via dashboard).

## Section 2: Backend API

### Module registration

In `app/core/modules.py`, add to `ADMIN_MODULES`:

```python
"pages": {"label": "Pages", "scope_aware": False},
```

`scope_aware=False` because pages are global content (not manufacturer-scoped). New modules automatically appear in the permission configuration interface without migration (per project convention).

### Schemas (`app/schemas/page.py`)

```python
class PageBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(default="", max_length=500_000)
    status: Literal["draft", "published"] = "draft"
    is_visible: bool = True
    sort_order: int = Field(default=0, ge=0)
    meta_title: str | None = Field(default=None, max_length=200)
    meta_description: str | None = Field(default=None, max_length=500)
    og_image_url: str | None = Field(default=None, max_length=500)

class PageCreate(PageBase):
    pass

class PageUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str | None = None
    content: str | None = None
    status: Literal["draft", "published"] | None = None
    is_visible: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)
    meta_title: str | None = None
    meta_description: str | None = None
    og_image_url: str | None = None

class PageRead(PageBase):
    id: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

class PageListItem(BaseModel):
    id: str
    slug: str
    title: str
    status: str
    is_visible: bool
    sort_order: int
    published_at: datetime | None
    updated_at: datetime

class PageListResponse(BaseModel):
    items: list[PageListItem]
    total: int
    page: int
    page_size: int

class PagePublicRead(BaseModel):
    slug: str
    title: str
    content: str
    meta_title: str | None
    meta_description: str | None
    og_image_url: str | None
```

### CRUD (`app/crud/page.py`)

```python
RESERVED_SLUGS = frozenset({
    "admin", "api", "cables", "cable", "categories",
    "manufacturers", "member", "login", "register", "verify",
    "sitemap",  # reserved for /api/pages/sitemap endpoint and sitemap.xml
})

class CRUDDPage(CRUDBase[Page, PageCreate, PageUpdate]):
    async def assert_slug_not_reserved(self, slug: str) -> None:
        if slug in RESERVED_SLUGS:
            raise ValueError(f"Slug '{slug}' is reserved")

    async def get_by_slug(self, db: AsyncSession, slug: str) -> Page | None: ...
    async def get_public_by_slug(self, db: AsyncSession, slug: str) -> Page | None:
        """Returns page only if status='published' AND is_visible=true."""
        ...
    async def list_paginated(
        self, db: AsyncSession, page: int = 1, page_size: int = 20,
        status_filter: str | None = None,
    ) -> tuple[list[Page], int]: ...
    async def create(self, db: AsyncSession, obj_in: PageCreate) -> Page:
        # 1. assert_slug_not_reserved
        # 2. check slug uniqueness (409 on conflict)
        # 3. if status=='published', set published_at=now()
        ...
    async def update(self, db: AsyncSession, db_obj: Page, obj_in: PageUpdate) -> Page:
        # 1. if slug changed: assert_slug_not_reserved + uniqueness check
        # 2. if status transitioned draft→published and published_at is None:
        #       set published_at = now()
        # 3. do NOT overwrite published_at if already set
        ...

crud_page = CRUDDPage(Page)
```

### Routes (`app/api/routes/pages.py`)

Mount under two prefixes:
- `/api/admin/pages` — admin CRUD (requires `require_module("pages")`)
- `/api/pages` — public read (no auth)

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api/admin/pages` | `require_module("pages")` | List with `?status=&page=&page_size=` |
| GET | `/api/admin/pages/{id}` | `require_module("pages")` | Detail (includes content) |
| POST | `/api/admin/pages` | `require_module("pages")` | Create |
| PUT | `/api/admin/pages/{id}` | `require_module("pages")` | Update |
| DELETE | `/api/admin/pages/{id}` | `require_module("pages")` | Delete (204) |
| GET | `/api/pages/{slug}` | Public | Public read; 404 if not published+visible |
| GET | `/api/pages/sitemap` | Public | Lightweight list of `{slug, updated_at}` for all published+visible pages; used by `sitemap.ts` |

**Note on route ordering**: `/api/pages/sitemap` must be declared BEFORE `/api/pages/{slug}` in the router to avoid `sitemap` being captured as a slug path parameter. Alternatively, `sitemap` will be added to the `RESERVED_SLUGS` blacklist to prevent any page from using it as a slug (and the public `/{slug}` endpoint will 404 on it).

**Error responses** (consistent with project convention, custom exception handler unwraps `detail`):
- 400: `{code: 400, message: "Slug '{slug}' is reserved"}` or `"Slug format invalid"`
- 404: `{code: 404, message: "Page not found"}`
- 409: `{code: 409, message: "Slug already exists"}`

**Status transition logic** (in CRUD `update`):
- Capture `old_status = db_obj.status` before applying update
- Apply update
- If `old_status == "draft"` AND `new_status == "published"` AND `db_obj.published_at is None`:
  - Set `db_obj.published_at = datetime.utcnow()`
- Otherwise leave `published_at` unchanged

### Public endpoint detail

`GET /api/pages/{slug}` returns `PagePublicRead` (no status, no is_visible, no sort_order, no timestamps). Returns 404 for:
- Non-existent slug
- `status != 'published'`
- `is_visible == false`

No Referer/Origin validation (public content is crawlable).

## Section 3: Frontend — Public Route & Rendering

### New route file

`frontend/app/(site)/[slug]/page.tsx`

Next.js route priority resolves conflicts automatically:
1. Static routes match first: `/cables`, `/cable/[brand_slug]/[slug]`, `/categories/[...slugs]`, `/manufacturers`, `/manufacturers/[slug]`, `/login`, `/register`, `/verify`, `/member/*`, `/admin/*`, `/api/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`
2. Single-level dynamic route `[slug]` matches remaining single-segment paths

### Page component flow

```tsx
// frontend/app/(site)/[slug]/page.tsx
import { notFound } from "next/navigation";
import { fetchPageBySlug } from "@/lib/api/pages";
import { PageView } from "@/components/pages/PageView";

export async function generateMetadata({ params }) {
  const page = await fetchPageBySlug(params.slug);
  if (!page) return {};
  return {
    title: page.meta_title || page.title,
    description: page.meta_description,
    openGraph: {
      title: page.meta_title || page.title,
      description: page.meta_description,
      images: page.og_image_url ? [{ url: page.og_image_url }] : undefined,
    },
  };
}

export default async function Page({ params }) {
  const page = await fetchPageBySlug(params.slug);
  if (!page) notFound();
  return <PageView page={page} />;
}
```

### PageView component

`frontend/components/pages/PageView.tsx`

- Container: `max-w-3xl mx-auto px-4 py-8`
- H1: `page.title` using project global font size (per project_memory: frontend and backend share same font size)
- Markdown rendering via `react-markdown` + `remark-gfm`
- Custom component mapping (no `@tailwindcss/typography` plugin — hand-written Tailwind classes for finer control):

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    h1: ({children}) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
    h2: ({children}) => <h2 className="text-2xl font-semibold mt-6 mb-3">{children}</h2>,
    h3: ({children}) => <h3 className="text-xl font-semibold mt-5 mb-2">{children}</h3>,
    p: ({children}) => <p className="mb-4 leading-relaxed">{children}</p>,
    a: ({href, children}) => href?.startsWith("/")
      ? <Link href={href} className="text-blue-600 hover:underline">{children}</Link>
      : <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>,
    img: ({src, alt}) => <img src={src} alt={alt} className="rounded-lg my-4 max-w-full h-auto" />,
    ul: ({children}) => <ul className="list-disc pl-6 mb-4">{children}</ul>,
    ol: ({children}) => <ol className="list-decimal pl-6 mb-4">{children}</ol>,
    li: ({children}) => <li className="mb-1">{children}</li>,
    blockquote: ({children}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4">{children}</blockquote>,
    code: ({inline, children}) => inline
      ? <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{children}</code>
      : <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code>{children}</code></pre>,
    table: ({children}) => <table className="w-full border-collapse my-4">{children}</table>,
    th: ({children}) => <th className="border border-gray-300 px-3 py-2 bg-gray-50 font-semibold">{children}</th>,
    td: ({children}) => <td className="border border-gray-300 px-3 py-2">{children}</td>,
    hr: () => <hr className="my-6 border-gray-300" />,
  }}
>
  {page.content}
</ReactMarkdown>
```

### API client

`frontend/lib/api/pages.ts`:

```typescript
export async function fetchPageBySlug(slug: string): Promise<PagePublicRead | null> {
  const res = await fetch(`${process.env.INTERNAL_API_BASE || ""}/api/pages/${slug}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  return res.json();
}
```

ISR with 60-second revalidation; on page update, admins see immediate changes in the dashboard preview; public pages refresh within 60 seconds.

### 404 handling

`notFound()` from `next/navigation` renders the project's existing `app/not-found.tsx`.

### Sitemap integration

Update `frontend/app/sitemap.ts` to include all published+visible pages:

```typescript
// Inside existing sitemap generation
const pages = await fetch(`${INTERNAL_API_BASE}/api/pages/sitemap`); // or extend public endpoint
// Append { url: `${siteUrl}/${page.slug}`, lastModified: page.updatedAt } to sitemap entries
```

Implementation detail: extend the public API to include a `GET /api/pages/sitemap` endpoint that returns a list of `{slug, updated_at}` for all published+visible pages (lightweight, no content). This avoids fetching full pages just for sitemap generation.

### New frontend dependencies

- `react-markdown` ^9.x
- `remark-gfm` ^4.x

No `@tailwindcss/typography`, no `react-syntax-highlighter` (MVP uses simple `<pre><code>` styling).

## Section 4: Admin Dashboard UI

### Route structure

```
frontend/app/admin/(dashboard)/pages/
├── page.tsx              # List page
├── new/page.tsx          # New page
└── [id]/page.tsx         # Edit page
```

### API namespace

`frontend/lib/api/admin/pages.ts` — methods: `list`, `get`, `create`, `update`, `remove`. All call `/api/admin/pages` with admin auth cookie.

### List page (`/admin/pages`)

- Table columns: Title, Slug, Status (draft/published color badge), Visible (eye icon), Sort Order, Updated At, Actions
- Top-right: "New Page" button
- Status filter tabs: All / Drafts / Published (maps to `?status=` query)
- Pagination: reuse project's existing pagination component pattern
- Row actions: Edit (link to `/admin/pages/[id]`), Delete (confirmation modal)
- Default sort: `sort_order ASC, updated_at DESC`
- **`<Suspense>` boundary required**: Per project convention, Next.js pages using `useSearchParams()` must have a `<Suspense>` boundary to prevent production build failures. The list page uses `useSearchParams()` for the `?status=` filter; wrap the filter + table content in `<Suspense fallback={...}>`

### Form component

`frontend/components/admin/pages/PageForm.tsx`

**Layout**: two-column grid on desktop (lg breakpoint)
- Left main column (lg:col-span-2): Title input, Content editor with Write/Preview tabs
- Right sidebar (lg:col-span-1): Slug input (with auto-generate from title), Status select, Is Visible switch, Sort Order number, SEO section (meta_title, meta_description, og_image_url with media picker button)

**Markdown editor**:
- `<textarea>` with monospace font, min-height 400px
- Toolbar above textarea with 6 buttons:
  - Bold: wraps selection with `**`
  - Italic: wraps selection with `*`
  - H1: prepends `# ` to current line
  - H2: prepends `## ` to current line
  - Link: wraps selection with `[text](url)` (prompts for URL, defaults to `https://`)
  - Image: opens MediaPickerModal; on select, inserts `![alt](url)` at cursor
- Selection-aware insertion: if text is selected, wrap it; if not, insert placeholder (e.g. `**bold text**`)
- Tab switch: "Write" shows textarea + toolbar; "Preview" shows `PageView` component rendering current content (same component as public page)

**Slug auto-generation**:
- On title blur: if slug field is empty, auto-generate from title (lowercase, spaces → hyphens, strip non-alphanumeric, collapse hyphens)
- If slug field already has a value, do not overwrite (user explicitly set it)
- On manual slug input: validate against regex + blacklist client-side, show red text below input if invalid

**Save buttons** (bottom of form):
- "Save as Draft" — sets status=draft
- "Save and Publish" — sets status=published
- Both call create or update depending on mode (new vs edit)

### Client-side validation

Replicate backend rules in `frontend/lib/validation/pages.ts`:
- `SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- `RESERVED_SLUGS` (same 10 entries as backend)
- `validateSlug(slug): string | null` — returns error message or null

Show inline error below slug input. Disable Save buttons if validation fails.

### Reused components

- `MediaPickerModal` (existing) — for og_image_url selection and Markdown editor image insertion
- Form/card/button components from project's existing admin pages

### Menu integration

No code changes to menu system. Admin workflow:
1. Create a page at `/admin/pages/new` (e.g. slug=`about`, title=`About Us`)
2. Publish the page
3. Go to `/admin/menu`, create new menu item with `type=link`, URL=`/about`
4. Menu item appears in frontend nav

UI hint in PageForm sidebar: "To add this page to the site menu, go to Menu → New Item, choose type=link, and set URL to `/{slug}`."

### Permission control

- `pages` module registered in `ADMIN_MODULES` (Section 2)
- Frontend `/admin/pages/*` checks user permissions include `pages`; if not, render 403 page
- Backend endpoints guarded by `require_module("pages")`
- `admin` role (is_system=true) has all modules by default (existing RBAC convention)
- Other roles (`content_editor`, `equipment_manager`, etc.) get `pages` module only if admin explicitly grants it at `/admin/roles`
- No pre-set role permissions for `pages` module (admin grants manually per project convention)

## Section 5: Testing Strategy

### Backend tests

File: `backend/tests/api/test_pages.py` — 15 tests across 6 classes.

```
TestPageCRUD (5 tests)
  test_create_page_success              # 201, fields persisted, default status=draft
  test_create_page_reserved_slug        # 400, slug="admin" rejected
  test_create_page_invalid_slug_format  # 400, slug="About Us" rejected (uppercase + space)
  test_create_page_duplicate_slug       # 409, second create with same slug
  test_update_page_slug_uniqueness      # 409, update slug to existing slug

TestPagePublish (2 tests)
  test_publish_sets_published_at        # draft→published, published_at becomes non-null
  test_publish_does_not_overwrite_published_at  # re-publish keeps original published_at

TestPageVisibility (2 tests)
  test_draft_not_public                 # GET /api/pages/{slug} → 404 when status=draft
  test_hidden_not_public                # GET /api/pages/{slug} → 404 when is_visible=false (even if published)

TestPagePublicAccess (2 tests)
  test_public_get_published_visible     # 200, returns PagePublicRead fields (no status/is_visible/sort_order/timestamps)
  test_public_get_nonexistent           # 404

TestPagePermission (2 tests)
  test_non_admin_cannot_access_admin_endpoints  # cable_manager (no pages module) → 403 on GET /api/admin/pages
  test_admin_can_access_admin_endpoints          # admin → 200

TestPageDelete (2 tests)
  test_delete_success                   # 204, page removed from DB
  test_delete_nonexistent               # 404
```

**Test fixtures**:
- Use existing `admin_headers` (already in conftest.py)
- Use existing `cable_manager_headers` (already in conftest.py — does not have `pages` module, perfect for permission test)
- Public endpoint tests use unauthenticated `client.get`

**conftest cleanup** (extend `_cleanup_test_data` in `backend/tests/conftest.py`):

```sql
DELETE FROM pages WHERE id LIKE 'page-test-%' OR slug LIKE 'test-%';
```

Test pages use IDs prefixed with `page-test-` and slugs prefixed with `test-` (e.g. `test-about`, `test-contact`) to avoid collision with production data.

**Slug blacklist tests**: Only test 1-2 representative reserved slugs (e.g. `admin`, `cables`), do not iterate all 10.

**published_at behavior test**: Explicitly test that re-publishing (draft → published → draft → published) does not overwrite the original `published_at` timestamp. This validates the "only set if currently NULL" rule from Section 2.

### Frontend

Per project convention (project_memory: "Frontend MVP does not require automated tests"), no automated tests. Manual smoke test checklist at end of spec.

## Manual Smoke Test Checklist

After implementation, verify in browser:

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Create draft page | `/admin/pages/new` → fill title "About Us", slug auto-fills "about-us", content "Hello", Save as Draft | Redirect to edit page, list shows draft badge |
| 2 | Edit page content | Edit page, type Markdown in textarea, switch to Preview tab | Preview renders Markdown correctly |
| 3 | Insert image via toolbar | Click Image button in toolbar, pick image from media picker | `![alt](url)` inserted at cursor, preview shows image |
| 4 | Publish page | Edit page, click "Save and Publish" | Status becomes published, published_at set |
| 5 | Public access | Visit `http://localhost:3000/about-us` | Page renders with title, content, SEO meta tags in source |
| 6 | Hidden page 404 | Edit page, set is_visible=false, save; visit `/about-us` | 404 not found |
| 7 | Draft page 404 | Set status back to draft, save; visit `/about-us` | 404 |
| 8 | Reserved slug rejected | New page, slug="admin", save | Inline error "Slug 'admin' is reserved" |
| 9 | Invalid slug rejected | New page, slug="About Us", save | Inline error "Slug format invalid" |
| 10 | Permission denied | Login as cable_manager, visit `/admin/pages` | 403 page |
| 11 | Permission granted | Admin grants `pages` module to cable_manager role at `/admin/roles`; cable_manager revisits `/admin/pages` | 200, list renders |
| 12 | Delete page | Edit page, click Delete, confirm | 204, page removed from list; `/about-us` returns 404 |
| 13 | Menu integration | Create menu item type=link URL=/about-us; visit homepage | Menu link appears, click navigates to page |
| 14 | Sitemap | Visit `/sitemap.xml` | CMS page URLs included for published+visible pages |
| 15 | SEO meta | View page source of `/about-us` | `<title>` from meta_title or title; `<meta name="description">` from meta_description; og:image tag present if og_image_url set |

## Constraints & Conventions (from project_memory)

- All code, comments, documentation in English
- Project-wide font: Arial, Sans-serif
- Frontend and backend admin interface use the same font size
- Frontend-backend separation (Next.js + FastAPI)
- PostgreSQL database
- Alembic for migrations
- All middleware must use async/await, no callback style
- Admin menu items support max 2 levels of hierarchy
- Menu item type=link must provide a valid URL (relative or absolute)
- New modules automatically appear in permission configuration interface without migration
- Admin role (is_system=true) cannot be deleted
- Frontend MVP does not require automated tests
- Next.js pages using useSearchParams() must have `<Suspense>` boundary (applies to admin list page if using search params for status filter)
- tsc baseline: 8 pre-existing errors in `.next/dev/types/validator.ts` line 440 — must not increase

## Open Questions Resolved

1. **id type**: business ID (e.g. `page-about`), consistent with manufacturers/cables/menu tables — *resolved*
2. **published_at semantics**: timestamp only, no scheduled publishing — *resolved*
3. **reserved slug blacklist**: 10 dynamic route segments, no static file names — *resolved*
4. **public endpoint auth**: no Referer/Origin validation — *resolved*
5. **preview endpoint**: no separate preview endpoint; admin uses in-form Preview tab — *resolved*
6. **batch operations**: none in MVP — *resolved*
7. **Markdown rendering**: hand-written Tailwind classes, no `@tailwindcss/typography` plugin — *resolved*
8. **sitemap integration**: yes, extend public API with `/api/pages/sitemap` endpoint — *resolved*
9. **breadcrumb**: not added — *resolved*
10. **og_image_url**: optional — *resolved*
11. **delete strategy**: hard delete — *resolved*
12. **quick publish button on list**: not in MVP — *resolved*
13. **preset role permissions**: none, admin grants manually — *resolved*
14. **slug blacklist test coverage**: 1-2 representative slugs, not exhaustive — *resolved*
15. **published_at re-publish behavior**: test explicitly — *resolved*
