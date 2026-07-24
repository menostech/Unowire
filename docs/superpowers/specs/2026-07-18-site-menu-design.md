# Site Menu Module Design Spec

**Date:** 2026-07-18
**Status:** Approved (pending user review of written spec)
**Branch:** `feat/media-picker-modal` (continues from CMS Pages work, HEAD `56d5901`)

## Goal

Replace the hardcoded navigation links in the site header (`Nav.tsx`) and footer (`Footer.tsx`) with a managed menu system. Admins create/edit/delete menu items through a dedicated admin UI; the public site fetches and renders them dynamically.

## Current State

- `frontend/components/layout/Nav.tsx`: server component with hardcoded `links = [{href:'/cables',label:'Cables'}, {href:'/manufacturers',label:'Manufacturers'}]`
- `frontend/components/layout/Footer.tsx`: function component with hardcoded 4 links (Cables / Manufacturers / Automotive / Consumer Electronics)
- Admin sidebar menu is already managed: `admin_menu_items` table + `/api/admin/menu` CRUD + `/admin/menu` UI with `MenuItemForm` supporting `page`/`link`/`group` types

## Scope

- **In scope**: managed header + footer navigation; nested (two-level) menus; `link` + `group` item types; admin CRUD UI
- **Out of scope**: i18n; multi-location beyond header/footer; RBAC per public menu item; CMS page association (use `link` type with `/slug` URL instead)

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Header + footer | Both currently hardcoded; unify management |
| Hierarchy | Nested (two-level) in both locations | Needed for dropdown menus in header and grouped links in footer |
| Item types | `link` + `group` | `link` = clickable URL; `group` = dropdown container. No `cms_page` type — CMS pages are linked by URL (e.g. `/about-us`), keeping schema simple |
| RBAC | Reuse existing `menu_config` module | Avoids new module seed; admins with menu access manage both admin sidebar and site menu |
| Storage | New `site_menu_items` table | Clean separation from `admin_menu_items`; simpler schema (no `icon`/`page_id` fields); independent public endpoint without admin auth |

## Section 1: Data Model

New `site_menu_items` table — structure mirrors `admin_menu_items` but simplified (no `icon`, no `page_id`, adds `location`).

### Schema

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String(100) | PK | Business ID, e.g. `header-cables`, `footer-automotive` |
| `location` | String(20) | NOT NULL, CHECK IN ('header','footer') | Where the item renders |
| `parent_id` | String(100) | FK self → `site_menu_items.id`, ON DELETE CASCADE, nullable | Parent for nested items |
| `type` | String(20) | NOT NULL, CHECK IN ('link','group') | `link`=clickable URL; `group`=dropdown container |
| `label` | String(100) | NOT NULL | Display text |
| `url` | String(500) | nullable | Required for `type='link'`; must be null for `type='group'` |
| `sort_order` | Integer | NOT NULL, default 0 | Sibling ordering |
| `is_visible` | Boolean | NOT NULL, default true | Public visibility toggle |
| `created_at` | TIMESTAMP(tz=true) | NOT NULL, server_default now() | |
| `updated_at` | TIMESTAMP(tz=true) | NOT NULL, server_default now(), onupdate now() | |

### Indexes

- `idx_site_menu_items_location` on (`location`) — filter by location
- `idx_site_menu_items_parent` on (`parent_id`) — tree building

### Validation Rules (enforced in CRUD layer)

- `type='link'` → `url` must be non-empty
- `type='group'` → `url` must be null
- `parent_id` must reference an existing item with the **same `location`** (cross-location nesting forbidden)
- `parent_id` must reference an item of `type='group'` (link-as-parent forbidden)

### External Link Detection

URLs starting with `http://` or `https://` are treated as external links. Frontend renders these with `target="_blank" rel="noopener noreferrer"`. All other URLs are treated as internal paths and rendered via Next.js `<Link>`.

### Seed Data (migrated from current hardcoded values)

Migration inserts 6 rows idempotently (`ON CONFLICT (id) DO NOTHING`):

- `header-cables` — location=header, type=link, label=Cables, url=/cables, sort=0
- `header-manufacturers` — location=header, type=link, label=Manufacturers, url=/manufacturers, sort=1
- `footer-cables` — location=footer, type=link, label=Cables, url=/cables, sort=0
- `footer-manufacturers` — location=footer, type=link, label=Manufacturers, url=/manufacturers, sort=1
- `footer-automotive` — location=footer, type=link, label=Automotive, url=/categories/automotive, sort=2
- `footer-consumer-electronics` — location=footer, type=link, label=Consumer Electronics, url=/categories/consumer-electronics, sort=3

### RBAC

No new module. Existing `menu_config` module (already seeded for admin role) governs admin access to site menu management.

## Section 2: Backend API

Two routers following the `pages.py` (admin + public) pattern.

### Public Router — `/api/site-menu` (no auth, ISR-cacheable)

| Method | Path | Description |
|---|---|---|
| GET | `/api/site-menu/{location}` | Returns tree for `header` or `footer`; only `is_visible=true` items |

- `location` path parameter validated against `'header'` / `'footer'` enum; other values return 422
- Response schema `SiteMenuTreeRead`: recursive structure with `id`, `type`, `label`, `url`, `children`
- Hidden items excluded; if a parent is hidden, its entire subtree is excluded
- Internal fields (`sort_order`, `is_visible`, `parent_id`, `created_at`, `updated_at`) not exposed

### Admin Router — `/api/admin/site-menu` (RBAC: `require_module("menu_config")`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/site-menu?location={header\|footer}` | List (optional location filter) |
| GET | `/api/admin/site-menu/{id}` | Single item |
| POST | `/api/admin/site-menu` | Create |
| PUT | `/api/admin/site-menu/{id}` | Update (partial, `exclude_unset=True`) |
| DELETE | `/api/admin/site-menu/{id}` | Delete (cascade children) |
| PUT | `/api/admin/site-menu/{id}/sort` | Reorder (`direction: 'up' \| 'down'`) |

Follows `admin_menu.py` implementation pattern.

### Pydantic Schemas (`backend/app/schemas/site_menu.py`)

- `SiteMenuItemBase`: `location`, `parent_id`, `type`, `label`, `url`, `sort_order`, `is_visible`
- `SiteMenuItemCreate`: `SiteMenuItemBase` + `id`
- `SiteMenuItemUpdate`: all fields Optional (`exclude_unset=True` merge)
- `SiteMenuItemRead`: `SiteMenuItemBase` + `id`, `created_at`, `updated_at` (`from_attributes=True`)
- `SiteMenuTreeRead`: `id`, `type`, `label`, `url`, `children: list[SiteMenuTreeRead]`
- `SiteMenuSortRequest`: `direction: Literal['up', 'down']`

### CRUD (`backend/app/crud/site_menu.py`)

Extends `CRUDBase`. Additional methods:

- `get_tree(db, location, include_hidden=False)`: query + filter + recursive tree build
- `assert_valid_payload(db, obj_in, id=None)`: validate link-has-url, group-null-url, parent-exists-same-location, parent-is-group
- `move(db, id, direction)`: swap `sort_order` with adjacent sibling under same parent

### main.py Registration

```python
app.include_router(site_menu.router, prefix=f"{settings.api_prefix}/site-menu", tags=["public-site-menu"])
app.include_router(site_menu.admin_router, prefix=f"{settings.api_prefix}/admin/site-menu", tags=["admin-site-menu"])
```

### Tests (`backend/tests/api/test_site_menu.py`)

- CRUD tests (create/read/update/delete)
- Validation tests (link missing url, group with url, cross-location parent, non-group parent)
- Tree building (nested structure, hidden item filtering)
- Public endpoint (no auth required, location enum, returns visible only)
- Permission tests (non-`menu_config` role → 403 on admin endpoints)
- Sort tests (up/down, boundary)

Conftest cleanup extended to clear `site_menu_items` between tests.

## Section 3: Frontend

### Type Definitions (append to `frontend/lib/types.ts`)

```typescript
export type SiteMenuLocation = "header" | "footer";
export type SiteMenuItemType = "link" | "group";

export interface SiteMenuItem {
  id: string;
  location: SiteMenuLocation;
  parent_id: string | null;
  type: SiteMenuItemType;
  label: string;
  url: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteMenuTreeNode {
  id: string;
  type: SiteMenuItemType;
  label: string;
  url: string | null;
  children: SiteMenuTreeNode[];
}
```

### Public API Client (`frontend/lib/api/siteMenu.ts`)

- `fetchSiteMenu(location: 'header' | 'footer'): Promise<SiteMenuTreeNode[]>`
- Returns `[]` on error (never throws — header/footer rendering must not crash the page)
- ISR: `next: { revalidate: 60 }`

### Nav.tsx Changes

- `fetchSiteMenu('header')` at top of component
- `<nav>` block iterates `tree`:
  - `type='link'` → `<Link href={url}>` (external links get `target="_blank" rel="noopener noreferrer"`)
  - `type='group'` → CSS-only hover dropdown (`group-hover:` Tailwind classes, no client JS)
- Component stays a server component

### Footer.tsx Changes

- `fetchSiteMenu('footer')` at top of component
- Render flat list; if a `group` is present, flatten its children inline (footer does not use dropdowns)

### Admin API Client (append `siteMenu` namespace to `frontend/lib/adminApi.ts`)

```typescript
siteMenu: {
  all(locationFilter?: 'header' | 'footer'): Promise<SiteMenuItem[]>,
  getById(id: string): Promise<SiteMenuItem | null>,
  create(payload): Promise<SiteMenuItem>,
  update(id: string, payload: Partial<...>): Promise<SiteMenuItem>,
  remove(id: string): Promise<void>,
  sort(id: string, direction: 'up' | 'down'): Promise<void>,
},
```

Uses existing `adminGet` / `adminFetch` helpers. Method names follow convention (`getById` / `remove`).

### Admin UI

**Route structure** (mirrors existing `/admin/menu`):
- `/admin/site-menu` — list page with location tabs (All / Header / Footer)
- `/admin/site-menu/new` — new item
- `/admin/site-menu/[id]` — edit item

**Components**:
- `frontend/components/admin/site-menu/SiteLinkForm.tsx` (client component): simplified version of `MenuItemForm`
  - Fields: ID, Label, Location (radio: header/footer), Parent (select of same-location groups), Type (radio: link/group), URL (shown when type=link), Sort Order, Visible
  - Reuses existing `MenuSortButtons` component for list-page sort controls
- Next.js API route proxies (`frontend/app/api/admin/site-menu/route.ts` POST, `[id]/route.ts` PUT/DELETE, `[id]/sort/route.ts` PUT) following the `brands` proxy pattern

### Admin Sidebar Registration

New migration `k1a2b3c4d5e6_add_site_menu_admin_menu_item.py` inserts menu item under `settings` group:

```python
INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, ...)
VALUES ('menu-site-menu', 'settings', 'page', 'site-menu', NULL, 'Site Menu', 'Menu', 6, true, ...);
```

Frontend registration:
- `frontend/lib/adminMenuRegistry.ts`: `{ pageId: "site-menu", href: "/admin/site-menu", defaultLabel: "Site Menu", defaultIcon: "Menu" }`
- `frontend/components/admin/layout/AdminSidebar.tsx` `PAGE_ID_TO_MODULE_ID`: `'site-menu': 'menu_config'`

## Section 4: Task Breakdown

| # | Task | Files | Depends On |
|---|---|---|---|
| 1 | Model + Migration + Seed | `backend/app/models/site_menu.py`, `backend/alembic/versions/j0f1a2b3c4d5_add_site_menu_items.py` | — |
| 2 | Pydantic Schemas | `backend/app/schemas/site_menu.py` | 1 |
| 3 | CRUD + validation + sort | `backend/app/crud/site_menu.py` | 1, 2 |
| 4 | API routes + main.py registration | `backend/app/api/routes/site_menu.py`, `backend/app/main.py` | 3 |
| 5 | Backend tests + conftest cleanup | `backend/tests/api/test_site_menu.py`, `backend/tests/conftest.py` | 4 |
| 6 | Admin menu item + frontend registry | `k1a2b3c4d5e6_add_site_menu_admin_menu_item.py`, `adminMenuRegistry.ts`, `AdminSidebar.tsx` | 1 |
| 7 | Frontend types + public API client | `frontend/lib/types.ts`, `frontend/lib/api/siteMenu.ts` | — |
| 8 | Nav.tsx + Footer.tsx dynamic rendering | `frontend/components/layout/Nav.tsx`, `Footer.tsx` | 7 |
| 9 | Admin API namespace + Next.js route proxies | `frontend/lib/adminApi.ts`, `frontend/app/api/admin/site-menu/...` | — |
| 10 | Admin UI (list + form + routes) | `frontend/app/admin/(dashboard)/site-menu/...`, `frontend/components/admin/site-menu/SiteLinkForm.tsx` | 9 |
| 11 | Final verification + tsc baseline + smoke test | — | all |

11 tasks, comparable in scope to the CMS Pages module.

## Section 5: Acceptance Criteria

- Backend test suite passes (baseline 113 + new ~15-18 site menu tests)
- tsc baseline unchanged (8 pre-existing errors in `.next/dev/types/validator.ts`, 0 new in any site menu file)
- Public endpoints `/api/site-menu/header` and `/api/site-menu/footer` accessible without auth
- `Nav.tsx` and `Footer.tsx` render dynamically from API; hardcoded links removed
- Admin `/admin/site-menu` supports full CRUD
- Existing admin sidebar menu unaffected (zero regressions)
- Manual smoke tests:
  1. Create header link, visit homepage, verify it appears
  2. Create header group + child link, hover, verify dropdown
  3. Create footer link, visit homepage, verify it appears
  4. Hide an item, verify it disappears from public site
  5. Delete a group, verify children cascade-deleted
  6. Reorder via sort buttons, verify order changes
