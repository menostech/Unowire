## Why

The platform currently has no document/resource management capability. The existing upload system is image-only (PIL → WebP thumbnails), making it impossible to share product manuals, technical spec sheets, CAD files, or installation guides. Users need a dedicated document library where visitors can browse and download resources, admins can manage the full catalog, and portal (manufacturer) users can upload their own documents.

## What Changes

- New `resource_categories` table (2-level self-referential tree, mirroring `equipment_categories`)
- New `resources` table storing document metadata + original file info (filename, content_type, size_bytes, url_path) — no image re-encoding
- Backend routes: public (list, get, download), admin (CRUD for resources + categories, file upload), portal (scope-filtered CRUD + upload)
- File upload endpoint accepting office documents (PDF, Word, Excel, PPT), CAD/engineering files (DWG, DXF), and archives (ZIP, RAR, 7Z) — max 50 MB
- Admin pages at `/admin/resources` (list, new, edit) and `/admin/resources/categories` (tree management)
- Public pages at `/resources` (list with category filter) and `/resources/[slug]` (detail + download)
- Portal pages at `/portal/resources` (list, new, edit) with scope-enforced ownership
- New admin modules: `resource_cats` (global) and `resource_list` (scope-aware, reuses existing scope types)
- `resources` added to `_FACTORY_ALLOWED_BY_SCOPE` for all three manufacturer scope types
- Download tracking via `download_count` field on resources
- Admin menu group "Resources" with children for resources and categories

## Capabilities

### New Capabilities
- `resource-document-module`: Full document/resource management — 2-level categories, document CRUD with file upload (office/CAD/archive types), public browsing and download, admin CRUD, portal self-service upload with scope isolation, download count tracking

### Modified Capabilities
<!-- No existing capabilities are modified at the spec level -->

## Impact

- **Backend**: New models (`resource.py`), schemas, CRUD, routes (public/admin/portal), file storage logic (original file preservation, no PIL re-encoding), new admin modules in `modules.py`, `_FACTORY_ALLOWED_BY_SCOPE` update in `deps.py`
- **Frontend**: New admin pages, public pages, portal pages, components, API client namespaces, admin menu registry entries, portal sidebar nav update, SearchBox category option
- **Database**: New Alembic migration creating `resource_categories` and `resources` tables + seeding admin menu items
- **File storage**: Documents stored under `/media/resources/` directory (separate from image uploads at `/media/uploads/`)
- **Existing systems**: No breaking changes; the existing image upload system remains untouched
