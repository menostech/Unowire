# Comet Design Handoff

- Change: portal-spec-editing
- Phase: design
- Mode: compact
- Context hash: 6476ba85a4481cee15bc5c2aac961509f45f27b87f7a2d2aa797cd0ef0417e2e

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/portal-spec-editing/proposal.md

- Source: openspec/changes/portal-spec-editing/proposal.md
- Lines: 1-32
- SHA256: 888c4587600789939ecf00fb8caa30de4d22537db2257e7efdd36d43d52d65fa

```md
## Why

Portal manufacturers currently cannot enter spec data when creating or editing cables and equipment through the portal UI — they must ask an admin to do it. This forces a context switch and delays product data completeness. Specs are already optional fields in the data model; exposing them in the portal forms (as optional JSON, matching the admin pattern) lets manufacturers self-serve and keeps spec data co-located with the product record.

## What Changes

- Add optional "Common Specs (JSON)" and "Variants (JSON)" textarea fields to the portal cable create/edit form, reusing the admin cable form's raw-JSON textarea + `JSON.parse` validation pattern.
- Add optional "Applicable Specs (JSON)" textarea field to the portal equipment create/edit form, reusing the admin equipment form's pattern.
- Extend `PortalCableCreate` schema to accept optional `common_specs` and `variants` fields (currently excluded by design).
- Extend `PortalEquipmentCreate` schema to accept optional `applicable_specs` (currently excluded by design).
- Remove the spec-stripping in the portal cable PUT route (`exclude={"common_specs", "variants"}`) so portal updates can persist specs; portal cable update path stays scope-guarded by `manufacturer_id`.
- Validation is JSON-syntax-only (matching admin): invalid JSON shows a red border + error message and blocks submit; valid JSON is parsed and sent to the backend. No structural/schema validation of spec field contents.
- No admin form changes, no new database columns, no migrations.

## Capabilities

### New Capabilities
<!-- None — this change extends existing portal CRUD capabilities. -->

### Modified Capabilities
- `portal-cable-crud`: Portal cable create/edit forms accept optional `common_specs` and `variants` JSON; backend `PortalCableCreate` and portal PUT route accept and persist these fields.
- `portal-equipment-crud`: Portal equipment create/edit forms accept optional `applicable_specs` JSON; backend `PortalEquipmentCreate` accepts and persists this field.

## Impact

- **Backend schemas**: `backend/app/schemas/cable.py` (`PortalCableCreate`), `backend/app/schemas/equipment.py` (`PortalEquipmentCreate`).
- **Backend routes**: `backend/app/api/routes/portal_cables.py` (remove spec exclusion in PUT), `backend/app/api/routes/portal_equipment.py` (no route change needed, create route passes through).
- **Frontend forms**: `frontend/components/portal/form/CableFormFields.tsx` (add 2 JSON textareas + validation state), `frontend/components/portal/form/EquipmentFormFields.tsx` (add 1 JSON textarea + validation state), corresponding create/edit form wrappers.
- **Frontend API client**: `frontend/lib/portalApi.ts` / `portalApiClient.ts` — types already include specs (reuses admin types); may need to extend portal create/update payloads.
- **BFF routes**: `frontend/app/api/portal/cables/route.ts` (POST/PUT forward body as-is, no change needed), `frontend/app/api/portal/equipment/route.ts` (same).
- **Tests**: Backend pytest for portal cable/equipment create+update with specs; frontend no automated tests (MVP).
- **No database migrations** — spec storage columns/tables already exist (`spec_items` for cables, `applicable_specs` JSONB for equipment).

```

## openspec/changes/portal-spec-editing/design.md

- Source: openspec/changes/portal-spec-editing/design.md
- Lines: 1-68
- SHA256: c36a3c5dcfe74f706ec1ef89c1ccb2996739b05e89f81908d83612517146c00d

```md
## Context

Portal cable and equipment create/edit forms currently omit spec fields entirely. The admin forms already have working spec editors using a raw-JSON `<textarea>` pattern with `JSON.parse` validation. Cable specs are normalized into `spec_items` rows (accessed via `common_specs` + `variants` relationships); equipment specs are a single `applicable_specs` JSONB column. The backend portal schemas intentionally excluded specs ("portal create is intentionally minimal"), but the admin schemas and CRUD already handle spec persistence — the portal just needs to pass them through.

## Goals / Non-Goals

**Goals:**
- Portal cable create/edit form accepts optional `common_specs` and `variants` as raw JSON
- Portal equipment create/edit form accepts optional `applicable_specs` as raw JSON
- Invalid JSON blocks submit with a visible error (matching admin UX)
- Backend portal create/update endpoints accept and persist optional spec fields
- Scope isolation preserved: portal users can only edit specs on cables/equipment within their `scope_id`

**Non-Goals:**
- Structured spec editor UI (key/value rows, type pickers) — deferred; raw JSON is the MVP
- Spec content schema validation (e.g., `spec_key` required, `spec_type` enum valid) — JSON syntax validation only, matching admin
- Admin form changes — admin already has spec editing; no changes needed
- Database migrations — spec storage already exists
- Batch spec editing or import — out of scope

## Decisions

### D1: Reuse admin's raw-JSON textarea pattern verbatim

**Choice**: Portal spec editors use the same `<textarea>` + `JSON.parse` + red-border-on-error pattern as `frontend/components/admin/form/CableForm.tsx` and `EquipmentForm.tsx`.

**Alternatives considered**:
- Structured key/value editor: rejected for MVP — adds complexity (type pickers, add/remove rows, nested variants) with no immediate user demand beyond "fill in spec JSON". Admin has shipped without it; portal should match.
- Dedicated JSON editor library (e.g., monaco-json): rejected — dependency cost unjustified for an optional field; admin's textarea works.

**Rationale**: Consistency with admin, zero new dependencies, proven UX, minimal code (the validation logic is ~15 lines per field).

### D2: Cable form gets two JSON textareas (common_specs + variants); equipment gets one (applicable_specs)

**Choice**: Match the admin cable form's two-field split and admin equipment form's single field.

**Rationale**: Cable spec data has two distinct structures (`common_specs` for cable-level, `variants` for variant-level). Merging them into one textarea would require a custom envelope schema and break compatibility with admin's data model. Mirroring admin keeps the portal↔admin data contract identical.

### D3: JSON-syntax-only validation, no structural schema validation

**Choice**: Validate only that the textarea content parses as JSON. Do not validate `spec_key` presence, `spec_type` enum values, or `min`/`max` ranges.

**Rationale**: Admin does the same. Structural validation adds backend complexity (spec schema definitions per product type) that isn't justified for an optional MVP field. Invalid spec structures will surface as empty/unmatched specs in the matching engine, not as crashes — acceptable for MVP.

### D4: Backend — extend portal schemas with optional fields, remove spec strip in cable PUT

**Choice**:
- `PortalCableCreate`: add `common_specs: list[dict] | None = None` and `variants: list[dict] | None = None`
- `PortalEquipmentCreate`: add `applicable_specs: list[dict] | None = None`
- Portal cable PUT route: remove `exclude={"common_specs", "variants"}` from the `model_dump` call (the route already reuses admin `CableUpdate` which accepts these fields)
- Portal equipment PUT route: no change (already uses `RecommendedEquipmentUpdate` which includes `applicable_specs`)

**Alternatives considered**:
- New `PortalCableUpdate` / `PortalEquipmentUpdate` schemas: rejected — adds schema duplication; admin update schemas are already scope-safe (the route enforces `manufacturer_id` ownership before applying updates)
- Keep spec strip in PUT, only allow specs on create: rejected — users need to edit specs on existing cables too

**Rationale**: Minimal schema delta. Scope safety comes from the route's `manufacturer_id == scope_id` check, not from field exclusion. The admin CRUD layer (`create_cable`, `update_cable`) already handles spec persistence.

### D5: Optional fields default to None / empty list — no breaking change to existing callers

**Choice**: All new portal schema fields are `Optional` with `None` default. When omitted, the CRUD layer treats them as "no specs" (same as today). Existing portal create/edit flows that don't send specs continue to work unchanged.

## Risks / Trade-offs

- **[Users enter malformed spec structures]** → Mitigation: JSON syntax validation catches typos; structural issues surface as non-matching specs in the equipment recommendation engine (no crash). Acceptable for MVP.
- **[Spec payload too large]** → Mitigation: FastAPI's default body size limit applies; admin has the same exposure. No special handling needed for MVP.
- **[Portal user enters specs for wrong product type]** → Mitigation: Out of scope — admin has the same limitation. Future structured editor would enforce product-type-specific spec keys.
- **[Existing portal PUT callers that don't send specs]** → Mitigation: Optional fields default to `None`; CRUD layer's `exclude_unset=True` in `model_dump` means unset fields won't overwrite existing specs with null. Verified against admin update path which uses the same pattern.

```

## openspec/changes/portal-spec-editing/tasks.md

- Source: openspec/changes/portal-spec-editing/tasks.md
- Lines: 1-47
- SHA256: ea4ef806a7132d47c07f03cb9b494e5d264c9532d1e2064a5477acce7071992a

```md
## 1. Backend Schemas

- [ ] 1.1 Extend `PortalCableCreate` in `backend/app/schemas/cable.py` with optional `common_specs: list[SpecItemCreate] | None = None` and `variants: list[CableVariantCreate] | None = None` (use `CableVariantCreate` to match admin create schema); update the docstring to remove the "Excludes specs" note.
- [ ] 1.2 Extend `PortalEquipmentCreate` in `backend/app/schemas/equipment.py` with optional `applicable_specs: list[dict] | None = None`; update the docstring to remove the "Excludes applicable_specs" note.

## 2. Backend Routes

- [ ] 2.1 Update `POST /api/portal/cables` in `backend/app/api/routes/portal_cables.py` to replicate admin create spec-persistence: `model_dump(exclude={"common_specs", "variants"})` for Cable fields, then iterate `obj_in.common_specs` to create `SpecItem` records and `obj_in.variants` to create `CableVariant` + nested `SpecItem` records (reference: `backend/app/api/routes/cables.py:100-124`).
- [ ] 2.2 Update `PUT /api/portal/cables/{cable_id}` in `backend/app/api/routes/portal_cables.py`: keep `exclude={"common_specs", "variants"}` on generic field update; add `common_specs` full-replacement logic (delete existing, add new — same as admin); add `variants` slug-matched merge logic (match by slug, preserve variant ID/slug/sort_order, replace only specs; ignore payload variants with unknown slug; keep existing variants not in payload).
- [ ] 2.3 Verify `POST /api/portal/equipment` and `PUT /api/portal/equipment/{equipment_id}` already accept `applicable_specs` via `PortalEquipmentCreate` (after schema change) and `RecommendedEquipmentUpdate` (already includes it); no route changes needed since `applicable_specs` is a JSONB column.

## 3. Frontend Types

- [ ] 3.1 Add optional `common_specs?: SpecItem[]` and `variants?: CableVariant[]` to `PortalCableCreate` and `PortalCableUpdate` in `frontend/lib/types/portal.ts` (reuse existing admin types or define as `Record<string, unknown>[]` if no shared type exists).
- [ ] 3.2 Add optional `applicable_specs?: Record<string, unknown>[]` to `PortalEquipmentCreate` and `PortalEquipmentUpdate` in `frontend/lib/types/portal.ts`.

## 4. Frontend Form Fields

- [ ] 4.1 Extend `CableFormState` in `frontend/components/portal/form/CableFormFields.tsx` with `common_specs_json: string` and `variants_json: string` fields; add two textareas labeled "Common Specs (JSON)" and "Variants (JSON)" with red-border-on-error styling matching the admin cable form.
- [ ] 4.2 Extend `EquipmentFormState` in `frontend/components/portal/form/EquipmentFormFields.tsx` with `applicable_specs_json: string`; add one textarea labeled "Applicable Specs (JSON)" with red-border-on-error styling matching the admin equipment form.

## 5. Frontend Form Wrappers

- [ ] 5.1 Update `CableCreateForm.tsx`: initialize `common_specs_json` and `variants_json` to `''`; in `handleSubmit`, parse non-empty JSON textareas (block submit with inline error on `JSON.parse` failure), include parsed values in the `portalApiClient.cables.create()` payload.
- [ ] 5.2 Update `CableEditForm.tsx`: pre-fill `common_specs_json` and `variants_json` from the loaded cable via `JSON.stringify` (empty string for missing); in `handleSubmit`, parse and include in the `portalApiClient.cables.update()` payload with the same validation/block-on-error behavior.
- [ ] 5.3 Update `EquipmentCreateForm.tsx`: initialize `applicable_specs_json` to `''`; in `handleSubmit`, parse non-empty JSON (block submit on parse failure), include in `portalApiClient.equipment.create()` payload.
- [ ] 5.4 Update `EquipmentEditForm.tsx`: pre-fill `applicable_specs_json` from loaded equipment via `JSON.stringify`; in `handleSubmit`, parse and include in `portalApiClient.equipment.update()` payload with the same validation/block-on-error behavior.

## 6. Backend Tests

- [ ] 6.1 Add pytest `test_portal_create_cable_with_specs`: POST with `common_specs` and `variants` → 201, returned `CableRead` includes specs.
- [ ] 6.2 Add pytest `test_portal_create_cable_without_specs`: POST without spec fields → 201, backward-compatible.
- [ ] 6.3 Add pytest `test_portal_update_cable_replace_common_specs`: PUT with `common_specs` → existing common_specs fully replaced.
- [ ] 6.4 Add pytest `test_portal_update_cable_variants_preserve_id`: PUT with `variants` where slug matches existing → variant ID unchanged, specs replaced.
- [ ] 6.5 Add pytest `test_portal_update_cable_variants_ignore_unknown_slug`: PUT with `variants` where slug doesn't match → existing variants unchanged, payload variant ignored.
- [ ] 6.6 Add pytest `test_portal_update_cable_without_variants_preserves_existing`: PUT without `variants` field → existing variants unchanged.
- [ ] 6.7 Add pytest `test_portal_update_cable_cross_scope_404`: PUT on another manufacturer's cable → 404.
- [ ] 6.8 Add pytest `test_portal_create_equipment_with_applicable_specs`: POST with `applicable_specs` → 201, persisted.
- [ ] 6.9 Add pytest `test_portal_update_equipment_applicable_specs`: PUT with `applicable_specs` → persisted.
- [ ] 6.10 Add pytest `test_portal_equipment_cross_scope_404`: cross-scope → 404.

## 7. Manual Verification

- [ ] 7.1 Start local stack (frontend, backend, db, nginx) and verify portal cable create form shows two JSON textareas with red border on invalid JSON and successful create with valid JSON.
- [ ] 7.2 Verify portal cable edit form pre-fills existing specs as JSON, saves changes, and persists on refresh.
- [ ] 7.3 Verify portal equipment create form shows the "Applicable Specs (JSON)" textarea with the same validation behavior.
- [ ] 7.4 Verify portal equipment edit form pre-fills existing `applicable_specs` and saves changes.

```

## openspec/changes/portal-spec-editing/specs/portal-cable-crud/spec.md

- Source: openspec/changes/portal-spec-editing/specs/portal-cable-crud/spec.md
- Lines: 1-105
- SHA256: ce0bf60c9aed99f58d0620ae0b0e985b5d47cfbdd564c4bd98ba94057749840c

[TRUNCATED]

```md
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

```

Full source: openspec/changes/portal-spec-editing/specs/portal-cable-crud/spec.md

## openspec/changes/portal-spec-editing/specs/portal-equipment-crud/spec.md

- Source: openspec/changes/portal-spec-editing/specs/portal-equipment-crud/spec.md
- Lines: 1-89
- SHA256: 57d7d98e5362179c60721f0b7233e5a0bb8491919e1f187480e0a7d0c92f8de8

[TRUNCATED]

```md
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

```

Full source: openspec/changes/portal-spec-editing/specs/portal-equipment-crud/spec.md
