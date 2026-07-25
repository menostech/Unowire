---
comet_change: portal-cable-equipment-crud
role: technical-design
canonical_spec: openspec
status: final
archived_with: 2026-07-25
archived_status: archived
---

# Portal Cable & Equipment CRUD — Technical Design Doc

Deep technical refinement of the open-phase `design.md` for `portal-cable-equipment-crud`. This doc specifies implementation approach, edge cases, and verification strategy without rewriting the OpenSpec proposal/spec scope.

## Context Recap

The manufacturer portal currently only supports viewing and updating cables/equipment — users cannot create or delete records, and the edit forms are skeletal (only `model` + `base_description` for cables, `model` + `description` for equipment). The list pages show only Name/Manufacturer/Created (cables) and Name/Created (equipment).

Change 1 (`portal-foundation-refactor`, archived) established the typed `portalApi` server-side client, the `portalApiClient` client-side write layer, shared TypeScript types in `frontend/lib/types/portal.ts`, and BFF route conventions. This change builds on that foundation.

Codebase exploration confirmed:

- `backend/app/api/routes/portal_cables.py`: GET list, GET detail, PUT update exist; no POST/DELETE. `_check_cable_ownership` returns 404 (not 403) to prevent information leakage.
- `backend/app/api/routes/portal_equipment.py`: same three-endpoint shape; `_check_equipment_ownership` is a one-liner returning 404.
- `backend/app/api/routes/cables.py` (admin): POST inlines variant/spec creation (doesn't use `crud_cable.create`); DELETE uses `crud_cable.remove`. `id` is client-supplied.
- `backend/app/schemas/cable.py`: `CableCreate` requires `id`, `manufacturer_id`, taxonomy, `model`, `slug`, `size_system`. `CableUpdate` makes all fields Optional. `CableRead` includes all fields + relations.
- `backend/app/schemas/equipment.py`: `RecommendedEquipmentCreate` requires `id`, `manufacturer_id`, `category_id`, `model`, `slug`. `RecommendedEquipmentUpdate` all Optional.
- `backend/app/models/cable.py`: `Cable.id` is `String(100)` PK (no auto-increment). Unique constraint `(manufacturer_id, slug)`. Check constraint `size_system IN ('awg','mm2','kcmil','none')`. `CableVariant.cable_id` and `SpecItem.cable_id` FKs have `ondelete="CASCADE"`.
- `backend/app/api/deps.py`: `_FACTORY_ALLOWED_BY_SCOPE` maps `manufacturer → {cables, ...}` and `equipment_manufacturer → {equipment, ...}`. `require_factory_module(module)` is the portal permission gate.
- `backend/app/api/routes/taxonomy.py`: `GET /api/taxonomy` is **public** (no auth). Returns `list[IndustryRead]` tree.
- `backend/app/api/routes/equipment_categories.py`: `GET /api/equipment-categories` is **public**. Returns two-level tree.
- `frontend/lib/portalApiClient.ts`: exists with `cables.update`, `equipment.update`, `inquiries.reply`, `auth.changePassword`. No create/remove methods yet. Exports `PortalApiError` with `fieldErrors`.
- `frontend/lib/types/portal.ts`: `PortalCable` and `PortalEquipment` exist (match `CableRead` / `RecommendedEquipmentRead`). `PortalCableUpdate = { model?, base_description? }` — too narrow, needs widening. `PortalEquipmentUpdate = { model?, description? }` — same.
- `frontend/app/api/portal/cables/[id]/route.ts`: PUT only, forwards `portal_token` cookie as `Authorization: Bearer`. No collection route, no DELETE handler.
- `frontend/components/portal/form/CableEditForm.tsx`: client component, only `model` + `base_description` fields, calls `portalApiClient.cables.update`.
- `frontend/app/portal/cables/page.tsx`: server component, fetches via `portalApi.cables.all()`, table has 3 columns, uses `any[]` typing.
- `backend/tests/api/test_portal_cables.py`: 5 tests using `client` + `cable_manager_headers` fixtures. Pattern: `client.get("/api/portal/cables", headers=cable_manager_headers)`.

## Goals

- Add `POST /api/portal/cables` and `POST /api/portal/equipment` with portal-specific create schemas (omit `id`, `manufacturer_id`, `common_specs`, `variants`, `applicable_specs`)
- Add `DELETE /api/portal/cables/{id}` and `DELETE /api/portal/equipment/{id}` reusing existing ownership checks
- Auto-generate record `id` server-side using `{manufacturer_slug}-{record_slug}` with collision fallback
- Add BFF routes for POST and DELETE (cables + equipment)
- Add `portalApiClient.cables.create/remove` and `equipment.create/remove`
- Widen `PortalCableUpdate` / `PortalEquipmentUpdate` types to cover all editable fields
- Add `CableCreateForm` / `EquipmentCreateForm` pages and components
- Expand `CableEditForm` / `EquipmentEditForm` with slug, size_system, meta fields, image_url, taxonomy
- Expand cable list with Category, Product Type, Size System columns + "New Cable" button
- Expand equipment list with Category column + "New Equipment" button
- Add delete buttons with confirmation dialog on detail pages

## Non-Goals

- `common_specs` and `variants` editing in portal (backend excludes these)
- `applicable_specs` editing on equipment in portal (complex rule editor; deferred)
- `category_ids` (JSONB list) editing in portal (defaults to `[]`)
- Media management / image upload UI — change 3 (`portal-media-management`). Image URL fields accept URL string only.
- Admin portal changes
- Database schema changes
- Bulk operations (bulk create / bulk delete)
- List page pagination, search, or filtering (not in spec)
- Per-row delete on list pages (spec mandates detail-page delete only)
- Automated frontend tests (per project constraint)

## Architecture

### Backend Layer

```
backend/app/schemas/cable.py        + PortalCableCreate
backend/app/schemas/equipment.py    + PortalEquipmentCreate
backend/app/api/routes/portal_cables.py    + POST, + DELETE, + _generate_cable_id helper
backend/app/api/routes/portal_equipment.py + POST, + DELETE, + _generate_equipment_id helper
```

No backend changes to PUT routes (already accept full `CableUpdate` / `RecommendedEquipmentUpdate`).

### Frontend Layer

```
frontend/lib/types/portal.ts                          + PortalCableCreate, PortalEquipmentCreate; widen PortalCableUpdate, PortalEquipmentUpdate
frontend/lib/portalApiClient.ts                       + cables.create/remove, + equipment.create/remove
frontend/app/api/portal/cables/route.ts               NEW (POST)
frontend/app/api/portal/cables/[id]/route.ts          + DELETE handler
frontend/app/api/portal/equipment/route.ts            NEW (POST)
frontend/app/api/portal/equipment/[id]/route.ts       + DELETE handler

frontend/components/portal/form/CableFormFields.tsx       NEW (shared controlled fields)
frontend/components/portal/form/CableCreateForm.tsx       NEW
frontend/components/portal/form/CableEditForm.tsx         EXPAND (wrap CableFormFields + PUT)
frontend/components/portal/form/EquipmentFormFields.tsx   NEW (shared)
frontend/components/portal/form/EquipmentCreateForm.tsx   NEW
frontend/components/portal/form/EquipmentEditForm.tsx     EXPAND (wrap + PUT)
frontend/components/portal/form/DeleteConfirmDialog.tsx   NEW (shared modal)
frontend/components/portal/form/CableDeleteButton.tsx     NEW (client component)
frontend/components/portal/form/EquipmentDeleteButton.tsx NEW

frontend/app/portal/cables/page.tsx                  EXPAND (columns + New button)
frontend/app/portal/cables/new/page.tsx              NEW (server component, fetches taxonomy)
frontend/app/portal/cables/[id]/page.tsx             EXPAND (render CableDeleteButton, pass taxonomy)
frontend/app/portal/equipment/page.tsx               EXPAND
frontend/app/portal/equipment/new/page.tsx           NEW
frontend/app/portal/equipment/[id]/page.tsx          EXPAND
```

### Data Flow

```
Create flow:
  User → /portal/cables/new (server comp)
       → server fetches GET /api/taxonomy via INTERNAL_API_BASE
       → renders <CableCreateForm taxonomy={tree} />
  User fills form → portalApiClient.cables.create(data)
       → POST /api/portal/cables (BFF)
       → forwards portal_token cookie
       → backend POST: force manufacturer_id=scope_id, generate id, insert
       → 201 CableRead
  On success → router.push('/portal/cables/{new_id}')

Delete flow:
  User → /portal/cables/{id} (server comp)
       → renders <CableEditForm cable taxonomy /> + <CableDeleteButton cableId name />
  User clicks Delete → DeleteConfirmDialog opens
  User confirms → portalApiClient.cables.remove(id)
       → DELETE /api/portal/cables/{id} (BFF)
       → backend DELETE: _check_cable_ownership, crud_cable.remove
       → 200 CableRead
  On success → router.push('/portal/cables')
```

## Detailed Design

### 1. Backend Schemas

#### `PortalCableCreate` (`backend/app/schemas/cable.py`)

```python
class PortalCableCreate(BaseModel):
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
    model_config = {"from_attributes": True}
```

Excludes: `id` (server-generated), `manufacturer_id` (server-forced), `common_specs` and `variants` (portal exclusion).

#### `PortalEquipmentCreate` (`backend/app/schemas/equipment.py`)

```python
class PortalEquipmentCreate(BaseModel):
    category_id: str
    model: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    external_url: str | None = None
    sort_order: int | None = None
    model_config = {"from_attributes": True}
```

Excludes: `id`, `manufacturer_id`, `applicable_specs`.

### 2. ID Generation Algorithm

```python
from uuid import uuid4

async def _generate_cable_id(db: AsyncSession, manufacturer_slug: str, cable_slug: str) -> str:
    base = f"{manufacturer_slug}-{cable_slug}".lower()[:92]  # leave 8 chars for suffix
    existing = await db.execute(select(Cable.id).where(Cable.id == base))
    if not existing.scalar_one_or_none():
        return base
    suffix = uuid4().hex[:8]
    return f"{base}-{suffix}"
```

- `manufacturer_slug` loaded via `crud_manufacturer.get(db, user.scope_id).slug`
- Truncation to 92 chars leaves room for `-` + 8-char suffix within `String(100)` PK
- Pre-check via SELECT before insert
- Concurrent race fallback: `try/except IntegrityError` → 409 Conflict

Equipment uses the same algorithm against `RecommendedEquipment.id`.

### 3. Backend POST Route (Cable)

```python
@router.post("", response_model=CableRead, status_code=201)
async def portal_create_cable(
    obj_in: PortalCableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    manufacturer = await crud_manufacturer.get(db, id=user.scope_id)
    if not manufacturer:
        raise HTTPException(404, detail={"code": 404, "message": "Manufacturer not found"})

    cable_id = await _generate_cable_id(db, manufacturer.slug, obj_in.slug)
    cable_data = obj_in.model_dump()
    cable_data["id"] = cable_id
    cable_data["manufacturer_id"] = user.scope_id  # server-forced, ignore client input

    cable = CableModel(**cable_data)
    db.add(cable)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": 409, "message": "A cable with this slug already exists"})
    await db.refresh(cable)
    return cable
```

Key points:
- `manufacturer_id` is forced to `user.scope_id` regardless of client input (PortalCableCreate schema doesn't even include the field, but the force is defensive)
- `IntegrityError` catches both unique constraint violations on `(manufacturer_id, slug)` and any race on `id` collision
- Does not create `common_specs` or `variants` (portal create is intentionally minimal; users can edit those via admin if needed)

Equipment POST follows the same pattern with `crud_equipment.create(db, obj_in=obj_in_with_id_and_manufacturer)`.

### 4. Backend DELETE Route (Cable)

```python
@router.delete("/{cable_id}", response_model=CableRead)
async def portal_delete_cable(
    cable_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_factory_module("cables")),
):
    cable = await crud_cable.get_detail(db, id=cable_id)
    _check_cable_ownership(user, cable)  # raises 404 if None or out-of-scope
    deleted = await crud_cable.remove(db, id=cable_id)
    await db.commit()
    return deleted
```

- Reuses existing `_check_cable_ownership` (returns 404 for both not-found and out-of-scope — no information leak)
- Cascade handled by DB: `CableVariant.cable_id` and `SpecItem.cable_id` FKs have `ondelete="CASCADE"`
- Equipment DELETE mirrors this with `_check_equipment_ownership` and `crud_equipment.remove`

### 5. Frontend Type Widening

```typescript
// frontend/lib/types/portal.ts

export interface PortalCableCreate {
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: "awg" | "mm2" | "kcmil" | "none";
  base_description?: string;
  meta_title?: string;
  meta_description?: string;
  image_url?: string;
  category_ids?: string[];
}

// Widen existing PortalCableUpdate (currently only { model?, base_description? })
export interface PortalCableUpdate {
  model?: string;
  slug?: string;
  size_system?: "awg" | "mm2" | "kcmil" | "none";
  base_description?: string;
  meta_title?: string;
  meta_description?: string;
  image_url?: string;
  industry_id?: string;
  category_id?: string;
  product_type_id?: string;
}

export interface PortalEquipmentCreate {
  category_id: string;
  model: string;
  slug: string;
  description?: string;
  image_url?: string;
  external_url?: string;
  sort_order?: number;
}

// Widen existing PortalEquipmentUpdate
export interface PortalEquipmentUpdate {
  model?: string;
  slug?: string;
  description?: string;
  image_url?: string;
  external_url?: string;
  sort_order?: number;
  category_id?: string;
}
```

### 6. BFF Routes

#### New `frontend/app/api/portal/cables/route.ts` (POST)

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("portal_token")?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: "Unauthorized" }, { status: 401 });
  }
  const backend = process.env.INTERNAL_API_BASE || "http://backend:8000";
  const res = await fetch(`${backend}/api/portal/cables`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: await req.text(),
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

#### Add DELETE to existing `frontend/app/api/portal/cables/[id]/route.ts`

Keep existing PUT handler. Add:

```typescript
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get("portal_token")?.value;
  if (!token) {
    return NextResponse.json({ code: 401, message: "Unauthorized" }, { status: 401 });
  }
  const backend = process.env.INTERNAL_API_BASE || "http://backend:8000";
  const res = await fetch(`${backend}/api/portal/cables/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

Equipment BFF routes mirror this pattern.

### 7. portalApiClient Extension

```typescript
export const portalApiClient = {
  cables: {
    async create(data: PortalCableCreate): Promise<PortalCable> {
      return bffFetch("/api/portal/cables", { method: "POST", body: JSON.stringify(data) });
    },
    async update(id: string, data: PortalCableUpdate): Promise<PortalCable> { /* existing */ },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/cables/${id}`, { method: "DELETE" });
    },
  },
  equipment: {
    async create(data: PortalEquipmentCreate): Promise<PortalEquipment> {
      return bffFetch("/api/portal/equipment", { method: "POST", body: JSON.stringify(data) });
    },
    async update(id: string, data: PortalEquipmentUpdate): Promise<PortalEquipment> { /* existing */ },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/equipment/${id}`, { method: "DELETE" });
    },
  },
  // ...existing inquiries, auth
};
```

`bffFetch` already parses `{code, message, field_errors}` from error responses and throws `PortalApiError`.

### 8. Form Component Architecture

#### Shared `CableFormFields` Component

```typescript
interface CableFormFieldsProps {
  value: CableFormState;
  onChange: (patch: Partial<CableFormState>) => void;
  errors: Record<string, string>;
  taxonomy: TaxonomyTree;  // Industry[] with nested categories and product_types
  mode: "create" | "edit";
}
```

Renders all cable fields:
- `model` (input, required)
- `slug` (input, required, auto-derived in create mode)
- `size_system` (`<select>` with 4 options)
- `base_description` (textarea)
- `meta_title` (input)
- `meta_description` (textarea)
- `image_url` (input, URL)
- `industry_id` (select, cascading parent)
- `category_id` (select, filtered by industry)
- `product_type_id` (select, filtered by category)

#### `CableCreateForm` Component

- Initializes empty form state
- Auto-derives slug from `model` until user touches slug field
- Validates all required fields on submit
- Calls `portalApiClient.cables.create(data)`
- On 201 → `router.push('/portal/cables/${new_id}')`
- On 409 → displays "Slug already in use" error on slug field
- On 422 → displays field errors from `PortalApiError.fieldErrors`

#### `CableEditForm` Component (Expanded)

- Pre-fills form state from `cable` prop
- Does not auto-derive slug (preserves existing)
- Calls `portalApiClient.cables.update(id, data)` with all modified fields
- Same error handling

#### Slug Auto-Derivation Logic

```typescript
function deriveSlug(model: string): string {
  return model.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// In CableCreateForm:
const [slugTouched, setSlugTouched] = useState(false);
const handleChange = (patch: Partial<CableFormState>) => {
  if (patch.model !== undefined && !slugTouched) {
    patch.slug = deriveSlug(patch.model);
  }
  if (patch.slug !== undefined) {
    setSlugTouched(true);
  }
  setFormState(prev => ({ ...prev, ...patch }));
};
```

### 9. Delete Components

#### `DeleteConfirmDialog` (Shared Modal)

```typescript
interface DeleteConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}
```

Uses Base UI Dialog (already a dependency via `@base-ui/react`). Cancel and confirm buttons. Confirm button shows loading state during async `onConfirm`.

#### `CableDeleteButton` / `EquipmentDeleteButton`

```typescript
"use client";
export function CableDeleteButton({ cableId, cableName }: { cableId: string; cableName: string }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await portalApiClient.cables.remove(cableId);
      router.push("/portal/cables");
    } catch (e) {
      // display error in dialog
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="...">Delete</button>
      <DeleteConfirmDialog
        open={open}
        title="Delete Cable"
        message={`Are you sure you want to delete "${cableName}"? This action cannot be undone.`}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
```

Rendered on detail page below `<CableEditForm>`.

### 10. List Page Expansion

#### Cable List (`frontend/app/portal/cables/page.tsx`)

Add columns: Category, Product Type, Size System (resolved from taxonomy tree passed to the page or fetched alongside cables).

Add "New Cable" button at top: `<Link href="/portal/cables/new">New Cable</Link>`.

#### Equipment List (`frontend/app/portal/equipment/page.tsx`)

Add Category column (from `equipment.category?.label`).

Add "New Equipment" button.

### 11. Create Pages

#### `frontend/app/portal/cables/new/page.tsx` (Server Component)

```typescript
export default async function NewCablePage() {
  const backend = process.env.INTERNAL_API_BASE || "http://backend:8000";
  const res = await fetch(`${backend}/api/taxonomy`, { cache: "no-store" });
  const taxonomy = await res.json();
  return <CableCreateForm taxonomy={taxonomy} />;
}
```

Public endpoint, no auth needed. Equipment create page fetches `${backend}/api/equipment-categories` instead.

### 12. Detail Page Expansion

#### `frontend/app/portal/cables/[id]/page.tsx`

```typescript
export default async function CableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cable = await portalApi.cables.getById(id);  // existing
  if (!cable) notFound();

  const backend = process.env.INTERNAL_API_BASE || "http://backend:8000";
  const taxonomyRes = await fetch(`${backend}/api/taxonomy`, { cache: "no-store" });
  const taxonomy = await taxonomyRes.json();

  return (
    <>
      <h1>{cable.model || cable.slug || "Cable"}</h1>
      <CableEditForm cable={cable} taxonomy={taxonomy} />
      <CableDeleteButton cableId={cable.id} cableName={cable.model} />
    </>
  );
}
```

## Testing Strategy

### Backend Tests (pytest)

Add to `backend/tests/api/test_portal_cables.py`:

```python
def test_portal_create_cable_success(client, cable_manager_headers):
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={
        "product_type_id": "pt-1", "industry_id": "ind-1", "category_id": "cat-1",
        "model": "Test Cable", "slug": "test-cable", "size_system": "awg"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["manufacturer_id"] == "mfr-1"  # forced to scope_id
    assert data["id"]  # auto-generated

def test_portal_create_cable_cross_scope_403(client, equipment_manager_headers):
    res = client.post("/api/portal/cables", headers=equipment_manager_headers, json={...})
    assert res.status_code == 403

def test_portal_create_cable_missing_fields_422(client, cable_manager_headers):
    res = client.post("/api/portal/cables", headers=cable_manager_headers, json={"model": "X"})
    assert res.status_code == 422

def test_portal_create_cable_duplicate_slug_409(client, cable_manager_headers):
    # create once, then create again with same slug
    ...

def test_portal_delete_cable_success(client, cable_manager_headers):
    # create then delete
    ...

def test_portal_delete_cable_out_of_scope_404(client, cable_manager_headers):
    res = client.delete("/api/portal/cables/nonexistent", headers=cable_manager_headers)
    assert res.status_code == 404
```

Same suite for `test_portal_equipment.py`.

### Frontend (Manual Smoke Tests)

Per tasks 14.4-14.7:
- Cable manufacturer: create → list with new columns → edit new fields → delete with confirm → verify gone
- Equipment manufacturer: same flow
- Scope enforcement: direct API DELETE out-of-scope → 404
- Cross-module: cable manufacturer POST equipment → 403

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ID generation race condition (two simultaneous creates with same slug) | Pre-check SELECT + IntegrityError catch → 409 Conflict response |
| Cross-scope data leakage on delete | `_check_*_ownership` returns 404 (not 403) for both not-found and out-of-scope |
| Slug uniqueness violation on edit (PUT) | Backend `CableUpdate` already accepts slug; `(manufacturer_id, slug)` unique constraint enforced by DB; frontend should warn if user changes slug to one that conflicts |
| Form complexity (9+ fields for cable) | Shared `CableFormFields` sub-component — single source of truth for field rendering |
| Dependency on change 1 artifacts | Verified `portalApiClient`, `frontend/lib/types/portal.ts`, and BFF conventions all exist |
| Taxonomy endpoint auth requirements | Verified `GET /api/taxonomy` and `GET /api/equipment-categories` are public — no BFF proxy needed |
| Delete cascade failure | DB FK `ondelete="CASCADE"` on `CableVariant.cable_id` and `SpecItem.cable_id` handles cascade; admin delete already relies on this behavior |
| `manufacturer.slug` missing | POST route loads manufacturer first; returns 404 if manufacturer record doesn't exist for `scope_id` |

## Spec Patches

None. Open phase delta specs (`portal-cable-crud`, `portal-equipment-crud`) already cover all scenarios:
- Portal create with required fields
- Create enforces scope-based manufacturer_id
- Create requires all mandatory fields (422)
- Non-manufacturer cannot create (403)
- Portal delete own record
- Delete out-of-scope returns 404
- Delete non-existent returns 404
- Delete requires confirmation dialog
- Edit form exposes all editable fields
- List page shows expanded columns

Design aligns with spec; no scope changes or scenario additions needed.

## Verification Checklist

- [ ] `tsc --noEmit` passes with 0 type errors
- [ ] Backend tests: `pytest backend/tests/api/test_portal_cables.py` all pass
- [ ] Backend tests: `pytest backend/tests/api/test_portal_equipment.py` all pass
- [ ] `next build` succeeds
- [ ] Smoke: cable manufacturer can create → list → edit → delete
- [ ] Smoke: equipment manufacturer can create → list → edit → delete
- [ ] Smoke: DELETE out-of-scope returns 404
- [ ] Smoke: POST cross-module returns 403
