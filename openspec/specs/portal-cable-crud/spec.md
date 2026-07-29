# portal-cable-crud Spec

## Purpose

Define the portal-facing cable management capability for manufacturers: list, search, filter, create, edit, delete, and bulk import cables scoped to the authenticated user's `scope_id`. Covers backend REST endpoints, BFF routes, frontend pages, and the import workflow.
## Requirements
### Requirement: Portal SHALL allow manufacturers to create cables within their scope

The portal backend SHALL expose a `POST /api/portal/cables` endpoint that creates a new cable. The endpoint SHALL force `manufacturer_id` to the authenticated user's `scope_id` and SHALL auto-generate the cable `id`. The endpoint SHALL accept optional `common_specs` and `variants` JSON fields and persist them through the same CRUD layer used by admin cable creation. The endpoint SHALL require the `cables` module permission via `require_factory_module("cables")`.

#### Scenario: Manufacturer creates a cable with required fields
- **WHEN** a manufacturer user submits a POST to `/api/portal/cables` with `model`, `slug`, `size_system`, `industry_id`, `category_id`, and `product_type_id`
- **THEN** the backend creates a cable with `manufacturer_id` set to the user's `scope_id`, auto-generates the `id`, and returns `201 Created` with the full `CableRead`

#### Scenario: Create enforces scope-based manufacturer_id
- **WHEN** a manufacturer user submits a POST to `/api/portal/cables` with a `manufacturer_id` field in the body
- **THEN** the backend ignores the client-supplied `manufacturer_id` and forces it to the user's `scope_id`

#### Scenario: Create requires all mandatory fields
- **WHEN** a manufacturer user submits a POST to `/api/portal/cables` missing `model`, `slug`, `size_system`, `industry_id`, `category_id`, or `product_type_id`
- **THEN** the backend returns `422 Unprocessable Entity` with a validation error listing the missing fields

#### Scenario: Non-manufacturer user cannot create cables
- **WHEN** an equipment_manufacturer user submits a POST to `/api/portal/cables`
- **THEN** the backend returns `403 Forbidden` because the `cables` module is not in the `equipment_manufacturer` allowed set

#### Scenario: Create accepts optional common_specs and variants
- **WHEN** a manufacturer user submits a POST to `/api/portal/cables` with `common_specs` and `variants` as valid JSON arrays
- **THEN** the backend persists them alongside the cable record (same CRUD path as admin) and the returned `CableRead` includes the spec data

#### Scenario: Create without specs still succeeds
- **WHEN** a manufacturer user submits a POST to `/api/portal/cables` without `common_specs` or `variants`
- **THEN** the backend creates the cable with no specs, identical to current behavior (backward-compatible)

### Requirement: Portal SHALL allow manufacturers to delete their own cables

The portal backend SHALL expose a `DELETE /api/portal/cables/{cable_id}` endpoint. The endpoint SHALL verify the cable belongs to the authenticated user's scope via `_check_cable_ownership` before deleting. Deleting a cable SHALL cascade to its variants and spec items.

#### Scenario: Manufacturer deletes their own cable
- **WHEN** a manufacturer user sends DELETE to `/api/portal/cables/{id}` where the cable's `manufacturer_id` matches the user's `scope_id`
- **THEN** the backend deletes the cable and its associated variants and spec items, and returns `200 OK` with the deleted `CableRead`

#### Scenario: Delete cable outside scope returns 404
- **WHEN** a manufacturer user sends DELETE to `/api/portal/cables/{id}` where the cable's `manufacturer_id` does NOT match the user's `scope_id`
- **THEN** the backend returns `404 Not Found` (ownership check fails; no information leak about record existence)

#### Scenario: Delete non-existent cable returns 404
- **WHEN** a manufacturer user sends DELETE to `/api/portal/cables/{nonexistent_id}`
- **THEN** the backend returns `404 Not Found`

### Requirement: Portal cable delete SHALL require user confirmation

The portal frontend SHALL display a confirmation dialog before deleting a cable. The dialog SHALL warn that deletion is irreversible. On confirmation, the frontend SHALL call the delete API and redirect to the cable list page on success.

#### Scenario: Delete button shows confirmation dialog
- **WHEN** a user clicks the "Delete" button on a cable detail page
- **THEN** a confirmation modal appears with the message "Are you sure you want to delete this cable? This action cannot be undone." and "Cancel" and "Delete" buttons

#### Scenario: Confirm delete redirects to list
- **WHEN** a user confirms the delete dialog and the API returns success
- **THEN** the frontend redirects to `/portal/cables` and the deleted cable no longer appears in the list

#### Scenario: Cancel delete does nothing
- **WHEN** a user clicks "Cancel" in the delete confirmation dialog
- **THEN** the modal closes and no API call is made

### Requirement: Portal cable edit form SHALL expose all editable fields

The `CableEditForm` component SHALL include input fields for: `model`, `slug`, `size_system`, `base_description`, `meta_title`, `meta_description`, `image_url`, `industry_id`, `category_id`, `product_type_id`, plus optional `common_specs` and `variants` raw-JSON textareas. Taxonomy fields SHALL be populated from the taxonomy API as cascading dropdowns (industry → category → product_type). The two JSON textareas SHALL reuse the admin cable form's raw-JSON pattern: empty textarea means "no specs"; non-empty content MUST parse as valid JSON before the form submits. Invalid JSON SHALL display a red border on the textarea and an inline error message, and SHALL block the Save action.

#### Scenario: Cable edit form shows all fields
- **WHEN** a user opens the cable edit page at `/portal/cables/{id}`
- **THEN** the form displays inputs for model, slug, size_system, base_description, meta_title, meta_description, image_url, dropdowns for industry, category, and product type, and two optional JSON textareas labeled "Common Specs (JSON)" and "Variants (JSON)"

#### Scenario: Cable edit form saves all fields
- **WHEN** a user modifies slug, size_system, meta_title, meta_description, image_url, and taxonomy fields and clicks Save
- **THEN** the form submits a PUT with all modified fields to `/api/portal/cables/{id}` via `portalApiClient.cables.update()`

#### Scenario: Cable edit form persists specs on save
- **WHEN** a user enters valid JSON in the "Common Specs (JSON)" and/or "Variants (JSON)" textareas and clicks Save
- **THEN** the form parses the JSON, includes `common_specs` and `variants` in the PUT payload, the backend persists them via the same spec-replacement logic as admin (common_specs are fully replaced; variants are slug-matched and their specs replaced with variant IDs preserved), and the saved cable reflects the new specs

#### Scenario: Cable edit form pre-fills existing specs as JSON
- **WHEN** a user opens the cable edit form for a cable that already has `common_specs` or `variants`
- **THEN** the corresponding JSON textareas are pre-filled with `JSON.stringify` of the existing spec data

#### Scenario: Invalid JSON blocks save
- **WHEN** a user enters text in a spec textarea that fails `JSON.parse` and clicks Save
- **THEN** the textarea shows a red border and an inline error message, and no PUT request is sent

#### Scenario: Empty spec textarea means no specs
- **WHEN** a user leaves both spec textareas empty and clicks Save
- **THEN** the form submits the PUT without `common_specs` or `variants` in the payload (no overwrite of existing specs via `exclude_unset`)

#### Scenario: Cable PUT replaces common_specs fully
- **WHEN** a user submits a PUT with `common_specs` as a valid JSON array
- **THEN** the backend deletes all existing common_specs for that cable and creates new SpecItem records from the payload (full replacement, same as admin)

#### Scenario: Cable PUT preserves variant IDs on slug match
- **WHEN** a user submits a PUT with `variants` where a payload variant's `slug` matches an existing variant's slug
- **THEN** the backend preserves the existing variant's database `id`, `slug`, and `sort_order`, deletes only that variant's existing SpecItem records, and creates new SpecItem records from the payload variant's `specs` list

#### Scenario: Cable PUT ignores payload variants with unknown slug
- **WHEN** a user submits a PUT with `variants` containing a variant whose `slug` does not match any existing variant
- **THEN** the backend ignores that payload variant (does not create a new variant), and existing variants are unchanged

#### Scenario: Cable PUT preserves existing variants when variants field omitted
- **WHEN** a user submits a PUT without the `variants` field (or with an empty textarea)
- **THEN** the backend leaves all existing variants and their specs unchanged (the field is excluded via `exclude_unset`)

#### Scenario: Taxonomy dropdowns are cascading
- **WHEN** a user selects an industry in the cable edit form
- **THEN** the category dropdown filters to categories within that industry, and selecting a category filters the product type dropdown to product types within that category

#### Scenario: Cable edit form pre-fills existing taxonomy values
- **WHEN** a user opens the cable edit form for a cable with `industry_id`, `category_id`, and `product_type_id` already set
- **THEN** the corresponding industry, category, and product type dropdowns are pre-selected

### Requirement: Portal cable list page SHALL show expanded columns

The cable list page at `/portal/cables` SHALL display table columns for: Name (model), Manufacturer, Category, Product Type, Size System, and Created date. The page SHALL include a "New Cable" button linking to `/portal/cables/new`.

#### Scenario: Cable list shows category, product type, and size system
- **WHEN** a user navigates to `/portal/cables`
- **THEN** the table includes columns: Name, Manufacturer, Category, Product Type, Size System, and Created

#### Scenario: Cable list includes New Cable button
- **WHEN** a user views the cable list page
- **THEN** a "New Cable" button is displayed that links to `/portal/cables/new`

#### Scenario: Cable list shows readable taxonomy labels
- **WHEN** a cable has `category_id`, `product_type_id`, and `size_system` values
- **THEN** the list displays human-readable category and product type names (not raw IDs) and the size system value

### Requirement: Portal SHALL provide a cable create form page

The portal SHALL provide a page at `/portal/cables/new` with a `CableCreateForm` component. The form SHALL collect all required fields (`model`, `slug`, `size_system`, `industry_id`, `category_id`, `product_type_id`) and optional fields (`base_description`, `meta_title`, `meta_description`, `image_url`), plus optional `common_specs` and `variants` raw-JSON textareas that follow the same validation pattern as the edit form. On submit, it SHALL call `portalApiClient.cables.create()` which POSTs to `/api/portal/cables` via the BFF route.

#### Scenario: Create cable form submits required fields
- **WHEN** a user fills in model, slug, size_system, and selects taxonomy on `/portal/cables/new` and clicks "Create"
- **THEN** the form POSTs to `/api/portal/cables` with the entered fields and redirects to the new cable's detail page on success

#### Scenario: Create cable form validates required fields
- **WHEN** a user clicks "Create" without filling in model, slug, size_system, or any taxonomy field
- **THEN** inline validation errors are displayed below the empty fields and the form is not submitted

#### Scenario: Create cable form handles server errors
- **WHEN** the backend returns an error (e.g., slug collision) on create
- **THEN** the form displays the error message and remains on the create page with entered values preserved

#### Scenario: Create cable form accepts optional spec JSON
- **WHEN** a user enters valid JSON in the "Common Specs (JSON)" and/or "Variants (JSON)" textareas and clicks "Create"
- **THEN** the form parses the JSON, includes `common_specs` and `variants` in the POST payload, and the created cable's `CableRead` includes the spec data

#### Scenario: Create cable form blocks on invalid spec JSON
- **WHEN** a user enters text in a spec textarea that fails `JSON.parse` and clicks "Create"
- **THEN** the textarea shows a red border and an inline error message, and no POST request is sent

### Requirement: Portal cable create and delete SHALL go through BFF and typed portalApiClient

Cable create and delete operations SHALL use typed `portalApiClient.cables.create(data)` and `portalApiClient.cables.remove(id)` methods. These methods SHALL call BFF routes at `/api/portal/cables` (POST) and `/api/portal/cables/{id}` (DELETE) respectively. The BFF routes SHALL forward the `portal_token` cookie as a Bearer token to the backend.

#### Scenario: Cable create via portalApiClient
- **WHEN** a user submits the cable create form
- **THEN** the form calls `portalApiClient.cables.create(data)` which POSTs to `/api/portal/cables` with a typed `PortalCableCreate` payload

#### Scenario: Cable delete via portalApiClient
- **WHEN** a user confirms cable deletion
- **THEN** the frontend calls `portalApiClient.cables.remove(id)` which sends DELETE to `/api/portal/cables/{id}`

#### Scenario: BFF route forwards token for cable create
- **WHEN** the BFF route `/api/portal/cables` receives a POST request
- **THEN** it forwards the request body and the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `POST /api/portal/cables`

#### Scenario: BFF route forwards token for cable delete
- **WHEN** the BFF route `/api/portal/cables/{id}` receives a DELETE request
- **THEN** it forwards the `portal_token` cookie as `Authorization: Bearer {token}` to the backend `DELETE /api/portal/cables/{id}`

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
- **THEN** the cable list reloads with `?search=AWG` and only cables whose `model` contains "AWG" are shown

#### Scenario: Empty search clears filter
- **WHEN** a manufacturer user clears the search box and submits
- **THEN** the `search` query parameter is removed from the URL and the list shows all scoped cables

### Requirement: Portal SHALL allow manufacturers to bulk import cables

The portal backend SHALL expose `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints. Both endpoints SHALL accept a file upload and a `format` field (`csv` or `json`). The validate endpoint SHALL return a preview with valid/skipped/error counts without persisting. The commit endpoint SHALL persist valid rows and return created/skipped/error counts. Both endpoints SHALL force `manufacturer_id` to the authenticated user's `scope_id`, ignoring any `manufacturer_id` in the import file. Both endpoints SHALL require `require_factory_module("cables")`. The import SHALL enforce a maximum of 500 rows and 5MB file size.

#### Scenario: Validate CSV file returns preview
- **WHEN** a manufacturer user uploads a CSV file to `/api/portal/cables/import/validate` with `format=csv`
- **THEN** the backend returns a preview with `valid_count`, `skipped_count`, `error_count`, and a list of validation errors (if any), without persisting any rows

#### Scenario: Commit CSV file creates cables
- **WHEN** a manufacturer user uploads a CSV file to `/api/portal/cables/import/commit` with `format=csv`
- **THEN** the backend creates cables for all valid rows with `manufacturer_id` forced to the user's `scope_id`, and returns `created_count`, `skipped_count`, and a list of errors

#### Scenario: Import forces manufacturer_id from user scope
- **WHEN** a manufacturer user uploads a file containing rows with a `manufacturer_id` field set to a different manufacturer
- **THEN** the backend ignores the file-supplied `manufacturer_id` and forces it to the user's `scope_id` for all created cables

#### Scenario: Import rejects file exceeding row limit
- **WHEN** a manufacturer user uploads a file with more than 500 rows
- **THEN** the backend returns `422 Unprocessable Entity` with an error message indicating the row limit was exceeded

#### Scenario: Import rejects file exceeding size limit
- **WHEN** a manufacturer user uploads a file larger than 5MB
- **THEN** the backend returns `413 Payload Too Large` or `422 Unprocessable Entity`

#### Scenario: Non-manufacturer user cannot import
- **WHEN** an equipment_manufacturer user sends POST to `/api/portal/cables/import/validate`
- **THEN** the backend returns `403 Forbidden` because the `cables` module is not in the `equipment_manufacturer` allowed set

#### Scenario: Validate JSON file returns preview
- **WHEN** a manufacturer user uploads a JSON file to `/api/portal/cables/import/validate` with `format=json`
- **THEN** the backend returns a preview with valid/skipped/error counts, supporting full nested cable structures (variants, common_specs)

### Requirement: Portal frontend SHALL provide a bulk-import page with 3-stage workflow

The portal frontend SHALL provide a bulk-import page at `/portal/cables/import` with a 3-stage workflow: upload → preview → result. The upload stage SHALL offer CSV and JSON format selection, file drag-and-drop, and template/example downloads. The preview stage SHALL show valid/skipped/error counts and a preview table. The result stage SHALL show created/skipped counts and error details after commit.

#### Scenario: Upload stage shows format selection and file drop
- **WHEN** a manufacturer user navigates to `/portal/cables/import`
- **THEN** the page displays radio buttons for CSV and JSON formats, a drag-and-drop file area, and download links for CSV template and JSON example

#### Scenario: Validate action shows preview
- **WHEN** a manufacturer user uploads a file and clicks "Validate"
- **THEN** the page transitions to the preview stage showing valid/skipped/error counts and a preview table of parsed rows

#### Scenario: Commit action shows result
- **WHEN** a manufacturer user clicks "Commit" on the preview stage
- **THEN** the page transitions to the result stage showing `created_count`, `skipped_count`, and any errors, with a "Back to Cable List" link

#### Scenario: Import entry point is on cable list page
- **WHEN** a manufacturer user views the portal cable list page
- **THEN** an "Import" button is visible alongside the "New Cable" button, linking to `/portal/cables/import`

### Requirement: Portal sidebar SHALL display fixed Unowire brand

The portal frontend sidebar SHALL display "Unowire" as the main brand text at the top, followed by a scope-specific subtitle. The subtitle SHALL be "Cable Portal" for users with `scope_type=manufacturer` and "Equipment Portal" for users with `scope_type=equipment_manufacturer`. The brand SHALL be static text (not dependent on `user.role_name`).

#### Scenario: Cable manufacturer sees Unowire Cable Portal brand
- **WHEN** a manufacturer user (scope_type=manufacturer) logs into the portal
- **THEN** the sidebar top shows "Unowire" as the main brand and "Cable Portal" as the subtitle

#### Scenario: Equipment manufacturer sees Unowire Equipment Portal brand
- **WHEN** an equipment_manufacturer user (scope_type=equipment_manufacturer) logs into the portal
- **THEN** the sidebar top shows "Unowire" as the main brand and "Equipment Portal" as the subtitle

