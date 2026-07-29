# portal-equipment-import Specification

## Purpose
TBD - created by archiving change portal-equipment-list-enhancements. Update Purpose after archive.
## Requirements
### Requirement: Portal SHALL provide an equipment batch upload page with 3-stage flow

The portal SHALL provide a page at `/portal/equipment/import` with a 3-stage client component flow: upload → preview → result. The page SHALL support CSV and JSON file formats. The flow SHALL validate the file first (preview stage), then commit valid rows (result stage). The page SHALL enforce a 5 MB file size limit and 500 row maximum.

#### Scenario: Upload stage shows format selection and file drop zone
- **WHEN** a user navigates to `/portal/equipment/import`
- **THEN** the page shows a format toggle (CSV / JSON), a drag-and-drop file zone accepting `.csv,.json` files, and "Download CSV template" / "View JSON example" links

#### Scenario: Validate triggers preview stage
- **WHEN** a user uploads a file and clicks "Validate"
- **THEN** the page calls the validate API and transitions to the preview stage showing counts of valid, skipped, and error rows

#### Scenario: Commit creates valid equipment records
- **WHEN** a user clicks "Commit N valid rows" in the preview stage
- **THEN** the page calls the commit API, which inserts all valid rows in a single transaction, and transitions to the result stage showing created/skipped/error counts

#### Scenario: Result stage offers navigation links
- **WHEN** the commit completes and the result stage is shown
- **THEN** the page displays links to view the equipment list or import another file

#### Scenario: File size limit enforced
- **WHEN** a user uploads a file larger than 5 MB
- **THEN** the page shows an error and does not proceed to validation

#### Scenario: Row count limit enforced
- **WHEN** a parsed file contains more than 500 rows
- **THEN** the backend returns a 400 error and the page shows the error message

### Requirement: Portal equipment import SHALL enforce manufacturer scope

The import backend SHALL force `manufacturer_id` on every parsed row to the authenticated user's `scope_id` AFTER parsing but BEFORE validation. Any `manufacturer_id` value supplied in the file SHALL be ignored. The import endpoints SHALL require the `equipment` module permission via `require_factory_module("equipment")`.

#### Scenario: Client-supplied manufacturer_id is overwritten
- **WHEN** a CSV/JSON file contains rows with `manufacturer_id` set to a different manufacturer
- **THEN** the backend overwrites each row's `manufacturer_id` with the user's `scope_id` before validation

#### Scenario: Non-equipment-manufacturer user cannot import
- **WHEN** a cable manufacturer user submits a POST to `/api/portal/equipment/import/validate`
- **THEN** the backend returns `403 Forbidden` because the `equipment` module is not in the allowed set

### Requirement: Portal equipment import SHALL provide CSV and JSON template downloads

The portal SHALL provide `GET /api/portal/equipment/import/csv-template` returning a CSV file with required and optional column headers, and `GET /api/portal/equipment/import/json-example` returning a JSON array example with sample equipment objects including nested `applicable_specs`.

#### Scenario: CSV template download
- **WHEN** a user clicks "Download CSV template"
- **THEN** the browser downloads a CSV file with headers: `id,model,slug,manufacturer_id,category_id,description,image_url,external_url,sort_order,applicable_specs`

#### Scenario: JSON example download
- **WHEN** a user clicks "View JSON example"
- **THEN** the browser downloads or displays a JSON array with sample equipment objects showing nested `applicable_specs` as a native JSON array

### Requirement: Portal equipment import SHALL validate rows with 4-layer validation

The import service SHALL validate each row through: (1) parse error detection, (2) field validation (required fields including `id`, type checking, `applicable_specs` JSON validity), (3) foreign key existence check (category_id must exist), (4) duplicate detection on BOTH `id` and `slug` (collision within file and against existing DB records). The `id` field is REQUIRED in the uploaded file (mirroring the cable import pattern) and is used as-is for DB insert. Each row SHALL be assigned a status: `valid`, `skipped` (DB duplicate), or `error` (validation failure).

#### Scenario: Row with missing required fields is marked error
- **WHEN** a row is missing `id`, `model`, `slug`, or `category_id`
- **THEN** the row is marked `error` with a message indicating which required field is missing

#### Scenario: Row with non-existent category_id is marked error
- **WHEN** a row has a `category_id` that does not exist in the database
- **THEN** the row is marked `error` with a message indicating the category was not found

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
- **WHEN** two rows in the same file have the same `slug`
- **THEN** the first occurrence is processed normally and the second is marked `error` with a duplicate message

#### Scenario: Valid row with applicable_specs as JSON string in CSV
- **WHEN** a CSV row has `applicable_specs` as a valid JSON string (e.g., `[{"spec_key":"conductor_area","min":0.1}]`)
- **THEN** the row is marked `valid` and the `applicable_specs` is parsed as a JSON array

#### Scenario: Row with invalid applicable_specs JSON is marked error
- **WHEN** a CSV row has `applicable_specs` that is not valid JSON
- **THEN** the row is marked `error` with a message indicating the JSON parse failure

### Requirement: Portal equipment import SHALL go through BFF and typed portalApiClient

Equipment import operations SHALL use typed `portalApiClient.equipment.import.validate(file, format)` and `portalApiClient.equipment.import.commit(file, format)` methods. These methods SHALL call BFF routes at `/api/portal/equipment/import/validate` and `/api/portal/equipment/import/commit` respectively. The BFF routes SHALL forward the `portal_token` cookie as a Bearer token to the backend with the FormData payload.

#### Scenario: Validate via portalApiClient
- **WHEN** a user clicks "Validate" on the import page
- **THEN** the frontend calls `portalApiClient.equipment.import.validate(file, format)` which POSTs FormData to `/api/portal/equipment/import/validate`

#### Scenario: Commit via portalApiClient
- **WHEN** a user clicks "Commit N valid rows"
- **THEN** the frontend calls `portalApiClient.equipment.import.commit(file, format)` which POSTs FormData to `/api/portal/equipment/import/commit`

#### Scenario: BFF route forwards token for validate
- **WHEN** the BFF route `/api/portal/equipment/import/validate` receives a POST request
- **THEN** it forwards the FormData and the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/portal/equipment/import/validate`

#### Scenario: BFF route forwards token for commit
- **WHEN** the BFF route `/api/portal/equipment/import/commit` receives a POST request
- **THEN** it forwards the FormData and the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/portal/equipment/import/commit`

#### Scenario: Template download via portalApiClient
- **WHEN** a user clicks "Download CSV template"
- **THEN** the frontend calls `portalApiClient.equipment.import.downloadCsvTemplate()` which GETs `/api/portal/equipment/import/csv-template`

