# Media Library Folder Management Design

**Date:** 2026-07-04
**Status:** Approved (pending user review)
**Topic:** Refactor admin `/admin/media` page into a two-pane Explorer-style image library with folder tree + thumbnail grid

## 1. Architecture & Data Model

### Layout

Two-pane Explorer-style layout:
- **Left pane:** Folder tree (virtual nodes + user folders, nested up to 5 levels)
- **Right pane:** Thumbnail grid for the currently selected folder, paginated 20/page

### New `Folder` Model

```python
class Folder(Base):
    __tablename__ = "media_folders"
    id: int (PK)
    name: str(100)            # folder display name
    parent_id: int | None     # FK -> media_folders.id, NULL = top-level
    created_at: datetime
    # Unique(parent_id, name) prevents duplicate names within same parent
```

### `Upload` Model Change

Add `folder_id: int | None` (FK -> media_folders.id, nullable, `ON DELETE SET NULL`).
- `NULL` = "unfiled" (root-level loose files)
- Existing uploads get `NULL` on migration (no data loss)

### Coexistence with `entity_type` / `entity_id`

Folders are a user-facing organization tool. Entity association tracks system usage. The two systems are orthogonal:
- A logo in `/brands/toyota` folder can still be associated with the `toyota` brand via `entity_type=brand, entity_id=toyota`
- IndustryForm / BrandForm / CategoryForm image pickers are unchanged

### Left Tree Structure

Three virtual nodes at the top, user folders below:

```
📁 All Files (123)        <- all uploads regardless of folder_id
📁 Unfiled (45)           <- folder_id IS NULL
── My Folders ──
📁 logos (12)
   📁 brands (8)
   📁 categories (4)
📁 banners (5)
```

- Click "All Files" -> right pane shows everything
- Click "Unfiled" -> right pane shows `folder_id IS NULL` only
- Click a user folder -> right pane filters to `folder_id = X`

### Image Rename

Add `PUT /api/admin/uploads/{id}` endpoint to update `original_filename`. Frontend exposes via right-click "Rename" on thumbnails.

### Video Upload (MP4)

**Out of scope.** Backend keeps `image/` content-type validation. Thumbnail generation logic stays image-only.

## 2. Backend API

### New `/api/admin/folders` Route Group

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/folders` | Return entire folder tree (one query, frontend builds tree recursively) |
| `POST` | `/api/admin/folders` | Create folder, body: `{ name, parent_id }` |
| `PUT` | `/api/admin/folders/{id}` | Rename folder, body: `{ name }` (no move/reparent to avoid cycle complexity) |
| `DELETE` | `/api/admin/folders/{id}` | Delete empty folder only; non-empty returns 409 |

### Extended `/api/admin/uploads` Routes

| Change | Details |
|---|---|
| `GET /api/admin/uploads?folder_id=X` | New `folder_id` query param. Numeric -> filter by folder; `none` -> filter unfiled; omitted -> return all |
| `POST /api/admin/uploads` | New optional `folder_id` form field, assigns upload to folder on creation |
| `PATCH /api/admin/uploads/{id}` | New endpoint, body: `{ folder_id }` to move upload (set NULL to move to root) |
| `PUT /api/admin/uploads/{id}` | New endpoint, body: `{ original_filename }` to rename |

### Schemas

```python
class FolderBase(BaseModel):
    name: str
    parent_id: int | None = None

class FolderCreate(FolderBase): pass

class FolderRead(BaseModel):
    id: int
    name: str
    parent_id: int | None
    created_at: datetime
    upload_count: int  # for tree display

class FolderTreeResponse(BaseModel):
    folders: list[FolderRead]

class UploadMove(BaseModel):
    folder_id: int | None  # None = move to root

class UploadUpdate(BaseModel):
    original_filename: str
```

### Alembic Migration

1. Create `media_folders` table
2. Add `folder_id` column to `uploads` (nullable, FK -> media_folders.id, `ON DELETE SET NULL`)
3. Add index `idx_uploads_folder` for fast filtering

### Why Fetch Entire Tree at Once

Folder count is typically in the tens. One query + recursive build on the frontend avoids per-expand network round-trips.

### Folder Depth Limit

Max nesting depth = 5. Backend rejects `POST /api/admin/folders` if `parent_id` chain exceeds 4 ancestors. Returns 400 Bad Request.

## 3. Frontend Components

### Page Layout

```
+-----------------------------------------------------+
| Header: "Media Library" + Upload button             |
+--------------+--------------------------------------+
|              |  Breadcrumb: All Files / logos       |
| FolderTree   |  Showing 12 of 45 files             |
|              |  +--+--+--+--+                       |
| All Files    |  |im|im|im|im|                       |
| Unfiled      |  +--+--+--+--+                       |
| -- Folders --|  +--+--+--+--+                       |
| logos        |  |im|im|im|im|                       |
|  brands      |  +--+--+--+--+                       |
| banners      |  [Previous] 1 2 3 [Next]             |
+--------------+--------------------------------------+
```

### Component Split (4 components, single responsibility each)

| Component | Responsibility | State |
|---|---|---|
| `MediaPage` | Top-level container; manages selected folder ID + current page; coordinates children | `selectedFolderId: 'all' \| 'unfiled' \| number` |
| `FolderTree` | Left pane folder tree; recursive render; context menu for create/rename/delete | Internal tree cache; selection callback to parent |
| `MediaGrid` | Right pane thumbnail grid; fetches by `folderId` + `page`; pagination; thumbnail context menu (Move/Rename) | items / total / loading |
| `MediaUploader` | Upload widget (existing, minor change) - pass current `folderId` on upload | Notify parent on success for grid refresh |

### FolderTree Structure (recursive)

```tsx
function FolderNode({ folder, depth, selectedId, onSelect, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {expanded ? <ChevronDown/> : <ChevronRight/>}
        <FolderIcon/>
        <span>{folder.name}</span>
        <span className="text-gray-400 text-xs">({folder.upload_count})</span>
      </div>
      {expanded && folder.children?.map(child => (
        <FolderNode key={child.id} folder={child} depth={depth+1} ... />
      ))}
      {menuOpen && <FolderContextMenu folder={folder} onClose={...} onRefresh={onRefresh} />}
    </div>
  );
}
```

### Context Menus

**Folder right-click:**
- New Subfolder (creates child under this folder)
- Rename
- Delete (non-empty -> backend 409 -> toast)

**Thumbnail right-click:**
- Move to... (opens folder picker modal, calls `PATCH /api/admin/uploads/{id}`)
- Rename (prompt for new `original_filename`, calls `PUT /api/admin/uploads/{id}`)
- Copy URL (existing behavior, unchanged)
- Delete (existing behavior, unchanged)

### MediaGrid Behavior

- Receives `folderId` prop; refetches on change
- `folderId = 'all'` -> omit `folder_id` query param
- `folderId = 'unfiled'` -> pass `folder_id=none`
- `folderId = number` -> pass `folder_id={number}`

### MediaUploader Change

- Accept optional `folderId` prop
- On upload, include `folder_id` in multipart form data
- On success, call `onUploaded()` callback to refresh grid

### Client Modules

**`lib/clientFolders.ts` (new):**
```typescript
export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  upload_count: number;
}

export async function listFolders(): Promise<Folder[]>
export async function createFolder(name: string, parentId: number | null): Promise<Folder>
export async function renameFolder(id: number, name: string): Promise<Folder>
export async function deleteFolder(id: number): Promise<void>
```

**`lib/clientUploads.ts` (extended):**
```typescript
// New
export async function updateUpload(id: number, originalFilename: string): Promise<BackendUpload>
export async function moveUpload(id: number, folderId: number | null): Promise<void>

// Modified
export async function uploadFile(file: File, folderId?: number): Promise<BackendUpload>
export async function listUploads(
  page: number,
  pageSize: number,
  folderId?: 'all' | 'unfiled' | number
): Promise<UploadListResponse>
```

### Next.js API Proxy Routes

- `app/api/admin/folders/route.ts` (new) - GET, POST
- `app/api/admin/folders/[id]/route.ts` (new) - PUT, DELETE
- `app/api/admin/uploads/route.ts` (modify) - POST accepts `folder_id` form field; GET accepts `folder_id` query
- `app/api/admin/uploads/[id]/route.ts` (modify) - add PUT (rename) and PATCH (move) methods

## 4. Error Handling, Testing, Phasing

### Error Handling Matrix

| Scenario | Backend Response | Frontend Behavior |
|---|---|---|
| Duplicate folder name (same parent) | 409 Conflict | toast "Folder name already exists" |
| Delete non-empty folder | 409 Conflict | toast "Cannot delete non-empty folder" |
| Delete/move non-existent upload | 404 Not Found | toast "File not found" |
| Rename upload with empty filename | 422 Unprocessable Entity | form validation blocks submit |
| Folder nesting exceeds 5 levels | 400 Bad Request | toast "Max folder depth is 5" |
| Move upload to non-existent folder | 404 Not Found | toast "Target folder not found" |
| Upload non-image file | 400 Bad Request | toast "Only image files are allowed" |

### Testing Strategy

| Layer | Scope | Tool |
|---|---|---|
| Backend unit tests | Folder CRUD, upload move/rename, delete non-empty 409, duplicate name validation | pytest + httpx AsyncClient |
| Backend integration tests | Full flow: create folder -> upload image to folder -> move -> rename -> delete folder | pytest |
| Frontend | No automated tests per MVP project constraint | - |
| Manual smoke tests | See checklist below | browser |

### Manual Smoke Test Checklist (11 items)

1. Left pane shows three virtual nodes (All Files / Unfiled / user folders); All Files selected by default
2. Click "New Folder" -> enter "logos" -> folder appears in tree
3. Right-click "logos" -> "New Subfolder" -> enter "brands" -> nested under logos
4. Right-click "logos" -> "Rename" -> change to "brand-logos" -> tree updates
5. Right-click empty folder -> "Delete" -> folder disappears
6. Right-click non-empty folder -> "Delete" -> toast "Cannot delete non-empty folder"
7. Select "logos" folder -> click Upload -> upload image -> image appears in that folder
8. Switch to "All Files" -> the uploaded image is visible
9. Right-click image -> "Move to..." -> pick "banners" folder -> image leaves current grid, appears in target
10. Right-click image -> "Rename" -> change filename -> thumbnail caption updates
11. Click "Unfiled" -> see uploads with `folder_id = NULL`

### Implementation Phasing (3 commits)

| Phase | Commit | Content |
|---|---|---|
| 1 | `feat(backend): add folder model and API` | Folder model + Alembic migration + `/api/admin/folders` CRUD + `uploads.folder_id` column + `PUT /api/admin/uploads/{id}` rename + `PATCH` move + depth limit |
| 2 | `feat(frontend): add folder tree to media page` | Rewrite `media/page.tsx` to two-pane layout + FolderTree component + `lib/clientFolders.ts` |
| 3 | `feat(frontend): wire folder ops to media grid` | MediaGrid accepts `folderId` + right-click context menu (Move/Rename) + MediaUploader passes `folderId` |

### Out of Scope (Future Cleanup)

- Drag-and-drop image-to-folder move (MVP uses right-click "Move to...")
- Drag-and-drop folder reordering
- Multi-select batch image move
- MP4 video upload support (explicitly excluded as YAGNI)
- Folder-level entity association (e.g., "this folder belongs to brand X") - folders remain purely organizational
