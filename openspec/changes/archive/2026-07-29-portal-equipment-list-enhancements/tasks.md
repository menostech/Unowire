## 1. Backend: Equipment List Filtering (Portal + Admin)

- [ ] 1.1 Extend `crud_equipment.list_by_manufacturer` in `backend/app/crud/equipment.py` to accept optional `search: str | None = None` and `category_id: str | None = None` parameters; apply `ilike` on `model` for search and equality on `category_id` for filter (reference: `backend/app/crud/cable.py:250-286`).
- [ ] 1.2 Extend `GET /api/portal/equipment` in `backend/app/api/routes/portal_equipment.py` to accept optional `search`, `category_id`, `skip`, `limit` query parameters and pass them to `crud_equipment.list_by_manufacturer`.
- [ ] 1.3 Extend `GET /api/recommended-equipments` in `backend/app/api/routes/equipment.py` to accept optional `q` search parameter; apply `ilike` on `model` (reference: admin cable list endpoint pattern).

## 2. Backend: Equipment Import Service (Shared)

- [ ] 2.1 Create `backend/app/services/equipment_import.py` with `parse_file(content, format)` function supporting CSV and JSON formats; CSV required columns: `id, model, slug, manufacturer_id, category_id`; optional: `description, image_url, external_url, sort_order, applicable_specs` (JSON string in CSV); JSON format is array of objects with native `applicable_specs` array (reference: `backend/app/services/cable_import.py`).
- [ ] 2.2 Add `validate_rows(db, rows)` with 4-layer validation: (1) parse errors, (2) field validation (required fields, `applicable_specs` JSON validity), (3) FK existence check (batch-load category + manufacturer IDs), (4) duplicate detection (slug collision within file and against DB).
- [ ] 2.3 Add `build_preview(validated, format)` returning `ImportPreview` with row statuses (`valid`, `skipped`, `error`) and `commit_valid_rows(db, validated)` inserting all valid rows in a single transaction with rollback on exception.
- [ ] 2.4 Add `MAX_IMPORT_SIZE = 5 * 1024 * 1024`, `MAX_ROWS = 500` constants; add CSV template string and JSON example object for template downloads.

## 3. Backend: Portal Equipment Import Routes

- [ ] 3.1 Create `backend/app/api/routes/portal_equipment_import.py` with router prefix `/api/portal/equipment/import`; add `POST /validate` endpoint accepting `UploadFile` + `format: Literal["csv", "json"]`, enforcing `require_factory_module("equipment")`, calling `parse_file → _force_manufacturer_id → validate_rows → build_preview` (reference: `backend/app/api/routes/portal_cable_import.py`).
- [ ] 3.2 Add `POST /commit` endpoint with same signature, calling `parse_file → _force_manufacturer_id → validate_rows → commit_valid_rows`.
- [ ] 3.3 Add `GET /csv-template` and `GET /json-example` template endpoints on the portal router.
- [ ] 3.4 Register the portal import router in `backend/app/main.py`.

## 4. Backend: Admin Equipment Import Routes

- [ ] 4.1 Create `backend/app/api/routes/equipment_import.py` with router prefix `/api/admin/equipment/import`; add `POST /validate` endpoint accepting `UploadFile` + `format: Literal["csv", "json"]`, enforcing `require_operator("equipment_list")`, calling `parse_file → validate_rows → build_preview` (reference: `backend/app/api/routes/cable_import.py`). No `_force_manufacturer_id` (admin can set any manufacturer_id).
- [ ] 4.2 Add `POST /commit` endpoint with same signature, calling `parse_file → validate_rows → commit_valid_rows`.
- [ ] 4.3 Create `backend/app/api/routes/equipment_import_templates.py` with `GET /csv-template` and `GET /json-example` endpoints (reference: `cable_import_templates.py`).
- [ ] 4.4 Register both admin import routers in `backend/app/main.py` under prefix `/api/admin/equipment/import`.

## 5. Backend: Tests

- [ ] 5.1 Add pytest `test_portal_equipment_list_with_search`: `GET /api/portal/equipment?search=transformer` returns only matching equipment.
- [ ] 5.2 Add pytest `test_portal_equipment_list_with_category_filter`: `GET /api/portal/equipment?category_id=cat-1` returns only equipment in that category.
- [ ] 5.3 Add pytest `test_portal_equipment_list_without_filters`: `GET /api/portal/equipment` returns all equipment (backward-compatible).
- [ ] 5.4 Add pytest `test_admin_equipment_list_with_q`: `GET /api/recommended-equipments?q=transformer` returns only matching equipment.
- [ ] 5.5 Add pytest `test_portal_equipment_import_validate_csv`: POST a valid CSV file → 200, preview shows valid rows.
- [ ] 5.6 Add pytest `test_portal_equipment_import_validate_json`: POST a valid JSON file → 200, preview shows valid rows with nested `applicable_specs`.
- [ ] 5.7 Add pytest `test_portal_equipment_import_commit`: POST valid file to `/commit` → 200, records created in DB.
- [ ] 5.8 Add pytest `test_portal_equipment_import_force_manufacturer_id`: CSV with wrong `manufacturer_id` → rows are force-overwritten with `scope_id`.
- [ ] 5.9 Add pytest `test_portal_equipment_import_too_many_rows`: POST file with >500 rows → 400.
- [ ] 5.10 Add pytest `test_portal_equipment_import_cross_scope_403`: Cable manufacturer user → 403.
- [ ] 5.11 Add pytest `test_admin_equipment_import_validate_csv`: Admin POST a valid CSV file → 200, preview shows valid rows.
- [ ] 5.12 Add pytest `test_admin_equipment_import_commit`: Admin POST valid file to `/commit` → 200, records created.
- [ ] 5.13 Add pytest `test_admin_equipment_import_validate_manufacturer_id`: Admin CSV with non-existent `manufacturer_id` → row marked error.
- [ ] 5.14 Add pytest `test_admin_equipment_import_unauthorized`: Non-operator user → 403.

## 6. Frontend: Portal Equipment List Page UI

- [ ] 6.1 Update `frontend/app/portal/equipment/page.tsx`: remove `<Link>` from Name column (render as plain text); add "Actions" column with "Edit" button linking to `/portal/equipment/${e.id}`; add "Import" button in page header linking to `/portal/equipment/import`; accept `searchParams` and forward `search`/`category_id` to `portalApi.equipment.all()`.
- [ ] 6.2 Create `frontend/components/portal/equipment/EquipmentListToolbar.tsx`: client component with search input ("Search by model…") and single Category `<select>` dropdown; populate categories from `GET /api/equipment-categories`; update URL search params via `router.push` (reference: `frontend/components/portal/cable/CableListToolbar.tsx` but simpler — single dropdown).

## 7. Frontend: Portal Equipment Import Page

- [ ] 7.1 Create `frontend/app/portal/equipment/import/page.tsx`: 3-stage client component (upload → preview → result); format toggle (CSV/JSON); drag-and-drop file zone; 5 MB size limit; "Download CSV template" / "View JSON example" links (reference: `frontend/app/portal/cables/import/page.tsx`).
- [ ] 7.2 Wire validate stage: call `portalApiClient.equipment.import.validate(file, format)` → show preview with counts and `<ImportPreviewTable>`.
- [ ] 7.3 Wire commit stage: call `portalApiClient.equipment.import.commit(file, format)` → show result with created/skipped/error counts and navigation links.
- [ ] 7.4 Create `frontend/app/api/portal/equipment/import/validate/route.ts`: BFF proxy forwarding FormData with `portal_token` cookie as Bearer token to backend.
- [ ] 7.5 Create `frontend/app/api/portal/equipment/import/commit/route.ts`: same BFF proxy pattern for commit.
- [ ] 7.6 Extend `frontend/lib/portalApiClient.ts`: add `equipment.import.validate(file, format)`, `equipment.import.commit(file, format)`, `equipment.import.downloadCsvTemplate()`, `equipment.import.downloadJsonExample()` methods.

## 8. Frontend: Admin Equipment List Page UI

- [ ] 8.1 Update `frontend/app/admin/(dashboard)/equipment/page.tsx`: add `<EquipmentSearchBox />` to header; add "Import" button linking to `/admin/equipment/import`; accept `q` search param and forward to `adminApi.equipment.all()`.
- [ ] 8.2 Create `frontend/components/admin/list/EquipmentSearchBox.tsx`: client component with search input ("Search by model…") that updates `?q=` URL param via `router.push` (reference: `frontend/components/admin/list/CableSearchBox.tsx`).

## 9. Frontend: Admin Equipment Import Page

- [ ] 9.1 Create `frontend/app/admin/(dashboard)/equipment/import/page.tsx`: 3-stage client component (upload → preview → result); format toggle (CSV/JSON); drag-and-drop file zone; 5 MB size limit; "Download CSV template" / "View JSON example" links (reference: `frontend/app/admin/(dashboard)/cables/import/page.tsx`).
- [ ] 9.2 Wire validate stage: call `clientEquipmentImport.validateImport(file, format)` → show preview with counts and `<ImportPreviewTable>`.
- [ ] 9.3 Wire commit stage: call `clientEquipmentImport.commitImport(file, format)` → show result with created/skipped/error counts and navigation links.
- [ ] 9.4 Create `frontend/lib/clientEquipmentImport.ts`: BFF client library with `validateImport`, `commitImport`, `downloadCsvTemplate`, `downloadJsonExample`, `triggerBlobDownload`, and types `ImportFormat`, `ImportPreview`, `ImportResult` (reference: `frontend/lib/clientCableImport.ts`).
- [ ] 9.5 Create `frontend/app/api/admin/equipment/import/validate/route.ts`: BFF proxy forwarding FormData with `admin_token` cookie as Bearer token to backend.
- [ ] 9.6 Create `frontend/app/api/admin/equipment/import/commit/route.ts`: same BFF proxy pattern for commit.

## 10. Manual Verification

- [ ] 10.1 Verify portal equipment list page: Name is plain text, Edit button in Actions column works, Import button links to import page.
- [ ] 10.2 Verify portal equipment list search and category filter: typing search and selecting category filters the list; clearing filters shows all.
- [ ] 10.3 Verify portal equipment import page: CSV upload → validate → preview → commit → result flow works end-to-end.
- [ ] 10.4 Verify portal equipment import page: JSON upload with nested `applicable_specs` works end-to-end.
- [ ] 10.5 Verify admin equipment list page: search box filters by model, Import button links to import page.
- [ ] 10.6 Verify admin equipment import page: CSV upload → validate → preview → commit → result flow works end-to-end.
- [ ] 10.7 Verify admin equipment import page: JSON upload with nested `applicable_specs` works end-to-end.
- [ ] 10.8 Verify CSV template download and JSON example download work on both portal and admin.
