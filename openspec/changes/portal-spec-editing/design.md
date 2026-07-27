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
