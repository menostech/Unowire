---
comet_change: add-resource-document-management
role: technical-design
canonical_spec: openspec
---

# Resource Document Management — Technical Design Doc

## 1. Overview

This document deepens the technical implementation details for the `add-resource-document-management` change. The high-level architecture decisions are captured in `openspec/changes/add-resource-document-management/design.md` (7 decisions: separate tables, reuse existing scope types, original file preservation, `/media/resources/` storage, 50MB limit, download tracking, ID generation). This doc covers implementation patterns, edge cases, and test strategy.

**Change**: `add-resource-document-management`
**Capability**: `resource-document-module`
**OpenSpec artifacts**: `openspec/changes/add-resource-document-management/{proposal,design,specs/resource-document-module/spec,tasks}.md`

## 2. Architecture

The module mirrors the Equipment module pattern but with two key simplifications per design D2:
- **No `resource_manufacturers` table** — `resources.scope_type` and `resources.scope_id` reuse the three existing manufacturer scope types.
- **Two admin modules only** (`resource_cats`, `resource_list`) — no `resource_mfrs` module since there is no resource-specific manufacturer entity.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                         │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │ /api/        │   │ /api/            │   │ /api/portal/    │  │
│  │ resources    │   │ resource-        │   │ resources       │  │
│  │ (public+admin)│   │ categories       │   │ (portal scoped) │  │
│  └──────┬───────┘   └────────┬─────────┘   └────────┬────────┘  │
│         │                    │                      │           │
│         ▼                    ▼                      ▼           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              app/crud/resource.py                        │    │
│  │   crud_resource  ·  crud_resource_category               │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                       │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐           │
│  │ Resource   │  │ Resource   │  │ resource_storage │           │
│  │ Model      │  │ Category   │  │ (utils)          │           │
│  │            │  │ Model      │  │ save/delete file │           │
│  └────────────┘  └────────────┘  └──────────────────┘           │
│                                                                  │
│  Storage: {MEDIA_DIR}/resources/{uuid}.{ext}                     │
│           (separate from {MEDIA_DIR}/uploads/ for images)        │
└─────────────────────────────────────────────────────────────────┘
         ▲                           ▲                    ▲
         │                           │                    │
┌────────┴────────┐     ┌────────────┴────────┐  ┌────────┴────────┐
│  Next.js proxies │     │  Next.js proxies    │  │ Next.js proxies │
│  /api/admin/     │     │  /api/admin/        │  │ /api/portal/    │
│  resources       │     │  resource-categories│  │ resources       │
└────────┬────────┘     └────────────┬────────┘  └────────┬────────┘
         │                           │                    │
┌────────┴────────┐     ┌────────────┴────────┐  ┌────────┴────────┐
│ Admin pages     │     │ Admin category pages│  │ Portal pages    │
│ /admin/resources│     │ /admin/resources/   │  │ /portal/resources│
│                 │     │   categories        │  │                 │
└─────────────────┘     └─────────────────────┘  └─────────────────┘

         ┌─────────────────────┐
         │  Public pages       │
         │  /resources         │
         │  /resources/[slug]  │
         └─────────────────────┘
```

## 3. Implementation Details

### 3.1 Backend Models (`backend/app/models/resource.py`)

Two models, mirroring `equipment.py` patterns:

**`ResourceCategory`** (table `resource_categories`):
- `id: str` (PK, String(100))
- `parent_id: str | None` (FK → `resource_categories.id`, ON DELETE CASCADE)
- `label: str` (String(200), NOT NULL)
- `slug: str` (String(200), NOT NULL)
- `description: str | None` (Text)
- `image_url: str | None` (String(500))
- `sort_order: int` (default 0)
- `created_at`, `updated_at` (datetime, utcnow)
- `UniqueConstraint("parent_id", "slug", name="uq_resource_categories_parent_slug")`
- Self-referential relationships: `parent` (remote_side=id), `children` (order_by=sort_order), `resources` (back_populates)

**`Resource`** (table `resources`):
- `id: str` (PK, String(100))
- `category_id: str` (FK → `resource_categories.id`, ON DELETE RESTRICT, NOT NULL)
- `title: str` (String(300), NOT NULL)
- `slug: str` (String(300), NOT NULL, unique)
- `description: str | None` (Text)
- `file_filename: str | None` (String(500)) — original filename
- `file_content_type: str | None` (String(200)) — original MIME type
- `file_size_bytes: int | None` (Integer) — original size
- `file_url_path: str | None` (String(500)) — `/media/resources/{uuid}.{ext}`
- `external_url: str | None` (String(500)) — for external links
- `thumbnail_url: str | None` (String(500)) — optional thumbnail
- `scope_type: str | None` (String(50)) — NULL=global, or one of `manufacturer`/`equipment_manufacturer`/`terminal_manufacturer`
- `scope_id: str | None` (String(100)) — references the manufacturer record
- `download_count: int` (Integer, default 0)
- `sort_order: int` (default 0)
- `is_published: bool` (Boolean, default True)
- `created_at`, `updated_at`
- `category` relationship (back_populates, lazy="selectin")

### 3.2 Backend Schemas (`backend/app/schemas/resource.py`)

Mirror equipment schemas with adaptations:

- `ResourceCategoryBase/Read/Create/Update` — flat fields
- `ResourceCategoryTreeRead` — flat `children: list[ResourceCategoryRead]` (NOT recursive, avoids `MissingGreenlet`)
- `ResourceBase/Read/Create/Update` — includes all fields; `Read` nests `category: ResourceCategoryRead | None`
- `PortalResourceCreate` — omits `id`, `scope_type`, `scope_id`, `is_published` (server forces these)
- `PortalResourceUpdate` — same omissions

### 3.3 Backend CRUD (`backend/app/crud/resource.py`)

Built on `CRUDBase` from `app/crud/base.py`:

**`CRUDResourceCategory`**:
- `get_all_top_level_with_children(db)` — `selectinload(children)`, order by `sort_order`
- `get_with_children(db, id)`
- `get_all_flat(db)` — all categories flat (for admin dropdowns)

**`CRUDResource`**:
- `get_with_relations(db, id)` — `selectinload(category)`
- `get_by_slug(db, slug)` — single resource by slug (public detail page)
- `get_all_with_relations(db, *, page, page_size, category_id=None, scope_type=None, scope_id=None, q=None, is_published=None)` — returns `(items, total)`; when `category_id` is a root, also matches its children's resources
- `list_by_scope(db, *, scope_type, scope_id, skip, limit, search=None, category_id=None)` — portal-specific
- `increment_download_count(db, id)` — `UPDATE resources SET download_count = download_count + 1 WHERE id = :id` (atomic)

All relation loading uses `selectinload` to avoid async `MissingGreenlet`.

### 3.4 File Storage Utility (`backend/app/utils/resource_storage.py`)

```python
ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "dwg", "dxf", "zip", "rar", "7z",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

async def save_resource_file(file: UploadFile) -> tuple[str, str, int, str]:
    """Returns (original_filename, content_type, size_bytes, url_path)."""
    # 1. Read content
    content = await file.read()
    size = len(content)
    if size > MAX_FILE_SIZE:
        raise HTTPException(413, {"code": 413, "message": "File too large (max 50 MB)"})
    # 2. Extract and validate extension
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, {"code": 415, "message": "Unsupported file type"})
    # 3. Store
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    resources_dir = os.path.join(MEDIA_DIR, "resources")
    os.makedirs(resources_dir, exist_ok=True)
    file_path = os.path.join(resources_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)
    url_path = f"/media/resources/{stored_name}"
    return (file.filename, file.content_type or "application/octet-stream", size, url_path)

def delete_resource_file(url_path: str) -> None:
    """Remove file from disk; silently ignore if missing."""
    if not url_path:
        return
    try:
        relative = url_path.lstrip("/media/")
        file_path = os.path.join(MEDIA_DIR, relative)
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass  # log but don't raise
```

### 3.5 Public + Admin Routes (`backend/app/api/routes/resource.py`)

Router created without prefix; prefix added in `main.py` as `/api/resources`.

**Public endpoints** (no auth):
- `GET /` — paginated list of `is_published=True` resources; filters: `category_id` (matches category + its children), `q` (title/description ILIKE), `page`, `page_size`
- `GET /{slug}` — single resource by slug (must be `is_published=True`)
- `GET /{id}/download` — streams file via `FileResponse`; atomic `download_count` increment; 404 if no file stored

**Admin endpoints** (gated by `require_operator("resource_list")`):
- `GET /admin` — list all resources; scoped admins see only their scope
- `POST /admin` — multipart create: `UploadFile` + form fields; admin-supplied `id`; scoped admins cannot set `scope_type`/`scope_id` to foreign values (403)
- `PUT /admin/{id}` — update; optional new file (replaces old file on disk); scoped admins can only edit own resources
- `DELETE /admin/{id}` — delete record + remove file from disk

**Multipart form fields for create/update**:
- `file: UploadFile | None` (optional on update, required on create if no `external_url`)
- `id: str` (create only, admin-supplied)
- `title, slug, category_id, description, external_url, thumbnail_url, sort_order, is_published`
- `scope_type, scope_id` (admin-only, scoped admins cannot set foreign values)

### 3.6 Category Routes (`backend/app/api/routes/resource_categories.py`)

Router prefix `/api/resource-categories` (in `main.py`).

**Public** (no auth): `GET /` (tree), `GET /flat` (flat list), `GET /{id}`
**Admin** (`require_operator("resource_cats")`): `POST /`, `PUT /{id}`, `DELETE /{id}`

**2-level depth enforcement** (in create/update):
```python
if parent_id:
    parent = await crud_resource_category.get(db, id=parent_id)
    if parent and parent.parent_id is not None:
        raise HTTPException(422, {"code": 422, "message": "Maximum depth is 2 levels"})
```

**Delete guards**: reject 409 if `category.children` non-empty or `category.resources` non-empty.

### 3.7 Portal Routes (`backend/app/api/routes/portal_resource.py`)

Router prefix baked in: `router = APIRouter(prefix="/api/portal/resources", tags=["portal-resources"])`. Registered bare in `main.py`.

All endpoints use `Depends(require_factory_module("resources"))`.

- `GET /` — `list_by_scope(scope_type=user.scope_type, scope_id=user.scope_id, ...)`
- `GET /{id}` — ownership check: 404 if `scope_id != user.scope_id`
- `POST /` — server forces `scope_type`/`scope_id` from user; ID = `{scope_id}-{slug}` with UUID8 fallback on `IntegrityError`; rejects `is_published=false` (422)
- `PUT /{id}` — ownership check; preserves `scope_type`/`scope_id`/`is_published` (portal cannot change these)
- `DELETE /{id}` — ownership check; delete record + file; 204

**Portal ownership helper**:
```python
async def _check_resource_ownership(db, user, resource_id) -> Resource:
    resource = await crud_resource.get_with_relations(db, id=resource_id)
    if not resource or resource.scope_id != user.scope_id or resource.scope_type != user.scope_type:
        raise HTTPException(404, {"code": 404, "message": "Resource not found"})
    return resource
```

### 3.8 Configuration Updates

**`backend/app/core/modules.py`** — add two entries (no new scope type):
```python
{"id": "resource_cats", "label": "Resource Cats", "scope_aware": False, "scope_type": None},
{"id": "resource_list", "label": "Resource List", "scope_aware": True, "scope_type": None},
```
`scope_type: None` on `resource_list` because the module reuses existing scope types — the role's `scope_type` determines which manufacturer table to validate against.

**`backend/app/api/deps.py`** — add `"resources"` to all three scope sets:
```python
_FACTORY_ALLOWED_BY_SCOPE = {
    "manufacturer": {"dashboard", "cables", "inquiries", "media", "me", "messages", "resources"},
    "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me", "messages", "resources"},
    "terminal_manufacturer": {"dashboard", "terminals", "inquiries", "media", "me", "messages", "resources"},
}
```

**`backend/app/main.py`** — register routers + create `resources` directory:
```python
app.include_router(resource.router, prefix=f"{settings.api_prefix}/resources", tags=["resources"])
app.include_router(resource_categories.router, prefix=f"{settings.api_prefix}/resource-categories", tags=["resource-categories"])
app.include_router(portal_resource.router)  # prefix baked in router
# In startup section:
os.makedirs(os.path.join(media_dir, "resources"), exist_ok=True)
```

### 3.9 Migration Strategy

**Migration 1** (`c9d0e1f2a3b4_add_resource_categories_and_resources.py`):
- `down_revision` = latest existing revision
- Create `resource_categories` table with `uq_resource_categories_parent_slug` constraint
- Create `resources` table with FK `category_id` → `resource_categories.id` (ON DELETE RESTRICT)
- No data migration needed (new tables)

**Migration 2** (`d0e1f2a3b4c5_seed_admin_resources_menu_and_permissions.py`):
- `down_revision` = `c9d0e1f2a3b4`
- Seed `admin_menu_items`:
  - `('resources', NULL, 'group', NULL, NULL, 'Resources', 'FileText', 6, ...)`
  - `('resources-list', 'resources', 'page', 'resources-list', NULL, 'Resources', 'FileText', 0, ...)`
  - `('resources-cats', 'resources', 'page', 'resources-cats', NULL, 'Categories', 'FileText', 1, ...)`
- Seed `role_permissions` for `admin` role: `('admin', 'resource_cats')`, `('admin', 'resource_list')`
- All inserts use `ON CONFLICT (id) DO NOTHING` (menu items) / `ON CONFLICT (role_id, module) DO NOTHING` (permissions)

### 3.10 Frontend Architecture

**Admin pages** (`frontend/app/admin/(dashboard)/resources/`):
- `page.tsx` — list with filters (category dropdown from flattened tree, keyword, scope), pagination via `<Link>`
- `new/page.tsx` — loads categories, renders `<ResourceForm>`
- `[id]/page.tsx` — loads resource + categories, renders `<ResourceForm initial={...}>`
- `categories/page.tsx` — 2-level tree management
- `categories/new/page.tsx`, `categories/[...id]/page.tsx`

**`ResourceForm` component** (`frontend/components/admin/form/ResourceForm.tsx`):
- Client component with `<form encType="multipart/form-data">`
- Fields: file input (accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"), title, slug, category_id (select), description, external_url, thumbnail_url, sort_order, is_published (checkbox)
- Edit mode: shows current file info, optional file replacement
- Submits to Next.js proxy `/api/admin/resources` (POST) or `/api/admin/resources/{id}` (PUT)

**Public pages** (`frontend/app/(site)/resources/`):
- `page.tsx` — category nav sidebar + search + paginated list
- `[slug]/page.tsx` — detail with download button / external link

**Portal pages** (`frontend/app/portal/resources/`):
- `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `loading.tsx`
- Portal form omits `is_published` (server forces true)

**Next.js proxies** (`frontend/app/api/`):
- `admin/resources/route.ts` + `admin/resources/[id]/route.ts`
- `admin/resource-categories/route.ts` + `admin/resource-categories/[...id]/route.ts`
- `portal/resources/route.ts` + `portal/resources/[id]/route.ts`

Multipart forwarding pattern:
```typescript
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const formData = await request.formData();
  const res = await fetch(`${API_BASE}/api/resources/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,  // do NOT set Content-Type; let fetch set the boundary
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
```

**Registries**:
- `lib/adminModules.ts` — add 2 mirror entries
- `lib/adminMenuRegistry.ts` — add 2 `ADMIN_PAGES` entries with kebab-case `pageId`s
- `components/admin/layout/AdminSidebar.tsx` — add 2 `PAGE_ID_TO_MODULE_ID` mappings
- `components/portal/layout/PortalSidebar.tsx` — add "Resources" `NavItem` to all three scope nav arrays
- `lib/adminApi.ts` — add `BackendResource`, `BackendResourceCategory` interfaces + `resources` + `resourceCategories` namespaces
- `lib/portalApi.ts` — add `resources` namespace + reuse public `resourceCategories`

## 4. Edge Cases and Error Handling

| Scenario | Handling |
|----------|----------|
| File with no extension | 415 "Unsupported file type" |
| File > 50 MB | 413 "File too large (max 50 MB)" |
| `octet-stream` MIME (DWG/DXF) | Validate by extension whitelist |
| Slug collision (admin) | 409 "Slug already exists" |
| Slug collision (portal) | Auto-append `-{uuid8}` suffix, retry |
| Delete category with children | 409 "Cannot delete category with children" |
| Delete category with resources | 409 "Category is in use" |
| 3rd-level category attempt | 422 "Maximum depth is 2 levels" |
| Download missing file (DB has record, disk missing) | 404 + log warning |
| Portal user sets `is_published=false` | 422 "Portal users cannot unpublish resources" |
| Portal user accesses foreign resource | 404 (not 403, to avoid leaking existence) |
| Scoped admin creates foreign-scope resource | 403 "Cannot create resource outside your scope" |
| Upload interrupted (partial file on disk) | Exception handler cleans up partial file |
| Delete resource — file removal fails | Log error, DB delete still succeeds (avoid orphaning records) |

## 5. Testing Strategy

No automated test framework in this project. Verification via manual flows (tasks.md group 12):

1. **Model + migration**: `alembic upgrade head` runs cleanly; tables exist with correct constraints
2. **Backend startup**: `/docs` shows new route groups; no import errors
3. **Admin flow**: Create category → upload PDF → edit (no file change) → replace file → delete (verify file removed from disk)
4. **Public flow**: Browse `/resources` → filter by category → search → open detail → download (verify filename + count increment)
5. **Portal flow**: Login as each of 3 scope types → see "Resources" nav → upload → verify scope isolation (404 on foreign resource)
6. **Scope isolation**: Portal `is_published=false` rejected (422); global resources visible publicly; portal resources visible publicly (default published)
7. **Regression**: Existing `/api/uploads` image pipeline unaffected (PIL → WebP, 5MB limit)

## 6. File Inventory

### New files (backend)
- `backend/app/models/resource.py`
- `backend/app/schemas/resource.py`
- `backend/app/crud/resource.py`
- `backend/app/utils/resource_storage.py`
- `backend/app/api/routes/resource.py`
- `backend/app/api/routes/resource_categories.py`
- `backend/app/api/routes/portal_resource.py`
- `backend/alembic/versions/c9d0e1f2a3b4_add_resource_categories_and_resources.py`
- `backend/alembic/versions/d0e1f2a3b4c5_seed_admin_resources_menu_and_permissions.py`

### Modified files (backend)
- `backend/app/models/__init__.py` (register models)
- `backend/app/core/modules.py` (add 2 modules)
- `backend/app/api/deps.py` (add "resources" to 3 scope sets)
- `backend/app/main.py` (register routers + create resources dir)

### New files (frontend)
- `frontend/app/admin/(dashboard)/resources/page.tsx`
- `frontend/app/admin/(dashboard)/resources/new/page.tsx`
- `frontend/app/admin/(dashboard)/resources/[id]/page.tsx`
- `frontend/app/admin/(dashboard)/resources/categories/page.tsx`
- `frontend/app/admin/(dashboard)/resources/categories/new/page.tsx`
- `frontend/app/admin/(dashboard)/resources/categories/[...id]/page.tsx`
- `frontend/app/(site)/resources/page.tsx`
- `frontend/app/(site)/resources/[slug]/page.tsx`
- `frontend/app/portal/resources/page.tsx`
- `frontend/app/portal/resources/new/page.tsx`
- `frontend/app/portal/resources/[id]/page.tsx`
- `frontend/app/portal/resources/loading.tsx`
- `frontend/app/api/admin/resources/route.ts`
- `frontend/app/api/admin/resources/[id]/route.ts`
- `frontend/app/api/admin/resource-categories/route.ts`
- `frontend/app/api/admin/resource-categories/[...id]/route.ts`
- `frontend/app/api/portal/resources/route.ts`
- `frontend/app/api/portal/resources/[id]/route.ts`
- `frontend/components/admin/form/ResourceForm.tsx`
- `frontend/components/admin/form/ResourceCategoryForm.tsx`
- `frontend/components/portal/form/ResourceForm.tsx`

### Modified files (frontend)
- `frontend/lib/adminApi.ts` (add resource + resourceCategory namespaces)
- `frontend/lib/portalApi.ts` (add resources namespace)
- `frontend/lib/api.ts` (add public resources namespace)
- `frontend/lib/adminModules.ts` (add 2 mirror entries)
- `frontend/lib/adminMenuRegistry.ts` (add 2 page entries)
- `frontend/components/admin/layout/AdminSidebar.tsx` (add 2 PAGE_ID_TO_MODULE_ID mappings)
- `frontend/components/portal/layout/PortalSidebar.tsx` (add Resources nav to 3 scope arrays)
- `frontend/components/home/HeroSearch.tsx` (optional: add Resources tab)
