## Why

The equipment list pages (both portal and admin) currently lack capabilities that the cable list pages already provide. On the portal side: the equipment list uses the Name column as a link instead of an explicit Edit button, has no search or category filter, and has no batch upload. On the admin side: the equipment list has no free-text search box and no import functionality. This change brings both portal and admin equipment lists to feature parity with their cable counterparts.

## What Changes

### Portal Equipment List
- Remove the hyperlink from the Name column on the portal equipment list page; render Name as plain text
- Add an "Actions" column with an "Edit" button linking to `/portal/equipment/{id}` (matches cable list pattern)
- Add a search input ("Search by model…") and a single Category dropdown filter to the portal equipment list page
- Create an `EquipmentListToolbar` client component (mirrors `CableListToolbar` pattern but with a single category dropdown)
- Extend the portal equipment list backend endpoint `GET /api/portal/equipment` to accept optional `search` and `category_id` query parameters
- Extend `crud_equipment.list_by_manufacturer` to accept and apply `search` (ilike on model) and `category_id` (equality) filters
- Add an "Import" button in the portal equipment list page header linking to `/portal/equipment/import`

### Portal Equipment Import
- Create a new `/portal/equipment/import` page with a 3-stage flow (upload → preview → result), supporting CSV and JSON formats
- Create backend `POST /api/portal/equipment/import/validate` and `POST /api/portal/equipment/import/commit` endpoints (with manufacturer-scope forcing)
- Add `portalApiClient.equipment.import.{validate,commit,downloadCsvTemplate,downloadJsonExample}` methods
- Add BFF routes at `/api/portal/equipment/import/{validate,commit}` proxying to the backend

### Admin Equipment List
- Add a free-text search box (`EquipmentSearchBox`) to the admin equipment list page (mirrors `CableSearchBox`)
- Extend the admin equipment list backend endpoint `GET /api/recommended-equipments` to accept optional `q` search parameter
- Add an "Import" button in the admin equipment list page header linking to `/admin/equipment/import`

### Admin Equipment Import
- Create a new `/admin/equipment/import` page with a 3-stage flow (upload → preview → result), mirroring the admin cable import page
- Create backend `POST /api/admin/equipment/import/validate` and `POST /api/admin/equipment/import/commit` endpoints (guarded by `require_operator("equipment_list")`)
- Create backend `GET /api/admin/equipment/import/csv-template` and `GET /api/admin/equipment/import/json-example` template endpoints
- Create `clientEquipmentImport.ts` BFF client library (mirrors `clientCableImport.ts`)
- Add BFF routes at `/api/admin/equipment/import/{validate,commit}` proxying to the backend

### Shared
- Create `app.services.equipment_import` service module (shared between admin and portal, mirrors `cable_import` pattern: parse → validate → commit)

## Capabilities

### New Capabilities
- `portal-equipment-import`: Portal equipment batch upload via CSV/JSON with validate→preview→commit 3-stage flow, manufacturer-scope enforcement, and template downloads
- `admin-equipment-import`: Admin equipment batch upload via CSV/JSON with validate→preview→commit 3-stage flow, template downloads, and admin equipment list search enhancement

### Modified Capabilities
- `portal-equipment-crud`: List page UI changes (remove Name link, add Edit button, add Actions column) and list endpoint filter/search support

## Impact

- **Frontend (Portal)**:
  - `frontend/app/portal/equipment/page.tsx` — list page UI (remove Name link, add Edit button + Actions column, add toolbar, add Import button)
  - `frontend/components/portal/equipment/EquipmentListToolbar.tsx` — new component
  - `frontend/app/portal/equipment/import/page.tsx` — new import page
  - `frontend/app/api/portal/equipment/import/validate/route.ts` — new BFF route
  - `frontend/app/api/portal/equipment/import/commit/route.ts` — new BFF route
  - `frontend/lib/portalApiClient.ts` — add equipment import methods
- **Frontend (Admin)**:
  - `frontend/app/admin/(dashboard)/equipment/page.tsx` — add search box and Import button
  - `frontend/components/admin/list/EquipmentSearchBox.tsx` — new component (mirrors `CableSearchBox`)
  - `frontend/app/admin/(dashboard)/equipment/import/page.tsx` — new import page
  - `frontend/app/api/admin/equipment/import/validate/route.ts` — new BFF route
  - `frontend/app/api/admin/equipment/import/commit/route.ts` — new BFF route
  - `frontend/lib/clientEquipmentImport.ts` — new BFF client library
- **Backend**:
  - `backend/app/api/routes/portal_equipment.py` — extend list endpoint with search/category_id params
  - `backend/app/crud/equipment.py` — extend `list_by_manufacturer` with search/category_id
  - `backend/app/api/routes/portal_equipment_import.py` — new portal import router
  - `backend/app/api/routes/equipment.py` — extend admin list endpoint with `q` search param
  - `backend/app/api/routes/equipment_import.py` — new admin import router
  - `backend/app/api/routes/equipment_import_templates.py` — new admin template endpoints
  - `backend/app/services/equipment_import.py` — new shared import service
  - `backend/app/schemas/equipment.py` — add import preview/result schemas if needed
- **No database schema changes** — all new features use existing tables and columns
- **No breaking API changes** — list endpoint additions are optional query parameters; new import endpoints are additive
