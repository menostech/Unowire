# Comet Design Handoff

- Change: portal-cable-list-enhancements
- Phase: design
- Mode: compact
- Context hash: 6095a0c2a60bf399633b693bd6fed1f78d36a80defe81821c12a92dc15c23b79

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/portal-cable-list-enhancements/proposal.md

- Source: openspec/changes/portal-cable-list-enhancements/proposal.md
- Lines: 1-39
- SHA256: c9e952af0401e61d53d50530a02a72f74b610bb9ef3dd075f1536a1db1e47a10

```md
## Why

The portal cable list page currently lacks basic list-management features that admin users already enjoy: no search, no category/product-type filters, no bulk import, and the NAME column uses a hyperlink instead of a conventional Edit button. The portal sidebar also shows a dynamic role name instead of a fixed brand identity. These gaps make it harder for cable manufacturers to find and manage their cables efficiently, especially as catalog size grows.

## What Changes

- **Sidebar brand**: Replace dynamic `user.role_name || 'Factory Portal'` with a fixed "Unowire" brand label plus a scope-specific subtitle ("Cable Portal" for manufacturers, "Equipment Portal" for equipment manufacturers).
- **List row Edit button**: Remove the hyperlink from the NAME column; display NAME as plain text and add an "Edit" button at the end of each row linking to the detail page.
- **Category filter**: Add a category dropdown on the cable list page that filters cables by `category_id`. Populated from the existing `/api/taxonomy` endpoint.
- **Product type filter**: Add a product-type dropdown on the cable list page that filters cables by `product_type_id`. Populated from the existing `/api/taxonomy` endpoint.
- **Search**: Add a search box on the cable list page that filters cables by `model` field (case-insensitive partial match), matching admin-side behavior.
- **Bulk import**: Add a bulk-import entry point on the cable list page. The import page follows the admin 3-stage workflow (upload → preview → result) and supports CSV and JSON formats. Imported cables are force-bound to the authenticated user's `scope_id` (manufacturer_id), preventing cross-scope data leakage.
- **Backend API extensions**: Extend `GET /api/portal/cables` to accept `search`, `category_id`, and `product_type_id` query parameters. Add `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints scoped to the manufacturer.

## Capabilities

### New Capabilities

(None — all changes extend the existing `portal-cable-crud` capability.)

### Modified Capabilities

- `portal-cable-crud`: Extends the existing cable CRUD spec with list-view enhancements (search, category/product-type filters, Edit-button row action) and a new bulk-import workflow (CSV/JSON upload → preview → commit, force-bound to manufacturer scope).

## Impact

- **Frontend**:
  - `components/portal/layout/PortalSidebar.tsx` — brand label change
  - `app/portal/cables/page.tsx` — list page: remove NAME hyperlink, add Edit button, add search box, add filter dropdowns, add import link
  - `app/portal/cables/import/page.tsx` — new import page (3-stage workflow)
  - `lib/portalApi.ts` / `lib/portalApiClient.ts` — extend `cables.all()` with query params; add `cables.import` namespace
  - `app/api/portal/cables/route.ts` — add GET BFF proxy with query params
  - `app/api/portal/cables/import/{validate,commit,csv-template,json-example}/route.ts` — new BFF proxies
- **Backend**:
  - `app/api/routes/portal_cables.py` — extend GET with search/filter params; add import routes
  - `app/crud/cable.py` — extend `list_by_manufacturer` with search/filter
  - `app/services/cable_import.py` — adapt existing service for portal-scoped import (force manufacturer_id)
- **No database schema changes** — `category_id` and `product_type_id` fields already exist on the Cable model.
- **No breaking changes** — all new parameters are optional with backward-compatible defaults.

```

## openspec/changes/portal-cable-list-enhancements/design.md

- Source: openspec/changes/portal-cable-list-enhancements/design.md
- Lines: 1-69
- SHA256: 4a97439b456a64876c6b39c7cecbbbda9f87dcac234bd637355ba24861a64679

```md
## Context

The portal cable list page (`/portal/cables`) currently provides only a flat list of cables with a "New Cable" button. The page lacks search, category/product-type filters, bulk import, and uses a hyperlink on the NAME column instead of a conventional Edit button. The portal sidebar shows a dynamic `user.role_name` instead of a fixed brand identity.

The admin side already has a mature cable-import workflow (`/admin/cables/import`) with a 3-stage upload → preview → result flow supporting CSV and JSON. The backend service (`app/services/cable_import.py`) is global (not scoped). The portal needs an equivalent capability but force-bound to the manufacturer's `scope_id` to prevent cross-scope data leakage.

The Cable model already has `category_id` and `product_type_id` FK fields. The `/api/taxonomy` endpoint already returns category and product-type trees. No schema changes are needed.

## Goals / Non-Goals

**Goals:**
- Improve portal cable list usability with search, category/product-type filters, and Edit-button row actions
- Add portal-scoped bulk import (CSV/JSON) reusing the admin 3-stage workflow pattern
- Fix portal sidebar brand to show "Unowire" + scope-specific subtitle
- All new list parameters are optional and backward-compatible

**Non-Goals:**
- Modify admin-side cable list or import (only portal)
- Database schema changes (fields already exist)
- Modify cable detail/edit page behavior
- Add pagination to portal cable list (deferred; current limit=50 is sufficient for MVP)
- Equipment list page enhancements (only cable list; sidebar change affects both scopes but is a text-only change)

## Decisions

### D1: Reuse admin cable_import service with portal-scoped wrapper

**Choice:** Reuse `app/services/cable_import.py` (parse_file, validate_rows, build_preview, commit_valid_rows) and add a portal-specific route handler that forces `manufacturer_id = user.scope_id` before calling the service.

**Rationale:** The admin import service is already tested and mature. Duplicating the parsing/validation logic would create maintenance burden. The only difference is scope enforcement, which belongs in the route handler (not the service).

**Alternatives considered:**
- *Copy the service into a portal-specific module*: rejected — duplicates ~200 lines of parsing/validation logic
- *Make the service accept an optional scope parameter*: rejected — mixes concerns; the service should remain scope-agnostic, and the route handler enforces scope

### D2: List search/filter via optional query parameters on existing endpoint

**Choice:** Extend `GET /api/portal/cables` with optional `search`, `category_id`, and `product_type_id` query parameters. All are optional and combine with AND logic. `search` performs case-insensitive partial match on `model` field only.

**Rationale:** Keeps the API backward-compatible (existing callers without params get the same behavior). Single endpoint avoids fragmenting the API. Model-only search matches admin-side behavior.

**Alternatives considered:**
- *Separate `/api/portal/cables/search` endpoint*: rejected — unnecessary endpoint proliferation; query params are the RESTful convention for filtering
- *Full-text search across multiple fields*: rejected by user decision (model-only for MVP)

### D3: Portal import forces manufacturer_id from user scope

**Choice:** The portal import commit route reads `user.scope_id` and forces it as `manufacturer_id` for every row, ignoring any client-supplied `manufacturer_id` in the import file. This mirrors the existing `POST /api/portal/cables` create-endpoint pattern (line 92 of portal_cables.py).

**Rationale:** Security-critical. Without forced scoping, a manufacturer could import cables under another manufacturer's scope. The create endpoint already follows this pattern; import must match.

### D4: Reuse /api/taxonomy for filter dropdown data

**Choice:** The portal cable list page fetches category and product-type options from the existing `/api/taxonomy` endpoint (already used by the list page for label resolution). No new endpoint needed.

**Rationale:** The endpoint already returns the full tree. Adding a dedicated filter-options endpoint would be redundant.

### D5: Sidebar brand shows "Unowire" + scope-specific subtitle

**Choice:** Replace `{user?.role_name || 'Factory Portal'}` with a fixed structure: `Unowire` as the main brand text + a subtitle span showing "Cable Portal" (for `manufacturer` scope) or "Equipment Portal" (for `equipment_manufacturer` scope). Styled to match the admin sidebar's `Unowire <span>Admin</span>` pattern.

**Rationale:** User requested fixed "Unowire" text. Adding a scope-specific subtitle preserves context (users know which portal they're in) without introducing a dynamic brand. Matches admin sidebar convention.

## Risks / Trade-offs

- **[Risk] Portal import file could contain cables with arbitrary manufacturer_id** → Mitigation: D3 forces scope_id at commit time; validation preview also strips/overrides manufacturer_id before showing preview
- **[Risk] Large import files could block the event loop** → Mitigation: existing admin import enforces MAX_ROWS=500 and MAX file size 5MB; portal reuses the same limits
- **[Trade-off] No pagination on portal cable list** → Accepted for MVP; current limit=50 is sufficient for most manufacturers. If a manufacturer exceeds 50 cables, they can use search/filter to narrow results. Full pagination deferred to a future change.
- **[Trade-off] Search is model-only** → Accepted by user decision; matches admin behavior. Can extend to more fields in a future change without breaking changes.

```

## openspec/changes/portal-cable-list-enhancements/tasks.md

- Source: openspec/changes/portal-cable-list-enhancements/tasks.md
- Lines: 1-71
- SHA256: 7d0c5464ba52af41f288831739acaab3d1cc42d3ccfa153c17ffd27ddb39d921

```md
## 1. Backend: Extend portal cable list API

- [ ] 1.1 Extend `list_by_manufacturer` in `app/crud/cable.py` to accept optional `search`, `category_id`, `product_type_id` parameters; apply case-insensitive partial match on `model` and exact-match filters with AND logic
- [ ] 1.2 Extend `GET /api/portal/cables` in `app/api/routes/portal_cables.py` to accept `search`, `category_id`, `product_type_id` query params and pass them to CRUD
- [ ] 1.3 Verify backward compatibility: no params → same behavior as before (limit=50, scoped)

## 2. Backend: Portal cable import API

- [ ] 2.1 Create `app/api/routes/portal_cable_import.py` with `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints, guarded by `require_factory_module("cables")`
- [ ] 2.2 Both endpoints SHALL force `manufacturer_id = user.scope_id` on every row, ignoring client-supplied values (mirror `POST /api/portal/cables` pattern)
- [ ] 2.3 Reuse `app/services/cable_import.py` (parse_file, validate_rows, build_preview, commit_valid_rows) for parsing/validation/commit logic
- [ ] 2.4 Enforce MAX_ROWS=500 and 5MB file size limits (reuse existing constants from cable_import service)
- [ ] 2.5 Register router in `app/main.py` (or appropriate router aggregation)

## 3. Backend tests

- [ ] 3.1 Test `GET /api/portal/cables?search=keyword` returns only matching cables (case-insensitive, scoped)
- [ ] 3.2 Test `GET /api/portal/cables?category_id=X` and `?product_type_id=Y` filters
- [ ] 3.3 Test combined `?search=&category_id=&product_type_id=` filters with AND logic
- [ ] 3.4 Test no-params backward compatibility (returns up to 50 scoped cables)
- [ ] 3.5 Test `POST /api/portal/cables/import/validate` with CSV returns preview (valid/skipped/error counts)
- [ ] 3.6 Test `POST /api/portal/cables/import/commit` with CSV creates cables with forced manufacturer_id
- [ ] 3.7 Test import forces manufacturer_id from user scope (ignores file-supplied value)
- [ ] 3.8 Test import rejects file > 500 rows (422) and > 5MB (413/422)
- [ ] 3.9 Test equipment_manufacturer user gets 403 on import endpoints
- [ ] 3.10 Test JSON format import (validate + commit) with nested structures

## 4. Frontend: Sidebar brand

- [ ] 4.1 Update `components/portal/layout/PortalSidebar.tsx`: replace `{user?.role_name || 'Factory Portal'}` with fixed "Unowire" + scope-specific subtitle ("Cable Portal" / "Equipment Portal" based on `user.scope_type`)

## 5. Frontend: Cable list page enhancements

- [ ] 5.1 Remove `<Link>` from NAME column in `app/portal/cables/page.tsx`; display as plain text (`model` → `slug` → `id` priority)
- [ ] 5.2 Add "Edit" button at end of each row linking to `/portal/cables/{id}`
- [ ] 5.3 Add search box component (reuse admin `CableSearchBox` pattern or create portal-specific); submit appends `?search=` to URL
- [ ] 5.4 Add category filter dropdown populated from `/api/taxonomy`; select appends `?category_id=` to URL; "Clear" option removes param
- [ ] 5.5 Add product-type filter dropdown populated from `/api/taxonomy`; select appends `?product_type_id=` to URL; "Clear" option removes param
- [ ] 5.6 Add "Import" button alongside "New Cable" button, linking to `/portal/cables/import`
- [ ] 5.7 Read URL search params (`search`, `category_id`, `product_type_id`) and pass to `portalApi.cables.all()` query

## 6. Frontend: API client extensions

- [ ] 6.1 Extend `cables.all()` in `lib/portalApi.ts` and `lib/portalApiClient.ts` to accept optional `{ search?, category_id?, product_type_id? }` params and append as query string
- [ ] 6.2 Add `cables.import` namespace to `portalApi` and `portalApiClient` with `validate(file, format)`, `commit(file, format)`, `downloadCsvTemplate()`, `downloadJsonExample()` methods (mirror admin `clientCableImport.ts`)

## 7. Frontend: BFF routes

- [ ] 7.1 Add GET handler to `app/api/portal/cables/route.ts` that forwards query params (`search`, `category_id`, `product_type_id`, `skip`, `limit`) to backend with `portal_token` cookie
- [ ] 7.2 Create `app/api/portal/cables/import/validate/route.ts` — POST proxy forwarding file + format to backend
- [ ] 7.3 Create `app/api/portal/cables/import/commit/route.ts` — POST proxy forwarding file + format to backend
- [ ] 7.4 Create `app/api/portal/cables/import/csv-template/route.ts` — GET proxy for CSV template download
- [ ] 7.5 Create `app/api/portal/cables/import/json-example/route.ts` — GET proxy for JSON example download

## 8. Frontend: Import page

- [ ] 8.1 Create `app/portal/cables/import/page.tsx` with 3-stage state machine: upload → preview → result (reference admin `app/admin/(dashboard)/cables/import/page.tsx`)
- [ ] 8.2 Upload stage: format radio buttons (CSV/JSON), drag-and-drop file area (max 5MB/500 rows), CSV template and JSON example download links
- [ ] 8.3 Preview stage: call `validate()`, show valid/skipped/error counts and `ImportPreviewTable` component
- [ ] 8.4 Result stage: call `commit()`, show created/skipped counts and error list, "Back to Cable List" link
- [ ] 8.5 Create `components/portal/cable/ImportPreviewTable.tsx` (or reuse admin's `ImportPreviewTable` if compatible)

## 9. Verification

- [ ] 9.1 Run backend pytest suite: all existing + new tests pass
- [ ] 9.2 Run frontend `tsc --noEmit`: no type errors
- [ ] 9.3 Run frontend `next build`: build succeeds with new routes compiled
- [ ] 9.4 Manual smoke test: sidebar brand shows "Unowire" + subtitle for both scope types
- [ ] 9.5 Manual smoke test: cable list search/filter/Edit-button work correctly
- [ ] 9.6 Manual smoke test: import workflow (upload → preview → result) works for both CSV and JSON
- [ ] 9.7 Manual smoke test: import forces manufacturer_id (verify created cables belong to current scope)

```

## openspec/changes/portal-cable-list-enhancements/specs/portal-cable-crud/spec.md

- Source: openspec/changes/portal-cable-list-enhancements/specs/portal-cable-crud/spec.md
- Lines: 1-149
- SHA256: 0e11ccca9125483c240e111d35e72898caf4f91937f63a03eedb6353614e2003

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: Portal SHALL allow manufacturers to search and filter cables

The portal backend SHALL extend `GET /api/portal/cables` to accept optional `search`, `industry_id`, `category_id`, and `product_type_id` query parameters. The `search` parameter SHALL perform a case-insensitive partial match on the `model` field. The `industry_id`, `category_id`, and `product_type_id` parameters SHALL filter by exact match. All parameters SHALL combine with AND logic. When no parameters are provided, the endpoint SHALL behave identically to the current implementation (backward-compatible). The endpoint SHALL continue to enforce `require_factory_module("cables")` and scope filtering by `user.scope_id`.

#### Scenario: Search by model keyword
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=AWG`
- **THEN** the backend returns only cables where `model` contains "AWG" (case-insensitive) and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by industry_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?industry_id=consumer_electronics`
- **THEN** the backend returns only cables where `industry_id` equals "consumer_electronics" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by category_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?category_id=cat-power`
- **THEN** the backend returns only cables where `category_id` equals "cat-power" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by product_type_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?product_type_id=pt-low-voltage`
- **THEN** the backend returns only cables where `product_type_id` equals "pt-low-voltage" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Combine search and all three taxonomy filters
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=AWG&industry_id=consumer_electronics&category_id=cat-power&product_type_id=pt-low-voltage`
- **THEN** the backend returns only cables matching all four conditions AND `manufacturer_id` matches the user's `scope_id`

#### Scenario: No parameters returns all scoped cables
- **WHEN** a manufacturer user sends GET to `/api/portal/cables` with no query parameters
- **THEN** the backend returns up to 50 cables for the user's scope (backward-compatible with existing behavior)

#### Scenario: Search with no matches returns empty list
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=NONEXISTENT_KEYWORD`
- **THEN** the backend returns `200 OK` with `items: []` and `total: 0`

### Requirement: Portal cable list SHALL display Edit button instead of NAME hyperlink

The portal frontend cable list page SHALL render the NAME column as plain text (not a hyperlink). Each row SHALL have an "Edit" button at the end that links to `/portal/cables/{id}`. The NAME text SHALL follow the priority `model` → `slug` → `id` for display.

#### Scenario: NAME column is plain text
- **WHEN** a manufacturer user views the portal cable list page
- **THEN** the NAME column displays the cable's `model` (or `slug` or `id`) as plain text without an anchor tag or hover underline

#### Scenario: Edit button links to detail page
- **WHEN** a manufacturer user clicks the "Edit" button on a cable row
- **THEN** the browser navigates to `/portal/cables/{cable_id}`

### Requirement: Portal cable list SHALL provide cascading industry, category, and product-type filter dropdowns

The portal frontend cable list page SHALL display three cascading filter dropdowns: industry, category, and product-type. All three dropdowns SHALL be populated from the existing `/api/taxonomy` endpoint tree. The dropdowns SHALL cascade: selecting an industry narrows the category dropdown to categories within that industry, and selecting a category narrows the product-type dropdown to product-types within that category. Selecting a filter SHALL append the corresponding query parameter (`industry_id`, `category_id`, or `product_type_id`) to the URL. A "Clear" option SHALL allow removing each filter independently. Changing a parent filter SHALL clear its descendant filters (e.g., changing industry clears `category_id` and `product_type_id` from the URL; changing category clears `product_type_id`).

#### Scenario: Industry dropdown filters list
- **WHEN** a manufacturer user selects an industry from the dropdown
- **THEN** the cable list reloads with `?industry_id={selected}` and only cables in that industry are shown, and the category dropdown narrows to categories within that industry

#### Scenario: Category dropdown cascades from industry and filters list
- **WHEN** a manufacturer user has selected an industry and then selects a category from the (narrowed) category dropdown
- **THEN** the cable list reloads with `?industry_id={selected}&category_id={selected}` and only cables matching both are shown, and the product-type dropdown narrows to product-types within that category

#### Scenario: Product type dropdown cascades from category and filters list
- **WHEN** a manufacturer user has selected an industry and category and then selects a product type from the (narrowed) product-type dropdown
- **THEN** the cable list reloads with `?industry_id={selected}&category_id={selected}&product_type_id={selected}` and only cables matching all three are shown

#### Scenario: Changing industry clears descendant filters
- **WHEN** a manufacturer user has all three filters selected and changes the industry dropdown to a different industry
- **THEN** the URL removes `category_id` and `product_type_id` params, the cable list reloads with only `?industry_id={new}`, and the category and product-type dropdowns reset to their "Clear" state

#### Scenario: Changing category clears product-type filter
- **WHEN** a manufacturer user has category and product-type selected and changes the category dropdown to a different category
- **THEN** the URL removes `product_type_id` param, the cable list reloads with the new `category_id`, and the product-type dropdown resets to its "Clear" state

#### Scenario: Clear filter shows all cables
- **WHEN** a manufacturer user selects the "Clear" option (or empty option) in any filter dropdown
- **THEN** the corresponding query parameter (and any descendant params) is removed from the URL and the list updates accordingly

### Requirement: Portal cable list SHALL provide search by model

The portal frontend cable list page SHALL display a search box. Entering a keyword and submitting SHALL filter the list by appending `?search={keyword}` to the URL. The search SHALL be case-insensitive and match the `model` field partially.

#### Scenario: Search box filters list
- **WHEN** a manufacturer user types "AWG" in the search box and presses Enter

```

Full source: openspec/changes/portal-cable-list-enhancements/specs/portal-cable-crud/spec.md
