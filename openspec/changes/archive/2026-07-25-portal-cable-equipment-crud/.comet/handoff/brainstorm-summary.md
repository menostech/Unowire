# Brainstorm Summary

- Change: portal-cable-equipment-crud
- Date: 2026-07-25

## Confirmed Technical Approach

### ID Generation (Decision confirmed)
- ID = `{manufacturer_slug}-{cable_slug}`.lower() truncated to 92 chars
- Pre-check via SELECT before insert; on collision append `-{8char uuid4.hex}` suffix
- Concurrent race fallback: catch `IntegrityError` → return 409 Conflict
- `manufacturer_id` server-forced to `user.scope_id`; client never controls it
- Portal create excludes `common_specs` and `variants` (consistent with portal PUT)

### Form Architecture (Decision confirmed)
- Shared `CableFormFields` / `EquipmentFormFields` sub-components (controlled inputs)
- `CableCreateForm` and `CableEditForm` wrap the shared fields with mode-specific submit logic
- Same pattern for equipment
- `CableFormFields` props: `value`, `onChange`, `errors`, `taxonomy`, `mode`

### Slug Behavior (Decision confirmed)
- `mode="create"`: auto-derive slug from model name (lowercase, replace non-alphanumeric with `-`, trim)
- After user manually edits slug, mark `slugTouched=true` and stop auto-deriving
- `mode="edit"`: preserve existing slug, no auto-derivation

### Delete Button Placement (Decision confirmed)
- Separate client component `CableDeleteButton` / `EquipmentDeleteButton` on detail page
- Rendered below `<EditForm>` (not inside it)
- Opens `DeleteConfirmDialog` shared modal → on confirm calls `portalApiClient.*.remove(id)` → redirects to list

### Backend Routes
- `POST /api/portal/cables` and `POST /api/portal/equipment` with portal-specific create schemas
- `DELETE /api/portal/cables/{id}` and `DELETE /api/portal/equipment/{id}` reusing existing `_check_*_ownership` (404 on out-of-scope)
- PUT routes unchanged (already accept full `CableUpdate` / `RecommendedEquipmentUpdate`)
- DB FK `ondelete="CASCADE"` handles variant/spec deletion; no ORM cascade needed

### Frontend Types
- Widen `PortalCableUpdate` to include slug, size_system, meta_*, image_url, taxonomy fields (all Optional)
- Widen `PortalEquipmentUpdate` similarly
- Add `PortalCableCreate` / `PortalEquipmentCreate` interfaces matching backend schemas
- Exclude `id, manufacturer_id, common_specs, variants, applicable_specs, category_ids` from portal types

### BFF Routes
- New `frontend/app/api/portal/cables/route.ts` (POST handler)
- Add DELETE handler to existing `frontend/app/api/portal/cables/[id]/route.ts`
- Same for equipment
- No taxonomy BFF proxy needed (public endpoint, server component fetches directly via `INTERNAL_API_BASE`)

### Taxonomy Data Flow
- Server component (create/edit pages) fetches `GET ${INTERNAL_API_BASE}/api/taxonomy` directly
- Passes taxonomy tree as prop to client form component
- Cascading dropdowns: industry → category → product_type; changing parent resets children
- Equipment categories from `GET ${INTERNAL_API_BASE}/api/equipment-categories`

### size_system Control
- `<select>` with 4 options: `awg`, `mm2`, `kcmil`, `none` (DB check constraint)

## Key Trade-offs and Risks

- **ID race condition**: mitigated by pre-check + IntegrityError fallback (409 response)
- **Cross-scope data leakage on delete**: mitigated by `_check_*_ownership` returning 404 (not 403)
- **Form complexity (9+ fields)**: mitigated by shared `CableFormFields` sub-component (single source of truth)
- **Dependency on change 1**: portalApiClient and types from `portal-foundation-refactor` must exist; verified they do
- **Taxonomy endpoint auth**: confirmed public, no BFF proxy needed
- **Delete cascade**: confirmed DB-level `ondelete="CASCADE"` on `CableVariant.cable_id` and `SpecItem.cable_id` FKs

## Testing Strategy

### Backend Tests (pytest, existing pattern)
- POST 201: create cable, verify `manufacturer_id == scope_id`, `id` auto-generated
- POST 403: equipment_manager attempts cable create
- POST 422: missing required fields
- POST 409: duplicate slug
- DELETE 200: delete own cable
- DELETE 404: out-of-scope or nonexistent cable
- Same suite for portal_equipment

### Frontend (no automated tests per project constraint)
- Manual smoke tests per tasks 14.4-14.7:
  - Cable manufacturer: create → list with new columns → edit new fields → delete with confirm
  - Equipment manufacturer: same flow
  - Scope enforcement: direct API DELETE out-of-scope → 404
  - Cross-module: cable manufacturer POST equipment → 403

## Spec Patches

None. Open phase delta specs (`portal-cable-crud`, `portal-equipment-crud`) already cover all scenarios. Design aligns with spec; no scope changes needed.
