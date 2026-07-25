# portal-equipment-crud Spec

## Requirements

### Requirement: Portal SHALL allow equipment manufacturers to create equipment within their scope

The portal backend SHALL expose a `POST /api/portal/equipment` endpoint that creates a new recommended equipment record. The endpoint SHALL force `manufacturer_id` to the authenticated user's `scope_id` and SHALL auto-generate the equipment `id`. The endpoint SHALL require the `equipment` module permission via `require_factory_module("equipment")`.

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

The `EquipmentEditForm` component SHALL include input fields for: `model`, `slug`, `description`, `image_url`, `external_url`, `sort_order`, and `category_id`. The category field SHALL be populated from the equipment categories API as a dropdown.

#### Scenario: Equipment edit form shows all fields
- **WHEN** a user opens the equipment edit page at `/portal/equipment/{id}`
- **THEN** the form displays inputs for model, slug, description, image_url, external_url, sort_order, and a dropdown for category

#### Scenario: Equipment edit form saves all fields
- **WHEN** a user modifies slug, image_url, external_url, sort_order, and category fields and clicks Save
- **THEN** the form submits a PUT with all modified fields to `/api/portal/equipment/{id}` via `portalApiClient.equipment.update()`

#### Scenario: Equipment edit form pre-fills existing category value
- **WHEN** a user opens the equipment edit form for an equipment with `category_id` already set
- **THEN** the corresponding category is pre-selected in the dropdown

#### Scenario: Sort order accepts numeric input
- **WHEN** a user enters a numeric value in the sort_order field
- **THEN** the value is accepted and submitted as an integer in the PUT payload

### Requirement: Portal equipment list page SHALL show expanded columns

The equipment list page at `/portal/equipment` SHALL display table columns for: Name (model), Category, and Created date. The page SHALL include a "New Equipment" button linking to `/portal/equipment/new`.

#### Scenario: Equipment list shows category column
- **WHEN** a user navigates to `/portal/equipment`
- **THEN** the table includes columns: Name, Category, and Created

#### Scenario: Equipment list includes New Equipment button
- **WHEN** a user views the equipment list page
- **THEN** a "New Equipment" button is displayed that links to `/portal/equipment/new`

#### Scenario: Equipment list shows readable category labels
- **WHEN** an equipment record has a `category` relation with a `label` value
- **THEN** the list displays the category label (not the raw `category_id`)

### Requirement: Portal SHALL provide an equipment create form page

The portal SHALL provide a page at `/portal/equipment/new` with an `EquipmentCreateForm` component. The form SHALL collect all required fields (`model`, `slug`, `category_id`) and optional fields (`description`, `image_url`, `external_url`, `sort_order`). On submit, it SHALL call `portalApiClient.equipment.create()` which POSTs to `/api/portal/equipment` via the BFF route.

#### Scenario: Create equipment form submits required fields
- **WHEN** a user fills in model, slug, and selects a category on `/portal/equipment/new` and clicks "Create"
- **THEN** the form POSTs to `/api/portal/equipment` with the entered fields and redirects to the new equipment's detail page on success

#### Scenario: Create equipment form validates required fields
- **WHEN** a user clicks "Create" without filling in model, slug, or category
- **THEN** inline validation errors are displayed below the empty fields and the form is not submitted

#### Scenario: Create equipment form handles server errors
- **WHEN** the backend returns an error (e.g., slug collision) on create
- **THEN** the form displays the error message and remains on the create page with entered values preserved

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
