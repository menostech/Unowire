# Admin Taxonomy Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin UI and auth guards for managing the three-level cable taxonomy (Industry / Category / Product Type), following the existing Manufacturer admin pattern.

**Architecture:** Backend changes are limited to (a) adding `Depends(get_current_admin)` to existing taxonomy write endpoints, and (b) converting `seed_taxonomy` from destructive truncate+insert to idempotent upsert. Frontend mirrors the Manufacturer admin: three independent route groups under `/admin/taxonomy/`, each with list/new/edit pages, a client form component, and Next.js API route proxies that forward the `admin_token` cookie as a Bearer token. Composite string IDs (e.g., `consumer_electronics/internal_wiring/electronic_wire`) are preserved and URL-encoded.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + PostgreSQL (backend, existing); Next.js 16 App Router + TypeScript + Tailwind CSS (frontend, existing); JWT auth via http-only `admin_token` cookie (existing).

**Spec:** [docs/superpowers/specs/2026-07-03-admin-taxonomy-management-design.md](file:///d:/projects/unowire/docs/superpowers/specs/2026-07-03-admin-taxonomy-management-design.md)

---

## File Structure

### Modified files (6)
- `backend/app/api/routes/industries.py` — add auth dependency to POST/PUT/DELETE
- `backend/app/api/routes/categories.py` — add auth dependency to POST/PUT/DELETE
- `backend/app/api/routes/product_types.py` — add auth dependency to POST/PUT/DELETE
- `backend/scripts/seed.py` — `seed_taxonomy` → upsert; `truncate_all` removes 3 tables
- `frontend/components/admin/layout/AdminSidebar.tsx` — add Taxonomy nav link
- `frontend/lib/adminApi.ts` — add `taxonomy` namespace

### New files (18)

**Industry admin (6)**
- `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx` — list
- `frontend/app/admin/(dashboard)/taxonomy/industries/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/industries/[id]/page.tsx`
- `frontend/components/admin/form/IndustryForm.tsx`
- `frontend/app/api/admin/industries/route.ts` — POST proxy
- `frontend/app/api/admin/industries/[id]/route.ts` — PUT/DELETE proxy

**Category admin (6)**
- `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx` — list (with industry filter)
- `frontend/app/admin/(dashboard)/taxonomy/categories/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/categories/[id]/page.tsx`
- `frontend/components/admin/form/CategoryForm.tsx`
- `frontend/app/api/admin/categories/route.ts` — POST proxy (reads `industry_id` from body)
- `frontend/app/api/admin/categories/[id]/route.ts` — PUT/DELETE proxy (splits composite ID)

**Product Type admin (6)**
- `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx` — list (with category filter)
- `frontend/app/admin/(dashboard)/taxonomy/product-types/new/page.tsx`
- `frontend/app/admin/(dashboard)/taxonomy/product-types/[id]/page.tsx`
- `frontend/components/admin/form/ProductTypeForm.tsx` — includes filters JSON editor
- `frontend/app/api/admin/product-types/route.ts` — POST proxy (reads `industry_id` + `category_id` from body)
- `frontend/app/api/admin/product-types/[id]/route.ts` — PUT/DELETE proxy (splits composite ID)

---

## Task 1: Add admin auth guard to taxonomy backend routes

**Files:**
- Modify: `backend/app/api/routes/industries.py`
- Modify: `backend/app/api/routes/categories.py`
- Modify: `backend/app/api/routes/product_types.py`

**Goal:** All POST/PUT/DELETE handlers on the three taxonomy route files must require `Depends(get_current_admin)`. GET handlers remain public.

- [ ] **Step 1: Add auth to `industries.py`**

Edit `backend/app/api/routes/industries.py`. Add the import and dependency parameter to POST/PUT/DELETE handlers.

Add to imports at top:
```python
from app.api.deps import get_current_admin
```

Modify the three handler signatures (only the signature, not the body):

```python
@router.post("", response_model=IndustryRead, status_code=201)
async def create_industry(obj_in: IndustryCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    return await crud_industry.create(db, obj_in=obj_in)


@router.put("/{id}", response_model=IndustryRead)
async def update_industry(id: str, obj_in: IndustryUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_industry.get(db, id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Industry not found"})
    return await crud_industry.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=IndustryRead)
async def delete_industry(id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_industry.remove(db, id=id)
    if not obj:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Industry not found"})
    return obj
```

- [ ] **Step 2: Add auth to `categories.py`**

Edit `backend/app/api/routes/categories.py`. Same pattern.

Add to imports:
```python
from app.api.deps import get_current_admin
```

Modify the three handler signatures:

```python
@router.post("", response_model=CategoryRead, status_code=201)
async def create_category(industry_id: str, obj_in: CategoryCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj_in_data = obj_in.model_dump()
    obj_in_data["industry_id"] = industry_id
    from app.models.taxonomy import Category
    db_obj = Category(**obj_in_data)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.put("/{id}", response_model=CategoryRead)
async def update_category(industry_id: str, id: str, obj_in: CategoryUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_category.get(db, id)
    if not obj or obj.industry_id != industry_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Category not found in this industry"})
    return await crud_category.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=CategoryRead)
async def delete_category(industry_id: str, id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_category.get(db, id)
    if not obj or obj.industry_id != industry_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Category not found in this industry"})
    return await crud_category.remove(db, id=id)
```

- [ ] **Step 3: Add auth to `product_types.py`**

Edit `backend/app/api/routes/product_types.py`. Same pattern.

Add to imports:
```python
from app.api.deps import get_current_admin
```

Modify the three handler signatures:

```python
@router.post("", response_model=ProductTypeRead, status_code=201)
async def create_product_type(category_id: str, obj_in: ProductTypeCreate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj_in_data = obj_in.model_dump()
    obj_in_data["category_id"] = category_id
    from app.models.taxonomy import ProductType
    db_obj = ProductType(**obj_in_data)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.put("/{id}", response_model=ProductTypeRead)
async def update_product_type(
    category_id: str, id: str, obj_in: ProductTypeUpdate, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)
):
    obj = await crud_product_type.get(db, id)
    if not obj or obj.category_id != category_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{id}", response_model=ProductTypeRead)
async def delete_product_type(category_id: str, id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    obj = await crud_product_type.get(db, id)
    if not obj or obj.category_id != category_id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Product type not found"})
    return await crud_product_type.remove(db, id=id)
```

- [ ] **Step 4: Verify auth guards work**

Run from project root (backend container is running with --reload):

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend python -c "import urllib.request; req = urllib.request.Request('http://localhost:8000/api/industries', method='POST'); req.add_header('Content-Type', 'application/json'); req.data = b'{\"id\":\"test\",\"label\":\"Test\",\"slug\":\"test\"}'; 
try:
  urllib.request.urlopen(req)
  print('FAIL: expected 401')
except urllib.error.HTTPError as e:
  print(f'OK: {e.code}')
"
```

Expected output: `OK: 401`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/industries.py backend/app/api/routes/categories.py backend/app/api/routes/product_types.py
git commit -m "feat(backend): add admin auth guard to taxonomy write endpoints

All POST/PUT/DELETE handlers on industries, categories, and product_types
routes now require get_current_admin. GET endpoints remain public."
```

---

## Task 2: Convert `seed_taxonomy` to upsert mode

**Files:**
- Modify: `backend/scripts/seed.py`

**Goal:** `seed_taxonomy` must upsert (update existing, insert new, never delete). `truncate_all` must NOT truncate the three taxonomy tables.

- [ ] **Step 1: Remove taxonomy tables from `truncate_all`**

Edit `backend/scripts/seed.py`. Find the `truncate_all` function (around line 36). Replace the tables list to remove `product_types`, `categories`, `industries`:

```python
async def truncate_all(db: AsyncSession):
    """Truncate all tables in reverse FK order.

    Taxonomy tables (industries, categories, product_types) are NOT truncated
    because they are upserted by seed_taxonomy to preserve admin edits.
    """
    from sqlalchemy import text
    tables = [
        "spec_items", "cable_variants", "cables",
        "recommended_equipments",
        "brands", "manufacturers", "audit_log",
    ]
    for t in tables:
        await db.execute(text(f'TRUNCATE TABLE "{t}" CASCADE'))
    await db.commit()
```

- [ ] **Step 2: Rewrite `seed_taxonomy` as upsert**

Edit `backend/scripts/seed.py`. Replace the existing `seed_taxonomy` function (around lines 84-124) with this upsert version:

```python
async def seed_taxonomy(db: AsyncSession, dry_run: bool):
    """Upsert taxonomy from taxonomy.json.

    - Records in JSON: update label/description/sort_order (and size_system/filters for ProductType)
    - Records NOT in JSON (admin-added): left untouched
    - Never deletes records
    """
    from sqlalchemy import select

    data = load_json("taxonomy.json")
    created = 0
    updated = 0

    for ind_key, ind_data in data.items():
        # === Industry upsert ===
        stmt = select(Industry).where(Industry.id == ind_key)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            existing.label = ind_data["label"]
            existing.slug = ind_data["slug"]
            existing.description = ind_data.get("description")
            updated += 1
            if dry_run:
                print(f"  ~ Industry (update): {ind_key} - {ind_data['label']}")
        else:
            db.add(Industry(
                id=ind_key,
                label=ind_data["label"],
                slug=ind_data["slug"],
                description=ind_data.get("description"),
            ))
            created += 1
            if dry_run:
                print(f"  + Industry (create): {ind_key} - {ind_data['label']}")

        for cat_key, cat_data in ind_data["categories"].items():
            cat_id = f"{ind_key}/{cat_key}"
            # === Category upsert ===
            stmt = select(Category).where(Category.id == cat_id)
            existing_cat = (await db.execute(stmt)).scalar_one_or_none()
            if existing_cat:
                existing_cat.industry_id = ind_key
                existing_cat.label = cat_data["label"]
                existing_cat.slug = cat_data["slug"]
                updated += 1
                if dry_run:
                    print(f"    ~ Category (update): {cat_id} - {cat_data['label']}")
            else:
                db.add(Category(
                    id=cat_id,
                    industry_id=ind_key,
                    label=cat_data["label"],
                    slug=cat_data["slug"],
                ))
                created += 1
                if dry_run:
                    print(f"    + Category (create): {cat_id} - {cat_data['label']}")

            for pt_key, pt_data in cat_data["product_types"].items():
                pt_id = f"{ind_key}/{cat_key}/{pt_key}"
                # === ProductType upsert ===
                stmt = select(ProductType).where(ProductType.id == pt_id)
                existing_pt = (await db.execute(stmt)).scalar_one_or_none()
                if existing_pt:
                    existing_pt.category_id = cat_id
                    existing_pt.label = pt_data["label"]
                    existing_pt.slug = pt_data["slug"]
                    existing_pt.size_system = pt_data["size_system"]
                    existing_pt.filters = pt_data.get("filters", [])
                    updated += 1
                    if dry_run:
                        print(f"      ~ ProductType (update): {pt_id} - {pt_data['label']}")
                else:
                    db.add(ProductType(
                        id=pt_id,
                        category_id=cat_id,
                        label=pt_data["label"],
                        slug=pt_data["slug"],
                        size_system=pt_data["size_system"],
                        filters=pt_data.get("filters", []),
                    ))
                    created += 1
                    if dry_run:
                        print(f"      + ProductType (create): {pt_id} - {pt_data['label']}")

    if not dry_run:
        await db.commit()
    print(f"  Taxonomy upsert: {created} created, {updated} updated")
```

- [ ] **Step 3: Verify upsert works**

Run dry-run to confirm no errors:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend python -m scripts.seed --dry-run
```

Expected: dry-run output shows `~ Industry (update)` entries (because data already exists), ends with `Taxonomy upsert: 0 created, N updated` (N matches the count of industries+categories+product_types in taxonomy.json).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed.py
git commit -m "feat(backend): convert seed_taxonomy to upsert mode

Preserves admin-added taxonomy records. JSON-defined records are updated
to match the JSON source. truncate_all no longer touches taxonomy tables."
```

---

## Task 3: Add `taxonomy` namespace to `adminApi.ts`

**Files:**
- Modify: `frontend/lib/adminApi.ts`

**Goal:** Server-side admin API client gains a `taxonomy` namespace with `industries`, `categories`, `productTypes` sub-namespaces, each with `all`, `getById`, `create`, `update`, `remove`.

- [ ] **Step 1: Add backend response interfaces**

Edit `frontend/lib/adminApi.ts`. After the existing `BackendCable` interface (around line 59), add:

```typescript
interface BackendTaxonomyFilter {
  spec_key: string;
  label: string;
  control: string;
  unit: string | null;
}

interface BackendIndustry {
  id: string;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  categories?: BackendCategory[];
}

interface BackendCategory {
  id: string;
  industry_id: string;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  product_types?: BackendProductType[];
}

interface BackendProductType {
  id: string;
  category_id: string;
  label: string;
  slug: string;
  size_system: string;
  filters: BackendTaxonomyFilter[];
  sort_order: number;
}
```

- [ ] **Step 2: Add the `taxonomy` namespace**

Edit `frontend/lib/adminApi.ts`. Before the closing `};` of the `adminApi` object (after the `auth` namespace, around line 273), add:

```typescript
  taxonomy: {
    industries: {
      async all(): Promise<BackendIndustry[]> {
        return await adminGet<BackendIndustry[]>('/api/industries');
      },
      async getById(id: string): Promise<BackendIndustry | null> {
        try {
          return await adminGet<BackendIndustry>(`/api/industries/${encodeURIComponent(id)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { id: string; label: string; slug: string; description?: string | null; sort_order?: number }): Promise<BackendIndustry> {
        const res = await adminFetch('/api/industries', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries`);
        return await res.json() as BackendIndustry;
      },
      async update(id: string, payload: { label?: string; slug?: string; description?: string | null; sort_order?: number }): Promise<BackendIndustry> {
        const res = await adminFetch(`/api/industries/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${id}`);
        return await res.json() as BackendIndustry;
      },
      async remove(id: string): Promise<void> {
        const res = await adminFetch(`/api/industries/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${id}`);
      },
    },

    categories: {
      // industryId optional — if omitted, returns all categories across industries (requires aggregate endpoint)
      // For now we fetch the full taxonomy tree and flatten categories
      async all(industryId?: string): Promise<BackendCategory[]> {
        const tree = await adminGet<BackendIndustry[]>('/api/industries');
        const filtered = industryId ? tree.filter(i => i.id === industryId) : tree;
        return filtered.flatMap(i => i.categories ?? []);
      },
      async getById(id: string): Promise<BackendCategory | null> {
        // Category ID is composite: "industry_id/category_slug"
        // Backend route: GET /api/industries/{industry_id}/categories/{category_id}
        const segments = id.split('/');
        if (segments.length < 2) return null;
        const industryId = segments[0];
        try {
          return await adminGet<BackendCategory>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(id)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { industry_id: string; id: string; label: string; slug: string; description?: string | null; sort_order?: number }): Promise<BackendCategory> {
        const { industry_id, ...body } = payload;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industry_id)}/categories`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industry_id}/categories`);
        return await res.json() as BackendCategory;
      },
      async update(id: string, payload: { label?: string; slug?: string; description?: string | null; sort_order?: number }): Promise<BackendCategory> {
        // Split composite ID to build nested URL
        const segments = id.split('/');
        if (segments.length < 2) throw new Error(`Invalid category ID: ${id}`);
        const industryId = segments[0];
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industryId}/categories/${id}`);
        return await res.json() as BackendCategory;
      },
      async remove(id: string): Promise<void> {
        const segments = id.split('/');
        if (segments.length < 2) throw new Error(`Invalid category ID: ${id}`);
        const industryId = segments[0];
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industryId}/categories/${id}`);
      },
    },

    productTypes: {
      async all(categoryId?: string): Promise<BackendProductType[]> {
        if (categoryId) {
          const segments = categoryId.split('/');
          if (segments.length < 2) return [];
          const industryId = segments[0];
          return await adminGet<BackendProductType[]>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types`);
        }
        // No filter — flatten from full taxonomy tree
        const tree = await adminGet<BackendIndustry[]>('/api/industries');
        return tree.flatMap(i => (i.categories ?? []).flatMap(c => c.product_types ?? []));
      },
      async getById(id: string): Promise<BackendProductType | null> {
        // ID: "industry/category/product_type"
        const segments = id.split('/');
        if (segments.length < 3) return null;
        const [industryId, categoryId] = segments;
        try {
          return await adminGet<BackendProductType>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types/${encodeURIComponent(id)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { industry_id: string; category_id: string; id: string; label: string; slug: string; size_system: string; filters?: BackendTaxonomyFilter[]; sort_order?: number }): Promise<BackendProductType> {
        const { industry_id, category_id, ...body } = payload;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industry_id)}/categories/${encodeURIComponent(category_id)}/product-types`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API ${res.status}: product-types create`);
        return await res.json() as BackendProductType;
      },
      async update(id: string, payload: { label?: string; slug?: string; size_system?: string; filters?: BackendTaxonomyFilter[]; sort_order?: number }): Promise<BackendProductType> {
        const segments = id.split('/');
        if (segments.length < 3) throw new Error(`Invalid product type ID: ${id}`);
        const [industryId, categoryId] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: product-types update ${id}`);
        return await res.json() as BackendProductType;
      },
      async remove(id: string): Promise<void> {
        const segments = id.split('/');
        if (segments.length < 3) throw new Error(`Invalid product type ID: ${id}`);
        const [industryId, categoryId] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: product-types delete ${id}`);
      },
    },
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T frontend npx tsc --noEmit
```

Expected: no errors (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/adminApi.ts
git commit -m "feat(frontend): add taxonomy namespace to adminApi

Server-side admin API client gains taxonomy.industries, taxonomy.categories,
taxonomy.productTypes with all/getById/create/update/remove methods.
Composite IDs are URL-encoded and split for nested backend routes."
```

---

## Task 4: Add Taxonomy nav link to AdminSidebar

**Files:**
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`

- [ ] **Step 1: Add nav link**

Edit `frontend/components/admin/layout/AdminSidebar.tsx`. Update the imports (line 5) to add `FolderOpen`:

```typescript
import { LayoutDashboard, Cable, Tag, Factory, ExternalLink, LogOut, FolderOpen } from 'lucide-react';
```

Add a new entry to `navLinks` array after the Manufacturers entry (after line 17):

```typescript
const navLinks: NavLink[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/cables', label: 'Cables', icon: Cable },
  { href: '/admin/brands', label: 'Brands', icon: Tag },
  { href: '/admin/manufacturers', label: 'Manufacturers', icon: Factory },
  { href: '/admin/taxonomy/industries', label: 'Taxonomy', icon: FolderOpen },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(frontend): add Taxonomy nav link to admin sidebar"
```

---

## Task 5: Create Industry API route proxies

**Files:**
- Create: `frontend/app/api/admin/industries/route.ts`
- Create: `frontend/app/api/admin/industries/[id]/route.ts`

**Goal:** Next.js API routes that read `admin_token` cookie and forward as Bearer to backend. Identical pattern to `/api/admin/manufacturers`.

- [ ] **Step 1: Create POST proxy**

Create `frontend/app/api/admin/industries/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/industries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create PUT/DELETE proxy**

Create `frontend/app/api/admin/industries/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/industries/
git commit -m "feat(frontend): add industry API route proxies"
```

---

## Task 6: Create Category API route proxies

**Files:**
- Create: `frontend/app/api/admin/categories/route.ts`
- Create: `frontend/app/api/admin/categories/[id]/route.ts`

**Goal:** Category backend routes are nested under `/api/industries/{industry_id}/categories`. The POST proxy reads `industry_id` from the request body. The PUT/DELETE proxy splits the composite `[id]` to extract `industry_id`.

- [ ] **Step 1: Create POST proxy**

Create `frontend/app/api/admin/categories/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const { industry_id, ...payload } = body;
  if (!industry_id) {
    return NextResponse.json({ code: 400, message: 'industry_id is required' }, { status: 400 });
  }
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industry_id)}/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create PUT/DELETE proxy**

Create `frontend/app/api/admin/categories/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  // id is composite: "industry_id/category_slug" — first segment is industry_id
  const segments = id.split('/');
  if (segments.length < 2) {
    return NextResponse.json({ code: 400, message: 'Invalid category ID' }, { status: 400 });
  }
  const industryId = segments[0];
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const segments = id.split('/');
  if (segments.length < 2) {
    return NextResponse.json({ code: 400, message: 'Invalid category ID' }, { status: 400 });
  }
  const industryId = segments[0];
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/categories/
git commit -m "feat(frontend): add category API route proxies"
```

---

## Task 7: Create Product Type API route proxies

**Files:**
- Create: `frontend/app/api/admin/product-types/route.ts`
- Create: `frontend/app/api/admin/product-types/[id]/route.ts`

**Goal:** Product Type backend routes are nested under `/api/industries/{industry_id}/categories/{category_id}/product-types`. The POST proxy reads `industry_id` + `category_id` from the body. The PUT/DELETE proxy splits the composite `[id]` to extract both.

- [ ] **Step 1: Create POST proxy**

Create `frontend/app/api/admin/product-types/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const { industry_id, category_id, ...payload } = body;
  if (!industry_id || !category_id) {
    return NextResponse.json({ code: 400, message: 'industry_id and category_id are required' }, { status: 400 });
  }
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industry_id)}/categories/${encodeURIComponent(category_id)}/product-types`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create PUT/DELETE proxy**

Create `frontend/app/api/admin/product-types/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  // id is composite: "industry_id/category_slug/product_type_slug"
  const segments = id.split('/');
  if (segments.length < 3) {
    return NextResponse.json({ code: 400, message: 'Invalid product type ID' }, { status: 400 });
  }
  const [industryId, categoryId] = segments;
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const segments = id.split('/');
  if (segments.length < 3) {
    return NextResponse.json({ code: 400, message: 'Invalid product type ID' }, { status: 400 });
  }
  const [industryId, categoryId] = segments;
  const res = await fetch(`${API_BASE}/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(categoryId)}/product-types/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/product-types/
git commit -m "feat(frontend): add product-type API route proxies"
```

---

## Task 8: Build IndustryForm component

**Files:**
- Create: `frontend/components/admin/form/IndustryForm.tsx`

**Goal:** Client component with fields label, slug, description, sort_order. Mirrors ManufacturerForm structure. Supports create/edit + delete.

- [ ] **Step 1: Create the form component**

Create `frontend/components/admin/form/IndustryForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IndustryFormProps {
  initial?: {
    id: string;
    label: string;
    slug: string;
    description: string | null;
    sort_order: number;
  };
}

export function IndustryForm({ initial }: IndustryFormProps) {
  const router = useRouter();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = {
      id: initial?.id || slug,
      label,
      slug,
      description: description || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/industries/${encodeURIComponent(initial.id)}`
        : '/api/admin/industries';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/taxonomy/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this industry? If it has cables referencing it, deletion will be blocked.')) return;
    try {
      const res = await fetch(`/api/admin/industries/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/industries');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">
          Label
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">
          Slug
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-gray-500">
          URL-friendly identifier, lowercase with hyphens (e.g., &quot;consumer_electronics&quot;)
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">
          Sort Order
        </label>
        <input
          id="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={inputClass}
        />
        <p className="text-xs text-gray-500">Lower numbers appear first</p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/taxonomy/industries"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/IndustryForm.tsx
git commit -m "feat(frontend): add IndustryForm component"
```

---

## Task 9: Build Industry admin pages (list, new, edit)

**Files:**
- Create: `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/industries/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/industries/[id]/page.tsx`

- [ ] **Step 1: Create list page**

Create `frontend/app/admin/(dashboard)/taxonomy/industries/page.tsx`:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function IndustriesPage() {
  const industries = await adminApi.taxonomy.industries.all();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Industries</h1>
        <Link
          href="/admin/taxonomy/industries/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {industries.map((ind) => (
              <tr key={ind.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{ind.label}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{ind.slug}</td>
                <td className="px-4 py-3 text-gray-600">
                  {ind.categories?.length ?? 0}
                </td>
                <td className="px-4 py-3 space-x-3">
                  <Link
                    href={`/admin/taxonomy/industries/${encodeURIComponent(ind.id)}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(ind.id)}`}
                    className="text-blue-600 hover:underline"
                  >
                    View Categories →
                  </Link>
                </td>
              </tr>
            ))}
            {industries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No industries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new page**

Create `frontend/app/admin/(dashboard)/taxonomy/industries/new/page.tsx`:

```tsx
import { IndustryForm } from '@/components/admin/form/IndustryForm';

export default function NewIndustryPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Industry</h1>
      <IndustryForm />
    </div>
  );
}
```

- [ ] **Step 3: Create edit page**

Create `frontend/app/admin/(dashboard)/taxonomy/industries/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditIndustryPage({ params }: PageProps) {
  const { id } = await params;
  const industry = await adminApi.taxonomy.industries.getById(id);
  if (!industry) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/taxonomy/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{industry.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Industry</h1>
      <IndustryForm initial={industry} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/taxonomy/industries/
git commit -m "feat(frontend): add Industry admin pages (list/new/edit)"
```

---

## Task 10: Build CategoryForm component

**Files:**
- Create: `frontend/components/admin/form/CategoryForm.tsx`

**Goal:** Form with industry dropdown, label, slug, description, sort_order. Submits to `/api/admin/categories` with `industry_id` in body. On edit, sends PUT to `/api/admin/categories/{composite_id}`.

- [ ] **Step 1: Create the form component**

Create `frontend/components/admin/form/CategoryForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IndustryOption {
  id: string;
  label: string;
}

interface CategoryFormProps {
  initial?: {
    id: string;
    industry_id: string;
    label: string;
    slug: string;
    description: string | null;
    sort_order: number;
  };
  industries: IndustryOption[];
  // Pre-selected industry when creating new category via ?industry_id= query
  preselectIndustryId?: string;
}

export function CategoryForm({ initial, industries, preselectIndustryId }: CategoryFormProps) {
  const router = useRouter();
  const [industryId, setIndustryId] = useState(initial?.industry_id ?? preselectIndustryId ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Composite ID: "industry_id/category_slug"
    const compositeId = initial?.id || `${industryId}/${slug}`;
    const body = {
      id: compositeId,
      industry_id: industryId,
      label,
      slug,
      description: description || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/categories/${encodeURIComponent(compositeId)}`
        : '/api/admin/categories';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/taxonomy/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this category? If it has cables referencing it, deletion will be blocked.')) return;
    try {
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/categories');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry_id" className="text-sm font-medium text-gray-700">
          Industry
        </label>
        <select
          id="industry_id"
          required
          value={industryId}
          onChange={(e) => setIndustryId(e.target.value)}
          disabled={!!initial}
          className={inputClass}
        >
          <option value="">Select an industry…</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.label}
            </option>
          ))}
        </select>
        {initial && (
          <p className="text-xs text-gray-500">
            Industry cannot be changed after creation (would require changing the composite ID)
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">
          Label
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">
          Slug
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">
          Sort Order
        </label>
        <input
          id="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/taxonomy/categories"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/CategoryForm.tsx
git commit -m "feat(frontend): add CategoryForm component with industry dropdown"
```

---

## Task 11: Build Category admin pages (list, new, edit)

**Files:**
- Create: `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/categories/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/categories/[id]/page.tsx`

- [ ] **Step 1: Create list page (with industry filter)**

Create `frontend/app/admin/(dashboard)/taxonomy/categories/page.tsx`:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ industry_id?: string }>;
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industryFilter = sp.industry_id;

  const [categories, industries] = await Promise.all([
    adminApi.taxonomy.categories.all(industryFilter),
    adminApi.taxonomy.industries.all(),
  ]);

  const currentIndustry = industries.find((i) => i.id === industryFilter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Categories
          {currentIndustry && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              in {currentIndustry.label}
            </span>
          )}
        </h1>
        <Link
          href={industryFilter
            ? `/admin/taxonomy/categories/new?industry_id=${encodeURIComponent(industryFilter)}`
            : '/admin/taxonomy/categories/new'}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      {/* Industry filter dropdown */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <label htmlFor="industry_filter" className="text-gray-600">
          Filter by industry:
        </label>
        <select
          id="industry_filter"
          value={industryFilter ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            window.location.href = val
              ? `/admin/taxonomy/categories?industry_id=${encodeURIComponent(val)}`
              : '/admin/taxonomy/categories';
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All industries</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Product Types</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const industry = industries.find((i) => i.id === cat.industry_id);
              return (
                <tr key={cat.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {industry?.label ?? cat.industry_id}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{cat.label}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{cat.slug}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {cat.product_types?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 space-x-3">
                    <Link
                      href={`/admin/taxonomy/categories/${encodeURIComponent(cat.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(cat.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      View Product Types →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: The `<select onChange>` requires this to be a client component, but since the parent is RSC and the dropdown uses `window.location.href`, we need a small client wrapper. Replace the `<select>` block with a call to a client component:

Add a small inline client component file at `frontend/components/admin/list/IndustryFilterSelect.tsx`:

```tsx
'use client';

interface IndustryFilterSelectProps {
  industries: { id: string; label: string }[];
  value: string | undefined;
}

export function IndustryFilterSelect({ industries, value }: IndustryFilterSelectProps) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        window.location.href = val
          ? `/admin/taxonomy/categories?industry_id=${encodeURIComponent(val)}`
          : '/admin/taxonomy/categories';
      }}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
    >
      <option value="">All industries</option>
      {industries.map((ind) => (
        <option key={ind.id} value={ind.id}>
          {ind.label}
        </option>
      ))}
    </select>
  );
}
```

Then in the list page, replace the inline `<select>` with `<IndustryFilterSelect industries={industries} value={industryFilter} />` and add the import.

- [ ] **Step 2: Create new page**

Create `frontend/app/admin/(dashboard)/taxonomy/categories/new/page.tsx`:

```tsx
import { CategoryForm } from '@/components/admin/form/CategoryForm';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ industry_id?: string }>;
}

export default async function NewCategoryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industries = await adminApi.taxonomy.industries.all();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Category</h1>
      <CategoryForm
        industries={industries.map((i) => ({ id: i.id, label: i.label }))}
        preselectIndustryId={sp.industry_id}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create edit page (with breadcrumb)**

Create `frontend/app/admin/(dashboard)/taxonomy/categories/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params;
  const category = await adminApi.taxonomy.categories.getById(id);
  if (!category) notFound();

  const industries = await adminApi.taxonomy.industries.all();
  const industry = industries.find((i) => i.id === category.industry_id);

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/taxonomy/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        {industry ? (
          <Link
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
            className="hover:underline"
          >
            {industry.label}
          </Link>
        ) : (
          <span>{category.industry_id}</span>
        )}
        <span className="mx-2">/</span>
        <span className="text-gray-900">{category.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Category</h1>
      <CategoryForm
        initial={category}
        industries={industries.map((i) => ({ id: i.id, label: i.label }))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/taxonomy/categories/ frontend/components/admin/list/IndustryFilterSelect.tsx
git commit -m "feat(frontend): add Category admin pages (list/new/edit) with industry filter"
```

---

## Task 12: Build ProductTypeForm component (with filters JSON editor)

**Files:**
- Create: `frontend/components/admin/form/ProductTypeForm.tsx`

**Goal:** Form with Industry/Category cascade dropdowns, label, slug, size_system select, filters JSON editor (live validation), sort_order.

- [ ] **Step 1: Create the form component**

Create `frontend/components/admin/form/ProductTypeForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IndustryOption {
  id: string;
  label: string;
  categories: { id: string; label: string }[];
}

interface ProductTypeFormProps {
  initial?: {
    id: string;
    category_id: string;
    label: string;
    slug: string;
    size_system: string;
    filters: { spec_key: string; label: string; control: string; unit: string | null }[];
    sort_order: number;
  };
  industries: IndustryOption[];
  preselectCategoryId?: string;
}

const SIZE_SYSTEMS = ['awg', 'mm2', 'kcmil', 'none'];

export function ProductTypeForm({ initial, industries, preselectCategoryId }: ProductTypeFormProps) {
  const router = useRouter();

  // Derive initial industry from category_id (composite: "industry/category")
  const initialCategoryId = initial?.category_id ?? preselectCategoryId ?? '';
  const initialIndustryId = initialCategoryId.split('/')[0] ?? '';

  const [industryId, setIndustryId] = useState(initialIndustryId);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sizeSystem, setSizeSystem] = useState(initial?.size_system ?? 'awg');
  const [filtersText, setFiltersText] = useState(
    JSON.stringify(initial?.filters ?? [], null, 2)
  );
  const [filtersValid, setFiltersValid] = useState(true);
  const [filtersError, setFiltersError] = useState('');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cascade: categories available for selected industry
  const selectedIndustry = industries.find((i) => i.id === industryId);
  const availableCategories = selectedIndustry?.categories ?? [];

  function handleIndustryChange(value: string) {
    setIndustryId(value);
    setCategoryId('');
  }

  function handleFiltersChange(value: string) {
    setFiltersText(value);
    if (!value.trim()) {
      setFiltersValid(true);
      setFiltersError('');
      return;
    }
    try {
      JSON.parse(value);
      setFiltersValid(true);
      setFiltersError('');
    } catch (e) {
      setFiltersValid(false);
      setFiltersError((e as Error).message);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Composite ID: "industry_id/category_slug/product_type_slug"
    const compositeId = initial?.id || `${categoryId}/${slug}`;
    const parsedFilters = filtersText.trim() ? JSON.parse(filtersText) : [];

    const body = {
      id: compositeId,
      industry_id: industryId,
      category_id: categoryId,
      label,
      slug,
      size_system: sizeSystem,
      filters: parsedFilters,
      sort_order: Number(sortOrder),
    };

    try {
      const url = initial
        ? `/api/admin/product-types/${encodeURIComponent(compositeId)}`
        : '/api/admin/product-types';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this product type? If it has cables referencing it, deletion will be blocked.')) return;
    try {
      const res = await fetch(`/api/admin/product-types/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {/* Industry cascade */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry_id" className="text-sm font-medium text-gray-700">
          Industry
        </label>
        <select
          id="industry_id"
          required
          value={industryId}
          onChange={(e) => handleIndustryChange(e.target.value)}
          disabled={!!initial}
          className={inputClass}
        >
          <option value="">Select an industry…</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category cascade */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category_id" className="text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          id="category_id"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!!initial || !industryId}
          className={inputClass}
        >
          <option value="">Select a category…</option>
          {availableCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>
        {initial && (
          <p className="text-xs text-gray-500">
            Industry and category cannot be changed after creation
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">
          Label
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">
          Slug
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="size_system" className="text-sm font-medium text-gray-700">
          Size System
        </label>
        <select
          id="size_system"
          required
          value={sizeSystem}
          onChange={(e) => setSizeSystem(e.target.value)}
          className={inputClass}
        >
          {SIZE_SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Filters JSON editor */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filters" className="text-sm font-medium text-gray-700">
          Filters (JSON array)
        </label>
        <textarea
          id="filters"
          rows={10}
          value={filtersText}
          onChange={(e) => handleFiltersChange(e.target.value)}
          className={`${inputClass} font-mono text-xs ${
            !filtersValid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
          }`}
          placeholder='[{"spec_key":"awg_size","label":"AWG Size","control":"select","unit":null}]'
        />
        {!filtersValid && (
          <p className="text-xs text-red-600">JSON error: {filtersError}</p>
        )}
        <p className="text-xs text-gray-500">
          Array of filter objects. Each: &#123;&quot;spec_key&quot;, &quot;label&quot;, &quot;control&quot;, &quot;unit&quot;&#125;
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">
          Sort Order
        </label>
        <input
          id="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !filtersValid}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/taxonomy/product-types"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/ProductTypeForm.tsx
git commit -m "feat(frontend): add ProductTypeForm with cascade dropdowns and filters JSON editor"
```

---

## Task 13: Build Product Type admin pages (list, new, edit)

**Files:**
- Create: `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/product-types/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/taxonomy/product-types/[id]/page.tsx`
- Create: `frontend/components/admin/list/CategoryFilterSelect.tsx`

- [ ] **Step 1: Create CategoryFilterSelect client component**

Create `frontend/components/admin/list/CategoryFilterSelect.tsx`:

```tsx
'use client';

interface CategoryFilterSelectProps {
  categories: { id: string; label: string; industry_id: string }[];
  value: string | undefined;
}

export function CategoryFilterSelect({ categories, value }: CategoryFilterSelectProps) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        window.location.href = val
          ? `/admin/taxonomy/product-types?category_id=${encodeURIComponent(val)}`
          : '/admin/taxonomy/product-types';
      }}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
    >
      <option value="">All categories</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Create list page**

Create `frontend/app/admin/(dashboard)/taxonomy/product-types/page.tsx`:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { CategoryFilterSelect } from '@/components/admin/list/CategoryFilterSelect';

interface PageProps {
  searchParams: Promise<{ category_id?: string }>;
}

export default async function ProductTypesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const categoryFilter = sp.category_id;

  const [productTypes, industries] = await Promise.all([
    adminApi.taxonomy.productTypes.all(categoryFilter),
    adminApi.taxonomy.industries.all(),
  ]);

  // Flatten all categories for the filter dropdown
  const allCategories = industries.flatMap((i) => i.categories ?? []);
  const currentCategory = allCategories.find((c) => c.id === categoryFilter);

  // Build a lookup for industry/category labels
  const industryMap = new Map(industries.map((i) => [i.id, i.label]));
  const categoryMap = new Map(allCategories.map((c) => [c.id, c.label]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Product Types
          {currentCategory && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              in {currentCategory.label}
            </span>
          )}
        </h1>
        <Link
          href={categoryFilter
            ? `/admin/taxonomy/product-types/new?category_id=${encodeURIComponent(categoryFilter)}`
            : '/admin/taxonomy/product-types/new'}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3 text-sm">
        <label htmlFor="category_filter" className="text-gray-600">
          Filter by category:
        </label>
        <CategoryFilterSelect categories={allCategories} value={categoryFilter} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Size System</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productTypes.map((pt) => {
              const industryId = pt.category_id?.split('/')[0];
              return (
                <tr key={pt.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {industryMap.get(industryId ?? '') ?? industryId}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {categoryMap.get(pt.category_id) ?? pt.category_id}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{pt.label}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{pt.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{pt.size_system}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/taxonomy/product-types/${encodeURIComponent(pt.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
            {productTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No product types found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create new page**

Create `frontend/app/admin/(dashboard)/taxonomy/product-types/new/page.tsx`:

```tsx
import { ProductTypeForm } from '@/components/admin/form/ProductTypeForm';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ category_id?: string }>;
}

export default async function NewProductTypePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industries = await adminApi.taxonomy.industries.all();

  // Map to the shape expected by ProductTypeForm
  const industryOptions = industries.map((i) => ({
    id: i.id,
    label: i.label,
    categories: (i.categories ?? []).map((c) => ({ id: c.id, label: c.label })),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Product Type</h1>
      <ProductTypeForm
        industries={industryOptions}
        preselectCategoryId={sp.category_id}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create edit page (with breadcrumb)**

Create `frontend/app/admin/(dashboard)/taxonomy/product-types/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductTypePage({ params }: PageProps) {
  const { id } = await params;
  const productType = await adminApi.taxonomy.productTypes.getById(id);
  if (!productType) notFound();

  const industries = await adminApi.taxonomy.industries.all();
  const industryOptions = industries.map((i) => ({
    id: i.id,
    label: i.label,
    categories: (i.categories ?? []).map((c) => ({ id: c.id, label: c.label })),
  }));

  // Find labels for breadcrumb
  const categoryId = productType.category_id;
  const industryId = categoryId.split('/')[0];
  const allCategories = industries.flatMap((i) => i.categories ?? []);
  const industry = industries.find((i) => i.id === industryId);
  const category = allCategories.find((c) => c.id === categoryId);

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/taxonomy/industries" className="hover:underline">
          Industries
        </Link>
        <span className="mx-2">/</span>
        {industry ? (
          <Link
            href={`/admin/taxonomy/categories?industry_id=${encodeURIComponent(industry.id)}`}
            className="hover:underline"
          >
            {industry.label}
          </Link>
        ) : (
          <span>{industryId}</span>
        )}
        <span className="mx-2">/</span>
        {category ? (
          <Link
            href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(category.id)}`}
            className="hover:underline"
          >
            {category.label}
          </Link>
        ) : (
          <span>{categoryId}</span>
        )}
        <span className="mx-2">/</span>
        <span className="text-gray-900">{productType.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Product Type</h1>
      <ProductTypeForm initial={productType} industries={industryOptions} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/(dashboard)/taxonomy/product-types/ frontend/components/admin/list/CategoryFilterSelect.tsx
git commit -m "feat(frontend): add Product Type admin pages (list/new/edit) with category filter"
```

---

## Task 14: End-to-end smoke test

**Goal:** Verify the complete flow works: login → list → create → edit → delete → auth guards → seed upsert.

- [ ] **Step 1: Restart services to pick up backend changes**

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend frontend
```

Wait ~10 seconds, then verify health:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

Expected: backend and frontend show `Up ... (healthy)`.

- [ ] **Step 2: Login and get cookie**

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = '{"email":"admin@unowire.com","password":"admin123456"}'
$r = Invoke-WebRequest -Uri http://localhost:8080/api/admin/auth/login -Method POST -Body $body -ContentType 'application/json' -WebSession $session -UseBasicParsing
"Login: $($r.StatusCode)"
$session.Cookies.GetCookies('http://localhost:8080') | ForEach-Object { "Cookie: $($_.Name)=$($_.Value.Substring(0,20))... HttpOnly=$($_.HttpOnly)" }
```

Expected: `Login: 200` and `Cookie: admin_token=... HttpOnly=True`.

- [ ] **Step 3: Test Industry list page**

```powershell
$r = Invoke-WebRequest -Uri 'http://localhost:8080/admin/taxonomy/industries' -WebSession $session -UseBasicParsing
"Industry list: $($r.StatusCode), length: $($r.Content.Length)"
```

Expected: `200`, length > 1000.

- [ ] **Step 4: Test Category list page**

```powershell
$r = Invoke-WebRequest -Uri 'http://localhost:8080/admin/taxonomy/categories' -WebSession $session -UseBasicParsing
"Category list: $($r.StatusCode), length: $($r.Content.Length)"
```

Expected: `200`.

- [ ] **Step 5: Test Product Type list page**

```powershell
$r = Invoke-WebRequest -Uri 'http://localhost:8080/admin/taxonomy/product-types' -WebSession $session -UseBasicParsing
"ProductType list: $($r.StatusCode), length: $($r.Content.Length)"
```

Expected: `200`.

- [ ] **Step 6: Test unauthenticated access to admin page**

```powershell
try {
  $r = Invoke-WebRequest -Uri 'http://localhost:8080/admin/taxonomy/industries' -MaximumRedirection 0 -UseBasicParsing
  "FAIL: expected redirect, got $($r.StatusCode)"
} catch {
  "Unauth admin page: $($_.Exception.Response.StatusCode) (expected 307)"
}
```

Expected: `307` redirect to login.

- [ ] **Step 7: Test unauthenticated POST to backend**

```powershell
try {
  $body = '{"id":"test","label":"Test","slug":"test"}'
  $r = Invoke-WebRequest -Uri 'http://localhost:8000/api/industries' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing
  "FAIL: expected 401, got $($r.StatusCode)"
} catch {
  "Unauth POST /api/industries: $($_.Exception.Response.StatusCode) (expected 401)"
}
```

Expected: `401`.

- [ ] **Step 8: Test seed upsert dry-run**

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend python -m scripts.seed --dry-run 2>&1 | Select-String -Pattern 'Taxonomy upsert'
```

Expected: `Taxonomy upsert: 0 created, N updated` (N > 0).

- [ ] **Step 9: Test edit page for an existing product type**

Pick a real product type ID from the list (e.g., `consumer_electronics/internal_wiring/electronic_wire`):

```powershell
$ptId = 'consumer_electronics%2Finternal_wiring%2Felectronic_wire'
$r = Invoke-WebRequest -Uri "http://localhost:8080/admin/taxonomy/product-types/$ptId" -WebSession $session -UseBasicParsing
"ProductType edit: $($r.StatusCode), has JSON editor: $($r.Content -match 'id=""filters""')"
```

Expected: `200`, `has JSON editor: True`.

- [ ] **Step 10: Commit final state**

If all tests pass, no code changes needed. Otherwise, fix issues and commit fixes.

```bash
git add -A
git commit -m "test: smoke test admin taxonomy management"
```

(Only commit if there are actual changes. If smoke test passes without fixes, skip this step.)

---

## Task Dependencies

- Task 1 (backend auth) — no deps
- Task 2 (seed upsert) — no deps
- Task 3 (adminApi namespace) — depends on Task 1 (auth guards must exist for write methods to work)
- Task 4 (sidebar link) — no deps
- Task 5 (industries proxies) — no deps
- Task 6 (categories proxies) — no deps
- Task 7 (product-types proxies) — no deps
- Task 8 (IndustryForm) — no deps
- Task 9 (industry pages) — depends on Task 8
- Task 10 (CategoryForm) — no deps
- Task 11 (category pages) — depends on Task 10, Task 3 (for `adminApi.taxonomy.industries.all()`)
- Task 12 (ProductTypeForm) — no deps
- Task 13 (product type pages) — depends on Task 12, Task 3
- Task 14 (smoke test) — depends on all prior tasks

**Parallelizable:**
- Tasks 1, 2, 4, 5, 6, 7 can all run in parallel (independent)
- Tasks 8, 10, 12 (form components) can run in parallel
- Tasks 9, 11, 13 (page files) depend on their respective form components but can run in parallel with each other once forms exist

## Self-Review

**Spec coverage check:**
- ✅ Auth guards on 3 backend route files → Task 1
- ✅ Seed upsert + truncate_all change → Task 2
- ✅ adminApi.taxonomy namespace → Task 3
- ✅ AdminSidebar nav link → Task 4
- ✅ API route proxies (3 sets) → Tasks 5, 6, 7
- ✅ IndustryForm + list/new/edit → Tasks 8, 9
- ✅ CategoryForm + list/new/edit (with industry filter) → Tasks 10, 11
- ✅ ProductTypeForm with filters JSON editor + list/new/edit → Tasks 12, 13
- ✅ Cross-level navigation (Industry row → "View Categories →", breadcrumb on edit pages) → Tasks 9, 11, 13
- ✅ Delete protection (RESTRICT → 409, surfaced via error message) → Tasks 8, 10, 12 (error display in forms)
- ✅ Smoke test → Task 14

**Placeholder scan:** No TBD/TODO. All steps have complete code.

**Type consistency:**
- `BackendIndustry`, `BackendCategory`, `BackendProductType` interfaces defined in Task 3 and used consistently
- Composite ID format `industry/category/product_type` handled consistently in proxies and forms
- `encodeURIComponent` used in all URL constructions
- Form prop shapes match what page components pass

**Scope check:** Focused on a single implementation cycle. No sub-project decomposition needed.
