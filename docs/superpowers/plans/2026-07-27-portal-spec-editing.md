---
change: portal-spec-editing
design-doc: docs/superpowers/specs/2026-07-27-portal-spec-editing-design.md
base-ref: bfffd42d2fc43b4e217ba51199bf2a2b49c13a06
archived-with: 2026-07-29-portal-spec-editing
---

# Portal Spec Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional raw-JSON spec textareas to the portal cable/equipment create/edit forms (reusing the admin's proven textarea + `JSON.parse` validation pattern), and extend the backend portal schemas and routes to accept and persist optional `common_specs`, `variants`, and `applicable_specs` fields.

**Architecture:** Backend `PortalCableCreate` and `PortalEquipmentCreate` schemas gain optional spec fields (defaulting to `None`). The portal cable POST route replicates admin's spec-persistence logic (`model_dump(exclude=...)` for Cable fields, then explicit `SpecItem` / `CableVariant` creation). The portal cable PUT route keeps `exclude` on generic update and adds common-specs full-replacement plus a slug-matched variant merge that preserves variant IDs. Equipment POST/PUT need no route changes — `applicable_specs` is a JSONB column that survives `model_dump`/`setattr` directly. Frontend adds optional spec fields to the portal types, two JSON textareas to `CableFormFields` and one to `EquipmentFormFields`, and each create/edit wrapper initializes / pre-fills / validates / parses those textareas on submit.

**Tech Stack:** FastAPI (async/await), Pydantic v2, SQLAlchemy 2.0 async, PostgreSQL; Next.js 15 App Router, TypeScript, React. No new npm or pip dependencies.

**Design Doc:** `docs/superpowers/specs/2026-07-27-portal-spec-editing-design.md`

## Global Constraints

- No database schema changes — no migrations, no new tables/columns. Spec fields already exist as JSONB (`applicable_specs`) or one-to-many relationships (`common_specs`, `variants`).
- No new npm or pip dependencies. Reuse `JSON.parse` on the frontend and existing SQLAlchemy models on the backend.
- Frontend has NO automated tests — do NOT write frontend test files. Frontend verification is `tsc --noEmit` + `next build` + manual smoke tests (Section 7).
- Backend uses pytest with existing `cable_manager_headers` (scoped to `mfr-1`, `manufacturer` scope) and `equipment_manager_headers` (scoped to `em-1`, `equipment_manufacturer` scope) fixtures from `backend/tests/conftest.py`.
- `common_specs` and `variants` are SQLAlchemy **relationships** on `Cable`, not scalar columns — they cannot be set via `setattr(cable, "common_specs", [...])` with pydantic objects. Portal routes must replicate admin's explicit `SpecItem` / `CableVariant` creation pattern (reference: `backend/app/api/routes/cables.py:100-124` for POST, `cables.py:144-170` for PUT).
- `applicable_specs` on `RecommendedEquipment` is a plain JSONB column — `EquipmentModel(**data)` and `setattr(equipment, "applicable_specs", [...])` work directly. No route changes needed beyond the schema change.
- Optional spec fields default to `None` (backend) and are omitted from the payload when the textarea is empty (frontend) — `exclude_unset=True` on PUT preserves existing specs when the field is omitted.
- Empty textarea ≠ empty JSON array `[]`. `[]` explicitly clears specs; empty textarea omits the field entirely (PUT preserves, POST creates none).
- `null` in textarea: `JSON.parse("null")` succeeds → pydantic accepts `None` → backend treats as "not provided" → existing specs preserved (PUT). Equivalent to empty textarea.
- JSON-syntax-only validation on the frontend (no structural schema validation). Pydantic catches structural issues server-side → 422 → form displays error. Same as admin.
- Variant ID preservation on PUT: match payload variants to existing by `slug`; matched variants keep their DB `id`, `slug`, and `sort_order`, only their `specs` list is replaced. Payload variants without a slug match are ignored. Existing variants whose slug is not in the payload are kept.
- PUT cannot add or remove variants (by design — MVP scope). Only specs of existing variants can be replaced.
- All code, comments, and docs in English.
- `build_mode: subagent-driven-development` — each task is independently executable by a background implementer subagent.

---

## File Structure

**New backend files:** none (modify existing).
**New frontend files:** none (modify existing).

**Modified backend files:**
- `backend/app/schemas/cable.py` — extend `PortalCableCreate` with optional `common_specs` and `variants`.
- `backend/app/schemas/equipment.py` — extend `PortalEquipmentCreate` with optional `applicable_specs`.
- `backend/app/api/routes/portal_cables.py` — extend POST and PUT routes with spec-persistence logic.
- `backend/tests/api/test_portal_cables.py` — add 7 spec-related tests.
- `backend/tests/api/test_portal_equipment.py` — add 3 spec-related tests.

**Modified frontend files:**
- `frontend/lib/types/portal.ts` — extend `PortalCableCreate`, `PortalCableUpdate`, `PortalEquipmentCreate`, `PortalEquipmentUpdate` with optional spec fields.
- `frontend/components/portal/form/CableFormFields.tsx` — extend `CableFormState` and add two JSON textareas.
- `frontend/components/portal/form/EquipmentFormFields.tsx` — extend `EquipmentFormState` and add one JSON textarea.
- `frontend/components/portal/form/CableCreateForm.tsx` — initialize / validate / parse spec textareas on submit.
- `frontend/components/portal/form/CableEditForm.tsx` — pre-fill / validate / parse spec textareas on submit.
- `frontend/components/portal/form/EquipmentCreateForm.tsx` — initialize / validate / parse spec textarea on submit.
- `frontend/components/portal/form/EquipmentEditForm.tsx` — pre-fill / validate / parse spec textarea on submit.

---

## Section 1: Backend Schemas

### Task 1.1: Extend `PortalCableCreate` with optional spec fields

**Files:**
- Modify: `backend/app/schemas/cable.py` (edit `PortalCableCreate` class, currently at lines 162–180)

**Interfaces:**
- Consumes: `SpecItemCreate` (defined at `cable.py:104-112`), `CableVariantCreate` (defined at `cable.py:115-118`). Both already exported from this module.
- Produces: `PortalCableCreate.common_specs: list[SpecItemCreate] | None = None` and `PortalCableCreate.variants: list[CableVariantCreate] | None = None`. Consumed by Task 2.1.

- [ ] **Step 1: Add the spec fields and update the docstring**

In `backend/app/schemas/cable.py`, replace the existing `PortalCableCreate` class body (lines 162–180) with:

```python
class PortalCableCreate(BaseModel):
    """Portal-specific cable create schema.

    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
    Optional `common_specs` and `variants` fields allow portal users to enter
    spec data via raw-JSON textareas. Persisted via the admin spec-persistence
    pattern (explicit `SpecItem` / `CableVariant` creation), not via `model_dump`.
    """
    product_type_id: str
    industry_id: str
    category_id: str
    model: str
    slug: str
    size_system: Literal["awg", "mm2", "kcmil", "none"]
    base_description: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    image_url: str | None = None
    category_ids: list[str] = []
    common_specs: list[SpecItemCreate] | None = None
    variants: list[CableVariantCreate] | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify the schema imports and instantiates**

Run from the `backend/` directory:

```bash
python -c "from app.schemas.cable import PortalCableCreate; print(PortalCableCreate.model_fields.keys())"
```

Expected: `dict_keys(['product_type_id', 'industry_id', 'category_id', 'model', 'slug', 'size_system', 'base_description', 'meta_title', 'meta_description', 'image_url', 'category_ids', 'common_specs', 'variants'])`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/cable.py
git commit -m "feat(schema): add optional common_specs and variants to PortalCableCreate"
```

---

### Task 1.2: Extend `PortalEquipmentCreate` with optional `applicable_specs`

**Files:**
- Modify: `backend/app/schemas/equipment.py` (edit `PortalEquipmentCreate` class, currently at lines 154–168)

**Interfaces:**
- Consumes: nothing new — `applicable_specs` is a plain `list[dict]` (matches admin's `RecommendedEquipmentCreate.applicable_specs` at `equipment.py:135`).
- Produces: `PortalEquipmentCreate.applicable_specs: list[dict] | None = None`. Consumed by Task 2.3 (which only verifies — no route change needed).

- [ ] **Step 1: Add the `applicable_specs` field and update the docstring**

In `backend/app/schemas/equipment.py`, replace the existing `PortalEquipmentCreate` class body (lines 154–168) with:

```python
class PortalEquipmentCreate(BaseModel):
    """Portal-specific equipment create schema.

    Omits `id` (server-generated) and `manufacturer_id` (server-forced to scope_id).
    Optional `applicable_specs` field allows portal users to enter spec data
    via a raw-JSON textarea. Persisted directly to the JSONB column.
    """
    category_id: str
    model: str
    slug: str
    applicable_specs: list[dict] | None = None
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int = 0

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify the schema imports and instantiates**

Run from the `backend/` directory:

```bash
python -c "from app.schemas.equipment import PortalEquipmentCreate; print(PortalEquipmentCreate.model_fields.keys())"
```

Expected: `dict_keys(['category_id', 'model', 'slug', 'applicable_specs', 'description', 'image_url', 'external_url', 'sort_order'])`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/equipment.py
git commit -m "feat(schema): add optional applicable_specs to PortalEquipmentCreate"
```

---

## Section 2: Backend Routes

### Task 2.1: Update portal cable POST to persist specs

**Files:**
- Modify: `backend/app/api/routes/portal_cables.py` (edit `portal_create_cable` function, currently at lines 92–115)

**Interfaces:**
- Consumes: `PortalCableCreate.common_specs` and `PortalCableCreate.variants` (from Task 1.1). Already imports `CableModel` from `app.models.cable`. Needs to additionally import `CableVariant` and `SpecItem`.
- Produces: A POST route that accepts payloads with optional `common_specs` and `variants` and persists them as `SpecItem` and `CableVariant` + nested `SpecItem` records. Reference implementation: `backend/app/api/routes/cables.py:100-124`.

- [ ] **Step 1: Update the `portal_create_cable` function**

In `backend/app/api/routes/portal_cables.py`, replace the body of `portal_create_cable` (lines 92–115) with:

```python
@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(
    obj_in: PortalCableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    from app.models.cable import CableVariant, SpecItem

    manufacturer = await crud_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Manufacturer not found"})

    cable_id = await _generate_cable_id(db, manufacturer.slug, obj_in.slug)
    cable_data = obj_in.model_dump(exclude={"common_specs", "variants"})
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id  # server-forced, ignore client input

    cable = CableModel(**cable_data)
    db.add(cable)
    await db.flush()

    # Common specs (mirrors admin create_cable logic)
    if obj_in.common_specs:
        for spec_data in obj_in.common_specs:
            spec = SpecItem(cable_id=cable.id, variant_id=None, **spec_data.model_dump())
            db.add(spec)

    # Variants + nested specs (mirrors admin create_cable logic)
    if obj_in.variants:
        for variant_data in obj_in.variants:
            variant = CableVariant(
                cable_id=cable.id,
                slug=variant_data.slug,
                sort_order=variant_data.sort_order,
            )
            db.add(variant)
            await db.flush()
            for spec_data in variant_data.specs:
                spec = SpecItem(cable_id=cable.id, variant_id=variant.id, **spec_data.model_dump())
                db.add(spec)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": 409, "message": "A cable with this slug already exists"})
    await db.refresh(cable)
    return cable
```

Note the changes from the original: (1) `model_dump()` → `model_dump(exclude={"common_specs", "variants"})` so SQLAlchemy relationship fields are not passed to `CableModel(**data)`; (2) `await db.flush()` after `db.add(cable)` to populate `cable.id` before creating related `SpecItem` / `CableVariant` rows; (3) explicit spec-persistence loops matching admin's pattern.

- [ ] **Step 2: Verify existing tests still pass (backward-compat)**

Run from the `backend/` directory:

```bash
pytest tests/api/test_portal_cables.py -v
```

Expected: all existing tests pass (no behavioral change for payloads without spec fields — `common_specs` and `variants` default to `None`, both `if` blocks skipped).

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/portal_cables.py
git commit -m "feat(portal-cables): persist common_specs and variants on POST"
```

---

### Task 2.2: Update portal cable PUT with slug-matched variant merge

**Files:**
- Modify: `backend/app/api/routes/portal_cables.py` (edit `update_cable` function, currently at lines 73–89)

**Interfaces:**
- Consumes: `CableUpdate.common_specs` (list[SpecItemCreate] | None) and `CableUpdate.variants` (list[CableVariantUpdate] | None) — already on the existing `body: CableUpdate` parameter. The `CableUpdate` schema is imported from `app.schemas.cable` (already imported at `portal_cables.py:15`). Needs to additionally import `CableVariant` and `SpecItem` from `app.models.cable` inside the function body (same pattern as admin route).
- Produces: A PUT route that replaces `common_specs` if provided and slug-merges `variants` if provided. Variant IDs are preserved for matched slugs; only their `specs` list is replaced. Unmatched payload variants are ignored; unmatched existing variants are kept.

- [ ] **Step 1: Update the `update_cable` function**

In `backend/app/api/routes/portal_cables.py`, replace the body of `update_cable` (lines 73–89) with:

```python
@router.put("/{cable_id}", response_model=CableRead)
async def update_cable(
    cable_id: str,
    body: CableUpdate,
    user: User = Depends(require_factory_module("cables")),
    db: AsyncSession = Depends(get_db),
):
    from app.models.cable import CableVariant, SpecItem

    cable = await crud_cable.get_detail(db, cable_id)
    _check_cable_ownership(user, cable)

    # Generic field update (specs still excluded — handled explicitly below)
    update_data = body.model_dump(exclude_unset=True, exclude={"common_specs", "variants"})
    for field, value in update_data.items():
        setattr(cable, field, value)

    # Replace common_specs if provided (same as admin PUT)
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

Notes: (1) `cable.common_specs` and `cable.variants` are loaded eagerly because `crud_cable.get_detail` uses `selectin` relationships (see `backend/app/models/cable.py:55-64` and `:81-85`). (2) `variant_data.slug` may be `None` on `CableVariantUpdate` (it's optional there); `existing_by_slug.get(None)` returns `None` for None-keyed slugs, so payload variants without a slug are ignored — same as unmatched slugs. (3) The slug-map lookup uses `variant_data.slug` directly, not `variant_data.slug` after `model_dump`, so we don't need to coerce.

- [ ] **Step 2: Verify existing tests still pass (backward-compat)**

Run from the `backend/` directory:

```bash
pytest tests/api/test_portal_cables.py -v
```

Expected: all existing tests pass. PUT payloads without `common_specs` / `variants` skip both `if` blocks; existing specs/variants preserved.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/portal_cables.py
git commit -m "feat(portal-cables): add common_specs replacement and variant slug-merge on PUT"
```

---

### Task 2.3: Fix portal equipment POST route to handle `applicable_specs` None default

**Files:**
- Modify: none (verification only).

**Interfaces:**
- Consumes: `PortalEquipmentCreate.applicable_specs` (from Task 1.2) and existing `RecommendedEquipmentUpdate.applicable_specs` (already on `body: RecommendedEquipmentUpdate`).
- Produces: Confirmation that no route changes are needed for equipment — `applicable_specs` is a JSONB column that flows through `EquipmentModel(**data)` (POST) and `setattr(equipment, "applicable_specs", [...])` (PUT) without explicit handling.

- [ ] **Step 1: Inspect the portal equipment POST route**

Open `backend/app/api/routes/portal_equipment.py` and confirm the `portal_create_equipment` function (lines 78–102) does:

```python
equipment_data = obj_in.model_dump()
equipment_data["id"] = equipment_id
equipment_data["manufacturer_id"] = user.scope_id
equipment = EquipmentModel(**equipment_data)
db.add(equipment)
```

After Task 1.2, `obj_in.model_dump()` includes `applicable_specs` (as `None` if omitted, or as the parsed list if provided). `EquipmentModel` accepts it directly because `applicable_specs` is a JSONB column. No code change needed.

- [ ] **Step 2: Inspect the portal equipment PUT route**

Confirm the `update_equipment` function (lines 59–75) does:

```python
update_data = body.model_dump(exclude_unset=True)
for field, value in update_data.items():
    setattr(equipment, field, value)
```

`RecommendedEquipmentUpdate.applicable_specs` is already `list[dict] | None = None` (see `equipment.py:147`). `exclude_unset=True` ensures that if the client omits the field, existing `applicable_specs` is preserved. If provided, `setattr` writes the new value to the JSONB column. No code change needed.

- [ ] **Step 3: Run existing equipment tests to confirm no regression**

Run from the `backend/` directory:

```bash
pytest tests/api/test_portal_equipment.py -v
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit (if any change was needed — typically none)**

If inspection revealed no code changes (expected), skip this step. Otherwise:

```bash
git add backend/app/api/routes/portal_equipment.py
git commit -m "feat(portal-equipment): confirm applicable_specs flows through POST/PUT"
```

---

## Section 3: Frontend Types

### Task 3.1: Add optional spec fields to portal cable types

**Files:**
- Modify: `frontend/lib/types/portal.ts` (edit `PortalCableCreate` at lines 70–82 and `PortalCableUpdate` at lines 85–96)

**Interfaces:**
- Consumes: nothing (loose `Record<string, unknown>[]` types — frontend doesn't structurally validate; backend pydantic does).
- Produces: `PortalCableCreate.common_specs?` and `PortalCableCreate.variants?` (consumed by Task 5.1); `PortalCableUpdate.common_specs?` and `PortalCableUpdate.variants?` (consumed by Task 5.2).

- [ ] **Step 1: Extend `PortalCableCreate`**

In `frontend/lib/types/portal.ts`, replace the existing `PortalCableCreate` interface (lines 70–82) with:

```typescript
// Portal-specific cable create payload (omits id, manufacturer_id).
// Optional spec fields are parsed from raw-JSON textareas; backend pydantic
// enforces the actual SpecItemCreate / CableVariantCreate structure.
export interface PortalCableCreate {
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string;
  meta_title?: string;
  meta_description?: string;
  image_url?: string;
  category_ids?: string[];
  common_specs?: Record<string, unknown>[];
  variants?: { slug: string; sort_order?: number; specs: Record<string, unknown>[] }[];
}
```

- [ ] **Step 2: Extend `PortalCableUpdate`**

In the same file, replace the existing `PortalCableUpdate` interface (lines 85–96) with:

```typescript
// Cable update payload — widened to cover all editable fields plus optional specs.
export interface PortalCableUpdate {
  model?: string;
  slug?: string;
  size_system?: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  image_url?: string | null;
  industry_id?: string;
  category_id?: string;
  product_type_id?: string;
  common_specs?: Record<string, unknown>[];
  variants?: { slug: string; sort_order?: number; specs: Record<string, unknown>[] }[];
}
```

- [ ] **Step 3: Verify type-checking passes**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: no new type errors. (If pre-existing errors exist, only confirm none were introduced by this change.)

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(types): add optional common_specs and variants to PortalCableCreate/Update"
```

---

### Task 3.2: Add optional `applicable_specs` to portal equipment types

**Files:**
- Modify: `frontend/lib/types/portal.ts` (edit `PortalEquipmentCreate` at lines 117–125 and `PortalEquipmentUpdate` at lines 128–136)

**Interfaces:**
- Consumes: nothing new (loose `Record<string, unknown>[]`).
- Produces: `PortalEquipmentCreate.applicable_specs?` (consumed by Task 5.3); `PortalEquipmentUpdate.applicable_specs?` (consumed by Task 5.4).

- [ ] **Step 1: Extend `PortalEquipmentCreate`**

In `frontend/lib/types/portal.ts`, replace the existing `PortalEquipmentCreate` interface (lines 117–125) with:

```typescript
// Portal-specific equipment create payload (omits id, manufacturer_id).
export interface PortalEquipmentCreate {
  category_id: string;
  model: string;
  slug: string;
  applicable_specs?: Record<string, unknown>[];
  description?: string;
  image_url?: string;
  external_url?: string;
  sort_order?: number;
}
```

- [ ] **Step 2: Extend `PortalEquipmentUpdate`**

In the same file, replace the existing `PortalEquipmentUpdate` interface (lines 128–136) with:

```typescript
// Equipment update payload — widened to cover all editable fields.
export interface PortalEquipmentUpdate {
  model?: string;
  slug?: string;
  description?: string | null;
  image_url?: string | null;
  external_url?: string | null;
  sort_order?: number;
  category_id?: string;
  applicable_specs?: Record<string, unknown>[];
}
```

- [ ] **Step 3: Verify type-checking passes**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(types): add optional applicable_specs to PortalEquipmentCreate/Update"
```

---

## Section 4: Frontend Form Fields

### Task 4.1: Add JSON textareas to `CableFormFields`

**Files:**
- Modify: `frontend/components/portal/form/CableFormFields.tsx` (extend `CableFormState` at lines 6–17 and the JSX at lines 33–152)

**Interfaces:**
- Consumes: nothing new. The existing `CableFormFieldsProps` interface (lines 19–24) already passes `value`, `onChange`, `errors`, `taxonomy`.
- Produces: `CableFormState.common_specs_json: string` and `CableFormState.variants_json: string`. Consumed by Tasks 5.1 and 5.2.

- [ ] **Step 1: Extend `CableFormState`**

In `frontend/components/portal/form/CableFormFields.tsx`, replace the existing `CableFormState` interface (lines 6–17) with:

```typescript
export interface CableFormState {
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description: string;
  meta_title: string;
  meta_description: string;
  image_url: string;
  industry_id: string;
  category_id: string;
  product_type_id: string;
  common_specs_json: string;
  variants_json: string;
}
```

- [ ] **Step 2: Add the two JSON textareas**

In the same file, immediately before the closing `</div>` of the outer `<div className="space-y-4">` (currently line 151, after the `ImageFieldWithPicker` block), add:

```tsx
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Common Specs (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of spec objects: <code>{`[{ "spec_key", "label", "value_string", "value_number", "unit", "spec_type", "filterable" }]`}</code>
        </p>
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
          <p className="mt-1 text-sm text-red-600">{errors.common_specs_json}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Variants (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of variant objects: <code>{`[{ "slug", "sort_order", "specs": [{ "spec_key", "label", ... }] }]`}</code>
        </p>
        <textarea
          value={value.variants_json}
          onChange={(e) => onChange({ variants_json: e.target.value })}
          className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            errors.variants_json
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {errors.variants_json && (
          <p className="mt-1 text-sm text-red-600">{errors.variants_json}</p>
        )}
      </div>
```

This mirrors the admin `CableForm.tsx` textarea pattern at lines 346–384, adapted to the portal's controlled `value`/`onChange` props.

- [ ] **Step 3: Verify type-checking**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: type errors in `CableCreateForm.tsx` and `CableEditForm.tsx` because their `useState` initializers don't yet include `common_specs_json` / `variants_json`. Those will be fixed in Tasks 5.1 and 5.2. Do not commit until those tasks are complete (or commit with the broken state and fix in the same PR — preferred: complete Section 5 before committing Section 4).

If you must commit independently, add temporary `common_specs_json: ''` and `variants_json: ''` to the initializers now, then refactor in Section 5. The recommended approach is to commit Sections 4 and 5 together.

- [ ] **Step 4: Commit (after Section 5 tasks that depend on this are also done, OR with temporary initializers)**

Recommended: complete Task 5.1 and Task 5.2 before committing. Then:

```bash
git add frontend/components/portal/form/CableFormFields.tsx \
        frontend/components/portal/form/CableCreateForm.tsx \
        frontend/components/portal/form/CableEditForm.tsx
git commit -m "feat(portal-cables): add JSON textareas for common_specs and variants"
```

---

### Task 4.2: Add JSON textarea to `EquipmentFormFields`

**Files:**
- Modify: `frontend/components/portal/form/EquipmentFormFields.tsx` (extend `EquipmentFormState` at lines 6–14 and the JSX at lines 33–107)

**Interfaces:**
- Consumes: nothing new.
- Produces: `EquipmentFormState.applicable_specs_json: string`. Consumed by Tasks 5.3 and 5.4.

- [ ] **Step 1: Extend `EquipmentFormState`**

In `frontend/components/portal/form/EquipmentFormFields.tsx`, replace the existing `EquipmentFormState` interface (lines 6–14) with:

```typescript
export interface EquipmentFormState {
  model: string;
  slug: string;
  description: string;
  image_url: string;
  external_url: string;
  sort_order: string; // string for input control; converted to number on submit
  category_id: string;
  applicable_specs_json: string;
}
```

- [ ] **Step 2: Add the JSON textarea**

In the same file, immediately before the closing `</div>` of the outer `<div className="space-y-4">` (currently line 106, after the Sort Order block), add:

```tsx
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Applicable Specs (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of spec rule objects, e.g. <code>{`[{ "spec_key": "conductor_area", "min": 0.1, "max": 1.0 }]`}</code>
        </p>
        <textarea
          value={value.applicable_specs_json}
          onChange={(e) => onChange({ applicable_specs_json: e.target.value })}
          placeholder='[{"spec_key":"conductor_area","min":0.1,"max":1.0}]'
          className={`font-mono text-sm min-h-[150px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            errors.applicable_specs_json
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {errors.applicable_specs_json && (
          <p className="mt-1 text-sm text-red-600">{errors.applicable_specs_json}</p>
        )}
      </div>
```

This mirrors the admin `EquipmentForm.tsx` textarea pattern at lines 198–217, adapted to the portal's controlled `value`/`onChange` props.

- [ ] **Step 3: Verify type-checking**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: type errors in `EquipmentCreateForm.tsx` and `EquipmentEditForm.tsx` — to be fixed in Tasks 5.3 and 5.4. Commit Sections 4.2 + 5.3 + 5.4 together.

- [ ] **Step 4: Commit (after Tasks 5.3 and 5.4 are also done)**

```bash
git add frontend/components/portal/form/EquipmentFormFields.tsx \
        frontend/components/portal/form/EquipmentCreateForm.tsx \
        frontend/components/portal/form/EquipmentEditForm.tsx
git commit -m "feat(portal-equipment): add JSON textarea for applicable_specs"
```

---

## Section 5: Frontend Form Wrappers

> **Shared helper convention:** Each wrapper validates JSON on change by calling a local `validateJsonField(field, text)` that runs `JSON.parse` on non-empty text, sets `errors[field]` to the parse error message on failure, and clears it on success. Empty text clears the error (empty is valid — it just means "omit from payload").

### Task 5.1: Wire spec textareas into `CableCreateForm`

**Files:**
- Modify: `frontend/components/portal/form/CableCreateForm.tsx` (extend `useState` initializer at lines 24–35, `handleChange` at lines 41–54, and `handleSubmit` at lines 68–99)

**Interfaces:**
- Consumes: `CableFormState.common_specs_json` / `variants_json` (from Task 4.1); `PortalCableCreate.common_specs?` / `variants?` (from Task 3.1); `portalApiClient.cables.create` (existing).
- Produces: A create form that initializes both spec textareas to `''`, validates JSON on change, blocks submit on parse error, and includes parsed specs in the POST payload when non-empty.

- [ ] **Step 1: Extend the `useState` initializer**

In `frontend/components/portal/form/CableCreateForm.tsx`, replace the `useState<CableFormState>` initializer (lines 24–35) with:

```typescript
  const [form, setForm] = useState<CableFormState>({
    model: '',
    slug: '',
    size_system: 'awg',
    base_description: '',
    meta_title: '',
    meta_description: '',
    image_url: '',
    industry_id: '',
    category_id: '',
    product_type_id: '',
    common_specs_json: '',
    variants_json: '',
  });
```

- [ ] **Step 2: Extend `handleChange` with JSON validation**

Replace the existing `handleChange` function (lines 41–54) with:

```typescript
  function handleChange(patch: Partial<CableFormState>) {
    // Mark slug as manually edited so auto-derivation stops.
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-derive slug from model unless the user has manually edited the slug.
      if (patch.model !== undefined && !slugTouched) {
        next.slug = slugify(patch.model);
      }
      return next;
    });
    // Validate JSON textareas on change (empty text is valid — clears the error).
    if (patch.common_specs_json !== undefined) {
      validateJsonField('common_specs_json', patch.common_specs_json);
    }
    if (patch.variants_json !== undefined) {
      validateJsonField('variants_json', patch.variants_json);
    }
  }

  function validateJsonField(field: 'common_specs_json' | 'variants_json', text: string) {
    setErrors((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[field];
        return next;
      }
      try {
        JSON.parse(text);
        delete next[field];
      } catch (e) {
        next[field] = `Invalid JSON: ${(e as Error).message}`;
      }
      return next;
    });
  }
```

- [ ] **Step 3: Extend `handleSubmit` to include parsed specs**

Replace the existing `handleSubmit` function (lines 68–99) with:

```typescript
  async function handleSubmit() {
    if (!validate()) return;
    // Re-validate JSON textareas defensively before submit.
    validateJsonField('common_specs_json', form.common_specs_json);
    validateJsonField('variants_json', form.variants_json);
    // Block submit if any JSON error is present (re-reads errors via setState callback
    // are async; instead we re-parse synchronously here and bail on failure).
    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.cables.create>[0] = {
      model: form.model,
      slug: form.slug,
      size_system: form.size_system,
      base_description: form.base_description,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      image_url: form.image_url,
      industry_id: form.industry_id,
      category_id: form.category_id,
      product_type_id: form.product_type_id,
    };
    if (form.common_specs_json.trim()) {
      try {
        payload.common_specs = JSON.parse(form.common_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, common_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (form.variants_json.trim()) {
      try {
        payload.variants = JSON.parse(form.variants_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, variants_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSubmitting(true);
    setErrorMessage('');
    setErrors({});
    try {
      const created = await portalApiClient.cables.create(payload);
      router.push(`/portal/cables/${created.id}`);
    } catch (err) {
      // Keep the user's entered values — only update error state.
      if (err instanceof PortalApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
      } else if (err instanceof PortalApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Network error');
      }
    } finally {
      setSubmitting(false);
    }
  }
```

Note: empty textarea → field omitted from payload → backend treats as `None` → no specs created. Non-empty valid JSON → parsed and included. Non-empty invalid JSON → submit blocked with inline error.

- [ ] **Step 4: Verify type-checking and build**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit (together with Task 4.1 and Task 5.2 — see Task 4.1 Step 4)**

---

### Task 5.2: Wire spec textareas into `CableEditForm`

**Files:**
- Modify: `frontend/components/portal/form/CableEditForm.tsx` (extend `useState` initializer at lines 14–25, add a `handleChange` JSON validator, and extend `handleSave` at lines 46–61)

**Interfaces:**
- Consumes: `CableFormState.common_specs_json` / `variants_json` (from Task 4.1); `PortalCable.common_specs` / `variants` (existing, typed as `unknown[]` at `portal.ts:63-64`); `PortalCableUpdate.common_specs?` / `variants?` (from Task 3.1); `portalApiClient.cables.update` (existing).
- Produces: An edit form that pre-fills both spec textareas from the loaded cable as pretty-printed JSON, validates on change, blocks save on parse error, and includes parsed specs in the PUT payload when non-empty (omitted otherwise to preserve existing specs via `exclude_unset`).

- [ ] **Step 1: Extend the `useState` initializer**

In `frontend/components/portal/form/CableEditForm.tsx`, replace the `useState<CableFormState>` initializer (lines 14–25) with:

```typescript
  const [form, setForm] = useState<CableFormState>({
    model: cable.model ?? '',
    slug: cable.slug ?? '',
    size_system: (cable.size_system as CableFormState['size_system']) ?? 'awg',
    base_description: cable.base_description ?? '',
    meta_title: cable.meta_title ?? '',
    meta_description: cable.meta_description ?? '',
    image_url: cable.image_url ?? '',
    industry_id: cable.industry_id ?? '',
    category_id: cable.category_id ?? '',
    product_type_id: cable.product_type_id ?? '',
    common_specs_json: JSON.stringify(cable.common_specs ?? [], null, 2),
    variants_json: JSON.stringify(cable.variants ?? [], null, 2),
  });
```

- [ ] **Step 2: Extend `handleChange` with JSON validation**

Replace the existing `handleChange` function (lines 30–32) with:

```typescript
  function handleChange(patch: Partial<CableFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    if (patch.common_specs_json !== undefined) {
      validateJsonField('common_specs_json', patch.common_specs_json);
    }
    if (patch.variants_json !== undefined) {
      validateJsonField('variants_json', patch.variants_json);
    }
  }

  function validateJsonField(field: 'common_specs_json' | 'variants_json', text: string) {
    setErrors((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[field];
        return next;
      }
      try {
        JSON.parse(text);
        delete next[field];
      } catch (e) {
        next[field] = `Invalid JSON: ${(e as Error).message}`;
      }
      return next;
    });
  }
```

- [ ] **Step 3: Extend `handleSave` to include parsed specs**

Replace the existing `handleSave` function (lines 46–61) with:

```typescript
  async function handleSave() {
    if (!validate()) return;
    // Re-validate JSON defensively.
    validateJsonField('common_specs_json', form.common_specs_json);
    validateJsonField('variants_json', form.variants_json);

    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.cables.update>[1] = {
      model: form.model,
      slug: form.slug,
      size_system: form.size_system,
      base_description: form.base_description,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      image_url: form.image_url,
      industry_id: form.industry_id,
      category_id: form.category_id,
      product_type_id: form.product_type_id,
    };
    // Only include spec fields if the textarea is non-empty — omitting them
    // preserves existing specs (backend uses exclude_unset=True on PUT).
    if (form.common_specs_json.trim()) {
      try {
        payload.common_specs = JSON.parse(form.common_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, common_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (form.variants_json.trim()) {
      try {
        payload.variants = JSON.parse(form.variants_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, variants_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, payload);
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }
```

Important: empty textarea on edit omits the field → existing specs preserved (this is the desired "don't overwrite if user cleared the textarea" semantic). Typing `[]` explicitly clears.

- [ ] **Step 4: Verify type-checking**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit (together with Task 4.1 and Task 5.1 — see Task 4.1 Step 4)**

---

### Task 5.3: Wire spec textarea into `EquipmentCreateForm`

**Files:**
- Modify: `frontend/components/portal/form/EquipmentCreateForm.tsx` (extend `useState` initializer at lines 22–30, `handleChange` at lines 36–50, and `handleSubmit` at lines 62–89)

**Interfaces:**
- Consumes: `EquipmentFormState.applicable_specs_json` (from Task 4.2); `PortalEquipmentCreate.applicable_specs?` (from Task 3.2); `portalApiClient.equipment.create` (existing).
- Produces: A create form that initializes the spec textarea to `''`, validates on change, blocks submit on parse error, and includes parsed specs in the POST payload when non-empty.

- [ ] **Step 1: Extend the `useState` initializer**

In `frontend/components/portal/form/EquipmentCreateForm.tsx`, replace the `useState<EquipmentFormState>` initializer (lines 22–30) with:

```typescript
  const [form, setForm] = useState<EquipmentFormState>({
    model: '',
    slug: '',
    description: '',
    image_url: '',
    external_url: '',
    sort_order: '0',
    category_id: '',
    applicable_specs_json: '',
  });
```

- [ ] **Step 2: Extend `handleChange` with JSON validation**

Replace the existing `handleChange` function (lines 36–50) with:

```typescript
  function handleChange(patch: Partial<EquipmentFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-derive slug from model unless the user has manually edited the slug.
      if (patch.model !== undefined && !slugTouched) {
        next.slug = deriveSlug(patch.model);
      }
      return next;
    });
    // If the user edited the slug directly, mark it as touched so we stop
    // overwriting their value.
    if (patch.slug !== undefined) {
      setSlugTouched(true);
    }
    if (patch.applicable_specs_json !== undefined) {
      validateJsonField('applicable_specs_json', patch.applicable_specs_json);
    }
  }

  function validateJsonField(field: 'applicable_specs_json', text: string) {
    setErrors((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[field];
        return next;
      }
      try {
        JSON.parse(text);
        delete next[field];
      } catch (e) {
        next[field] = `Invalid JSON: ${(e as Error).message}`;
      }
      return next;
    });
  }
```

- [ ] **Step 3: Extend `handleSubmit` to include parsed specs**

Replace the existing `handleSubmit` function (lines 62–89) with:

```typescript
  async function handleSubmit() {
    if (!validate()) return;
    validateJsonField('applicable_specs_json', form.applicable_specs_json);

    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.equipment.create>[0] = {
      model: form.model,
      slug: form.slug,
      description: form.description,
      image_url: form.image_url,
      external_url: form.external_url,
      sort_order: Number(form.sort_order),
      category_id: form.category_id,
    };
    if (form.applicable_specs_json.trim()) {
      try {
        payload.applicable_specs = JSON.parse(form.applicable_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, applicable_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSubmitting(true);
    setErrorMessage('');
    setErrors({});
    try {
      const created = await portalApiClient.equipment.create(payload);
      router.push(`/portal/equipment/${created.id}`);
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) {
        setErrors(err.fieldErrors);
      } else if (err instanceof PortalApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Network error');
      }
    } finally {
      setSubmitting(false);
    }
  }
```

- [ ] **Step 4: Verify type-checking**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit (together with Task 4.2 and Task 5.4 — see Task 4.2 Step 4)**

---

### Task 5.4: Wire spec textarea into `EquipmentEditForm`

**Files:**
- Modify: `frontend/components/portal/form/EquipmentEditForm.tsx` (extend `useState` initializer at lines 14–22, add `handleChange` JSON validator, and extend `handleSave` at lines 41–64)

**Interfaces:**
- Consumes: `EquipmentFormState.applicable_specs_json` (from Task 4.2); `PortalEquipment.applicable_specs` (existing, typed as `unknown[]` at `portal.ts:105`); `PortalEquipmentUpdate.applicable_specs?` (from Task 3.2); `portalApiClient.equipment.update` (existing).
- Produces: An edit form that pre-fills the spec textarea from loaded equipment as pretty-printed JSON, validates on change, blocks save on parse error, and includes parsed specs in the PUT payload when non-empty.

- [ ] **Step 1: Extend the `useState` initializer**

In `frontend/components/portal/form/EquipmentEditForm.tsx`, replace the `useState<EquipmentFormState>` initializer (lines 14–22) with:

```typescript
  const [form, setForm] = useState<EquipmentFormState>({
    model: equipment.model ?? '',
    slug: equipment.slug ?? '',
    description: equipment.description ?? '',
    image_url: equipment.image_url ?? '',
    external_url: equipment.external_url ?? '',
    sort_order: String(equipment.sort_order ?? 0),
    category_id: equipment.category_id ?? '',
    applicable_specs_json: JSON.stringify(equipment.applicable_specs ?? [], null, 2),
  });
```

- [ ] **Step 2: Extend `handleChange` with JSON validation**

Replace the existing `handleChange` function (lines 27–29) with:

```typescript
  function handleChange(patch: Partial<EquipmentFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    if (patch.applicable_specs_json !== undefined) {
      validateJsonField('applicable_specs_json', patch.applicable_specs_json);
    }
  }

  function validateJsonField(field: 'applicable_specs_json', text: string) {
    setErrors((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[field];
        return next;
      }
      try {
        JSON.parse(text);
        delete next[field];
      } catch (e) {
        next[field] = `Invalid JSON: ${(e as Error).message}`;
      }
      return next;
    });
  }
```

- [ ] **Step 3: Extend `handleSave` to include parsed specs**

Replace the existing `handleSave` function (lines 41–64) with:

```typescript
  async function handleSave() {
    if (!validate()) return;
    validateJsonField('applicable_specs_json', form.applicable_specs_json);

    let hasJsonError = false;
    const payload: Parameters<typeof portalApiClient.equipment.update>[1] = {
      model: form.model,
      slug: form.slug,
      description: form.description,
      image_url: form.image_url,
      external_url: form.external_url,
      sort_order: Number(form.sort_order),
      category_id: form.category_id,
    };
    if (form.applicable_specs_json.trim()) {
      try {
        payload.applicable_specs = JSON.parse(form.applicable_specs_json);
      } catch (e) {
        setErrors((prev) => ({ ...prev, applicable_specs_json: `Invalid JSON: ${(e as Error).message}` }));
        hasJsonError = true;
      }
    }
    if (hasJsonError) return;

    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.equipment.update(equipment.id, payload);
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 4: Verify type-checking and build**

Run from the `frontend/` directory:

```bash
npx tsc --noEmit
npx next build
```

Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit (together with Task 4.2 and Task 5.3 — see Task 4.2 Step 4)**

---

## Section 6: Backend Tests

> **Shared test setup pattern:** Each cable spec test creates a fresh cable via `POST /api/portal/cables` (using `cable_manager_headers` and taxonomy fetched from `GET /api/taxonomy`), then operates on it. The pattern is identical to the existing `test_portal_create_cable_success` test at `backend/tests/api/test_portal_cables.py:46-75`. Each equipment spec test similarly mirrors `test_portal_create_equipment_success` at `test_portal_equipment.py:52-76`.
>
> **Spec payload fixtures** (reusable across tests):
> ```python
> COMMON_SPECS = [
>     {"spec_key": "voltage_rating", "label": "Voltage Rating", "value_string": "600V", "spec_type": "string", "filterable": True, "sort_order": 0},
> ]
> VARIANT_SPECS = [
>     {"slug": "red", "sort_order": 0, "specs": [
>         {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
>     ]},
> ]
> ```

### Task 6.1: `test_portal_create_cable_with_specs`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after the last test, ~line 128)

**Interfaces:**
- Consumes: Task 2.1 (POST route accepts `common_specs` and `variants`).
- Produces: Test verifying POST with specs returns 201 and the response includes the persisted specs.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_create_cable_with_specs(client, cable_manager_headers):
    """POST with common_specs and variants persists specs and returns them in the response."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    unique_slug = f"test-portal-cable-specs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Spec Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "common_specs": [
            {"spec_key": "voltage_rating", "label": "Voltage Rating", "value_string": "600V", "spec_type": "string", "filterable": True, "sort_order": 0},
        ],
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert len(data["common_specs"]) == 1
    assert data["common_specs"][0]["spec_key"] == "voltage_rating"
    assert data["common_specs"][0]["value_string"] == "600V"
    assert len(data["variants"]) == 1
    assert data["variants"][0]["slug"] == "red"
    assert len(data["variants"][0]["specs"]) == 1
    assert data["variants"][0]["specs"][0]["spec_key"] == "color"
```

- [ ] **Step 2: Run the test and verify it passes**

Run from the `backend/` directory:

```bash
pytest tests/api/test_portal_cables.py::test_portal_create_cable_with_specs -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover POST with common_specs and variants"
```

---

### Task 6.2: `test_portal_create_cable_without_specs`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.1's test)

**Interfaces:**
- Consumes: Task 2.1 (POST route — backward-compat: spec fields default to None).
- Produces: Test verifying POST without spec fields still works and returns empty lists.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_create_cable_without_specs(client, cable_manager_headers):
    """POST without spec fields is backward-compatible — returns empty spec lists."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    unique_slug = f"test-portal-cable-nospecs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "No Spec Cable",
        "slug": unique_slug,
        "size_system": "awg",
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert data["common_specs"] == []
    assert data["variants"] == []
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_create_cable_without_specs -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover POST without spec fields (backward-compat)"
```

---

### Task 6.3: `test_portal_update_cable_replace_common_specs`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.2's test)

**Interfaces:**
- Consumes: Task 2.1 (POST to set up the cable) and Task 2.2 (PUT to replace `common_specs`).
- Produces: Test verifying PUT with `common_specs` fully replaces existing common specs.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_update_cable_replace_common_specs(client, cable_manager_headers):
    """PUT with common_specs fully replaces existing common specs."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    # Create a cable with one common spec.
    unique_slug = f"test-portal-cable-replace-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Replace Specs Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "common_specs": [
            {"spec_key": "old_spec", "label": "Old", "value_string": "old", "spec_type": "string", "sort_order": 0},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]

    # PUT with a new common_specs list.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "common_specs": [
            {"spec_key": "new_spec", "label": "New", "value_string": "new", "spec_type": "string", "sort_order": 0},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["common_specs"]) == 1
    assert data["common_specs"][0]["spec_key"] == "new_spec"
    # The old spec is gone (full replacement, not append).
    assert all(s["spec_key"] != "old_spec" for s in data["common_specs"])
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_update_cable_replace_common_specs -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover PUT common_specs full replacement"
```

---

### Task 6.4: `test_portal_update_cable_variants_preserve_id`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.3's test)

**Interfaces:**
- Consumes: Task 2.1 (POST with variants) and Task 2.2 (PUT with slug-matched variant merge).
- Produces: Test verifying that PUT with a slug-matched variant preserves the variant's DB id and only replaces its specs.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_update_cable_variants_preserve_id(client, cable_manager_headers):
    """PUT with variants matching existing slug preserves variant id and replaces specs only."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    # Create a cable with a "red" variant.
    unique_slug = f"test-portal-cable-varid-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Variant ID Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]
    original_variant_id = create_res.json()["variants"][0]["id"]
    assert create_res.json()["variants"][0]["specs"][0]["value_string"] == "Red"

    # PUT with the same slug but different specs.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Crimson", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["variants"]) == 1
    # Variant id preserved.
    assert data["variants"][0]["id"] == original_variant_id
    assert data["variants"][0]["slug"] == "red"
    # Specs replaced.
    assert len(data["variants"][0]["specs"]) == 1
    assert data["variants"][0]["specs"][0]["value_string"] == "Crimson"
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_update_cable_variants_preserve_id -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover PUT variant slug-merge preserving id"
```

---

### Task 6.5: `test_portal_update_cable_variants_ignore_unknown_slug`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.4's test)

**Interfaces:**
- Consumes: Task 2.1 (POST with variants) and Task 2.2 (PUT — unknown slug ignored).
- Produces: Test verifying that PUT with an unknown variant slug leaves existing variants unchanged and ignores the payload variant.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_update_cable_variants_ignore_unknown_slug(client, cable_manager_headers):
    """PUT with variants whose slug doesn't match any existing variant ignores the payload variant."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    unique_slug = f"test-portal-cable-unknown-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "Unknown Slug Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]
    original_variant_id = create_res.json()["variants"][0]["id"]

    # PUT with an unknown slug.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "variants": [
            {"slug": "blue", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Blue", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    # Existing "red" variant unchanged; "blue" not created.
    assert len(data["variants"]) == 1
    assert data["variants"][0]["slug"] == "red"
    assert data["variants"][0]["id"] == original_variant_id
    assert data["variants"][0]["specs"][0]["value_string"] == "Red"
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_update_cable_variants_ignore_unknown_slug -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover PUT variant with unknown slug (ignored)"
```

---

### Task 6.6: `test_portal_update_cable_without_variants_preserves_existing`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.5's test)

**Interfaces:**
- Consumes: Task 2.1 (POST with variants) and Task 2.2 (PUT — `variants` field omitted → preserved via `exclude_unset`).
- Produces: Test verifying that PUT without a `variants` field leaves existing variants unchanged.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_update_cable_without_variants_preserves_existing(client, cable_manager_headers):
    """PUT without a variants field preserves existing variants (exclude_unset)."""
    tax_res = client.get("/api/taxonomy")
    industries = tax_res.json()
    if not industries or not industries[0].get("categories") or not industries[0]["categories"][0].get("product_types"):
        pytest.skip("No taxonomy data seeded")
    industry = industries[0]
    category = industry["categories"][0]
    product_type = category["product_types"][0]

    unique_slug = f"test-portal-cable-novar-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": product_type["id"],
        "industry_id": industry["id"],
        "category_id": category["id"],
        "model": "No Variant PUT Cable",
        "slug": unique_slug,
        "size_system": "awg",
        "variants": [
            {"slug": "red", "sort_order": 0, "specs": [
                {"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0},
            ]},
        ],
    })
    assert create_res.status_code == 201
    cable_id = create_res.json()["id"]
    original_variant_id = create_res.json()["variants"][0]["id"]

    # PUT updating only the model field — no variants key in payload.
    put_res = client.put(f"/api/portal/cables/{cable_id}", headers=cable_manager_headers, json={
        "model": "Renamed Cable",
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert data["model"] == "Renamed Cable"
    # Existing variant preserved.
    assert len(data["variants"]) == 1
    assert data["variants"][0]["id"] == original_variant_id
    assert data["variants"][0]["slug"] == "red"
    assert data["variants"][0]["specs"][0]["value_string"] == "Red"
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_update_cable_without_variants_preserves_existing -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover PUT without variants preserves existing"
```

---

### Task 6.7: `test_portal_update_cable_cross_scope_404`

**Files:**
- Modify: `backend/tests/api/test_portal_cables.py` (append after Task 6.6's test)

**Interfaces:**
- Consumes: Task 2.2 (PUT — `_check_cable_ownership` returns 404 for out-of-scope cables). Existing `_check_cable_ownership` helper already enforces this; the test pins the behavior for the new spec-persistence path.
- Produces: Test verifying that PUT on another manufacturer's cable returns 404.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_update_cable_cross_scope_404(client, cable_manager_headers, equipment_manager_headers):
    """PUT on another manufacturer's cable returns 404 (no information leakage)."""
    # cable_manager_headers is scoped to mfr-1; equipment_manager_headers is scoped to em-1
    # and has a different scope_type, so it can't even hit the cable route (403).
    # Instead, use a non-existent cable id — same code path as a real out-of-scope cable
    # because _check_cable_ownership returns 404 for both None and wrong-manufacturer.
    res = client.put("/api/portal/cables/nonexistent-cable-id", headers=cable_manager_headers, json={
        "common_specs": [
            {"spec_key": "x", "label": "X", "value_string": "y", "spec_type": "string", "sort_order": 0},
        ],
    })
    assert res.status_code == 404
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_cables.py::test_portal_update_cable_cross_scope_404 -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_cables.py
git commit -m "test(portal-cables): cover PUT cross-scope 404"
```

---

### Task 6.8: `test_portal_create_equipment_with_applicable_specs`

**Files:**
- Modify: `backend/tests/api/test_portal_equipment.py` (append after the last test, ~line 125)

**Interfaces:**
- Consumes: Task 1.2 (schema accepts `applicable_specs`) and Task 2.3 (POST route passes it through to JSONB column).
- Produces: Test verifying POST with `applicable_specs` returns 201 and persists the value.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_equipment.py`:

```python
def test_portal_create_equipment_with_applicable_specs(client, equipment_manager_headers):
    """POST with applicable_specs persists the JSONB value and returns it in the response."""
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    unique_slug = f"test-portal-eq-specs-{uuid.uuid4().hex[:8]}"
    res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Spec Equipment",
        "slug": unique_slug,
        "applicable_specs": [
            {"spec_key": "conductor_area", "min": 0.1, "max": 1.0},
        ],
    })
    assert res.status_code == 201, f"Create failed: {res.text}"
    data = res.json()
    assert len(data["applicable_specs"]) == 1
    assert data["applicable_specs"][0]["spec_key"] == "conductor_area"
    assert data["applicable_specs"][0]["min"] == 0.1
    assert data["applicable_specs"][0]["max"] == 1.0
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_equipment.py::test_portal_create_equipment_with_applicable_specs -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_equipment.py
git commit -m "test(portal-equipment): cover POST with applicable_specs"
```

---

### Task 6.9: `test_portal_update_equipment_applicable_specs`

**Files:**
- Modify: `backend/tests/api/test_portal_equipment.py` (append after Task 6.8's test)

**Interfaces:**
- Consumes: Task 2.3 (PUT route — `applicable_specs` flows through `setattr` via `exclude_unset`).
- Produces: Test verifying PUT with `applicable_specs` persists the new value.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_equipment.py`:

```python
def test_portal_update_equipment_applicable_specs(client, equipment_manager_headers):
    """PUT with applicable_specs persists the new JSONB value."""
    cat_res = client.get("/api/equipment-categories")
    categories = cat_res.json()
    if not categories:
        pytest.skip("No equipment categories seeded")
    category = categories[0]
    if category.get("children"):
        category = category["children"][0]

    # Create with initial specs.
    unique_slug = f"test-portal-eq-update-{uuid.uuid4().hex[:8]}"
    create_res = client.post("/api/portal/equipment", headers=equipment_manager_headers, json={
        "category_id": category["id"],
        "model": "Update Spec Equipment",
        "slug": unique_slug,
        "applicable_specs": [
            {"spec_key": "old_key", "min": 0.0, "max": 1.0},
        ],
    })
    assert create_res.status_code == 201
    equipment_id = create_res.json()["id"]

    # PUT with new specs.
    put_res = client.put(f"/api/portal/equipment/{equipment_id}", headers=equipment_manager_headers, json={
        "applicable_specs": [
            {"spec_key": "new_key", "min": 1.0, "max": 10.0},
        ],
    })
    assert put_res.status_code == 200, f"PUT failed: {put_res.text}"
    data = put_res.json()
    assert len(data["applicable_specs"]) == 1
    assert data["applicable_specs"][0]["spec_key"] == "new_key"
    assert data["applicable_specs"][0]["max"] == 10.0
```

- [ ] **Step 2: Run the test and verify it passes**

```bash
pytest tests/api/test_portal_equipment.py::test_portal_update_equipment_applicable_specs -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_equipment.py
git commit -m "test(portal-equipment): cover PUT with applicable_specs"
```

---

### Task 6.10: `test_portal_equipment_cross_scope_404`

**Files:**
- Modify: `backend/tests/api/test_portal_equipment.py` (append after Task 6.9's test)

**Interfaces:**
- Consumes: Task 2.3 (PUT route — `_check_equipment_ownership` returns 404 for out-of-scope equipment).
- Produces: Test verifying that PUT on another manufacturer's equipment returns 404.

- [ ] **Step 1: Write the test**

Append to `backend/tests/api/test_portal_equipment.py`:

```python
def test_portal_equipment_cross_scope_404(client, equipment_manager_headers):
    """PUT on another manufacturer's equipment returns 404 (no information leakage)."""
    # Non-existent id exercises the same _check_equipment_ownership code path
    # as a real out-of-scope equipment id (both return 404).
    res = client.put("/api/portal/equipment/nonexistent-equipment-id", headers=equipment_manager_headers, json={
        "applicable_specs": [{"spec_key": "x", "min": 0, "max": 1}],
    })
    assert res.status_code == 404
```

- [ ] **Step 2: Run the full portal equipment test suite**

```bash
pytest tests/api/test_portal_equipment.py -v
```

Expected: all tests pass, including the new one.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_equipment.py
git commit -m "test(portal-equipment): cover PUT cross-scope 404"
```

---

## Section 7: Manual Verification

> These tasks have no code deliverable — they are smoke tests against a running local stack. Each task ends with a checkbox to mark once verified. Run the full local stack before starting: frontend (`npm run dev` in `frontend/`), backend (`uvicorn app.main:app --reload` in `backend/`), db (PostgreSQL), nginx (if used locally). All four manual verification tasks should be performed by a human; do not automate.

### Task 7.1: Verify portal cable create form

- [ ] **Step 1: Log in as a cable manufacturer user**

Open the portal login page, sign in as `cable_manager@test.com` / `test123456` (or whichever manufacturer account is seeded in your local DB). Navigate to `/portal/cables` and click "New Cable".

- [ ] **Step 2: Confirm two JSON textareas appear**

Verify the create form renders two textareas labeled "Common Specs (JSON)" and "Variants (JSON)" below the existing fields. Each should have a hint paragraph above it showing the expected JSON shape.

- [ ] **Step 3: Confirm red-border-on-invalid-JSON behavior**

Type invalid JSON (e.g., `{not valid`) into the "Common Specs (JSON)" textarea. Verify the textarea border turns red and an "Invalid JSON: ..." error message appears below it. Type valid JSON (e.g., `[]`) and verify the border returns to gray/blue and the error clears.

- [ ] **Step 4: Confirm successful create with valid JSON**

Fill in required fields (Model, Slug, Industry, Category, Product Type, Size System). Enter valid JSON in both spec textareas, e.g.:

```json
[
  {"spec_key": "voltage_rating", "label": "Voltage Rating", "value_string": "600V", "spec_type": "string", "filterable": true, "sort_order": 0}
]
```

for Common Specs, and:

```json
[
  {"slug": "red", "sort_order": 0, "specs": [{"spec_key": "color", "label": "Color", "value_string": "Red", "spec_type": "string", "sort_order": 0}]}
]
```

for Variants. Click "Create". Verify the form navigates to the new cable's detail page. Fetch the cable via `GET /api/portal/cables/{id}` (or reload the detail page) and confirm the specs are persisted.

### Task 7.2: Verify portal cable edit form

- [ ] **Step 1: Open an existing cable for editing**

From `/portal/cables`, click an existing cable to open its detail page, then click "Edit".

- [ ] **Step 2: Confirm spec textareas are pre-filled**

Verify the "Common Specs (JSON)" and "Variants (JSON)" textareas contain pretty-printed JSON of the cable's existing specs. If the cable has no specs, the textareas should contain `[]`.

- [ ] **Step 3: Modify specs and save**

Edit a spec value in the JSON (e.g., change "Red" to "Crimson" in a variant). Click "Save". Verify the "Saved" message appears.

- [ ] **Step 4: Confirm persistence on refresh**

Reload the page (or navigate away and back). Verify the edited JSON is reflected in the textarea and in the cable detail view. Confirm the variant's id is unchanged (if you can inspect via the API response — variant ids should match before and after the edit).

### Task 7.3: Verify portal equipment create form

- [ ] **Step 1: Log in as an equipment manufacturer user**

Sign in as `equip_manager@test.com` / `test123456`. Navigate to `/portal/equipment` and click "New Equipment".

- [ ] **Step 2: Confirm the JSON textarea appears**

Verify the create form renders a textarea labeled "Applicable Specs (JSON)" below the existing fields, with a hint showing the expected shape (e.g., `[{"spec_key":"conductor_area","min":0.1,"max":1.0}]`).

- [ ] **Step 3: Confirm red-border-on-invalid-JSON behavior**

Type invalid JSON into the textarea. Verify the border turns red and an error message appears. Type valid JSON and verify the error clears.

- [ ] **Step 4: Confirm successful create with valid JSON**

Fill in required fields (Model, Slug, Category). Enter:

```json
[{"spec_key": "conductor_area", "min": 0.1, "max": 1.0}]
```

in the Applicable Specs textarea. Click "Create". Verify navigation to the new equipment's detail page and that the spec is persisted (visible in the detail view or via `GET /api/portal/equipment/{id}`).

### Task 7.4: Verify portal equipment edit form

- [ ] **Step 1: Open an existing equipment for editing**

From `/portal/equipment`, click an existing equipment to open its detail page, then click "Edit".

- [ ] **Step 2: Confirm the JSON textarea is pre-filled**

Verify the "Applicable Specs (JSON)" textarea contains pretty-printed JSON of the equipment's existing `applicable_specs`. If empty, it should contain `[]`.

- [ ] **Step 3: Modify specs and save**

Edit the JSON (e.g., change `max` from `1.0` to `10.0`). Click "Save". Verify the "Saved" message appears.

- [ ] **Step 4: Confirm persistence on refresh**

Reload the page. Verify the edited JSON is reflected in the textarea and in the equipment detail view.

---

## Self-Review

### Spec coverage check

Mapped each design-doc section / decision to a task:

- **D1** (Reuse admin's raw-JSON textarea pattern verbatim) → Tasks 4.1, 4.2 (textareas mirror admin `CableForm.tsx:346-384` and `EquipmentForm.tsx:198-217` patterns, adapted to portal's controlled `value`/`onChange` props).
- **D2** (Cable form gets two JSON textareas; equipment gets one) → Task 4.1 (two: `common_specs_json` + `variants_json`), Task 4.2 (one: `applicable_specs_json`).
- **D3** (JSON-syntax-only validation, no structural schema validation) → Tasks 5.1–5.4 (`validateJsonField` runs `JSON.parse` only; structural validation delegated to backend pydantic → 422).
- **D4 corrected** (Portal cable POST and PUT routes replicate admin's spec-persistence logic) → Task 2.1 (POST), Task 2.2 (PUT).
- **D5** (Optional fields default to None / empty list) → Tasks 1.1, 1.2 (schema fields default to `None`); Tasks 5.1, 5.3 (create forms initialize to `''`).
- **Variant ID preservation on PUT** (slug-matched merge) → Task 2.2 (slug-map logic); Tests 6.4 (preserve id), 6.5 (ignore unknown slug), 6.6 (keep existing when omitted).
- **Backend Schemas** section → Tasks 1.1, 1.2.
- **Backend Routes** section → Tasks 2.1, 2.2, 2.3.
- **Frontend Types** section → Tasks 3.1, 3.2.
- **Frontend Form Components** section → Tasks 4.1, 4.2.
- **Frontend Form Wrappers** section → Tasks 5.1, 5.2, 5.3, 5.4.
- **Backend Tests** section → Tasks 6.1–6.10 (10 tests).
- **Edge Cases** (empty array, empty textarea, null, JSON object instead of array, large payload, slug collision) → covered by tests 6.1, 6.2, 6.3 (replace), 6.4, 6.5, 6.6; documented in Global Constraints.
- **Risks** table → mitigations baked into the plan (red-border-on-error, slug-merge, pre-fill JSON, loose frontend types).

All 21 tasks.md items (1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 6.1–6.10, 7.1–7.4) are present. No gaps.

### Placeholder scan

- No "TBD", "TODO", "implement later", "fill in details" anywhere.
- No "Add appropriate error handling" — error handling is shown explicitly in each `validateJsonField` and `handleSubmit`.
- No "Write tests for the above" without test code — each test task contains the full pytest function.
- No "Similar to Task N" without repeating the code — Task 5.2/5.4 reference Task 5.1/5.3 in the header note but include the full code.
- All code steps contain actual code blocks with the exact content an engineer needs.

### Type consistency

- `CableFormState.common_specs_json: string` and `variants_json: string` — defined in Task 4.1, consumed identically in Tasks 5.1 and 5.2. ✓
- `EquipmentFormState.applicable_specs_json: string` — defined in Task 4.2, consumed identically in Tasks 5.3 and 5.4. ✓
- `PortalCableCreate.common_specs?: Record<string, unknown>[]` and `variants?: { slug: string; sort_order?: number; specs: Record<string, unknown>[] }[]` — defined in Task 3.1, used in Tasks 5.1 and 5.2 payload construction. ✓
- `PortalEquipmentCreate.applicable_specs?: Record<string, unknown>[]` — defined in Task 3.2, used in Task 5.3. ✓
- `PortalEquipmentUpdate.applicable_specs?: Record<string, unknown>[]` — defined in Task 3.2, used in Task 5.4. ✓
- `validateJsonField(field, text)` — same name and signature across Tasks 5.1–5.4 (only the `field` union type literal differs per wrapper, which is intentional since each wrapper has different form-state keys). ✓
- Backend: `SpecItemCreate`, `CableVariantCreate`, `SpecItem`, `CableVariant` — all referenced consistently with their definitions in `backend/app/schemas/cable.py` and `backend/app/models/cable.py`. ✓
- Backend: `body.common_specs is not None` and `body.variants is not None` checks in Task 2.2 match the `None` defaults on `CableUpdate.common_specs` / `variants` at `cable.py:158-159`. ✓
- Test payload field names (`spec_key`, `label`, `value_string`, `spec_type`, `filterable`, `sort_order`, `slug`) match `SpecItemCreate` and `CableVariantCreate` field names. ✓
