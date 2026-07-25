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

**Rationale**: The backend PUT routes and update schemas already support all fields. The form expansion is purely a frontend change.

### 7. List page column expansion: Frontend-only change

**Choice**: The cable and equipment list endpoints (`GET /api/portal/cables`, `GET /api/portal/equipment`) already return full records via `list_by_manufacturer`, which loads records with relations (manufacturer, variants, common_specs for cables; manufacturer, category for equipment). The list page expansion is a frontend-only change — add columns to the existing tables.

**Rationale**: No backend changes needed. The list endpoints already return the data needed for the new columns. Cable `CableRead` includes `category_id`, `product_type_id`, `industry_id`, and `size_system`; equipment `RecommendedEquipmentRead` includes `category` relation.

## Risks / Trade-offs

- **[Dependency on change 1]** → This change assumes `portalApiClient`, `frontend/lib/types/portal.ts`, and typed `portalApi` exist. Mitigation: change 1 must be implemented first; if change 1 is delayed, the create/delete BFF routes and client methods can be built directly (they are simple fetch wrappers).
- **[Slug collision on create]** → Two cables with the same slug under the same manufacturer could produce duplicate IDs. Mitigation: server generates ID with UUID fallback; verify slug uniqueness at the DB constraint level or via a check query before insert.
- **[Delete of cable with variants/specs]** → Deleting a cable cascades to variants and spec items. Mitigation: verify cascade behavior in the model; the admin delete route already handles this via `crud_cable.remove` which relies on DB cascade or ORM cascade.
- **[Taxonomy endpoint auth]** → The public taxonomy endpoint may not require auth. If it does, the portal BFF needs to forward the token. Mitigation: verify auth requirements during implementation; add a BFF proxy route (`/api/portal/taxonomy`) if needed.
- **[Form complexity]** → The expanded cable form has 9+ fields including cascading taxonomy dropdowns. Mitigation: keep the form simple with standard HTML selects; no complex dynamic form library.
- **[Cross-scope data leakage on delete]** → A user might attempt to delete another manufacturer's cable by guessing the ID. Mitigation: `_check_cable_ownership` / `_check_equipment_ownership` return 404 (not 403) for out-of-scope records, preventing information leakage about record existence.
