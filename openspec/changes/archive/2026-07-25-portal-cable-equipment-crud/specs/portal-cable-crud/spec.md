## ADDED Requirements

### Requirement: Portal SHALL allow manufacturers to create cables within their scope

The portal backend SHALL expose a `POST /api/portal/cables` endpoint that creates a new cable. The endpoint SHALL force `manufacturer_id` to the authenticated user's `scope_id` and SHALL auto-generate the cable `id`. The endpoint SHALL exclude `common_specs` and `variants` from creation. The endpoint SHALL require the `cables` module permission via `require_factory_module("cables")`.

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

The `CableEditForm` component SHALL include input fields for: `model`, `slug`, `size_system`, `base_description`, `meta_title`, `meta_description`, `image_url`, `industry_id`, `category_id`, and `product_type_id`. Taxonomy fields SHALL be populated from the taxonomy API as cascading dropdowns (industry → category → product_type).

#### Scenario: Cable edit form shows all fields
- **WHEN** a user opens the cable edit page at `/portal/cables/{id}`
- **THEN** the form displays inputs for model, slug, size_system, base_description, meta_title, meta_description, image_url, and dropdowns for industry, category, and product type

#### Scenario: Cable edit form saves all fields
- **WHEN** a user modifies slug, size_system, meta_title, meta_description, image_url, and taxonomy fields and clicks Save
- **THEN** the form submits a PUT with all modified fields to `/api/portal/cables/{id}` via `portalApiClient.cables.update()`

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

The portal SHALL provide a page at `/portal/cables/new` with a `CableCreateForm` component. The form SHALL collect all required fields (`model`, `slug`, `size_system`, `industry_id`, `category_id`, `product_type_id`) and optional fields (`base_description`, `meta_title`, `meta_description`, `image_url`). On submit, it SHALL call `portalApiClient.cables.create()` which POSTs to `/api/portal/cables` via the BFF route.

#### Scenario: Create cable form submits required fields
- **WHEN** a user fills in model, slug, size_system, and selects taxonomy on `/portal/cables/new` and clicks "Create"
- **THEN** the form POSTs to `/api/portal/cables` with the entered fields and redirects to the new cable's detail page on success

#### Scenario: Create cable form validates required fields
- **WHEN** a user clicks "Create" without filling in model, slug, size_system, or any taxonomy field
- **THEN** inline validation errors are displayed below the empty fields and the form is not submitted

#### Scenario: Create cable form handles server errors
- **WHEN** the backend returns an error (e.g., slug collision) on create
- **THEN** the form displays the error message and remains on the create page with entered values preserved

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
