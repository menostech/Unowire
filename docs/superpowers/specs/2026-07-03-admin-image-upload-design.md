# Admin Image Upload — Design Spec

**Date**: 2026-07-03
**Topic**: Image upload for Manufacturer, Brand, Industry, Category, ProductType (admin edit + list + public pages)
**Status**: Approved

## 1. Goals

Add image upload capability to 5 taxonomy/commerce entities:
- Manufacturer
- Brand
- Industry
- Category
- ProductType

Each entity gets a single square thumbnail image. Images display in:
- Admin list pages (40×40 table thumbnail)
- Admin edit pages (preview + URL field)
- Public pages (`/cables` ProductType cards, cable detail brand/manufacturer logos)

## 2. Non-Goals (Out of Scope for MVP)

- Multiple images per entity (logos + covers + galleries)
- Image cropping or editing UI
- External URL fetching / import from remote
- Automatic orphan cleanup on entity delete (manual via Media page)
- Drag-and-drop reorder of images
- Image alt text fields (use entity label as alt)

## 3. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Local disk + Docker volume | Zero external deps, MVP-friendly |
| Upload handler | FastAPI + Pillow | Mature Python image library, aligns with existing backend |
| Format | WebP, 400×400, quality 85 | ~20-50KB per image, modern format, small payload |
| Upload flow | Two-step (upload first, then paste URL into form) | Keeps form submissions JSON, simple, supports batch upload |
| DB tracking | `uploads` table records every file | Enables Media page listing, orphan detection |
| Image source | Admin upload only (via Media page) | Simplest, most controlled |
| Entity field | `image_url: str \| None` (relative path `/media/uploads/xxx.webp`) | Uniform across entities, easy to render |

## 4. Data Model

### 4.1 New `Upload` Table

File: `backend/app/models/upload.py`

```python
class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(200), unique=True)
    original_filename: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100), default="image/webp")
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    url_path: Mapped[str] = mapped_column(String(500))  # /media/uploads/{filename}
    entity_type: Mapped[str | None] = mapped_column(String(50))  # manufacturer|brand|industry|category|product_type
    entity_id: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

Indexes:
- `idx_uploads_entity` on `(entity_type, entity_id)` — lookup by associated entity
- `idx_uploads_orphan` on `entity_id` WHERE `IS NULL` — orphan listing

### 4.2 Entity Table Changes

Migration adds nullable `image_url` column (String 500) to 5 tables:
- `manufacturers.image_url`
- `brands.image_url`
- `industries.image_url`
- `categories.image_url`
- `product_types.image_url`

`image_url` stores the same value as `uploads.url_path` (e.g. `/media/uploads/abc123.webp`). Denormalized for query simplicity — no JOIN needed to render list pages.

### 4.3 File Storage

- Container path: `/app/media/uploads/`
- Docker volume: `media_data:/app/media` (persists across container rebuilds)
- Filename: `uuid4().hex + ".webp"` (avoid collisions, do not trust user filenames)
- Original filename stored in DB for reference only

## 5. Backend API

### 5.1 Upload Endpoint

File: `backend/app/api/routes/uploads.py`

```
POST /api/admin/uploads
  Content-Type: multipart/form-data
  Body: file=<binary>
  Auth: Bearer JWT (get_current_admin)
  Response 201: { id, filename, url_path, size_bytes, content_type, original_filename }

Validation:
  - Content-Type must start with "image/"
  - Size <= 5MB (checked before reading full body)
  - PIL must successfully open the file (catches corrupt/non-image)

Processing:
  1. Read uploaded bytes
  2. PIL.Image.open(BytesIO(bytes))
  3. Convert to RGB (drop alpha channel, composite on white if needed)
  4. thumbnail((400, 400)) — preserves aspect ratio, fits within 400×400 box (may not be square)
  5. Save as WebP quality=85 to /app/media/uploads/{uuid}.webp
     (Display-side CSS `object-cover` crops to square visually; no server-side padding needed)
  6. Insert Upload record (entity_type/entity_id NULL)
  7. Return JSON
```

### 5.2 List Endpoint

```
GET /api/admin/uploads?page=1&page_size=20
  Auth: Bearer JWT
  Response: { items: Upload[], total, page, page_size }

  Ordered by created_at DESC
  Each item includes entity_type/entity_id (null = orphan)
```

### 5.3 Delete Endpoint

```
DELETE /api/admin/uploads/{id}
  Auth: Bearer JWT
  Logic:
    1. Fetch upload record
    2. If entity_id IS NOT NULL → return 409 "Cannot delete: still associated"
    3. Delete file from disk (best-effort, log warning if missing)
    4. Delete DB record
  Response: 204
```

### 5.4 Static File Serving

In `backend/app/main.py`:

```python
from fastapi.staticfiles import StaticFiles
import os

media_dir = os.environ.get("MEDIA_DIR", "/app/media")
os.makedirs(os.path.join(media_dir, "uploads"), exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")
```

Mounted AFTER all API routers so `/api/*` routes take precedence.

### 5.5 Entity Schemas

Each of the 5 entities' Read/Create/Update schemas adds:
- `ManufacturerRead/Create/Update`: `image_url: str | None = None`
- `BrandRead/Create/Update`: `image_url: str | None = None`
- `IndustryRead/Create/Update`: `image_url: str | None = None`
- `CategoryRead/Create/Update`: `image_url: str | None = None`
- `ProductTypeRead/Create/Update`: `image_url: str | None = None`

No changes to route handlers — existing CRUD generic update handles new field automatically since `model_dump()` includes it.

## 6. Nginx Configuration

Add location block to `deploy/nginx/nginx.conf` BEFORE the catch-all `/`:

```nginx
location /media/ {
    proxy_pass http://backend:8000/media/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "public, max-age=86400";
}
```

Existing `client_max_body_size 10m` covers 5MB upload limit.

## 7. Docker Compose

### docker-compose.yml

```yaml
backend:
  volumes:
    - media_data:/app/media

volumes:
  pgdata:
  media_data:  # NEW
```

### docker-compose.dev.yml

```yaml
backend:
  volumes:
    - ./backend/media:/app/media  # local dev: write to host filesystem
```

## 8. Frontend — Admin Media Page

### 8.1 Route

`/admin/media` — new dashboard route.

### 8.2 List Page (`frontend/app/admin/(dashboard)/media/page.tsx`)

Layout:
- Header: "Media Library" + "Upload" button
- Upload zone (drag-and-drop multi-file, or click to select)
- File grid: 4 columns, each card shows:
  - Thumbnail (200×200, click to view full)
  - URL path with "Copy" button
  - "Unassociated" badge if `entity_id IS NULL`
  - "Delete" button (disabled if associated, with tooltip)
- Pagination

### 8.3 Upload Component (`frontend/components/admin/form/MediaUploader.tsx`)

Client component:
- `<input type="file" multiple accept="image/*">`
- For each file: POST to `/api/admin/uploads` with FormData
- Progress bar per file
- On success: append to URL list with copy button
- On error: show inline error message per file

### 8.4 AdminSidebar Update

Add entry:
```typescript
{ href: '/admin/media', label: 'Media', icon: Image }
```

(Use `Image` from lucide-react)

## 9. Frontend — Entity Forms

### 9.1 Form Changes (5 forms)

Files to modify:
- `frontend/components/admin/form/ManufacturerForm.tsx`
- `frontend/components/admin/form/BrandForm.tsx`
- `frontend/components/admin/form/IndustryForm.tsx`
- `frontend/components/admin/form/CategoryForm.tsx`
- `frontend/components/admin/form/ProductTypeForm.tsx`

Each form:
1. Add `image_url` to props type:
   ```typescript
   initial?: { ...existing, image_url: string | null }
   ```
2. Add state: `const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');`
3. Add form field (below existing fields):
   ```tsx
   <label>Image URL</label>
   <input type="text" value={imageUrl} onChange={...} />
   <a href="/admin/media" target="_blank">Open Media library</a>
   {imageUrl && <img src={imageUrl} alt="Preview" className="h-32 w-32 object-cover" />}
   ```
4. Include `image_url: imageUrl || null` in submit body

### 9.2 Edit Page Changes

No changes needed to edit pages. The `initial` prop is passed through from the API response, which will now include `image_url` automatically. TypeScript inference handles the new field without explicit type annotations.

## 10. Frontend — List Pages

### 10.1 Admin List Pages (5 pages)

Files to modify:
- `frontend/app/admin/(dashboard)/manufacturers/page.tsx`
- `frontend/app/admin/(dashboard)/brands/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx`

Each list page:
1. Add `<th>Image</th>` as first column header
2. Add first cell per row:
   ```tsx
   <td className="px-4 py-3">
     {item.image_url ? (
       <img src={item.image_url} alt={item.label} className="h-10 w-10 rounded object-cover" />
     ) : (
       <div className="h-10 w-10 rounded bg-gray-200" />
     )}
   </td>
   ```
3. Adjust `colSpan` on empty-state row

### 10.2 adminApi.ts

The `BackendManufacturer`, `BackendBrand`, `BackendIndustry`, `BackendCategory`, `BackendProductType` interfaces add `image_url: string | null`.

Adapter functions pass `image_url` through unchanged (raw backend shape used by admin pages).

## 11. Frontend — Public Pages

### 11.1 `/cables` Page

File: `frontend/app/cables/page.tsx`

ProductType cards already use `ProductCardImage`. Pass `productType.image_url` as `src` when available; otherwise fall back to existing placeholder logic.

### 11.2 Cable Detail Page

File: `frontend/app/cables/[industry]/[category]/[product-type]/page.tsx`

Display brand.image_url and manufacturer.image_url as logos next to names. Small size (32×32) with rounded corners.

### 11.3 Public API Response

The `lib/api.ts` types for Industry/Category/ProductType/Manufacturer/Brand add `image_url: string | null` field. Adapter functions expose it.

## 12. Error Handling

| Scenario | HTTP | Response |
|---|---|---|
| Upload non-image file | 400 | `{"code": 400, "message": "File must be an image"}` |
| Upload > 5MB | 413 | `{"code": 413, "message": "File too large (max 5MB)"}` |
| Corrupt image (PIL fails to open) | 400 | `{"code": 400, "message": "Invalid image file"}` |
| Delete associated upload | 409 | `{"code": 409, "message": "Cannot delete: still associated with an entity"}` |
| Image not found on disk (GET) | 404 | FastAPI StaticFiles default behavior |
| Image load failure in browser | — | `ProductCardImage` onError hides img (existing behavior) |

## 13. Dependencies

### backend/requirements.txt (add)

```
Pillow>=10.0.0
python-multipart>=0.0.6
```

`python-multipart` is required by FastAPI for `UploadFile` support.

## 14. Testing

### Backend (manual smoke test)

1. Login → POST `/api/admin/uploads` with sample PNG → expect 201 + url_path
2. GET `/media/uploads/{filename}` → expect 200 + image bytes
3. PUT `/api/manufacturers/{id}` with `image_url` → expect 200, GET returns image_url
4. DELETE `/api/admin/uploads/{id}` when unassociated → 204
5. DELETE `/api/admin/uploads/{id}` when associated → 409

### Frontend (manual)

1. Open `/admin/media` → drag 3 images → verify all upload successfully
2. Copy URL from Media page
3. Open `/admin/manufacturers/{id}` → paste URL → Save
4. Verify `/admin/manufacturers` list shows thumbnail
5. Repeat for Brand, Industry, Category, ProductType
6. Open `/cables` → verify ProductType card shows image

Frontend automated tests: not required for MVP (per project memory).

## 15. Migration Plan

Single Alembic migration adds:
1. `uploads` table with indexes
2. `image_url` column to 5 entity tables

Run: `alembic revision --autogenerate -m "add image_url and uploads table"`
Then: `alembic upgrade head`

## 16. File Inventory (New + Modified)

### New files (9)
- `backend/app/models/upload.py`
- `backend/app/schemas/upload.py`
- `backend/app/crud/upload.py`
- `backend/app/api/routes/uploads.py`
- `backend/alembic/versions/<hash>_add_image_url_and_uploads.py` (auto-generated filename)
- `frontend/app/admin/(dashboard)/media/page.tsx`
- `frontend/components/admin/form/MediaUploader.tsx`
- `frontend/components/admin/list/ImageCell.tsx` (shared thumbnail cell)
- `backend/media/.gitkeep` (placeholder for dev volume)

### Modified files (≈20)
- `backend/app/main.py` — mount StaticFiles, include uploads router
- `backend/app/models/__init__.py` — export Upload
- `backend/app/schemas/manufacturer.py` — add image_url
- `backend/app/schemas/brand.py` — add image_url
- `backend/app/schemas/taxonomy.py` — add image_url to Industry/Category/ProductType schemas
- `backend/requirements.txt` — add Pillow + python-multipart
- `deploy/nginx/nginx.conf` — add /media/ location
- `docker-compose.yml` — add media_data volume
- `docker-compose.dev.yml` — add dev media mount
- `frontend/lib/adminApi.ts` — add image_url to interfaces, add uploads namespace
- `frontend/lib/api.ts` — add image_url to public types
- `frontend/lib/types.ts` — add image_url to entity types
- `frontend/components/admin/layout/AdminSidebar.tsx` — add Media link
- `frontend/components/admin/form/ManufacturerForm.tsx` — add image_url field
- `frontend/components/admin/form/BrandForm.tsx` — add image_url field
- `frontend/components/admin/form/IndustryForm.tsx` — add image_url field
- `frontend/components/admin/form/CategoryForm.tsx` — add image_url field
- `frontend/components/admin/form/ProductTypeForm.tsx` — add image_url field
- `frontend/app/admin/(dashboard)/manufacturers/page.tsx` — add Image column
- `frontend/app/admin/(dashboard)/brands/page.tsx` — add Image column
- `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx` — add Image column
- `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx` — add Image column
- `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx` — add Image column
- `frontend/app/cables/page.tsx` — pass image_url to ProductCardImage
- `frontend/app/cables/[industry]/[category]/[product-type]/page.tsx` — show brand/manufacturer logos
