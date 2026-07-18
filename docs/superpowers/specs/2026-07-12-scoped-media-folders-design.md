# Scoped Media Folders for Cable & Equipment Manufacturers — Design Spec

**Date:** 2026-07-12
**Status:** Approved (pending spec review)
**Branch:** `feat/media-picker-modal`

## Goal

Give each cable manufacturer and equipment manufacturer a dedicated, auto-provisioned folder tree in the media library. Restrict scoped managers (users with `scope_type="manufacturer"` or `scope_type="equipment_manufacturer"`) to only their own manufacturer's folders. Global admins retain full visibility.

## Background

The media library (`media_folders` + `uploads` tables) already exists with folder CRUD, upload CRUD, and a frontend admin page. The RBAC system already supports `scope_type` of `"manufacturer"` and `"equipment_manufacturer"` on roles/users. However:

1. The `media` module is currently global (`scope_aware: False` in `modules.py` line 19) — every admin with media access sees all uploads.
2. Folders are purely user-created; there is no per-manufacturer provisioning.
3. `require_module("media")` only checks module membership, not `scope_id`.

This spec closes those gaps.

## User Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Folder creation | **Auto-create** on manufacturer creation |
| Folder structure | **Nested + sub-categories** (container → manufacturer → sub-folders) |
| Scoped manager visibility | **Only own manufacturer's folders** (no container, no other manufacturers) |
| Sub-category names | **logos / products / docs** (3 sub-folders per manufacturer) |
| Existing folders | **Clear and rebuild** (TRUNCATE `media_folders` + `uploads`, reset identity to zero) |

## Architecture

### Approach: Add `scope_type` / `scope_id` columns to `media_folders`

Each folder stores its scope directly. Sub-folders inherit the parent's scope values (set once at creation, never change). Queries filter by a single-table `WHERE scope_type = ? AND scope_id = ?` — no JOINs, no recursion.

```
Cable Manufacturers/              scope_type=NULL  scope_id=NULL   (global container)
  Sumitomo Electric/              scope_type="manufacturer"  scope_id="mfr-1"
    logos/                        scope_type="manufacturer"  scope_id="mfr-1"
    products/                     scope_type="manufacturer"  scope_id="mfr-1"
    docs/                         scope_type="manufacturer"  scope_id="mfr-1"
Equipment Manufacturers/          scope_type=NULL  scope_id=NULL   (global container)
  Hitachi Cable/                  scope_type="equipment_manufacturer"  scope_id="em-1"
    logos/                        scope_type="equipment_manufacturer"  scope_id="em-1"
    products/                     scope_type="equipment_manufacturer"  scope_id="em-1"
    docs/                         scope_type="equipment_manufacturer"  scope_id="em-1"
```

**Rejected alternatives:**
- Separate `media_folder_owners` mapping table — requires JOINs + recursive scope inheritance, higher complexity for no benefit.
- Path-string prefix matching — fragile on rename, security risk on name collisions.

## Component Design

### 1. Data Model Changes

**File:** `backend/app/models/folder.py`

Add two nullable columns:

```python
scope_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
scope_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
```

**Semantics:**
- `scope_type=NULL, scope_id=NULL` → global container folder ("Cable Manufacturers", "Equipment Manufacturers")
- `scope_type="manufacturer", scope_id="mfr-xxx"` → cable manufacturer's folder (root or sub-folder, all inherit)
- `scope_type="equipment_manufacturer", scope_id="em-xxx"` → equipment manufacturer's folder

**Index:** `idx_media_folders_scope` on `(scope_type, scope_id)` for fast scope-filtered queries.

### 2. Migration Script

**File:** `backend/alembic/versions/XXXX_scoped_media_folders.py`

**Steps (in order):**

1. **Delete orphaned upload files from disk** — iterate `uploads` table, delete each file at `{MEDIA_DIR}/uploads/{filename}`. This must happen before TRUNCATE because TRUNCATE loses the filename list.
2. `TRUNCATE TABLE media_folders RESTART IDENTITY CASCADE;` — clears folders, resets `media_folders.id` sequence to 1. CASCADE ensures child folders and `uploads.folder_id` references are cleared.
3. `TRUNCATE TABLE uploads RESTART IDENTITY CASCADE;` — clears uploads, resets `uploads.id` sequence to 1.
4. `ALTER TABLE media_folders ADD COLUMN scope_type VARCHAR(50) NULL;`
5. `ALTER TABLE media_folders ADD COLUMN scope_id VARCHAR(100) NULL;`
6. `CREATE INDEX idx_media_folders_scope ON media_folders(scope_type, scope_id);`
7. **Insert two global container folders:**
   ```sql
   INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at)
   VALUES ('Cable Manufacturers', NULL, NULL, NULL, NOW());
   INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at)
   VALUES ('Equipment Manufacturers', NULL, NULL, NULL, NOW());
   ```
8. **Seed manufacturer folders** — for each existing row in `manufacturers`:
   - Insert manufacturer root folder: `name=manufacturer.name, parent_id=<Cable Manufacturers container id>, scope_type='manufacturer', scope_id=manufacturer.id`
   - Insert 3 sub-folders (`logos`, `products`, `docs`) under the manufacturer root, inheriting `scope_type` and `scope_id`.
9. **Seed equipment manufacturer folders** — same pattern, using `equipment_manufacturers` table and the "Equipment Manufacturers" container, with `scope_type='equipment_manufacturer'`.

**Downgrade:** Drop `scope_type`/`scope_id` columns + index. Cannot restore truncated data (data loss is intentional per user decision).

### 3. Folder Provisioning Service

**File:** `backend/app/crud/folder.py` — new method `provision_for_manufacturer`

```python
PROTECTED_SUBFOLDERS = ("logos", "products", "docs")
CONTAINER_NAMES = {
    "manufacturer": "Cable Manufacturers",
    "equipment_manufacturer": "Equipment Manufacturers",
}

async def provision_for_manufacturer(
    self, db: AsyncSession, *, scope_type: str, scope_id: str, name: str
) -> Folder:
    """Create a manufacturer root folder + 3 protected sub-folders.
    
    Called after manufacturer/equipment_manufacturer creation.
    Idempotent: if folder already exists for this scope, returns existing.
    """
    # Find global container
    container = await db.execute(
        select(Folder).where(
            Folder.scope_type.is_(None),
            Folder.name == CONTAINER_NAMES[scope_type],
        )
    )
    container = container.scalar_one()
    
    # Check if manufacturer root already exists (idempotent)
    existing = await db.execute(
        select(Folder).where(
            Folder.scope_type == scope_type,
            Folder.scope_id == scope_id,
            Folder.parent_id == container.id,
        )
    )
    existing = existing.scalar_one_or_none()
    if existing:
        return existing
    
    # Create manufacturer root
    root = Folder(name=name, parent_id=container.id, scope_type=scope_type, scope_id=scope_id)
    db.add(root)
    await db.flush()  # get root.id
    
    # Create 3 protected sub-folders
    for sub_name in PROTECTED_SUBFOLDERS:
        sub = Folder(name=sub_name, parent_id=root.id, scope_type=scope_type, scope_id=scope_id)
        db.add(sub)
    
    await db.commit()
    await db.refresh(root)
    return root
```

### 4. Lifecycle Hooks

**Manufacturer creation hook** — `backend/app/api/routes/manufacturers.py` `create_manufacturer`:

```python
@router.post("", response_model=ManufacturerRead, status_code=status.HTTP_201_CREATED)
async def create_manufacturer(...):
    # ... existing scope check + create logic ...
    obj = await crud_manufacturer.create(db, obj_in=obj_in)
    # Auto-provision media folder
    await crud_folder.provision_for_manufacturer(
        db, scope_type="manufacturer", scope_id=obj.id, name=obj.name
    )
    return obj
```

**Equipment manufacturer creation hook** — `backend/app/api/routes/equipment_manufacturers.py` `create_equipment_manufacturer`: same pattern with `scope_type="equipment_manufacturer"`.

**Manufacturer delete hook** — `delete_manufacturer` and `delete_equipment_manufacturer`:
1. Find all folders with `scope_type=X, scope_id=manufacturer.id`
2. For each upload in those folders: delete disk file + delete upload record
3. Delete all folders with that scope (CASCADE handles sub-folders)

**Manufacturer rename hook** — `update_manufacturer` and `update_equipment_manufacturer`:
- If `obj_in.name` differs from current `obj.name`, update the manufacturer root folder's `name` (the one with `scope_type=X, scope_id=id, parent_id=container.id`).
- Sub-folder names (logos/products/docs) never change.

### 5. Scope-Aware Access Control

**Module registry change** — `backend/app/core/modules.py` line 19:

```python
# media module becomes scope_aware, but scope_type=None means it supports
# BOTH global access and scoped access (determined at runtime by user's role)
{"id": "media", "label": "Media", "scope_aware": True, "scope_type": None},
```

**Note:** `scope_aware=True` with `scope_type=None` is a new pattern. It signals: "this module supports scoped access, but the scope_type is determined by the user's role, not fixed to one type." The `VALID_SCOPE_TYPES` set already includes `None`, so no change needed there.

**Important:** `validate_scope_id` in `scope_resolvers.py` treats `scope_type=None` as "global role, scope_id must be None." This is correct for role assignment validation. The media module's runtime scope detection (`get_media_scope`) is separate — it inspects the user's role at request time, not at role-assignment time. No conflict.

**New dependency function** — `backend/app/api/deps.py`:

```python
def get_media_scope(user: User = Depends(get_current_user)) -> tuple[str | None, str | None]:
    """Returns (scope_type, scope_id) for media filtering.
    
    - Global admin/role (scope_type=None): returns (None, None) → sees all folders
    - Scoped role (manufacturer/equipment_manufacturer): returns (role.scope_type, user.scope_id)
    """
    if user.role and user.role.scope_type in ("manufacturer", "equipment_manufacturer"):
        return (user.role.scope_type, user.scope_id)
    return (None, None)
```

**Folder list filtering** — `backend/app/crud/folder.py` `list_all_with_counts`:

```python
async def list_all_with_counts(
    self, db: AsyncSession, *, scope_type: str | None = None, scope_id: str | None = None
) -> list[tuple[Folder, int]]:
    # ... count subquery unchanged ...
    
    stmt = select(Folder).order_by(Folder.name)
    if scope_type is not None:
        # Scoped user: only own folders (exclude global containers)
        stmt = stmt.where(Folder.scope_type == scope_type, Folder.scope_id == scope_id)
    # else: global admin sees all
    # ... rest unchanged ...
```

**Upload list filtering** — `backend/app/crud/upload.py` `list_paginated`:

```python
async def list_paginated(
    self, db: AsyncSession, *, page=1, page_size=20, folder_id=None,
    scope_type: str | None = None, scope_id: str | None = None,
):
    stmt = select(Upload)
    if scope_type is not None:
        # Scoped user: only uploads in their folders
        folder_ids_subq = select(Folder.id).where(
            Folder.scope_type == scope_type, Folder.scope_id == scope_id
        )
        stmt = stmt.where(Upload.folder_id.in_(folder_ids_subq))
    # ... folder_id filter + pagination unchanged ...
```

Scoped users never see orphan uploads (`folder_id=NULL`).

**Operation guards** — new helper `crud/folder.py`:

```python
async def assert_folder_in_scope(
    db: AsyncSession, folder_id: int, scope_type: str | None, scope_id: str | None
) -> Folder:
    """Returns folder if it belongs to the given scope, raises 403 otherwise."""
    folder = await db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(404, ...)
    if scope_type is not None:
        if folder.scope_type != scope_type or folder.scope_id != scope_id:
            raise HTTPException(403, "Folder outside your scope")
    return folder
```

**Applied to:**
- `POST /api/uploads/` — scoped user MUST provide a `folder_id` in their scope (folder_id=NULL rejected with 400 for scoped users); if `folder_id` provided, assert it's in scope
- `PATCH /api/uploads/{id}` (move) — assert target `folder_id` in scope, and source upload's current folder in scope
- `PUT/DELETE /api/uploads/{id}` — assert upload's `folder_id` in scope (if upload.folder_id is NULL, scoped users get 403)
- `POST /api/folders` — if `parent_id` provided, assert parent in scope; scoped users must always provide a `parent_id` (cannot create root-level folders)
- `PUT/DELETE /api/folders/{id}` — assert folder in scope

**Explicit null-folder check for scoped users** — `upload_file` route:

```python
if scope_type is not None and folder_id is None:
    raise HTTPException(400, "Scoped users must upload to a specific folder")
```

**Protected sub-folder guard** — `crud/folder.py`:

```python
async def delete_folder(...) -> ...:
    # ... existing checks ...
    if folder.name in PROTECTED_SUBFOLDERS and folder.scope_type is not None:
        raise HTTPException(403, "Cannot delete protected sub-folder (logos/products/docs)")
```

This applies to all users (including global admin) to preserve the standard structure.

### 6. Route Changes

**File:** `backend/app/api/routes/folders.py`

All route handlers gain `scope = Depends(get_media_scope)` parameter, pass it to CRUD methods:

```python
@router.get("", response_model=FolderTreeResponse)
async def list_folders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("media")),
    scope: tuple[str | None, str | None] = Depends(get_media_scope),
):
    rows = await crud_folder.list_all_with_counts(
        db, scope_type=scope[0], scope_id=scope[1]
    )
    # ... rest unchanged ...
```

Same pattern for `create_folder`, `rename_folder`, `delete_folder` — each calls `assert_folder_in_scope` before operating.

**File:** `backend/app/api/routes/uploads.py`

All route handlers gain `scope = Depends(get_media_scope)`:

- `upload_file`: if `folder_id` provided, call `assert_folder_in_scope(db, folder_id, scope[0], scope[1])`
- `list_uploads`: pass scope to `list_paginated`
- `rename_upload`, `move_upload`, `delete_upload`: assert upload's current folder in scope (if folder_id not null)

### 7. Frontend Changes

**No structural changes needed.** The frontend already fetches folders/uploads via API and renders what the backend returns. Scope filtering happens server-side.

**Minor UI adjustment** — `frontend/app/admin/(dashboard)/media/page.tsx`:
- The "New Folder" button remains visible to all users with media module access
- Scoped managers can only create sub-folders within their manufacturer root (enforced server-side via `assert_folder_in_scope` on `parent_id`)
- No client-side scope logic — server is the single source of truth

**No changes to:**
- `frontend/lib/clientFolders.ts`
- `frontend/lib/clientUploads.ts`
- `frontend/components/admin/media/FolderTree.tsx`
- `frontend/components/admin/media/MediaGrid.tsx`
- `frontend/components/admin/form/MediaPickerModal.tsx`

### 8. Testing

**New file:** `backend/tests/api/test_media_scope.py`

Test fixtures (in `conftest.py`):
- `cable_manager_user` — role with `scope_type="manufacturer"`, `scope_id="mfr-test"`, permissions include `media`
- `equipment_manager_user` — role with `scope_type="equipment_manufacturer"`, `scope_id="em-test"`, permissions include `media`
- `global_admin_user` — existing admin role with all modules

**Test cases:**

1. **Folder visibility:**
   - Global admin sees all folders (containers + all manufacturer folders)
   - Cable manager sees only 4 folders: their manufacturer root + logos/products/docs
   - Equipment manager sees only 4 folders: their manufacturer root + logos/products/docs
   - Scoped user does NOT see global container folders

2. **Upload visibility:**
   - Global admin sees all uploads
   - Scoped manager sees only uploads in their folders
   - Scoped manager does NOT see orphan uploads (folder_id=NULL)

3. **Upload operations:**
   - Scoped manager uploads to own folder → 201
   - Scoped manager uploads to other manufacturer's folder → 403
   - Scoped manager uploads with folder_id=NULL → 403 (orphans not allowed for scoped users)

4. **Move operations:**
   - Scoped manager moves upload to own folder → 200
   - Scoped manager moves upload to other manufacturer's folder → 403

5. **Folder CRUD:**
   - Scoped manager creates sub-folder in own root → 201
   - Scoped manager creates folder under global container → 403
   - Scoped manager deletes own sub-folder (non-protected) → 204
   - Scoped manager deletes protected sub-folder (logos/products/docs) → 403
   - Scoped manager deletes own manufacturer root → 403 (protected as it has children)

6. **Auto-provisioning:**
   - Create manufacturer → 4 folders auto-created (root + logos/products/docs)
   - Create equipment manufacturer → 4 folders auto-created
   - Provisioning is idempotent (calling twice for same scope returns existing, no duplicates)

7. **Lifecycle:**
   - Delete manufacturer → all folders + uploads for that scope deleted (disk files too)
   - Rename manufacturer → manufacturer root folder name updated, sub-folders unchanged

**Existing test updates:**
- `backend/tests/conftest.py` — fixtures that created folders/uploads directly must account for the new `scope_type`/`scope_id` columns (set them or use `provision_for_manufacturer`)
- Tests in `test_admin_menu.py`, `test_admin_members.py`, etc. that don't touch media are unaffected

### 9. Edge Cases

| Case | Behavior |
|---|---|
| Manufacturer created but name collides with existing in container | `provision_for_manufacturer` uses `scope_type+scope_id` check (not name), so no collision. Two manufacturers with same name get separate folders. |
| Manufacturer deleted but uploads still referenced by `image_url` strings | `image_url` fields are plain strings (not FKs), so deleting the upload record doesn't break the DB. The URL will 404. This is an existing issue (documented in project_memory.md) and out of scope for this fix. |
| Scoped manager's role loses `media` module permission | `require_module("media")` returns 403 — they can't access media at all. Correct behavior. |
| Global admin creates folder at root level (parent_id=NULL) | Allowed — global admin can create additional global folders. These are visible only to global admins (scope_type=NULL folders are invisible to scoped users). |
| Manufacturer name contains special characters | Stored as-is in `folder.name`. The unique constraint is on `(parent_id, name)`, so special characters are fine. |
| Disk file deletion fails during manufacturer delete | Log error, continue with DB deletion. The DB record is the source of truth; orphaned disk files are a cleanup concern. |

## Files Modified/Created

### Modified:
- `backend/app/models/folder.py` — add `scope_type`, `scope_id` columns
- `backend/app/crud/folder.py` — add `provision_for_manufacturer`, `assert_folder_in_scope`, update `list_all_with_counts`, `delete_folder`
- `backend/app/crud/upload.py` — update `list_paginated` with scope filter
- `backend/app/api/routes/folders.py` — add `get_media_scope` dependency to all handlers
- `backend/app/api/routes/uploads.py` — add `get_media_scope` dependency + scope guards
- `backend/app/api/routes/manufacturers.py` — call `provision_for_manufacturer` after create, cleanup on delete, rename on update
- `backend/app/api/routes/equipment_manufacturers.py` — same hooks as manufacturers
- `backend/app/api/deps.py` — add `get_media_scope` function
- `backend/app/core/modules.py` — change `media` module to `scope_aware=True`
- `backend/tests/conftest.py` — add scoped user fixtures, update folder/upload fixtures

### Created:
- `backend/alembic/versions/XXXX_scoped_media_folders.py` — migration
- `backend/tests/api/test_media_scope.py` — scope tests

### Unchanged:
- All frontend files (scope filtering is server-side)
- `backend/app/schemas/folder.py` — `FolderRead` does not expose scope_type/scope_id (not needed by frontend; scope is a backend concern)
- `backend/app/schemas/upload.py` — unchanged

## Out of Scope

- Wiring `Upload.entity_type`/`entity_id` to manufacturer `image_url` fields (existing stub, future work)
- Migrating existing `image_url` values to reference `uploads` table (future work)
- Frontend UI for showing which manufacturer a folder belongs to (not needed — scoped users only see their own)
- Backup/restore of deleted media on manufacturer delete (intentional data loss)
