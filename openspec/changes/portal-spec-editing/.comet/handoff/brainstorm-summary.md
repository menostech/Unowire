# Brainstorm Summary

- Change: portal-spec-editing
- Date: 2026-07-27

## Confirmed Technical Approach

**Overall**: Extend portal cable/equipment create/edit forms with optional raw-JSON spec textareas, reusing admin's textarea + `JSON.parse` validation pattern. Backend portal schemas accept optional spec fields and persist them via the same CRUD patterns as admin.

**Critical refinement to open-phase design.md D4**: The open-phase design said "remove `exclude={"common_specs", "variants"}` from portal cable PUT route". Code investigation proved this insufficient — `common_specs` and `variants` are SQLAlchemy relationships, not columns, so `setattr(cable, "common_specs", [...])` fails. The portal cable POST and PUT routes must replicate admin's spec-persistence logic (strip from generic update → create/replace SpecItem and CableVariant records explicitly).

**User-confirmed variant update semantic on PUT**: Preserve variant IDs. Match payload variants to existing by `slug`; matched variants keep their DB `id`, `slug`, and `sort_order`, only their `specs` list is replaced (delete old SpecItem rows, add new ones). Payload variants without a slug match are ignored (not created). Existing variants whose slug is not in the payload are kept (not deleted). This diverges from admin's "delete all + recreate all" approach to avoid breaking external references to variant IDs.

**Cable POST (create)**: Replicate admin create — `model_dump(exclude={"common_specs", "variants"})` for Cable fields, then iterate payload to create SpecItem (common_specs) and CableVariant + SpecItem (variants) records. New cables get new variants with new IDs.

**Cable PUT (update)**: Keep `exclude={"common_specs", "variants"}` on generic field update. For `common_specs`: if provided, delete all existing common_specs and add new ones (same as admin). For `variants`: slug-matched merge as described above (preserve IDs, replace specs only, no add/delete).

**Equipment POST/PUT**: No route changes needed. `applicable_specs` is a JSONB column, passes through `EquipmentModel(**data)` and `setattr(equipment, "applicable_specs", [...])` directly.

**Frontend**: Add `*_json: string` fields to form state; textareas in `CableFormFields`/`EquipmentFormFields` reuse admin's className + red-border-on-error styling; 4 form wrappers handle pre-fill (`JSON.stringify(existing, null, 2)` or empty string) + on-change validation (parent runs `JSON.parse`, stores error in `errors` map) + on-submit (only include field in payload if textarea non-empty, to avoid overwriting untouched specs via `exclude_unset`).

## Key Trade-offs and Risks

- **Variant slug as match key**: If two existing variants share a slug (shouldn't happen — slug is the natural key per variant), behavior is undefined. Mitigation: admin enforces unique slugs per cable at creation time; portal inherits this invariant.
- **PUT can't add/remove variants**: By design — portal users can only edit specs within existing variants. Adding/removing variants requires admin or a future dedicated variant editor. Acceptable for MVP.
- **Cable spec structural validation**: Backend pydantic validates `SpecItemCreate` structure (e.g., `spec_key` required, `spec_type` required). Invalid structure → 422 → form displays error. Frontend only validates JSON syntax, matching admin. Equipment `applicable_specs` is `list[dict]` — no structural validation.
- **Spec replacement is destructive for common_specs**: On PUT, providing `common_specs` deletes all existing common_specs. Form pre-fills existing specs as JSON so user sees what they're replacing.
- **No admin form changes**: Confirmed — admin's inline JSON textarea pattern is duplicated in portal forms, not extracted to a shared component. 2x duplication (CableFormFields + EquipmentFormFields) is acceptable.

## Testing Strategy

**Backend pytest** (in `backend/tests/api/portal/`):
- cable POST with `common_specs` + `variants` → 201, returned CableRead includes specs
- cable POST without specs → 201, backward-compatible
- cable PUT with `common_specs` → existing common_specs replaced
- cable PUT with `variants` (slug matches existing) → variant ID preserved, specs replaced
- cable PUT with `variants` (slug doesn't match) → existing variant unchanged, payload variant ignored
- cable PUT without `variants` → existing variants preserved (exclude_unset)
- cable PUT cross-scope → 404 (ownership)
- equipment POST with `applicable_specs` → 201, persisted
- equipment PUT with `applicable_specs` → persisted
- equipment cross-scope → 404

**Frontend**: No automated tests (MVP). Manual verification of: textarea renders, red border on invalid JSON, pre-fill on edit, successful submit with valid JSON, blocked submit on invalid JSON.

## Spec Patches

**portal-cable-crud/spec.md**:
1. Fix scenario "Cable edit form persists specs on save" — change "(the portal PUT route no longer strips spec fields)" to "(the portal PUT route persists specs via the same spec-replacement logic as admin: common_specs are fully replaced; variants are slug-matched and their specs replaced with variant IDs preserved)"
2. Add scenario "Cable PUT preserves variant IDs on slug match" — when payload variant slug matches existing, variant ID is preserved, only specs are replaced
3. Add scenario "Cable PUT without variants field preserves existing variants" — when payload omits `variants`, existing variants are unchanged

**portal-equipment-crud/spec.md**: No patches needed — existing scenarios accurately describe equipment behavior.
