## MODIFIED Requirements

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
