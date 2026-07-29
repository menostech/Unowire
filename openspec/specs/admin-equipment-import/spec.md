# admin-equipment-import Specification

## Purpose
TBD - created by archiving change portal-equipment-list-enhancements. Update Purpose after archive.
## Requirements
### Requirement: Admin equipment list SHALL support free-text search

The admin equipment list page at `/admin/equipment` SHALL include a search box component (`EquipmentSearchBox`) with placeholder "Search by model…". The search box SHALL update the URL query param `q` via `router.push` to trigger a server-side filtered fetch. The backend `GET /api/recommended-equipments` endpoint SHALL accept an optional `q` query parameter and filter results by `model` ilike.

#### Scenario: Search box filters equipment by model
- **WHEN** an admin types "transformer" in the search box and submits
- **THEN** the URL updates with `?q=transformer` and the list shows only equipment whose `model` matches (case-insensitive ilike)

#### Scenario: Clearing search shows all equipment
- **WHEN** an admin clears the search box
- **THEN** the URL has no `q` param and the list shows all equipment (filtered by existing manufacturer_id/category_id if set)

#### Scenario: Backend list endpoint accepts q parameter
- **WHEN** the backend receives `GET /api/recommended-equipments?q=transformer`
- **THEN** it returns only equipment where `model` ilike `%transformer%`, respecting existing manufacturer_id/category_id filters if present

#### Scenario: Backend list endpoint without q returns all
- **WHEN** the backend receives `GET /api/recommended-equipments` with no `q`
- **THEN** it returns all equipment (backward-compatible, existing filters still apply)

### Requirement: Admin equipment list SHALL include Import button

The admin equipment list page SHALL include an "Import" button in the page header that links to `/admin/equipment/import`.

#### Scenario: Import button present on equipment list
- **WHEN** an admin views the equipment list page
- **THEN** an "Import" button is displayed in the header, linking to `/admin/equipment/import`

### Requirement: Admin SHALL provide an equipment batch upload page with 3-stage flow

The admin SHALL provide a page at `/admin/equipment/import` with a 3-stage client component flow: upload → preview → result. The page SHALL support CSV and JSON file formats. The flow SHALL validate the file first (preview stage), then commit valid rows (result stage). The page SHALL enforce a 5 MB file size limit and 500 row maximum.

#### Scenario: Upload stage shows format selection and file drop zone
- **WHEN** an admin navigates to `/admin/equipment/import`
- **THEN** the page shows a format toggle (CSV / JSON), a drag-and-drop file zone accepting `.csv,.json` files, and "Download CSV template" / "View JSON example" links

#### Scenario: Validate triggers preview stage
- **WHEN** an admin uploads a file and clicks "Validate"
- **THEN** the page calls the validate API and transitions to the preview stage showing counts of valid, skipped, and error rows

#### Scenario: Commit creates valid equipment records
- **WHEN** an admin clicks "Commit N valid rows" in the preview stage
- **THEN** the page calls the commit API, which inserts all valid rows in a single transaction, and transitions to the result stage showing created/skipped/error counts

#### Scenario: Result stage offers navigation links
- **WHEN** the commit completes and the result stage is shown
- **THEN** the page displays links to view the equipment list or import another file

#### Scenario: File size limit enforced
- **WHEN** an admin uploads a file larger than 5 MB
- **THEN** the page shows an error and does not proceed to validation

#### Scenario: Row count limit enforced
- **WHEN** a parsed file contains more than 500 rows
- **THEN** the backend returns a 400 error and the page shows the error message

### Requirement: Admin equipment import SHALL require operator permission

The import backend endpoints SHALL require `require_operator("equipment_list")` permission. The admin import does NOT force `manufacturer_id` (unlike portal) — admin can set any `manufacturer_id` subject to RBAC scope.

#### Scenario: Admin operator can access import
- **WHEN** an admin user with `equipment_list` operator permission submits a POST to `/api/admin/equipment/import/validate`
- **THEN** the backend processes the request normally

#### Scenario: Non-operator user cannot import
- **WHEN** a user without `equipment_list` operator permission submits a POST to `/api/admin/equipment/import/validate`
- **THEN** the backend returns `403 Forbidden`

### Requirement: Admin equipment import SHALL provide CSV and JSON template downloads

The admin SHALL provide `GET /api/admin/equipment/import/csv-template` returning a CSV file with required and optional column headers, and `GET /api/admin/equipment/import/json-example` returning a JSON array example with sample equipment objects including nested `applicable_specs`.

#### Scenario: CSV template download
- **WHEN** an admin clicks "Download CSV template"
- **THEN** the browser downloads a CSV file with headers: `id,model,slug,manufacturer_id,category_id,description,image_url,external_url,sort_order,applicable_specs`

#### Scenario: JSON example download
- **WHEN** an admin clicks "View JSON example"
- **THEN** the browser downloads or displays a JSON array with sample equipment objects showing nested `applicable_specs` as a native JSON array

### Requirement: Admin equipment import SHALL validate rows with 4-layer validation

The import service SHALL validate each row through: (1) parse error detection, (2) field validation (required fields including `id`, type checking, `applicable_specs` JSON validity), (3) foreign key existence check (category_id and manufacturer_id must exist), (4) duplicate detection on BOTH `id` and `slug` (collision within file and against existing DB records). The `id` field is REQUIRED in the uploaded file (mirroring the cable import pattern) and is used as-is for DB insert. Each row SHALL be assigned a status: `valid`, `skipped` (DB duplicate), or `error` (validation failure).

#### Scenario: Row with missing required fields is marked error
- **WHEN** a row is missing `id`, `model`, `slug`, or `category_id`
- **THEN** the row is marked `error` with a message indicating which required field is missing

#### Scenario: Row with non-existent category_id is marked error
- **WHEN** a row has a `category_id` that does not exist in the database
- **THEN** the row is marked `error` with a message indicating the category was not found

#### Scenario: Row with non-existent manufacturer_id is marked error
- **WHEN** a row has a `manufacturer_id` that does not exist in the database
- **THEN** the row is marked `error` with a message indicating the manufacturer was not found

#### Scenario: Row with id collision in DB is marked skipped
- **WHEN** a row has an `id` that already exists in the database
- **THEN** the row is marked `skipped` (not `error`)

#### Scenario: Row with intra-file duplicate id is marked error
- **WHEN** two rows in the same file have the same `id`
- **THEN** the first occurrence is processed normally and the second is marked `error` with a duplicate message

#### Scenario: Row with slug collision in DB is marked skipped
- **WHEN** a row has a `slug` that already exists for the same manufacturer in the database
- **THEN** the row is marked `skipped` (not `error`)

#### Scenario: Row with intra-file duplicate slug is marked error
- **WHEN** two rows in the same file have the same `slug` for the same manufacturer
- **THEN** the first occurrence is processed normally and the second is marked `error` with a duplicate message

#### Scenario: Valid row with applicable_specs as JSON string in CSV
- **WHEN** a CSV row has `applicable_specs` as a valid JSON string
- **THEN** the row is marked `valid` and the `applicable_specs` is parsed as a JSON array

### Requirement: Admin equipment import SHALL go through BFF and typed clientEquipmentImport

Equipment import operations SHALL use typed `clientEquipmentImport.validateImport(file, format)` and `clientEquipmentImport.commitImport(file, format)` methods. These methods SHALL call BFF routes at `/api/admin/equipment/import/validate` and `/api/admin/equipment/import/commit` respectively. The BFF routes SHALL forward the `admin_token` cookie as a Bearer token to the backend with the FormData payload.

#### Scenario: Validate via clientEquipmentImport
- **WHEN** an admin clicks "Validate" on the import page
- **THEN** the frontend calls `clientEquipmentImport.validateImport(file, format)` which POSTs FormData to `/api/admin/equipment/import/validate`

#### Scenario: Commit via clientEquipmentImport
- **WHEN** an admin clicks "Commit N valid rows"
- **THEN** the frontend calls `clientEquipmentImport.commitImport(file, format)` which POSTs FormData to `/api/admin/equipment/import/commit`

#### Scenario: BFF route forwards token for validate
- **WHEN** the BFF route `/api/admin/equipment/import/validate` receives a POST request
- **THEN** it forwards the FormData and the `admin_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/admin/equipment/import/validate`

#### Scenario: BFF route forwards token for commit
- **WHEN** the BFF route `/api/admin/equipment/import/commit` receives a POST request
- **THEN** it forwards the FormData and the `admin_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/admin/equipment/import/commit`

