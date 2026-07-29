# portal-equipment-crud Spec

## Purpose

Define the portal-side CRUD flows for equipment manufacturers: list, create, detail, update, and delete recommended equipment within their manufacturer scope, including spec editing (applicable_specs).
## Requirements
### Requirement: Portal SHALL allow equipment manufacturers to create equipment within their scope

The portal backend SHALL expose a `POST /api/portal/equipment` endpoint that creates a new recommended equipment record. The endpoint SHALL force `manufacturer_id` to the authenticated user's `scope_id` and SHALL auto-generate the equipment `id`. The endpoint SHALL accept an optional `applicable_specs` JSON field and persist it through the same CRUD layer used by admin equipment creation. The endpoint SHALL require the `equipment` module permission via `require_factory_module("equipment")`.

#### Scenario: Equipment manufacturer creates equipment with required fields
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/equipment` with `model`, `slug`, and `category_id`
- **THEN** the backend creates an equipment record with `manufacturer_id` set to the user's `scope_id`, auto-generates the `id`, and returns `201 Created` with the full `RecommendedEquipmentRead`

#### Scenario: Create enforces scope-based manufacturer_id
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/equipment` with a `manufacturer_id` field in the body
- **THEN** the backend ignores the client-supplied `manufacturer_id` and forces it to the user's `scope_id`

#### Scenario: Create requires all mandatory fields
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/equipment` missing `model`, `slug`, or `category_id`
- **THEN** the backend returns `422 Unprocessable Entity` with a validation error listing the missing fields

#### Scenario: Non-equipment-manufacturer user cannot create equipment
- **WHEN** a manufacturer (cable) user submits a POST to `/api/portal/equipment`
- **THEN** the backend returns `403 Forbidden` because the `equipment` module is not in the `manufacturer` allowed set

#### Scenario: Create accepts optional applicable_specs
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/equipment` with `applicable_specs` as a valid JSON array
- **THEN** the backend persists it on the equipment record (same CRUD path as admin) and the returned `RecommendedEquipmentRead` includes the spec data

#### Scenario: Create without applicable_specs still succeeds
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/equipment` without `applicable_specs`
- **THEN** the backend creates the equipment with no specs, identical to current behavior (backward-compatible)

### Requirement: Portal SHALL allow equipment manufacturers to delete their own equipment

The portal backend SHALL expose a `DELETE /api/portal/equipment/{equipment_id}` endpoint. The endpoint SHALL verify the equipment belongs to the authenticated user's scope via `_check_equipment_ownership` before deleting.

#### Scenario: Equipment manufacturer deletes their own equipment
- **WHEN** an equipment_manufacturer user sends DELETE to `/api/portal/equipment/{id}` where the equipment's `manufacturer_id` matches the user's `scope_id`
- **THEN** the backend deletes the equipment record and returns `200 OK` with the deleted `RecommendedEquipmentRead`

#### Scenario: Delete equipment outside scope returns 404
- **WHEN** an equipment_manufacturer user sends DELETE to `/api/portal/equipment/{id}` where the equipment's `manufacturer_id` does NOT match the user's `scope_id`
- **THEN** the backend returns `404 Not Found` (ownership check fails; no information leak about record existence)

#### Scenario: Delete non-existent equipment returns 404
- **WHEN** an equipment_manufacturer user sends DELETE to `/api/portal/equipment/{nonexistent_id}`
- **THEN** the backend returns `404 Not Found`

### Requirement: Portal equipment delete SHALL require user confirmation

The portal frontend SHALL display a confirmation dialog before deleting equipment. The dialog SHALL warn that deletion is irreversible. On confirmation, the frontend SHALL call the delete API and redirect to the equipment list page on success.

#### Scenario: Delete button shows confirmation dialog
- **WHEN** a user clicks the "Delete" button on an equipment detail page
- **THEN** a confirmation modal appears with the message "Are you sure you want to delete this equipment? This action cannot be undone." and "Cancel" and "Delete" buttons

#### Scenario: Confirm delete redirects to list
- **WHEN** a user confirms the delete dialog and the API returns success
- **THEN** the frontend redirects to `/portal/equipment` and the deleted equipment no longer appears in the list

#### Scenario: Cancel delete does nothing
- **WHEN** a user clicks "Cancel" in the delete confirmation dialog
- **THEN** the modal closes and no API call is made

### Requirement: Portal equipment edit form SHALL expose all editable fields

The `EquipmentEditForm` component SHALL include input fields for: `model`, `slug`, `description`, `image_url`, `external_url`, `sort_order`, `category_id`, plus an optional `applicable_specs` raw-JSON textarea. The category field SHALL be populated from the equipment categories API as a dropdown. The JSON textarea SHALL reuse the admin equipment form's raw-JSON pattern: empty textarea means "no specs"; non-empty content MUST parse as valid JSON before the form submits. Invalid JSON SHALL display a red border on the textarea and an inline error message, and SHALL block the Save action.

#### Scenario: Equipment edit form shows all fields
- **WHEN** a user opens the equipment edit page at `/portal/equipment/{id}`
- **THEN** the form displays inputs for model, slug, description, image_url, external_url, sort_order, a dropdown for category, and an optional JSON textarea labeled "Applicable Specs (JSON)"

#### Scenario: Equipment edit form saves all fields
- **WHEN** a user modifies slug, image_url, external_url, sort_order, and category fields and clicks Save
- **THEN** the form submits a PUT with all modified fields to `/api/portal/equipment/{id}` via `portalApiClient.equipment.update()`

#### Scenario: Equipment edit form persists specs on save
- **WHEN** a user enters valid JSON in the "Applicable Specs (JSON)" textarea and clicks Save
- **THEN** the form parses the JSON, includes `applicable_specs` in the PUT payload, the backend persists it (the portal PUT route already accepts `applicable_specs` via `RecommendedEquipmentUpdate`), and the saved equipment reflects the new specs

#### Scenario: Equipment edit form pre-fills existing specs as JSON
- **WHEN** a user opens the equipment edit form for an equipment record that already has `applicable_specs`
- **THEN** the JSON textarea is pre-filled with `JSON.stringify` of the existing spec data

#### Scenario: Invalid JSON blocks save
- **WHEN** a user enters text in the spec textarea that fails `JSON.parse` and clicks Save
- **THEN** the textarea shows a red border and an inline error message, and no PUT request is sent

#### Scenario: Empty spec textarea means no specs
- **WHEN** a user leaves the spec textarea empty and clicks Save
- **THEN** the form submits the PUT without `applicable_specs` in the payload (no overwrite of existing specs via `exclude_unset`)

#### Scenario: Equipment edit form pre-fills existing category value
- **WHEN** a user opens the equipment edit form for an equipment with `category_id` already set
- **THEN** the corresponding category is pre-selected in the dropdown

#### Scenario: Sort order accepts numeric input
- **WHEN** a user enters a numeric value in the sort_order field
- **THEN** the value is accepted and submitted as an integer in the PUT payload

### Requirement: Portal equipment list page SHALL show expanded columns

The equipment list page at `/portal/equipment` SHALL display table columns for: Name (model as plain text, not a link), Category, Created date, and an Actions column containing an "Edit" button. The page SHALL include a "New Equipment" button linking to `/portal/equipment/new` and an "Import" button linking to `/portal/equipment/import`. The Name column SHALL NOT be a hyperlink — navigation to the edit/detail page SHALL be via the "Edit" button in the Actions column, which links to `/portal/equipment/{id}`.

#### Scenario: Equipment list shows category column
- **WHEN** a user navigates to `/portal/equipment`
- **THEN** the table includes columns: Name, Category, Created, and Actions

#### Scenario: Equipment list Name is plain text
- **WHEN** a user views the equipment list table
- **THEN** the Name column displays the model (or slug or id fallback) as plain text without a hyperlink

#### Scenario: Equipment list has Edit button in Actions column
- **WHEN** a user views the equipment list table
- **THEN** each row has an Actions column containing an "Edit" button that links to `/portal/equipment/{id}`

#### Scenario: Equipment list includes New Equipment button
- **WHEN** a user views the equipment list page
- **THEN** a "New Equipment" button is displayed that links to `/portal/equipment/new`

#### Scenario: Equipment list includes Import button
- **WHEN** a user views the equipment list page
- **THEN** an "Import" button is displayed that links to `/portal/equipment/import`

#### Scenario: Equipment list shows readable category labels
- **WHEN** an equipment record has a `category` relation with a `label` value
- **THEN** the list displays the category label (not the raw `category_id`)

### Requirement: Portal SHALL provide an equipment create form page

The portal SHALL provide a page at `/portal/equipment/new` with an `EquipmentCreateForm` component. The form SHALL collect all required fields (`model`, `slug`, `category_id`) and optional fields (`description`, `image_url`, `external_url`, `sort_order`), plus an optional `applicable_specs` raw-JSON textarea that follows the same validation pattern as the edit form. On submit, it SHALL call `portalApiClient.equipment.create()` which POSTs to `/api/portal/equipment` via the BFF route.

#### Scenario: Create equipment form submits required fields
- **WHEN** a user fills in model, slug, and selects a category on `/portal/equipment/new` and clicks "Create"
- **THEN** the form POSTs to `/api/portal/equipment` with the entered fields and redirects to the new equipment's detail page on success

#### Scenario: Create equipment form validates required fields
- **WHEN** a user clicks "Create" without filling in model, slug, or category
- **THEN** inline validation errors are displayed below the empty fields and the form is not submitted

#### Scenario: Create equipment form handles server errors
- **WHEN** the backend returns an error (e.g., slug collision) on create
- **THEN** the form displays the error message and remains on the create page with entered values preserved

#### Scenario: Create equipment form accepts optional applicable_specs JSON
- **WHEN** a user enters valid JSON in the "Applicable Specs (JSON)" textarea and clicks "Create"
- **THEN** the form parses the JSON, includes `applicable_specs` in the POST payload, and the created equipment's `RecommendedEquipmentRead` includes the spec data

#### Scenario: Create equipment form blocks on invalid spec JSON
- **WHEN** a user enters text in the spec textarea that fails `JSON.parse` and clicks "Create"
- **THEN** the textarea shows a red border and an inline error message, and no POST request is sent

### Requirement: Portal equipment create and delete SHALL go through BFF and typed portalApiClient

Equipment create and delete operations SHALL use typed `portalApiClient.equipment.create(data)` and `portalApiClient.equipment.remove(id)` methods. These methods SHALL call BFF routes at `/api/portal/equipment` (POST) and `/api/portal/equipment/{id}` (DELETE) respectively. The BFF routes SHALL forward the `portal_token` cookie as a Bearer token to the backend.

#### Scenario: Equipment create via portalApiClient
- **WHEN** a user submits the equipment create form
- **THEN** the form calls `portalApiClient.equipment.create(data)` which POSTs to `/api/portal/equipment` with a typed `PortalEquipmentCreate` payload

#### Scenario: Equipment delete via portalApiClient
- **WHEN** a user confirms equipment deletion
- **THEN** the frontend calls `portalApiClient.equipment.remove(id)` which sends DELETE to `/api/portal/equipment/{id}`

#### Scenario: BFF route forwards token for equipment create
- **WHEN** the BFF route `/api/portal/equipment` receives a POST request
- **THEN** it forwards the request body and the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/portal/equipment`

#### Scenario: BFF route forwards token for equipment delete
- **WHEN** the BFF route `/api/portal/equipment/{id}` receives a DELETE request
- **THEN** it forwards the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `DELETE /api/portal/equipment/{id}`

### Requirement: Portal equipment list SHALL support search and category filtering

The portal equipment list page SHALL include a toolbar component (`EquipmentListToolbar`) with a text search input ("Search by model…") and a single Category dropdown filter. The toolbar SHALL update the URL search params (`search`, `category_id`) via `router.push` to trigger a server-side filtered fetch. The backend `GET /api/portal/equipment` endpoint SHALL accept optional `search` and `category_id` query parameters and filter results accordingly.

#### Scenario: Search box filters equipment by model
- **WHEN** a user types "transformer" in the search box and clicks Search
- **THEN** the URL updates with `?search=transformer` and the list shows only equipment whose `model` matches (case-insensitive ilike)

#### Scenario: Category dropdown filters equipment by category
- **WHEN** a user selects a category from the dropdown
- **THEN** the URL updates with `?category_id={selected_id}` and the list shows only equipment in that category

#### Scenario: Combined search and category filter
- **WHEN** a user enters a search term AND selects a category
- **THEN** the list shows equipment matching both the search term AND the selected category

#### Scenario: Clearing filters shows all equipment
- **WHEN** a user clears the search box and selects "All Categories"
- **THEN** the URL has no `search` or `category_id` params and the list shows all equipment for the manufacturer

#### Scenario: Backend list endpoint accepts search parameter
- **WHEN** the backend receives `GET /api/portal/equipment?search=transformer`
- **THEN** it returns only equipment where `model` ilike `%transformer%`, scoped to the authenticated user's `manufacturer_id`

#### Scenario: Backend list endpoint accepts category_id parameter
- **WHEN** the backend receives `GET /api/portal/equipment?category_id=cat-1`
- **THEN** it returns only equipment where `category_id = 'cat-1'`, scoped to the authenticated user's `manufacturer_id`

#### Scenario: Backend list endpoint without filters returns all
- **WHEN** the backend receives `GET /api/portal/equipment` with no `search` or `category_id`
- **THEN** it returns the first page of equipment for the user's `manufacturer_id` (backward-compatible for default first page)

### Requirement: Portal equipment list SHALL return a paginated response

The backend `GET /api/portal/equipment` endpoint SHALL accept optional `page` (default 1) and `page_size` (default 20) query parameters and SHALL return a `PaginatedResponse[RecommendedEquipmentRead]` shape with `items`, `total`, `page`, and `page_size` fields. The portal equipment list page SHALL render pagination controls (Prev/Next) that update the `page` URL search param. This mirrors the cable portal list endpoint behavior.

#### Scenario: List endpoint returns paginated response
- **WHEN** the backend receives `GET /api/portal/equipment`
- **THEN** it returns a JSON object with `items` (array of equipment), `total` (integer count of all matching equipment for the manufacturer), `page` (1), and `page_size` (20)

#### Scenario: List endpoint accepts page parameter
- **WHEN** the backend receives `GET /api/portal/equipment?page=2&page_size=10`
- **THEN** it returns the second page of 10 items, with `total` reflecting the full count and `page=2`, `page_size=10`

#### Scenario: List page renders pagination controls
- **WHEN** a user views the equipment list page and `total` exceeds one page
- **THEN** the page shows Prev/Next navigation links that update the `?page=` URL param

#### Scenario: Pagination preserves existing filters
- **WHEN** a user has `?search=transformer&category_id=cat-1` active and clicks Next
- **THEN** the URL becomes `?search=transformer&category_id=cat-1&page=2` and the second filtered page is fetched

