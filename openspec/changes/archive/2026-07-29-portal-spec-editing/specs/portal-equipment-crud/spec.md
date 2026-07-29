## MODIFIED Requirements

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
