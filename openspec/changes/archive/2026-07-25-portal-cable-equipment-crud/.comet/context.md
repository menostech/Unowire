# Comet Design Handoff

- Change: portal-cable-equipment-crud
- Phase: design
- Mode: compact
- Context hash: a5cfc2bb2779c070002e758b9aab1835c94826a461f35db5b0f02ff6f9dd2f94

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/portal-cable-equipment-crud/proposal.md

- Source: openspec/changes/portal-cable-equipment-crud/proposal.md
- Lines: 1-37
- SHA256: 146ffe7e7b16141a596e4d512b3959cd2dc6dd860b600b3a9a08def7ea08737c

```md
## Why

The manufacturer portal currently only supports viewing and updating existing cables and equipment — users cannot create new records or delete their own. The cable and equipment edit forms are also skeletal: the cable form exposes only `model` and `base_description` (missing slug, size_system, SEO metadata, image, and taxonomy), and the equipment form exposes only `model` and `description` (missing slug, image, external URL, sort order, and category). The list pages are equally sparse — the cable list shows only Name/Manufacturer/Created, and the equipment list shows only Name/Created. This change adds full create/delete capabilities (scope-enforced) and expands the forms and list pages to surface the fields portal users need to manage their catalogs without relying on the admin backend.

## What Changes

- **Cable create**: Add `POST /api/portal/cables` backend route + BFF route + `portalApiClient.cables.create()` + "New Cable" form page at `/portal/cables/new`.
- **Cable delete**: Add `DELETE /api/portal/cables/{id}` backend route + BFF route + `portalApiClient.cables.remove()` + delete button with confirmation modal on the cable detail page.
- **Equipment create**: Add `POST /api/portal/equipment` backend route + BFF route + `portalApiClient.equipment.create()` + "New Equipment" form page at `/portal/equipment/new`.
- **Equipment delete**: Add `DELETE /api/portal/equipment/{id}` backend route + BFF route + `portalApiClient.equipment.remove()` + delete button with confirmation modal on the equipment detail page.
- **Cable edit form expansion**: Add slug, size_system, meta_title, meta_description, image_url, and taxonomy fields (industry_id, category_id, product_type_id) to `CableEditForm`.
- **Equipment edit form expansion**: Add slug, image_url, external_url, sort_order, and category_id to `EquipmentEditForm`.
- **Cable list expansion**: Add Category, Product Type, and Size System columns to the cable list table; add "New Cable" button.
- **Equipment list expansion**: Add Category column to the equipment list table; add "New Equipment" button.
- **Portal create schemas**: Add `PortalCableCreate` and `PortalEquipmentCreate` backend schemas that omit `manufacturer_id` (server-forced to `scope_id`) and `id` (server-generated); `PortalCableCreate` also excludes `common_specs` and `variants`.

## Capabilities

### New Capabilities

- `portal-cable-crud`: Cable create and delete operations with scope-based ownership enforcement, expanded cable edit form (slug, size_system, meta fields, image, taxonomy), and expanded cable list page (category, product type, size system columns).
- `portal-equipment-crud`: Equipment create and delete operations with scope-based ownership enforcement, expanded equipment edit form (slug, image, external_url, sort_order, category), and expanded equipment list page (category column).

### Modified Capabilities

<!-- No existing specs to modify — this is the second change in a 3-change batch. It builds on portal-api-layer and portal-error-resilience from change 1 (portal-foundation-refactor), which are not yet archived. -->

## Impact

- **Backend routes**: `backend/app/api/routes/portal_cables.py` — add `POST` and `DELETE`; `backend/app/api/routes/portal_equipment.py` — add `POST` and `DELETE`.
- **Backend schemas**: `backend/app/schemas/cable.py` — add `PortalCableCreate`; `backend/app/schemas/equipment.py` — add `PortalEquipmentCreate`.
- **Frontend BFF routes**: `frontend/app/api/portal/cables/route.ts` (new, POST); `frontend/app/api/portal/cables/[id]/route.ts` (add DELETE handler); `frontend/app/api/portal/equipment/route.ts` (new, POST); `frontend/app/api/portal/equipment/[id]/route.ts` (add DELETE handler).
- **Frontend lib**: `frontend/lib/portalApiClient.ts` — add `cables.create()`, `cables.remove()`, `equipment.create()`, `equipment.remove()`; `frontend/lib/types/portal.ts` — add `PortalCableCreate` and `PortalEquipmentCreate` payload types.
- **Frontend pages**: `frontend/app/portal/cables/page.tsx` — expand table columns, add "New Cable" button; `frontend/app/portal/cables/new/page.tsx` (new); `frontend/app/portal/cables/[id]/page.tsx` — add delete button; `frontend/app/portal/equipment/page.tsx` — expand table columns, add "New Equipment" button; `frontend/app/portal/equipment/new/page.tsx` (new); `frontend/app/portal/equipment/[id]/page.tsx` — add delete button.
- **Frontend components**: `frontend/components/portal/form/CableEditForm.tsx` — expand fields; `frontend/components/portal/form/EquipmentEditForm.tsx` — expand fields; new `CableCreateForm.tsx` and `EquipmentCreateForm.tsx` components; new `DeleteConfirmDialog.tsx` shared component.
- **No database changes**: No schema migrations required.
- **No new dependencies**: Uses existing Next.js, React, TypeScript, and FastAPI stack.

```

## openspec/changes/portal-cable-equipment-crud/design.md

- Source: openspec/changes/portal-cable-equipment-crud/design.md
- Lines: 1-96
- SHA256: f0f339199e9568f63a1848fa539e8a7ef68958686f5de9d99fb88ca7991fc339

[TRUNCATED]

```md
## Context

Change 1 (`portal-foundation-refactor`) establishes the type-safe `portalApi` server-side client, the `portalApiClient` client-side write layer, shared TypeScript types in `frontend/lib/types/portal.ts`, and BFF route conventions. This change builds on that foundation to add create/delete capabilities and expand the forms and list pages.

The backend already has admin routes for cable/equipment CRUD (`backend/app/api/routes/cables.py`, `backend/app/api/routes/equipment.py`) with scope checks. The portal routes (`portal_cables.py`, `portal_equipment.py`) currently only support GET (list), GET (detail), and PUT (update). The portal PUT for cables intentionally excludes `common_specs` and `variants` — this exclusion carries over to create.

Ownership is enforced via `_check_cable_ownership` / `_check_equipment_ownership`, which verify `manufacturer_id == user.scope_id`. Portal users are scoped: `manufacturer` scope_type users access the `cables` module; `equipment_manufacturer` scope_type users access the `equipment` module (per `_FACTORY_ALLOWED_BY_SCOPE` in `backend/app/api/deps.py`).

Taxonomy data for cable form dropdowns is available via the public `GET /api/taxonomy` endpoint (industry → category → product_type tree). Equipment categories are available via `GET /api/equipment-categories` (two-level tree). Both return the structures needed for cascading selects.

The existing `CableUpdate` and `RecommendedEquipmentUpdate` schemas already include all fields the expanded forms need (slug, size_system, meta_title, meta_description, image_url, taxonomy for cables; slug, image_url, external_url, sort_order, category_id for equipment). The form expansion is therefore a frontend-only change for PUT — no backend route changes needed for editing.

## Goals / Non-Goals

**Goals:**
- Add POST (create) and DELETE endpoints to portal cable and equipment backend routes.
- Enforce scope-based ownership on all new operations: `manufacturer_id` forced to `scope_id` on create; ownership checked on delete.
- Add BFF routes and `portalApiClient` methods for create and delete.
- Add "New Cable" and "New Equipment" form pages with create forms and inline validation.
- Add delete buttons with confirmation dialogs on detail pages.
- Expand `CableEditForm` with slug, size_system, meta_title, meta_description, image_url, and taxonomy (industry_id, category_id, product_type_id) fields.
- Expand `EquipmentEditForm` with slug, image_url, external_url, sort_order, and category_id fields.
- Expand cable list page with Category, Product Type, and Size System columns.
- Expand equipment list page with Category column.

**Non-Goals:**
- `common_specs` and `variants` editing in portal (backend intentionally excludes these; portal create also excludes them).
- Media management / image upload UI — covered by change 3 (`portal-media-management`). Image URL fields accept a URL string only; no file picker.
- Foundation refactoring (types, BFF write layer, error handling, loading states) — covered by change 1.
- Admin portal changes.
- Database schema changes.
- Bulk operations (bulk create / bulk delete).
- Editing `applicable_specs` on equipment in the portal (complex rule editor; deferred).

## Decisions

### 1. Portal-specific create schemas: `PortalCableCreate` and `PortalEquipmentCreate`

**Choice**: Create new Pydantic schemas in the backend that omit `manufacturer_id` (server forces it to `user.scope_id`) and `id` (server auto-generates). `PortalCableCreate` also omits `common_specs` and `variants` (consistent with the existing portal PUT exclusion).

**Rationale**: Reusing `CableCreate` / `RecommendedEquipmentCreate` would require the client to send `manufacturer_id` and `id`, then silently override `manufacturer_id` on the server — insecure and confusing. A portal-specific schema makes the security boundary explicit: the client never controls `manufacturer_id` or `id`.

**Alternative considered**: Reusing admin schemas with server-side overrides — rejected because it allows clients to submit fields they shouldn't control, and the exclusion of `common_specs`/`variants` would need to be re-applied.

### 2. ID generation: Server-side, slug-based with UUID fallback

**Choice**: The portal create routes auto-generate the record `id` on the server. Use a slug-derived ID (e.g., `{manufacturer_slug}-{cable_slug}`) with a UUID suffix fallback on collision.

**Rationale**: The cable and equipment models use string primary keys. Forcing portal users to manually choose a unique ID is poor UX. Auto-generation from the slug produces human-readable IDs; the UUID fallback handles collisions.

**Alternative considered**: Requiring the user to provide an ID — rejected as unnecessary friction. Pure UUID — rejected as unreadable in URLs and debugging.

### 3. Delete confirmation: Client-side modal dialog

**Choice**: Delete buttons on detail pages open a confirmation modal ("Are you sure you want to delete this cable? This action cannot be undone.") before calling the delete API. On success, redirect to the list page. A shared `DeleteConfirmDialog` component is reused for both cables and equipment.

**Rationale**: Prevents accidental deletion. A modal is simpler than a separate confirmation page and keeps the user in context.

**Alternative considered**: Inline type-to-confirm — rejected as over-engineering for this scope. No confirmation — rejected as dangerous.

### 4. Create forms: Separate form components from edit forms

**Choice**: Create dedicated `CableCreateForm` and `EquipmentCreateForm` components for the new pages. The create forms include all required fields up front and submit via POST; the edit forms pre-fill from existing data and submit via PUT.

**Rationale**: Create forms need all required fields and submit via a different HTTP method and endpoint. Sharing a single component with a `mode` prop risks conditional branching complexity. Separate components keep each form's validation and submission logic clear.

**Alternative considered**: One form component with `mode="create"|"edit"` — viable but adds conditional branching. Can be revisited if the forms are nearly identical after implementation.

### 5. Taxonomy dropdowns: Fetch via existing public endpoints

**Choice**: Cable create/edit forms fetch taxonomy options (industries, categories, product types) via the existing `GET /api/taxonomy` endpoint through a BFF proxy route or server component data fetch. Equipment forms fetch categories via `GET /api/equipment-categories`. Taxonomy selects are cascading: industry → category → product_type.

**Rationale**: These endpoints already exist and return the tree structure needed for cascading dropdowns. No new backend endpoints needed.

**Alternative considered**: Adding portal-specific taxonomy endpoints — rejected as unnecessary duplication.

### 6. Cable/equipment PUT expansion: Frontend-only change

**Choice**: The existing `PUT /api/portal/cables/{id}` route already accepts the full `CableUpdate` schema (which includes slug, size_system, meta_title, meta_description, image_url, taxonomy fields). The existing `PUT /api/portal/equipment/{id}` route already accepts the full `RecommendedEquipmentUpdate` schema. No backend route changes needed for form expansion — only the frontend form components need new fields.


```

Full source: openspec/changes/portal-cable-equipment-crud/design.md

## openspec/changes/portal-cable-equipment-crud/tasks.md

- Source: openspec/changes/portal-cable-equipment-crud/tasks.md
- Lines: 1-101
- SHA256: d9a0b5a790e7e2992d3fbfcc568f2cf26876e0ce09ecfeca6595664e3e52c3c5

[TRUNCATED]

```md
## 1. Backend Schemas

- [ ] 1.1 Add `PortalCableCreate` schema to `backend/app/schemas/cable.py` with fields: `product_type_id`, `industry_id`, `category_id`, `model`, `slug`, `size_system`, `base_description`, `meta_title`, `meta_description`, `image_url`, `category_ids` (omit `id`, `manufacturer_id`, `common_specs`, `variants`)
- [ ] 1.2 Add `PortalEquipmentCreate` schema to `backend/app/schemas/equipment.py` with fields: `category_id`, `model`, `slug`, `description`, `image_url`, `external_url`, `sort_order` (omit `id`, `manufacturer_id`, `applicable_specs`)
- [ ] 1.3 Verify both schemas use `model_config = {"from_attributes": True}` where applicable and match the existing field types from `CableCreate` / `RecommendedEquipmentCreate`

## 2. Backend Portal Cable Routes (POST + DELETE)

- [ ] 2.1 Add `POST /api/portal/cables` to `backend/app/api/routes/portal_cables.py`: accept `PortalCableCreate`, force `manufacturer_id = user.scope_id`, auto-generate `id` (slug-based with UUID fallback), create `Cable` model (no common_specs/variants), return `201` with `CableRead`
- [ ] 2.2 Add `DELETE /api/portal/cables/{cable_id}` to `backend/app/api/routes/portal_cables.py`: fetch cable via `crud_cable.get_detail`, call `_check_cable_ownership`, delete via `crud_cable.remove`, return `200` with `CableRead`
- [ ] 2.3 Verify ID auto-generation handles collisions (check if ID exists before insert, append UUID suffix on collision)
- [ ] 2.4 Run backend tests to verify create and delete work with scope enforcement

## 3. Backend Portal Equipment Routes (POST + DELETE)

- [ ] 3.1 Add `POST /api/portal/equipment` to `backend/app/api/routes/portal_equipment.py`: accept `PortalEquipmentCreate`, force `manufacturer_id = user.scope_id`, auto-generate `id` (slug-based with UUID fallback), create via `crud_equipment.create`, return `201` with `RecommendedEquipmentRead`
- [ ] 3.2 Add `DELETE /api/portal/equipment/{equipment_id}` to `backend/app/api/routes/portal_equipment.py`: fetch equipment via `crud_equipment.get`, call `_check_equipment_ownership`, delete via `crud_equipment.remove`, return `200` with `RecommendedEquipmentRead`
- [ ] 3.3 Verify ID auto-generation handles collisions (check if ID exists before insert, append UUID suffix on collision)
- [ ] 3.4 Run backend tests to verify create and delete work with scope enforcement

## 4. Frontend Types

- [ ] 4.1 Add `PortalCableCreate` interface to `frontend/lib/types/portal.ts` matching the backend schema (product_type_id, industry_id, category_id, model, slug, size_system, base_description?, meta_title?, meta_description?, image_url?, category_ids?)
- [ ] 4.2 Add `PortalEquipmentCreate` interface to `frontend/lib/types/portal.ts` matching the backend schema (category_id, model, slug, description?, image_url?, external_url?, sort_order?)

## 5. Frontend BFF Routes

- [ ] 5.1 Create `frontend/app/api/portal/cables/route.ts` with a POST handler that forwards the body and `portal_token` cookie to backend `POST /api/portal/cables`
- [ ] 5.2 Add a DELETE handler to `frontend/app/api/portal/cables/[id]/route.ts` that forwards the `portal_token` cookie to backend `DELETE /api/portal/cables/{id}`
- [ ] 5.3 Create `frontend/app/api/portal/equipment/route.ts` with a POST handler that forwards the body and `portal_token` cookie to backend `POST /api/portal/equipment`
- [ ] 5.4 Add a DELETE handler to `frontend/app/api/portal/equipment/[id]/route.ts` that forwards the `portal_token` cookie to backend `DELETE /api/portal/equipment/{id}`
- [ ] 5.5 (Optional) Create `frontend/app/api/portal/taxonomy/route.ts` BFF proxy if the taxonomy endpoint requires auth — verify auth requirements first

## 6. Frontend portalApiClient Methods

- [ ] 6.1 Add `cables.create(data: PortalCableCreate)` to `frontend/lib/portalApiClient.ts` — POSTs to `/api/portal/cables`, returns `PortalCable`
- [ ] 6.2 Add `cables.remove(id: string)` to `frontend/lib/portalApiClient.ts` — DELETEs to `/api/portal/cables/{id}`
- [ ] 6.3 Add `equipment.create(data: PortalEquipmentCreate)` to `frontend/lib/portalApiClient.ts` — POSTs to `/api/portal/equipment`, returns `PortalEquipment`
- [ ] 6.4 Add `equipment.remove(id: string)` to `frontend/lib/portalApiClient.ts` — DELETEs to `/api/portal/equipment/{id}`
- [ ] 6.5 Add error handling that parses BFF error responses and throws typed errors with the server message

## 7. Cable Edit Form Expansion

- [ ] 7.1 Expand `frontend/components/portal/form/CableEditForm.tsx` with state and inputs for: slug, size_system, meta_title, meta_description, image_url
- [ ] 7.2 Add cascading taxonomy dropdowns (industry_id, category_id, product_type_id) to `CableEditForm` — fetch options from `GET /api/taxonomy` (via server component prop or BFF)
- [ ] 7.3 Pre-select existing taxonomy values from the cable record
- [ ] 7.4 Update the PUT submission to include all new fields in the payload via `portalApiClient.cables.update()`
- [ ] 7.5 Add inline validation for required fields (model, slug, size_system, taxonomy)

## 8. Equipment Edit Form Expansion

- [ ] 8.1 Expand `frontend/components/portal/form/EquipmentEditForm.tsx` with state and inputs for: slug, image_url, external_url, sort_order
- [ ] 8.2 Add category dropdown (category_id) to `EquipmentEditForm` — fetch options from `GET /api/equipment-categories`
- [ ] 8.3 Pre-select existing category value from the equipment record
- [ ] 8.4 Update the PUT submission to include all new fields in the payload via `portalApiClient.equipment.update()`
- [ ] 8.5 Add inline validation for required fields (model, slug, category_id); validate sort_order is numeric

## 9. Cable List Page Expansion

- [ ] 9.1 Update `frontend/app/portal/cables/page.tsx` table to add columns: Category, Product Type, Size System (in addition to Name, Manufacturer, Created)
- [ ] 9.2 Display human-readable category and product type labels (resolve IDs to names from taxonomy data, or fetch taxonomy tree in the server component)
- [ ] 9.3 Add a "New Cable" button linking to `/portal/cables/new`

## 10. Equipment List Page Expansion

- [ ] 10.1 Update `frontend/app/portal/equipment/page.tsx` table to add a Category column (in addition to Name, Created)
- [ ] 10.2 Display the category label from the equipment's `category` relation (already returned by the list endpoint)
- [ ] 10.3 Add a "New Equipment" button linking to `/portal/equipment/new`

## 11. Cable Create Page & Form

- [ ] 11.1 Create `frontend/app/portal/cables/new/page.tsx` — server component that fetches taxonomy tree and renders `CableCreateForm`
- [ ] 11.2 Create `frontend/components/portal/form/CableCreateForm.tsx` — client component with fields: model, slug, size_system, base_description, meta_title, meta_description, image_url, and cascading taxonomy dropdowns
- [ ] 11.3 Add inline validation for required fields (model, slug, size_system, industry_id, category_id, product_type_id)
- [ ] 11.4 On submit, call `portalApiClient.cables.create(data)` and redirect to `/portal/cables/{new_id}` on success
- [ ] 11.5 Display server error messages (e.g., slug collision) without losing entered form values

## 12. Equipment Create Page & Form

- [ ] 12.1 Create `frontend/app/portal/equipment/new/page.tsx` — server component that fetches equipment categories and renders `EquipmentCreateForm`

```

Full source: openspec/changes/portal-cable-equipment-crud/tasks.md

## openspec/changes/portal-cable-equipment-crud/specs/portal-cable-crud/spec.md

- Source: openspec/changes/portal-cable-equipment-crud/specs/portal-cable-crud/spec.md
- Lines: 1-125
- SHA256: d17891e0f90be52d8ddad89f7918d2340bd0ef331409b848281cc7990b5a7fbb

[TRUNCATED]

```md
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

```

Full source: openspec/changes/portal-cable-equipment-crud/specs/portal-cable-crud/spec.md

## openspec/changes/portal-cable-equipment-crud/specs/portal-equipment-crud/spec.md

- Source: openspec/changes/portal-cable-equipment-crud/specs/portal-equipment-crud/spec.md
- Lines: 1-125
- SHA256: be2063388d374084b062c50b3357805b7646cf29e869d38eb643da713a7bd4a4

[TRUNCATED]

```md
## ADDED Requirements

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

```

Full source: openspec/changes/portal-cable-equipment-crud/specs/portal-equipment-crud/spec.md
