## 1. Backend Schemas

- [x] 1.1 Extend `PortalCableCreate` in `backend/app/schemas/cable.py` with optional `common_specs: list[SpecItemCreate] | None = None` and `variants: list[CableVariantCreate] | None = None` (use `CableVariantCreate` to match admin create schema); update the docstring to remove the "Excludes specs" note.
- [x] 1.2 Extend `PortalEquipmentCreate` in `backend/app/schemas/equipment.py` with optional `applicable_specs: list[dict] | None = None`; update the docstring to remove the "Excludes applicable_specs" note.

## 2. Backend Routes

- [ ] 2.1 Update `POST /api/portal/cables` in `backend/app/api/routes/portal_cables.py` to replicate admin create spec-persistence: `model_dump(exclude={"common_specs", "variants"})` for Cable fields, then iterate `obj_in.common_specs` to create `SpecItem` records and `obj_in.variants` to create `CableVariant` + nested `SpecItem` records (reference: `backend/app/api/routes/cables.py:100-124`).
- [ ] 2.2 Update `PUT /api/portal/cables/{cable_id}` in `backend/app/api/routes/portal_cables.py`: keep `exclude={"common_specs", "variants"}` on generic field update; add `common_specs` full-replacement logic (delete existing, add new — same as admin); add `variants` slug-matched merge logic (match by slug, preserve variant ID/slug/sort_order, replace only specs; ignore payload variants with unknown slug; keep existing variants not in payload).
- [ ] 2.3 Fix POST /api/portal/equipment route: use model_dump(exclude={applicable_specs}) + conditional set (DB column nullable=False with server_default=[]). PUT already uses exclude_unset=True.

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
