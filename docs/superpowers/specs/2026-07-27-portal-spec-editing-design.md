---
comet_change: portal-spec-editing
role: technical-design
canonical_spec: openspec
---

# Design Doc: Portal Spec Editing

## Context

Portal manufacturers cannot enter spec data when creating or editing cables and equipment through the portal UI — they must ask an admin. This change adds optional raw-JSON spec textareas to the portal cable/equipment create/edit forms, reusing the admin's proven textarea + `JSON.parse` validation pattern, and extends the backend portal schemas and routes to accept and persist optional spec fields.

The open-phase `design.md` established the high-level approach (D1–D5). This Design Doc refines the technical implementation, corrects a critical flaw in D4 (cable route spec handling), and documents the user-confirmed variant update semantic.

## Open-Phase Design Refinement

### Correction to D4: Cable Route Spec Handling

**D4 original**: "Portal cable PUT route: remove `exclude={"common_specs", "variants"}` from the `model_dump` call (the route already reuses admin `CableUpdate` which accepts these fields)"

**Finding**: Code investigation of `backend/app/api/routes/cables.py` (admin) and `backend/app/api/routes/portal_cables.py` (portal) revealed that `common_specs` and `variants` are SQLAlchemy **relationships** (one-to-many), not scalar columns. The admin routes handle them with explicit spec-persistence logic:

- **Admin POST** ([cables.py:100-124](file:///d:/projects/unowire/backend/app/api/routes/cables.py#L100-124)): `model_dump(exclude={"common_specs", "variants"})` for Cable fields → create Cable → iterate `obj_in.common_specs` to `db.add(SpecItem(...))` → iterate `obj_in.variants` to create `CableVariant` + nested `SpecItem` records
- **Admin PUT** ([cables.py:144-170](file:///d:/projects/unowire/backend/app/api/routes/cables.py#L144-170)): keep `exclude` on generic update → if `common_specs is not None`, delete existing common_specs and add new → if `variants is not None`, delete existing variants+specs and add new

Simply removing the `exclude` from the portal PUT route would cause `setattr(cable, "common_specs", [SpecItemCreate(...)])` to fail (relationship expects SQLAlchemy model instances, not pydantic objects).

**Corrected approach**: The portal cable POST and PUT routes must replicate admin's spec-persistence logic, not just toggle the exclude flag. See Implementation section below.

### User-Confirmed Refinement: Variant ID Preservation on PUT

**D4 original**: Implied portal PUT would match admin's "delete all + recreate all" variant replacement.

**User decision**: Preserve variant IDs on PUT. Match payload variants to existing by `slug`; matched variants keep their DB `id`, `slug`, and `sort_order`, only their `specs` list is replaced. Payload variants without a slug match are ignored. Existing variants whose slug is not in the payload are kept.

**Rationale**: External systems may reference variant IDs. Admin's full-recreate approach breaks these references. Portal's PUT takes a conservative merge-by-slug approach.

## Implementation

### Backend Schemas

**`backend/app/schemas/cable.py` — `PortalCableCreate`**:
- Add `common_specs: list[SpecItemCreate] | None = None`
- Add `variants: list[CableVariantCreate] | None = None` (use `CableVariantCreate`, not `CableVariantUpdate`, to match admin create schema — both have `slug`, `sort_order`, `specs`)
- Update docstring: remove "Excludes specs" note, document that specs are optional and persisted via admin's spec-persistence pattern

**`backend/app/schemas/equipment.py` — `PortalEquipmentCreate`**:
- Add `applicable_specs: list[dict] | None = None` (match admin's `RecommendedEquipmentCreate` type — `list[dict]`, no structural validation)
- Update docstring: remove "Excludes applicable_specs" note

No new schemas needed. `PortalCableUpdate` and `PortalEquipmentUpdate` are not introduced — portal PUT reuses admin's `CableUpdate` and `RecommendedEquipmentUpdate` (already the case in current code).

### Backend Routes

**`backend/app/api/routes/portal_cables.py` — POST (create)**:
Replicate admin create logic ([cables.py:100-124](file:///d:/projects/unowire/backend/app/api/routes/cables.py#L100-124)):

```python
@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(obj_in: PortalCableCreate, db, user):
    # existing manufacturer check + ID generation...
    from app.models.cable import CableVariant, SpecItem

    cable_data = obj_in.model_dump(exclude={"common_specs", "variants"})
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id
    cable = CableModel(**cable_data)
    db.add(cable)
    await db.flush()

    # Common specs
    if obj_in.common_specs:
        for spec_data in obj_in.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Variants + nested specs
    if obj_in.variants:
        for variant_data in obj_in.variants:
            variant = CableVariant(cable_id=cable.id, slug=variant_data.slug, sort_order=variant_data.sort_order)
            db.add(variant)
            await db.flush()
            for spec_data in variant_data.specs:
                spec = SpecItem(cable_id=cable.id, variant_id=variant.id, **spec_data.model_dump())
                db.add(spec)

    await db.commit()
    await db.refresh(cable)
    return cable
```

**`backend/app/api/routes/portal_cables.py` — PUT (update)**:
Keep `exclude` on generic update; add spec-replacement logic with slug-matched variant merge:

```python
@router.put("/{cable_id}", response_model=CableRead)
async def update_cable(cable_id, body: CableUpdate, user, db):
    from app.models.cable import CableVariant, SpecItem

    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)

    # Generic field update (specs still excluded)
    update_data = body.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})
    for field, value in update_data.items():
        setattr(cable, field, value)

    # Replace common_specs if provided (same as admin)
    if body.common_specs is not None:
        for existing in list(cable.common_specs):
            await db.delete(existing)
        for spec_data in body.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Variants: slug-matched merge (preserve IDs, replace specs only)
    if body.variants is not None:
        existing_by_slug = {v.slug: v for v in cable.variants}
        for variant_data in body.variants:
            existing = existing_by_slug.get(variant_data.slug)
            if existing is None:
                # Slug not found — ignore (don't create new variants via PUT)
                continue
            # Preserve variant id, slug, sort_order; replace specs only
            for existing_spec in list(existing.specs):
                await db.delete(existing_spec)
            for spec_data in variant_data.specs:
                spec = SpecItem(cable_id=cable.id, variant_id=existing.id, **spec_data.model_dump())
                db.add(spec)
        # Existing variants not in payload: keep (don't delete)

    await db.commit()
    await db.refresh(cable)
    return cable
```

**`backend/app/api/routes/portal_equipment.py` — POST and PUT**: No route changes. `applicable_specs` is a JSONB column; `EquipmentModel(**data)` and `setattr(equipment, "applicable_specs", [...])` work directly. The existing `model_dump(exclude_unset=True)` on PUT already handles optional omission correctly.

### Frontend Types

**`frontend/lib/types/portal.ts`**:
- `PortalCableCreate`: add `common_specs?: Record<string, unknown>[]` and `variants?: { slug: string; sort_order?: number; specs: Record<string, unknown>[] }[]` (use loose `Record` types since frontend doesn't structurally validate — backend pydantic does)
- `PortalCableUpdate`: add same optional fields
- `PortalEquipmentCreate`: add `applicable_specs?: Record<string, unknown>[]`
- `PortalEquipmentUpdate`: add `applicable_specs?: Record<string, unknown>[]`

### Frontend Form Components

**`frontend/components/portal/form/CableFormFields.tsx`**:
- Extend `CableFormState` with `common_specs_json: string` and `variants_json: string`
- Add two textareas after the existing fields, reusing admin's className pattern:
  ```tsx
  <textarea
    value={value.common_specs_json}
    onChange={(e) => onChange({ common_specs_json: e.target.value })}
    className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
      errors.common_specs_json
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
    }`}
  />
  {errors.common_specs_json && (
    <p className="text-red-600 text-sm mt-1">{errors.common_specs_json}</p>
  )}
  ```
- Add a `<p>` hint above each textarea showing expected JSON shape (matching admin's hint text)

**`frontend/components/portal/form/EquipmentFormFields.tsx`**:
- Extend `EquipmentFormState` with `applicable_specs_json: string`
- Add one textarea with the same pattern

### Frontend Form Wrappers

**`CableCreateForm.tsx` and `CableEditForm.tsx`**:
- Initialize `common_specs_json` and `variants_json`:
  - Create: empty string `''`
  - Edit: `JSON.stringify(cable.common_specs ?? [], null, 2)` and `JSON.stringify(cable.variants ?? [], null, 2)`
- Extend `handleChange` to validate JSON on change:
  ```tsx
  if (patch.common_specs_json !== undefined) {
    validateJsonField(patch.common_specs_json, 'common_specs_json');
  }
  if (patch.variants_json !== undefined) {
    validateJsonField(patch.variants_json, 'variants_json');
  }
  ```
  where `validateJsonField` runs `JSON.parse` on non-empty text and sets/clears `errors[field]`.
- In `handleSubmit`:
  - Re-validate JSON fields (defensive)
  - Block submit if any JSON error
  - Build payload: only include `common_specs`/`variants` if the corresponding textarea is non-empty (after trim); parse and include
  - For edit: if textarea is empty, omit the field (don't overwrite existing specs — `exclude_unset` on backend preserves them)

**`EquipmentCreateForm.tsx` and `EquipmentEditForm.tsx`**: Same pattern with single `applicable_specs_json` field.

### Backend Tests

Add to `backend/tests/api/portal/test_cables.py` and `test_equipment.py`:

**Cable tests**:
1. `test_portal_create_cable_with_specs` — POST with `common_specs` and `variants` → 201, response includes specs
2. `test_portal_create_cable_without_specs` — POST without spec fields → 201, backward-compatible
3. `test_portal_update_cable_replace_common_specs` — PUT with `common_specs` → existing common_specs replaced
4. `test_portal_update_cable_variants_preserve_id` — PUT with `variants` where slug matches existing → variant ID unchanged, specs replaced
5. `test_portal_update_cable_variants_ignore_unknown_slug` — PUT with `variants` where slug doesn't match → existing variants unchanged, payload variant ignored
6. `test_portal_update_cable_without_variants_preserves_existing` — PUT without `variants` field → existing variants unchanged
7. `test_portal_update_cable_cross_scope_404` — PUT on another manufacturer's cable → 404

**Equipment tests**:
8. `test_portal_create_equipment_with_applicable_specs` — POST with `applicable_specs` → 201, persisted
9. `test_portal_update_equipment_applicable_specs` — PUT with `applicable_specs` → persisted
10. `test_portal_equipment_cross_scope_404` — cross-scope → 404

## Edge Cases

- **Empty JSON array `[]` in textarea**: parsed successfully, sent as `common_specs: []` → backend deletes existing common_specs and adds none (clears specs). This is intentional — user explicitly typed `[]`.
- **Empty textarea (no text)**: field omitted from payload → existing specs preserved (PUT) or no specs created (POST). Distinguished from `[]` which explicitly clears.
- **`null` in textarea**: `JSON.parse("null")` succeeds, sends `common_specs: null` → pydantic accepts `None` for `list[SpecItemCreate] | None` → backend treats as "not provided" → existing specs preserved (PUT). Equivalent to empty textarea.
- **JSON object instead of array** (e.g., `{"foo": "bar"}`): `JSON.parse` succeeds, but pydantic rejects (expects list) → 422 → form displays error.
- **Large spec payload**: FastAPI's default body size limit applies; admin has same exposure. No special handling.
- **Variant slug collision** (two variants with same slug in payload): undefined behavior — admin enforces unique slugs at creation; portal PUT's slug-map will only match the last one in the iteration. Acceptable since admin prevents the upstream state.

## Risks

| Risk | Mitigation |
|------|------------|
| Portal user enters malformed spec structure | JSON syntax validation catches typos; pydantic catches structural issues (422); form displays error. Same as admin. |
| Variant ID referenced by external system breaks | Portal PUT preserves variant IDs via slug-matched merge. POST (create) generates new IDs — acceptable for new cables. |
| PUT can't add/remove variants | By design — MVP scope. Adding/removing variants requires admin or future variant editor. Documented in spec. |
| common_specs replacement is destructive | Form pre-fills existing specs as JSON; user sees what they're replacing. Matches admin behavior. |
| Frontend type mismatch with backend | Frontend uses loose `Record<string, unknown>[]` types; backend pydantic enforces actual structure. Mismatches surface as 422 errors, not runtime crashes. |
