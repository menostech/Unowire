## 1. Backend: Extend portal cable list API

- [x] 1.1 Extend `list_by_manufacturer` in `app/crud/cable.py` to accept optional `search`, `category_id`, `product_type_id` parameters; apply case-insensitive partial match on `model` and exact-match filters with AND logic
- [x] 1.2 Extend `GET /api/portal/cables` in `app/api/routes/portal_cables.py` to accept `search`, `category_id`, `product_type_id` query params and pass them to CRUD
- [x] 1.3 Verify backward compatibility: no params → same behavior as before (limit=50, scoped)

## 2. Backend: Portal cable import API

- [x] 2.1 Create `app/api/routes/portal_cable_import.py` with `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints, guarded by `require_factory_module("cables")`
- [x] 2.2 Both endpoints SHALL force `manufacturer_id = user.scope_id` on every row, ignoring client-supplied values (mirror `POST /api/portal/cables` pattern)
- [x] 2.3 Reuse `app/services/cable_import.py` (parse_file, validate_rows, build_preview, commit_valid_rows) for parsing/validation/commit logic
- [x] 2.4 Enforce MAX_ROWS=500 and 5MB file size limits (reuse existing constants from cable_import service)
- [x] 2.5 Register router in `app/main.py` (or appropriate router aggregation)

## 3. Backend tests

- [x] 3.1 Test `GET /api/portal/cables?search=keyword` returns only matching cables (case-insensitive, scoped)
- [x] 3.2 Test `GET /api/portal/cables?category_id=X` and `?product_type_id=Y` filters
- [x] 3.3 Test combined `?search=&category_id=&product_type_id=` filters with AND logic
- [x] 3.4 Test no-params backward compatibility (returns up to 50 scoped cables)
- [x] 3.5 Test `POST /api/portal/cables/import/validate` with CSV returns preview (valid/skipped/error counts)
- [x] 3.6 Test `POST /api/portal/cables/import/commit` with CSV creates cables with forced manufacturer_id
- [x] 3.7 Test import forces manufacturer_id from user scope (ignores file-supplied value)
- [x] 3.8 Test import rejects file > 500 rows (422) and > 5MB (413/422)
- [x] 3.9 Test equipment_manufacturer user gets 403 on import endpoints
- [x] 3.10 Test JSON format import (validate + commit) with nested structures

## 4. Frontend: Sidebar brand

- [x] 4.1 Update `components/portal/layout/PortalSidebar.tsx`: replace `{user?.role_name || 'Factory Portal'}` with fixed "Unowire" + scope-specific subtitle ("Cable Portal" / "Equipment Portal" based on `user.scope_type`)

## 5. Frontend: Cable list page enhancements

- [x] 5.1 Remove `<Link>` from NAME column in `app/portal/cables/page.tsx`; display as plain text (`model` → `slug` → `id` priority)
- [x] 5.2 Add "Edit" button at end of each row linking to `/portal/cables/{id}`
- [x] 5.3 Add search box component (reuse admin `CableSearchBox` pattern or create portal-specific); submit appends `?search=` to URL
- [x] 5.4 Add category filter dropdown populated from `/api/taxonomy`; select appends `?category_id=` to URL; "Clear" option removes param
- [x] 5.5 Add product-type filter dropdown populated from `/api/taxonomy`; select appends `?product_type_id=` to URL; "Clear" option removes param
- [x] 5.6 Add "Import" button alongside "New Cable" button, linking to `/portal/cables/import`
- [x] 5.7 Read URL search params (`search`, `category_id`, `product_type_id`) and pass to `portalApi.cables.all()` query

## 6. Frontend: API client extensions

- [x] 6.1 Extend `cables.all()` in `lib/portalApi.ts` and `lib/portalApiClient.ts` to accept optional `{ search?, category_id?, product_type_id? }` params and append as query string
- [x] 6.2 Add `cables.import` namespace to `portalApi` and `portalApiClient` with `validate(file, format)`, `commit(file, format)`, `downloadCsvTemplate()`, `downloadJsonExample()` methods (mirror admin `clientCableImport.ts`)

## 7. Frontend: BFF routes

- [x] 7.1 Add GET handler to `app/api/portal/cables/route.ts` that forwards query params (`search`, `category_id`, `product_type_id`, `skip`, `limit`) to backend with `portal_token` cookie
- [x] 7.2 Create `app/api/portal/cables/import/validate/route.ts` — POST proxy forwarding file + format to backend
- [x] 7.3 Create `app/api/portal/cables/import/commit/route.ts` — POST proxy forwarding file + format to backend
- [x] 7.4 Create `app/api/portal/cables/import/csv-template/route.ts` — GET proxy for CSV template download
- [x] 7.5 Create `app/api/portal/cables/import/json-example/route.ts` — GET proxy for JSON example download

## 8. Frontend: Import page

- [x] 8.1 Create `app/portal/cables/import/page.tsx` with 3-stage state machine: upload → preview → result (reference admin `app/admin/(dashboard)/cables/import/page.tsx`)
- [x] 8.2 Upload stage: format radio buttons (CSV/JSON), drag-and-drop file area (max 5MB/500 rows), CSV template and JSON example download links
- [x] 8.3 Preview stage: call `validate()`, show valid/skipped/error counts and `ImportPreviewTable` component
- [x] 8.4 Result stage: call `commit()`, show created/skipped counts and error list, "Back to Cable List" link
- [x] 8.5 Create `components/portal/cable/ImportPreviewTable.tsx` (or reuse admin's `ImportPreviewTable` if compatible)

## 9. Verification

- [x] 9.1 Run backend pytest suite: all existing + new tests pass
- [x] 9.2 Run frontend `tsc --noEmit`: no type errors
- [x] 9.3 Run frontend `next build`: build succeeds with new routes compiled
- [x] 9.4 Manual smoke test: sidebar brand shows "Unowire" + subtitle for both scope types
- [x] 9.5 Manual smoke test: cable list search/filter/Edit-button work correctly
- [x] 9.6 Manual smoke test: import workflow (upload → preview → result) works for both CSV and JSON
- [x] 9.7 Manual smoke test: import forces manufacturer_id (verify created cables belong to current scope)
