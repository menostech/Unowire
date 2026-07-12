# Admin Menu Customization Design

> **Status:** Approved (2026-07-07)
> **Scope:** Make the admin sidebar menu database-driven and configurable via UI, with two-level nesting support.

## Goal

Replace the hardcoded `navLinks` array in `AdminSidebar.tsx` with a database-driven menu that admins can configure through a dedicated admin page. Support two-level nesting (top-level + submenu), three item types (existing page / custom URL / pure group), icon selection from the lucide library, ordering, and soft-hide.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Database: admin_menu_items (single table, type-based)  │
│  - type: page | link | group                            │
│  - parent_id self-reference, max 2 levels               │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │ RESTful CRUD
┌─────────────────────────────────────────────────────────┐
│  Backend FastAPI                                         │
│  - models/menu.py: AdminMenuItem                         │
│  - schemas/menu.py: Read/Create/Update + Tree            │
│  - crud/menu.py: get_tree(), get_flat(), validate_parent │
│  - api/routes/admin_menu.py: full CRUD + sort endpoint   │
│  - migration + seed (10 items matching current sidebar) │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │ /api/admin/menu/* proxy routes
┌─────────────────────────────────────────────────────────┐
│  Frontend Next.js                                        │
│  - lib/adminMenuRegistry.ts: page registry constant      │
│    (page_id → {href, defaultLabel, defaultIcon})         │
│  - lib/adminApi.ts: adminMenu namespace                  │
│  - components/admin/layout/AdminSidebar.tsx: refactored  │
│    to fetch tree from API, support collapse/expand       │
│  - app/admin/(dashboard)/menu/page.tsx: list editor      │
│  - app/admin/(dashboard)/menu/new/page.tsx: create       │
│  - app/admin/(dashboard)/menu/[id]/page.tsx: edit        │
│  - components/admin/form/MenuItemForm.tsx: form with     │
│    type switcher, page picker, icon picker, parent select│
└─────────────────────────────────────────────────────────┘
```

### Key Decisions

- **Single table + type discrimination**: One table, one CRUD, one set of endpoints. Frontend renders by type (page→same-window Link, link→external new window or internal Link, group→expand/collapse only).
- **Max 2 levels**: Top-level + submenu. Parent must be `group` type and top-level itself (enforced at CRUD layer).
- **Page registry in frontend constant**: `ADMIN_PAGES` array maps `pageId` to `{href, defaultLabel, defaultIcon}`. Backend mirrors an `ALLOWED_PAGE_IDS` set for validation. Both kept in sync manually (explicit convention, no codegen).
- **Sort via up/down buttons**: Matches existing industries/categories pattern. No drag-and-drop.
- **Soft-hide via `is_visible`**: Hidden items not returned by tree endpoint but visible in editor.
- **Fallback to constant on API failure**: Sidebar always renders; if tree fetch fails, falls back to `ADMIN_PAGES` constant.
- **`menu-config` protected item**: Cannot be deleted (403). Prevents lockout from the menu editor.

## Data Model

### `admin_menu_items` Table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String(100)` | PK | e.g. `dashboard`, `equipment-mfrs` |
| `parent_id` | `String(100)` | FK→`admin_menu_items.id` ON DELETE CASCADE, nullable | NULL = top-level |
| `type` | `String(20)` | NOT NULL, CHECK IN (`page`,`link`,`group`) | Item type |
| `page_id` | `String(100)` | nullable | type=page: references frontend page registry |
| `url` | `String(500)` | nullable | type=link: custom URL (relative path or `https://`) |
| `label` | `String(100)` | NOT NULL | Display text |
| `icon` | `String(50)` | nullable | lucide icon name (e.g. `Cable`, `Wrench`) |
| `sort_order` | `Integer` | NOT NULL, default 0 | Sibling order |
| `is_visible` | `Boolean` | NOT NULL, default true | false = hidden from sidebar, visible in editor |
| `created_at` | `DateTime` | NOT NULL | |
| `updated_at` | `DateTime` | NOT NULL, onupdate | |

### Constraints

Enforced at schema (Pydantic validator) + CRUD layer:

- `type=page` → `page_id` required, `url` must be NULL
- `type=link` → `url` required, `page_id` must be NULL
- `type=group` → both `page_id` and `url` must be NULL
- `parent_id` not NULL → parent must exist, parent `type=group`, parent `parent_id` NULL (prevents 3rd level)
- `page_id` must be in `ALLOWED_PAGE_IDS` whitelist

### Indexes

- `ix_admin_menu_items_parent_id` on `parent_id`
- `ix_admin_menu_items_parent_id_sort_order` composite on `(parent_id, sort_order)`

### Delete Strategy

- `ON DELETE CASCADE`: parent deletion removes children (matches `industries→categories→product_types` pattern)
- Editor shows confirmation dialog for parent deletion: "This will also delete N child item(s)"
- `menu-config` item is protected (403 on delete)

### Pydantic Schemas

```python
class MenuItemRead(BaseModel):
    """Flat item, no children — used by editor list and single-item endpoints."""
    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class MenuItemTreeRead(BaseModel):
    """Tree item for sidebar rendering. children is flat (no recursion)."""
    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True
    children: list[MenuItemRead] = []  # flat, no nested children
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class MenuItemCreate(BaseModel):
    id: str
    parent_id: str | None = None
    type: Literal["page", "link", "group"]
    page_id: str | None = None
    url: str | None = None
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True

class MenuItemUpdate(BaseModel):
    parent_id: str | None = None
    type: Literal["page", "link", "group"] | None = None
    page_id: str | None = None
    url: str | None = None
    label: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None
```

**Avoiding MissingGreenlet** (lesson from EquipmentCategory): `get_tree()` uses `selectinload(AdminMenuItem.children)` to load exactly two levels. `MenuItemTreeRead.children` items have `children=[]` (no recursive serialization). Flat CRUD endpoints return `MenuItemRead` without `children`.

## Backend API

All endpoints under `/api/admin/menu`, require admin auth via `get_current_admin`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/menu/tree` | Tree (top-level + children), `is_visible=false` excluded. For sidebar. |
| GET | `/api/admin/menu` | Flat list (all items incl. hidden), ordered by `parent_id NULLS FIRST, sort_order`. For editor. |
| GET | `/api/admin/menu/{id}` | Single item detail |
| POST | `/api/admin/menu` | Create, body=`MenuItemCreate` |
| PUT | `/api/admin/menu/{id}` | Update, body=`MenuItemUpdate` |
| DELETE | `/api/admin/menu/{id}` | Delete, cascade children |
| PUT | `/api/admin/menu/{id}/sort` | Reorder, body=`{direction: "up"\|"down"}`, swaps `sort_order` with adjacent sibling |

### Validation Rules

**Conditional required fields** (Pydantic validator):
- `type=page` → `page_id` required, `url` must be NULL
- `type=link` → `url` required, `page_id` must be NULL
- `type=group` → both NULL

**Hierarchy validation** (CRUD layer, raises 422):
- `parent_id` not NULL → parent must exist, parent `type=group`, parent `parent_id` NULL

**Whitelist** (CRUD layer, raises 422):
- `page_id` must be in `ALLOWED_PAGE_IDS` constant

**Uniqueness**:
- `id` PK unique (409 on conflict)
- `label` not unique (admin may want same-name groups)

### CRUD Methods

```python
class CRUDMenuItem:
    async def get_tree(self, only_visible: bool = True) -> list[MenuItemTreeRead]:
        # selectinload(AdminMenuItem.children) two levels
        # WHERE parent_id IS NULL
        # only_visible=True: exclude top-level items with is_visible=false,
        #   and within each parent's children, exclude is_visible=false children
        #   (a visible parent may have a mix of visible/hidden children)

    async def get_flat(self) -> list[MenuItemRead]:
        # ORDER BY parent_id NULLS FIRST, sort_order

    async def validate_parent(self, parent_id: str | None) -> None:
        # raise HTTPException(422) on invalid parent

    async def validate_page_id(self, page_id: str | None) -> None:
        # raise HTTPException(422) if not in ALLOWED_PAGE_IDS

    async def move(self, id: str, direction: Literal["up", "down"]) -> None:
        # find adjacent sibling, swap sort_order
        # raise HTTPException(400) at boundary

    async def assert_not_protected(self, id: str) -> None:
        # raise HTTPException(403) if id == "menu-config"
```

### Allowed Page IDs (Backend Constant)

Mirrors frontend `ADMIN_PAGES` pageId values:

```python
ALLOWED_PAGE_IDS = {
    "dashboard", "cables", "brands", "manufacturers", "industries",
    "equipment-mfrs", "equipment-cats", "equipment-list",
    "media", "menu-config",
}
```

### Seed Data (Inserted by Migration)

11 items total (10 representing current sidebar after Equipment collapse into group + 1 new `menu-config`):

| id | type | parent_id | page_id / url | label | icon | sort_order |
|---|---|---|---|---|---|---|
| `dashboard` | page | NULL | page_id=`dashboard` | Dashboard | LayoutDashboard | 0 |
| `cables` | page | NULL | page_id=`cables` | Cables | Cable | 1 |
| `brands` | page | NULL | page_id=`brands` | Brands | Tag | 2 |
| `manufacturers` | page | NULL | page_id=`manufacturers` | Manufacturers | Factory | 3 |
| `industries` | page | NULL | page_id=`industries` | Industries | FolderOpen | 4 |
| `equipment` | group | NULL | — | Equipment | Wrench | 5 |
| `equipment-mfrs` | page | `equipment` | page_id=`equipment-mfrs` | Equipment Mfrs | Wrench | 0 |
| `equipment-cats` | page | `equipment` | page_id=`equipment-cats` | Equipment Cats | Wrench | 1 |
| `equipment-list` | page | `equipment` | page_id=`equipment-list` | Equipment | Wrench | 2 |
| `media` | page | NULL | page_id=`media` | Media | Image | 6 |
| `menu-config` | page | NULL | page_id=`menu-config` | Menu Config | Settings | 7 |

Note: original hardcoded three top-level Equipment entries collapse into one `group` + three children.

## Frontend

### Page Registry (`frontend/lib/adminMenuRegistry.ts`)

```typescript
export interface PageRegistryEntry {
  pageId: string;
  href: string;
  defaultLabel: string;
  defaultIcon: string;
}

export const ADMIN_PAGES: PageRegistryEntry[] = [
  { pageId: "dashboard",      href: "/admin",                              defaultLabel: "Dashboard",       defaultIcon: "LayoutDashboard" },
  { pageId: "cables",         href: "/admin/cables",                       defaultLabel: "Cables",           defaultIcon: "Cable" },
  { pageId: "brands",         href: "/admin/brands",                       defaultLabel: "Brands",           defaultIcon: "Tag" },
  { pageId: "manufacturers",  href: "/admin/manufacturers",                defaultLabel: "Manufacturers",    defaultIcon: "Factory" },
  { pageId: "industries",     href: "/admin/industries",                   defaultLabel: "Industries",       defaultIcon: "FolderOpen" },
  { pageId: "equipment-mfrs", href: "/admin/equipment/manufacturers",      defaultLabel: "Equipment Mfrs",   defaultIcon: "Wrench" },
  { pageId: "equipment-cats", href: "/admin/equipment/categories",         defaultLabel: "Equipment Cats",   defaultIcon: "Wrench" },
  { pageId: "equipment-list", href: "/admin/equipment",                    defaultLabel: "Equipment",        defaultIcon: "Wrench" },
  { pageId: "media",          href: "/admin/media",                        defaultLabel: "Media",            defaultIcon: "Image" },
  { pageId: "menu-config",    href: "/admin/menu",                         defaultLabel: "Menu Config",      defaultIcon: "Settings" },
];

export const PAGE_BY_ID: Record<string, PageRegistryEntry> = Object.fromEntries(
  ADMIN_PAGES.map(p => [p.pageId, p])
);
```

### AdminSidebar Refactor (`frontend/components/admin/layout/AdminSidebar.tsx`)

Key changes:
- Remove hardcoded `navLinks` array
- `useEffect` calls `GET /api/admin/menu/tree` on mount
- Loading state: skeleton placeholder (matches existing admin loading style)
- Error fallback: use `ADMIN_PAGES` constant (sidebar always renders, never locks out)
- Two-level collapse: `group` items expand/collapse on click, `useState` for open state
- Auto-expand on load: if `pathname` matches a child item, its parent group is expanded by default
- Render by `type`:
  - `page` → `<Link href={PAGE_BY_ID[page_id].href}>`, same window
  - `link` with `http*` URL → `<a target="_blank" rel="noopener noreferrer">`, new window
  - `link` with relative path → `<Link>`, same window
  - `group` → no link, click toggles expand state only
- Icon rendering: dynamic lookup from `lucide-react` by name, fallback to `Circle` if not found
- `is_visible=false` already filtered by backend tree endpoint

### Active State Logic

- `page`: `pathname === href || pathname.startsWith(href + "/")`
- `link` (relative): same
- `link` (external): no active state
- `group`: parent highlighted if any child is active

### Cache & Refresh

- Sidebar fetches once on mount, no SWR/cache
- After menu editor save/delete: `router.refresh()` + sidebar re-fetches to reflect latest state
- Simple and reliable for MVP

## Menu Editor UI/UX

### Pages

1. **List** `/admin/menu` — tree display of all items (incl. hidden), supports sort/edit/delete
2. **New** `/admin/menu/new` — form
3. **Edit** `/admin/menu/[id]` — same form, prefilled

### List Page Layout

```
┌────────────────────────────────────────────────────┐
│  Menu Items                          [+ New Item]  │
├────────────────────────────────────────────────────┤
│  Dashboard            page   /admin         ↑ ↓ ✏ 🗑 │
│  Cables               page   /admin/cables   ↑ ↓ ✏ 🗑 │
│  ...                                                │
│  ▾ Equipment          group  —              ↑ ↓ ✏ 🗑 │
│      Equipment Mfrs   page   /admin/eq/mfrs  ↑ ↓ ✏ 🗑 │
│      Equipment Cats   page   /admin/eq/cats  ↑ ↓ ✏ 🗑 │
│      Equipment        page   /admin/eq       ↑ ↓ ✏ 🗑 │
│  Media                page   /admin/media    ↑ ↓ ✏ 🗑 │
└────────────────────────────────────────────────────┘
```

- Tree display: top-level left-aligned, children indented one level
- Sort buttons ↑/↓: same-level only, swap `sort_order` via `PUT /api/admin/menu/{id}/sort`
- Edit ✏: navigate to `/admin/menu/[id]`
- Delete 🗑: parent deletion shows confirmation "This will also delete N child item(s)"
- `is_visible=false` items shown grayed out with "(Hidden)" tag
- Top `[+ New Item]` button navigates to `/admin/menu/new`

### Form Fields

| Field | Control | Notes |
|---|---|---|
| Type | Radio: Page / Link / Group | Toggles visibility of related fields |
| Label | Text input | Required |
| ID | Text input | Required, editable on create, read-only on edit (preserves FK relations) |
| Icon | Icon picker | ~30 common lucide icons, searchable, with "no icon" option (nullable) |
| Parent | Select | Options = top-level `group` items + "None (Top Level)" |
| Page (type=page) | Select | Options from `ADMIN_PAGES`, shows `defaultLabel`, value=`pageId` |
| URL (type=link) | Text input | Required, placeholder `/admin/custom` or `https://example.com` |
| Sort Order | Number input | Default 0 |
| Visible | Toggle | Default on |

### Form Interactions

- Type switch clears opposite fields (page→link clears `page_id`, vice versa)
- Type=group hides Page/URL fields
- Parent select: choosing a group makes this item a child; Sort Order then ranks among siblings
- Save success: `router.push("/admin/menu")` + `router.refresh()` to update sidebar

### Icon Picker

- Dropdown grid of ~30 common lucide icons
- Selected icon shows name + rendered preview
- Searchable via simple `filter` on icon name
- Includes "No icon" option (nullable value)

### Delete Protection

- `menu-config` item (points to `/admin/menu`) cannot be deleted
- Backend CRUD hardcodes ID blacklist, returns 403
- Prevents admin from locking themselves out of the menu editor

### Routing

- List, new pages: standard routes
- Edit page: `/admin/menu/[id]`, regular dynamic route (menu IDs contain no slashes, no catch-all needed)

## Error Handling

| Scenario | HTTP | Response |
|---|---|---|
| Non-admin access | 401/403 | Existing `get_current_admin` dependency |
| `parent_id` not found | 422 | `{detail: "Parent menu item not found"}` |
| Parent `type != group` | 422 | `{detail: "Parent must be a group type"}` |
| Parent has `parent_id` (3rd level) | 422 | `{detail: "Maximum depth is 2 levels"}` |
| type=page missing `page_id` | 422 | Pydantic validator |
| type=link missing `url` | 422 | Pydantic validator |
| `page_id` not in whitelist | 422 | `{detail: "Unknown page_id"}` |
| ID conflict | 409 | `{detail: "Menu item ID already exists"}` |
| Sort at boundary | 400 | `{detail: "Already at top/bottom of siblings"}` |
| Delete protected `menu-config` | 403 | `{detail: "Cannot delete protected menu item"}` |
| Sidebar tree fetch failure (frontend) | — | Fallback to `ADMIN_PAGES` constant |

## Testing

### Backend (`backend/tests/api/test_admin_menu.py`)

- Tree query: top-level + children two-level structure correct
- `is_visible=false` excluded from tree, included in flat
- Create: type=page/group/link each, verify persistence
- Hierarchy validation: parent missing / parent non-group / parent has parent → three 422 cases
- Sort: up/down swap, boundary returns 400
- Delete: parent cascades children
- Delete protection: `menu-config` returns 403
- Auth: unauthenticated returns 401

### Frontend

MVP: no automated tests (per project convention). Manual smoke testing covers:
- List page renders tree structure
- New/edit form type switching toggles fields
- Sidebar render + collapse/expand
- Sort/delete reflects in list and sidebar in real time

## Migration (Alembic)

**File**: `backend/alembic/versions/xxxx_add_admin_menu_items.py`

**Steps**:
1. `op.create_table("admin_menu_items", ...)` with all columns + CHECK constraint `type IN ('page','link','group')`
2. Create indexes: `ix_admin_menu_items_parent_id`, `ix_admin_menu_items_parent_id_sort_order`
3. `op.execute(""" INSERT INTO admin_menu_items ... """)` for 10 seed items, using `ON CONFLICT (id) DO NOTHING` for idempotency
4. Downgrade: `op.drop_table("admin_menu_items")` — seed data lost (acceptable, sidebar falls back to frontend constant)

**Simpler than equipment migration**: brand-new table, no legacy data backfill, direct INSERT.

## Deployment Impact

- Migration idempotent via `ON CONFLICT (id) DO NOTHING`, safe to re-run
- Hardcoded sidebar code replaced, takes effect on deploy
- `menu-config` seed item ensures menu editor remains accessible post-deploy

## Out of Scope

- Three-level nesting (only 2 levels supported)
- Per-user / per-role menu customization (single global menu for all admins)
- Drag-and-drop reordering (up/down buttons only)
- Shared codegen between frontend `ADMIN_PAGES` and backend `ALLOWED_PAGE_IDS` (manually synced)
- SWR/React Query caching for sidebar (simple fetch on mount)
- Automated frontend tests (MVP convention)
