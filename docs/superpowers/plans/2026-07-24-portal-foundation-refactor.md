---
change: portal-foundation-refactor
design-doc: docs/superpowers/specs/2026-07-24-portal-foundation-refactor-design.md
base-ref: b25bcb5c5841aedd5406a9fa422ac825727d9a37
---

# Portal Foundation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the manufacturer portal foundation — replace all `any` types with shared TypeScript interfaces, unify portal writes through a typed client-side `portalApiClient`, make every portal page resilient to expired tokens and backend errors, add inline form validation, wire `allowed_modules` to the sidebar, and consolidate the redundant `/api/portal/me` endpoint into `/api/portal/auth/me`.

**Architecture:** Two-layer API client. Server Components use `portalApi` (reads `portal_token` via `next/headers`). Client Components use a new `portalApiClient` (browser sends the httpOnly cookie automatically) that calls Next.js BFF routes under `/api/portal/*`, which forward the cookie as a Bearer token to FastAPI. The two client modules never share code (`next/headers` is server-only). A new `frontend/lib/types/portal.ts` holds all portal TypeScript interfaces. The layout reads an `x-pathname` request header set by middleware to drive server-side redirect on expired tokens.

**Tech Stack:** Next.js 15 App Router (Server + Client Components, `loading.tsx` streaming), TypeScript, FastAPI (async/await), Pydantic, PostgreSQL. No new npm dependencies.

**Design Doc:** `docs/superpowers/specs/2026-07-24-portal-foundation-refactor-design.md`

## Global Constraints

- Frontend MVP does NOT require automated tests — do NOT write new frontend test files. Frontend verification is `tsc --noEmit` + `npm run build` + manual smoke.
- Backend MUST keep `pytest backend/tests/` green — existing tests that reference removed endpoints must be migrated (not deleted) to avoid regressions.
- All code, comments, and docs in English.
- FastAPI backend: async/await for all middleware and routes (no callbacks).
- No new CRUD endpoints, no media upload UI, no DB migrations, no form field expansion, no new npm packages (zod, react-hook-form, etc.). These belong to later changes — flag as out-of-scope if encountered.
- TypeScript interfaces in `portal.ts` MUST match the actual backend Pydantic schemas / route responses exactly — NOT the Design Doc's draft interfaces (see "Schema Discrepancies" below). Mismatches are fixed in `portal.ts`, never in the backend.

## Schema Discrepancies (Design Doc vs. Actual Backend)

The Design Doc's "Type System" section contains DRAFT interfaces that do NOT match the verified backend contracts. The implementer MUST use the corrected interfaces shown in Task 1, which are derived from these backend sources:

| Interface | Backend source | Design Doc error | Correction |
|-----------|----------------|------------------|------------|
| `PortalCable` | `backend/app/schemas/cable.py` `CableRead` | `id: number`, `manufacturer_id: number` | `id: string`, `manufacturer_id: string`; also missing `product_type_id`, `industry_id`, `category_id`, `size_system`, `meta_title`, `meta_description`, `image_url`, `common_specs`, `variants` |
| `PortalEquipment` | `backend/app/schemas/equipment.py` `RecommendedEquipmentRead` | `id: number`, `manufacturer_id: number` | `id: string`, `manufacturer_id: string`, `category_id: string`; also missing `applicable_specs`, `image_url`, `external_url`, `sort_order`, `category` |
| `PortalInquiry` | `backend/app/schemas/inquiry.py` `InquiryRead` | missing `is_member_read` | add `is_member_read: boolean` |
| `PortalFolder` | `backend/app/api/routes/portal_media.py` `list_folders` response | `manufacturer_id: number`, `created_at: string` | backend returns `{ id, name, parent_id, scope_type, scope_id, upload_count }` — NO `manufacturer_id`, NO `created_at` |
| `PortalUpload` | `backend/app/api/routes/portal_media.py` `list_uploads` response | `url`, `size`, `mime_type`, `manufacturer_id` | backend returns `{ id, filename, url_path, folder_id, created_at }` — field is `url_path` (not `url`); no `size`/`mime_type`/`manufacturer_id` |
| `PortalPermissions` | `backend/app/api/routes/portal_auth.py` `portal_my_permissions` | `extends PortalUser` (implies `id`) | backend returns `user_id` (NOT `id`); must be its own interface, not an extension of `PortalUser` |
| `PortalUser` | `backend/app/api/routes/portal_auth.py` `portal_me` | `role_name: string`, `scope_type: PortalScopeType`, `scope_id: string` (non-null) | backend can return `null` when `user.role` is None — use `string \| null` / `PortalScopeType \| null` |

The portal cables/equipment update PUT endpoints accept `CableUpdate` / `RecommendedEquipmentUpdate` (all fields optional). `PortalCableUpdate` / `PortalEquipmentUpdate` are intentionally narrow subsets (`model` + description) matching what the edit forms submit.

## Pre-Removal Grep — `/api/portal/me` References

A full-repo grep (excluding `node_modules`, `.next`, `.git`) was run during planning. Code references that MUST be migrated or removed in Task 5:

| # | File:line | Reference | Action |
|---|-----------|-----------|--------|
| 1 | `backend/app/api/routes/portal_me.py:11` | `prefix="/api/portal/me"` (the router) | DELETE the file (Task 5) |
| 2 | `backend/tests/api/test_portal_me.py` (lines 6, 16, 24, 33, 41) | `client.get/put("/api/portal/me")` | Migrate assertions to `/api/portal/auth/me` GET + PUT (Task 5) |
| 3 | `frontend/lib/portalApi.ts:120-131` | `portalApi.me.get()` → `/api/portal/me` | REMOVE the `me` block (Task 5) |
| 4 | `frontend/app/portal/settings/page.tsx:7` | `me = await portalApi.me.get()` | Migrate to `portalApi.auth.me()` (Task 5) — **not enumerated in Design Doc** |
| 5 | `frontend/app/api/portal/me/route.ts` (lines 7, 17) | BFF route forwarding to backend `/api/portal/me` | DELETE file + directory (Task 5) |
| 6 | `frontend/components/portal/form/ChangePasswordForm.tsx:16` | `fetch('/api/portal/me', { method: 'PUT' })` | Migrate to `portalApiClient.auth.changePassword()` → `/api/portal/auth/me` PUT (Task 6) |

Documentation-only references (historical specs/plans/openspec/.comet) require NO migration: `docs/superpowers/specs/2026-07-21-portal-separation-design.md`, `docs/superpowers/plans/2026-07-21-portal-separation.md`, `openspec/changes/portal-foundation-refactor/**`, `.comet/**`.

---

## File Structure

**New files:**
- `frontend/lib/types/portal.ts` — all portal TypeScript interfaces (single source of truth).
- `frontend/lib/portalApiClient.ts` — client-side typed write layer + `PortalApiError`.
- `frontend/app/portal/loading.tsx` — dashboard skeleton.
- `frontend/app/portal/cables/loading.tsx` — table skeleton.
- `frontend/app/portal/equipment/loading.tsx` — table skeleton.
- `frontend/app/portal/inquiries/loading.tsx` — card list skeleton.
- `frontend/app/portal/media/loading.tsx` — grid skeleton.
- `frontend/components/portal/PortalDashboardErrorState.tsx` — small client component (error + Retry).
- `frontend/components/portal/PortalDashboardContent.tsx` — dashboard render extracted from `page.tsx`.

**Modified files:**
- `frontend/lib/portalApi.ts` — typed returns, remove `any`, remove `me` block.
- `frontend/middleware.ts` — add `x-pathname` request header.
- `frontend/app/portal/layout.tsx` — parallel `me()` + `permissions()`, redirect on null user, pass `allowedModules` prop.
- `frontend/app/portal/page.tsx` — try/catch around `dashboard.get()`, redirect on auth failure, error state on backend error.
- `frontend/app/portal/settings/page.tsx` — replace `portalApi.me.get()` with `portalApi.auth.me()`.
- `frontend/components/portal/layout/PortalSidebar.tsx` — accept `allowedModules` prop, filter nav by `allowed_modules`.
- `frontend/components/portal/form/CableEditForm.tsx` — `portalApiClient` + inline validation.
- `frontend/components/portal/form/EquipmentEditForm.tsx` — `portalApiClient` + inline validation.
- `frontend/components/portal/form/ReplyForm.tsx` — `portalApiClient` + inline validation.
- `frontend/components/portal/form/ChangePasswordForm.tsx` — `portalApiClient` + inline validation.
- `frontend/app/api/portal/auth/me/route.ts` — add `PUT` handler (password change).
- `frontend/app/portal/cables/page.tsx`, `equipment/page.tsx`, `inquiries/page.tsx`, `media/page.tsx` — consistent `empty-state` styling + typed arrays.
- `backend/app/api/routes/portal_auth.py` — add `PUT /me` (change password) + `ChangePasswordRequest`.
- `backend/app/main.py` — unregister `portal_me.router` (remove import + `include_router`).
- `backend/tests/api/test_portal_me.py` — migrate assertions to `/api/portal/auth/me`.

**Deleted files:**
- `backend/app/api/routes/portal_me.py`
- `frontend/app/api/portal/me/route.ts` (and the empty `me/` directory)

---

## Task 1: Portal TypeScript Types

**Files:**
- Create: `frontend/lib/types/portal.ts`

**Interfaces:**
- Produces: `PortalScopeType`, `PortalUser`, `PortalPermissions`, `PortalDashboardStats`, `PortalDashboard`, `PortalCable`, `PortalCableUpdate`, `PortalEquipment`, `PortalEquipmentUpdate`, `PortalInquiry`, `PortalFolder`, `PortalUpload`, `PortalUploadsResponse` — consumed by Tasks 2, 3, 6, 8.

- [ ] **Step 1: Create `frontend/lib/types/portal.ts` with corrected interfaces**

Use these EXACT interfaces (they override the Design Doc's draft — see "Schema Discrepancies"). They match the verified backend schemas in `backend/app/schemas/{cable,equipment,inquiry,folder}.py` and the route responses in `backend/app/api/routes/portal_{auth,dashboard,media,cables,equipment,inquiries}.py`.

```typescript
export type PortalScopeType = 'manufacturer' | 'equipment_manufacturer';

export interface PortalUser {
  id: number;
  email: string;
  role_id: string;
  role_name: string | null;
  scope_type: PortalScopeType | null;
  scope_id: string | null;
}

// NOTE: backend /api/portal/auth/me/permissions returns `user_id` (not `id`),
// so this is its own interface — it does NOT extend PortalUser.
export interface PortalPermissions {
  user_id: number;
  email: string;
  role_id: string;
  role_name: string | null;
  scope_type: PortalScopeType | null;
  scope_id: string | null;
  allowed_modules: string[];
}

export interface PortalDashboardStats {
  cables_count?: number;
  equipment_count?: number;
  views_total: number;
  views_trend_30d: number;
  inquiries_total: number;
  inquiries_unread: number;
}

export interface PortalDashboard {
  factory_name: string;
  scope_type: string;
  stats: PortalDashboardStats;
  inquiry_trend: { date: string; count: number }[];
  views_trend: { date: string; count: number }[];
  recent_inquiries: {
    id: number;
    subject: string;
    created_at: string | null;
    is_read: boolean;
  }[];
}

// Matches backend CableRead (backend/app/schemas/cable.py).
// id / manufacturer_id are `string` (BigInteger stored as str in the schema).
export interface PortalCable {
  id: string;
  model: string;
  slug: string;
  base_description: string | null;
  manufacturer_id: string;
  product_type_id: string;
  industry_id: string;
  category_id: string;
  size_system: string;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  manufacturer: { id: string; name: string } | null;
  common_specs: unknown[];
  variants: unknown[];
  created_at: string;
  updated_at: string;
}

// Narrow subset of backend CableUpdate that the edit form submits.
export interface PortalCableUpdate {
  model?: string;
  base_description?: string | null;
}

// Matches backend RecommendedEquipmentRead (backend/app/schemas/equipment.py).
export interface PortalEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: unknown[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: { id: string; name: string; slug: string } | null;
  category: { id: string; label: string; slug: string } | null;
  created_at: string;
  updated_at: string;
}

// Narrow subset of backend RecommendedEquipmentUpdate that the edit form submits.
export interface PortalEquipmentUpdate {
  model?: string;
  description?: string | null;
}

// Matches backend InquiryRead (backend/app/schemas/inquiry.py).
export interface PortalInquiry {
  id: number;
  sender_id: number;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;
  subject: string;
  body: string;
  reply_body: string | null;
  replied_at: string | null;
  replied_by: number | null;
  is_read: boolean;
  is_member_read: boolean;
  created_at: string;
}

// Matches the dict returned by GET /api/portal/folders (portal_media.py list_folders).
export interface PortalFolder {
  id: number;
  name: string;
  parent_id: number | null;
  scope_type: string;
  scope_id: string;
  upload_count: number;
}

// Matches the item dict returned by GET /api/portal/uploads (portal_media.py list_uploads).
export interface PortalUpload {
  id: number;
  filename: string;
  url_path: string;
  folder_id: number | null;
  created_at: string | null;
}

export interface PortalUploadsResponse {
  items: PortalUpload[];
  total: number;
  page: number;
  page_size: number;
}
```

- [x] **Step 2: Verify types compile in isolation**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (the new file is pure type declarations; nothing imports it yet, so it must not introduce errors).

- [x] **Step 3: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(portal): add typed portal interfaces matching backend schemas"
```

**Acceptance criteria:** `portal-api-layer/spec.md` Requirement "Portal API SHALL use typed interfaces for all responses" (typed cable, dashboard, inquiry responses). The interfaces match backend schemas exactly (string ids for cable/equipment, `url_path` for uploads, `user_id` for permissions, `is_member_read` for inquiries).

---

## Task 2: Server-Side `portalApi` Type Safety

**Files:**
- Modify: `frontend/lib/portalApi.ts` (full file)

**Interfaces:**
- Consumes: `PortalUser`, `PortalPermissions`, `PortalDashboard`, `PortalCable`, `PortalEquipment`, `PortalInquiry`, `PortalFolder`, `PortalUpload`, `PortalUploadsResponse` from Task 1.
- Produces: a typed `portalApi` server module consumed by `layout.tsx`, `page.tsx`, list pages, `settings/page.tsx`. The `me` block is REMOVED here (callers use `portalApi.auth.me()`).

- [ ] **Step 1: Replace the inline `auth.me()` return type with `PortalUser`**

In `frontend/lib/portalApi.ts`, add an import at the top:

```typescript
import type {
  PortalUser,
  PortalPermissions,
  PortalDashboard,
  PortalCable,
  PortalEquipment,
  PortalInquiry,
  PortalFolder,
  PortalUpload,
  PortalUploadsResponse,
} from '@/lib/types/portal';
```

Change `auth.me()` to return `Promise<PortalUser | null>`:

```typescript
async me(): Promise<PortalUser | null> {
  try {
    return await portalGet<PortalUser>('/api/portal/auth/me');
  } catch {
    return null;
  }
},
```

- [ ] **Step 2: Replace `auth.permissions()` return type with `PortalPermissions`**

```typescript
async permissions(): Promise<PortalPermissions | null> {
  try {
    return await portalGet<PortalPermissions>('/api/portal/auth/me/permissions');
  } catch {
    return null;
  }
},
```

- [ ] **Step 3: Replace `dashboard.get()` return type with `PortalDashboard`**

```typescript
async get(): Promise<PortalDashboard> {
  return portalGet<PortalDashboard>('/api/portal/dashboard');
},
```

- [ ] **Step 4: Replace `cables` methods' `any` with `PortalCable`**

```typescript
cables: {
  async all(): Promise<PortalCable[]> {
    return portalGet<PortalCable[]>('/api/portal/cables');
  },
  async getById(id: string): Promise<PortalCable> {
    return portalGet<PortalCable>(`/api/portal/cables/${id}`);
  },
},
```

- [ ] **Step 5: Replace `equipment` methods' `any` with `PortalEquipment`**

```typescript
equipment: {
  async all(): Promise<PortalEquipment[]> {
    return portalGet<PortalEquipment[]>('/api/portal/equipment');
  },
  async getById(id: string): Promise<PortalEquipment> {
    return portalGet<PortalEquipment>(`/api/portal/equipment/${id}`);
  },
},
```

- [ ] **Step 6: Replace `inquiries` methods' `any` with `PortalInquiry`**

```typescript
inquiries: {
  async all(): Promise<PortalInquiry[]> {
    return portalGet<PortalInquiry[]>('/api/portal/inquiries');
  },
  async unreadCount(): Promise<{ count: number }> {
    return portalGet<{ count: number }>('/api/portal/inquiries/unread-count');
  },
  async getById(id: number): Promise<PortalInquiry> {
    return portalGet<PortalInquiry>(`/api/portal/inquiries/${id}`);
  },
},
```

- [ ] **Step 7: Replace `folders.all()` and `uploads.all()` return types**

```typescript
folders: {
  async all(): Promise<PortalFolder[]> {
    return portalGet<PortalFolder[]>('/api/portal/folders');
  },
},
uploads: {
  async all(): Promise<PortalUploadsResponse> {
    return portalGet<PortalUploadsResponse>('/api/portal/uploads');
  },
},
```

- [ ] **Step 8: Remove the `me` block**

Delete the entire `me: { async get() { ... } }` block from `portalApi`. This removes the `/api/portal/me` caller from `portalApi.ts`. (The settings page caller is migrated in Task 5; do NOT remove the `me` block until Task 5 migrates that caller — but since Task 5 runs after Task 2, this step would break `settings/page.tsx` at type-check. To keep each task independently green, defer the actual deletion of the `me` block to Task 5 Step 2. Instead, here, ONLY re-type the `me.get()` return to `PortalUser` so it stays consistent:)

```typescript
me: {
  async get(): Promise<PortalUser> {
    return portalGet<PortalUser>('/api/portal/me');
  },
},
```

> **Note:** The `me` block is fully removed in Task 5 after its caller (`settings/page.tsx`) is migrated. Keeping it typed here avoids a broken intermediate state.

- [ ] **Step 9: Verify `portalApi.ts` has zero `any` remaining**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors. (The list pages currently consume `any[]` from these methods; re-typing them may surface type errors in `cables/page.tsx`, `equipment/page.tsx`, `inquiries/page.tsx`, `media/page.tsx` because they read fields off `any`. Since `any` was previously returned, the call sites used untyped access. After re-typing, fix any compile errors in those list pages by reading only fields that exist on the new interfaces — they already do: `c.id`, `c.model`, `c.slug`, `c.manufacturer?.name`, `c.created_at`, `inq.id`, `inq.subject`, `inq.body`, `inq.is_read`, `inq.created_at`, `f.id`, `f.name`, `f.upload_count`, `u.id`, `u.filename`, `u.url_path`. All these fields exist on the Task 1 interfaces.)

If `tsc` reports errors in list pages, fix them in this step (they will be field-access fixes only — no logic changes).

- [ ] **Step 10: Commit**

```bash
git add frontend/lib/portalApi.ts frontend/app/portal/cables/page.tsx frontend/app/portal/equipment/page.tsx frontend/app/portal/inquiries/page.tsx frontend/app/portal/media/page.tsx
git commit -m "refactor(portal): replace any types in portalApi with shared interfaces"
```

**Acceptance criteria:** `portal-api-layer/spec.md` — "No `any` types SHALL remain in portal API code"; scenarios "Typed cable response", "Typed dashboard response", "Typed inquiry response".

---

## Task 3: Client-Side `portalApiClient` + `PortalApiError`

**Files:**
- Create: `frontend/lib/portalApiClient.ts`

**Interfaces:**
- Consumes: `PortalCable`, `PortalCableUpdate`, `PortalEquipment`, `PortalEquipmentUpdate`, `PortalInquiry` from Task 1. The BFF write routes (`/api/portal/cables/[id]` PUT, `/api/portal/equipment/[id]` PUT, `/api/portal/inquiries/[id]/reply` POST) already exist and forward the cookie — verify only. The `/api/portal/auth/me` PUT BFF handler is added in Task 5; `portalApiClient.auth.changePassword` calls it and will work once Task 5 lands.
- Produces: `PortalApiError` class and `portalApiClient` object consumed by all four forms in Task 6.

- [ ] **Step 1: Create `frontend/lib/portalApiClient.ts`**

```typescript
import type {
  PortalCable,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentUpdate,
  PortalInquiry,
} from '@/lib/types/portal';

export class PortalApiError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }
}

async function bffFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new PortalApiError(
      res.status,
      data.code ?? res.status,
      data.message ?? 'Request failed',
      data.field_errors,
    );
  }
  return res;
}

export const portalApiClient = {
  cables: {
    async update(id: string, data: PortalCableUpdate): Promise<PortalCable> {
      const res = await bffFetch(`/api/portal/cables/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  equipment: {
    async update(id: string, data: PortalEquipmentUpdate): Promise<PortalEquipment> {
      const res = await bffFetch(`/api/portal/equipment/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  inquiries: {
    async reply(id: number, replyBody: string): Promise<PortalInquiry> {
      const res = await bffFetch(`/api/portal/inquiries/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply_body: replyBody }),
      });
      return res.json();
    },
  },
  auth: {
    async changePassword(oldPassword: string, newPassword: string): Promise<void> {
      await bffFetch('/api/portal/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
    },
  },
};
```

- [ ] **Step 2: Verify the BFF write routes that `portalApiClient` depends on exist**

Confirm these files exist (they do, per planning): `frontend/app/api/portal/cables/[id]/route.ts` (PUT), `frontend/app/api/portal/equipment/[id]/route.ts` (PUT), `frontend/app/api/portal/inquiries/[id]/reply/route.ts` (POST). No changes needed — they already forward the `portal_token` cookie as Bearer and proxy the response. The `/api/portal/auth/me` PUT handler is added in Task 5.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/portalApiClient.ts
git commit -m "feat(portal): add typed client-side portalApiClient and PortalApiError"
```

**Acceptance criteria:** `portal-api-layer/spec.md` Requirement "Portal write operations SHALL go through unified BFF client"; scenarios "Cable update via portalApiClient", "Inquiry reply via portalApiClient" (payload `{ reply_body: string }`), "Password change via portalApiClient".

---

## Task 4: Backend Endpoint Consolidation — Add `PUT /api/portal/auth/me`

**Files:**
- Modify: `backend/app/api/routes/portal_auth.py` (add `ChangePasswordRequest` + `PUT /me` handler)

**Interfaces:**
- Consumes: existing `get_current_factory_user` dep, `verify_password` / `hash_password` from `app.core.security`.
- Produces: `PUT /api/portal/auth/me` (password change) — consumed by the BFF route added in Task 5 and by `portalApiClient.auth.changePassword`.

- [ ] **Step 1: Add `ChangePasswordRequest` schema and `PUT /me` handler to `portal_auth.py`**

At the top of `backend/app/api/routes/portal_auth.py`, add imports (merge with existing imports — `hash_password` is new; `verify_password` is already imported):

```python
from app.core.security import create_access_token, hash_password, verify_password
from app.core.database import get_db
```

Add `AsyncSession` to the existing `sqlalchemy.ext.asyncio` import if not present (it is present). Then append the new handler below the existing `portal_my_permissions` handler:

```python
class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.put("/me")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_factory_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Current password is incorrect"})
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail={"code": 400, "message": "Password must be at least 8 characters"})
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    await db.commit()
    return {"ok": True}
```

This is the exact logic moved verbatim from `portal_me.py` (same `ChangePasswordRequest` shape, same 400 errors, same `verify_password` / `hash_password` calls).

- [ ] **Step 2: Verify the new endpoint works in isolation (before removing the old one)**

Run backend tests for portal auth if any exist, then run the full suite:

```bash
pytest backend/tests/ -k portal
```
Expected: all pass. (`portal_me.py` still exists at this point, so existing `test_portal_me.py` tests still pass against the old endpoint; the new endpoint is additive.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/portal_auth.py
git commit -m "feat(portal): add PUT /api/portal/auth/me for password change"
```

**Acceptance criteria:** `portal-api-layer/spec.md` scenario "Password change after consolidation" (request goes to `PUT /api/portal/auth/me`). Backend tests still green.

---

## Task 5: Remove `/api/portal/me` — Backend Route, BFF Route, `portalApi.me`, and Migrate All Callers

**Files:**
- Modify: `backend/app/main.py` (unregister `portal_me.router`)
- Modify: `backend/tests/api/test_portal_me.py` (migrate assertions to `/api/portal/auth/me`)
- Modify: `frontend/lib/portalApi.ts` (remove `me` block)
- Modify: `frontend/app/portal/settings/page.tsx` (use `portalApi.auth.me()`)
- Delete: `backend/app/api/routes/portal_me.py`
- Delete: `frontend/app/api/portal/me/route.ts` (and empty `me/` directory)
- Create: `frontend/app/api/portal/auth/me/route.ts` (add `PUT` handler next to existing `GET`)

**Interfaces:**
- Consumes: `PUT /api/portal/auth/me` from Task 4; `PortalUser` from Task 1.
- Produces: a single `/api/portal/auth/me` endpoint pair (GET profile, PUT password) on both backend and BFF; no remaining `/api/portal/me` code references.

- [ ] **Step 1: Migrate `backend/tests/api/test_portal_me.py` to `/api/portal/auth/me`**

Open `backend/tests/api/test_portal_me.py`. Every `client.get("/api/portal/me", ...)` becomes `client.get("/api/portal/auth/me", ...)` (profile). Every `client.put("/api/portal/me", ...)` becomes `client.put("/api/portal/auth/me", ...)` (password change). Keep all assertions and headers identical. If the file's test names reference `portal_me`, rename them to `portal_auth_me` for clarity (e.g. `test_get_me` → `test_auth_get_me`). Do not change assertion logic — only the URL path (and optionally test names).

If a `test_portal_auth.py` already covers `GET /api/portal/auth/me`, merge the migrated PUT assertions into it and delete `test_portal_me.py` instead of leaving a duplicate. Check `backend/tests/api/` for an existing portal_auth test file first; otherwise keep the migrated `test_portal_me.py` (renamed in-place is fine).

- [ ] **Step 2: Run migrated backend tests**

Run: `pytest backend/tests/ -k portal`
Expected: all pass against `/api/portal/auth/me`.

- [ ] **Step 3: Remove `portal_me.py` and unregister its router**

Delete `backend/app/api/routes/portal_me.py`. In `backend/app/main.py`:
- Remove `portal_me` from the import on line 12 (the long `from app.api.routes import (...)` tuple).
- Remove the line `app.include_router(portal_me.router)` (line 119).

- [ ] **Step 4: Run full backend suite to confirm no regressions**

Run: `pytest backend/tests/`
Expected: all pass, no import errors, no 404s from tests still hitting the old path.

- [ ] **Step 5: Remove the `me` block from `frontend/lib/portalApi.ts`**

Delete the entire `me: { async get() { ... } }` block (the one re-typed in Task 2 Step 8). `portalApi` no longer exposes a `me` namespace.

- [ ] **Step 6: Migrate `frontend/app/portal/settings/page.tsx` to `portalApi.auth.me()`**

Change line 7 from `me = await portalApi.me.get();` to `me = await portalApi.auth.me();`. The local `me` variable becomes `PortalUser | null` (already typed as `any` — change the declaration to `let me: PortalUser | null = null;` and add the import `import type { PortalUser } from '@/lib/types/portal';`). The JSX already reads `me.email`, `me.role_name`, `me.scope_type`, `me.scope_id` — all exist on `PortalUser`. Wrap in the existing try/catch (it already has one).

- [ ] **Step 7: Delete the old BFF route**

Delete `frontend/app/api/portal/me/route.ts` and the now-empty `frontend/app/api/portal/me/` directory.

- [ ] **Step 8: Add `PUT` handler to `frontend/app/api/portal/auth/me/route.ts`**

The existing file has a `GET` handler. Add a `PUT` handler that forwards the cookie + body to the backend `PUT /api/portal/auth/me` (mirror the existing `cables/[id]/route.ts` PUT pattern):

```typescript
export async function PUT(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  const body = await req.json();
  const res = await fetch(`${API_BASE}/api/portal/auth/me`, {
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
```

Keep the existing `GET` handler and the existing `API_BASE` / imports unchanged.

- [ ] **Step 9: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors. (No remaining references to `portalApi.me` or `/api/portal/me` in frontend code.)

- [ ] **Step 10: Commit**

```bash
git add backend/app/main.py backend/tests/api/test_portal_me.py frontend/lib/portalApi.ts frontend/app/portal/settings/page.tsx frontend/app/api/portal/auth/me/route.ts
git rm backend/app/api/routes/portal_me.py frontend/app/api/portal/me/route.ts
git commit -m "refactor(portal): consolidate /api/portal/me into /api/portal/auth/me"
```

**Acceptance criteria:** `portal-api-layer/spec.md` Requirement "Portal API SHALL eliminate redundant /me endpoint"; scenarios "Profile retrieval after consolidation", "Password change after consolidation", "Old /api/portal/me endpoint removed" (GET `/api/portal/me` → 404). `portal-error-resilience` unaffected. Backend tests green.

---

## Task 6: Forms — Migrate to `portalApiClient` + Inline Validation

**Files:**
- Modify: `frontend/components/portal/form/CableEditForm.tsx`
- Modify: `frontend/components/portal/form/EquipmentEditForm.tsx`
- Modify: `frontend/components/portal/form/ReplyForm.tsx`
- Modify: `frontend/components/portal/form/ChangePasswordForm.tsx`

**Interfaces:**
- Consumes: `portalApiClient`, `PortalApiError` from Task 3; `PortalCable`, `PortalEquipment` from Task 1.
- Produces: four forms that validate inline before submit and map `PortalApiError.fieldErrors` to per-field messages.

**Shared pattern (apply to every form):** add `const [errors, setErrors] = useState<Record<string, string>>({});`. Add a `validate()` returning boolean. On submit, call `validate()`; if false, return without calling the API. In the `catch`, if `err instanceof PortalApiError && err.fieldErrors`, `setErrors(err.fieldErrors)`; else if `err instanceof PortalApiError`, set the form-level message to `err.message`; else set form-level message to `'Network error'`. Render `{errors.<field> && <p className="mt-1 text-sm text-red-600">{errors.<field>}</p>}` below each validated field.

- [ ] **Step 1: Refactor `CableEditForm.tsx`**

Change the prop type from `{ cable }: { cable: any }` to `{ cable }: { cable: PortalCable }` (import `PortalCable` from `@/lib/types/portal`). Replace the `handleSave` body:

```typescript
import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalCable } from '@/lib/types/portal';

export function CableEditForm({ cable }: { cable: PortalCable }) {
  const [model, setModel] = useState(cable.model ?? '');
  const [baseDescription, setBaseDescription] = useState(cable.base_description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!model.trim()) e.model = 'Model is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, { model, base_description: baseDescription });
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }
  // ... existing JSX, but add below the Model input:
  // {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
}
```

Add the inline error `<p>` below the Model input. Leave the Base Description field without validation (optional).

- [ ] **Step 2: Refactor `EquipmentEditForm.tsx`**

Same pattern. Prop type `{ equipment }: { equipment: PortalEquipment }`. Validation rule: `model` required.

```typescript
function validate(): boolean {
  const e: Record<string, string> = {};
  if (!model.trim()) e.model = 'Model is required';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSave() {
  if (!validate()) return;
  setSaving(true);
  setMessage('');
  setErrors({});
  try {
    await portalApiClient.equipment.update(equipment.id, { model, description });
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

Add inline error below the Model input.

- [ ] **Step 3: Refactor `ReplyForm.tsx`**

Validation rule: `reply_body` required (non-empty after trim). Replace the raw `fetch` with `portalApiClient.inquiries.reply(inquiryId, replyBody)`. The payload is `{ reply_body: replyBody }` (matches backend `InquiryReply` schema — `reply_body: str`). Keep `router.refresh()` on success.

```typescript
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

const [errors, setErrors] = useState<Record<string, string>>({});

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!replyBody.trim()) e.reply_body = 'Reply cannot be empty';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!validate()) return;
  setSaving(true);
  setErrors({});
  setError('');
  try {
    await portalApiClient.inquiries.reply(inquiryId, replyBody);
    router.refresh();
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else if (err instanceof PortalApiError) setError(err.message);
    else setError('Network error');
  } finally {
    setSaving(false);
  }
}
```

Render `{errors.reply_body && <p className="mt-1 text-sm text-red-600">{errors.reply_body}</p>}` below the textarea. (Keep the existing `error` form-level message for non-field errors.)

- [ ] **Step 4: Refactor `ChangePasswordForm.tsx`**

Validation rules: `old_password` required; `new_password` ≥ 8 chars; `new_password !== old_password`. Replace the raw `fetch('/api/portal/me', PUT)` with `portalApiClient.auth.changePassword(oldPassword, newPassword)` (which calls `/api/portal/auth/me` PUT — added in Task 5).

```typescript
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

const [errors, setErrors] = useState<Record<string, string>>({});

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!oldPassword) e.old_password = 'Current password is required';
  if (newPassword.length < 8) e.new_password = 'Password must be at least 8 characters';
  if (newPassword && newPassword === oldPassword) e.new_password = 'New password must differ from current password';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!validate()) return;
  setSaving(true);
  setMessage('');
  setErrors({});
  try {
    await portalApiClient.auth.changePassword(oldPassword, newPassword);
    setMessage('Password changed successfully');
    setOldPassword('');
    setNewPassword('');
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else if (err instanceof PortalApiError) setMessage(err.message);
    else setMessage('Network error');
  } finally {
    setSaving(false);
  }
}
```

Render `{errors.old_password && <p className="mt-1 text-sm text-red-600">{errors.old_password}</p>}` below the Current Password input, and `{errors.new_password && <p className="mt-1 text-sm text-red-600">{errors.new_password}</p>}` below the New Password input (in addition to the existing "Minimum 8 characters." hint).

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/portal/form/CableEditForm.tsx frontend/components/portal/form/EquipmentEditForm.tsx frontend/components/portal/form/ReplyForm.tsx frontend/components/portal/form/ChangePasswordForm.tsx
git commit -m "feat(portal): migrate forms to portalApiClient with inline validation"
```

**Acceptance criteria:** `portal-api-layer/spec.md` Requirement "Portal forms SHALL display inline validation errors"; scenarios "Cable edit form required field validation", "Password change form min length validation", "Reply form empty body validation". All four forms use `portalApiClient` (no raw `fetch`).

---

## Task 7: Loading States & Consistent Empty States

**Files:**
- Create: `frontend/app/portal/loading.tsx`
- Create: `frontend/app/portal/cables/loading.tsx`
- Create: `frontend/app/portal/equipment/loading.tsx`
- Create: `frontend/app/portal/inquiries/loading.tsx`
- Create: `frontend/app/portal/media/loading.tsx`
- Modify: `frontend/app/portal/cables/page.tsx`, `equipment/page.tsx`, `inquiries/page.tsx`, `media/page.tsx` (consistent `empty-state` styling)

**Interfaces:**
- Consumes: nothing (pure presentational skeletons).
- Produces: Next.js streaming skeletons for every portal route segment; consistent empty-state styling.

- [ ] **Step 1: Create `frontend/app/portal/loading.tsx` (dashboard skeleton)**

```tsx
export default function PortalDashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-white shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="h-64 animate-pulse rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/portal/cables/loading.tsx` (table skeleton)**

```tsx
export default function PortalCablesLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/portal/equipment/loading.tsx`**

Reuse the same skeleton markup as Step 2 (table with 5 placeholder rows).

- [ ] **Step 4: Create `frontend/app/portal/inquiries/loading.tsx` (card list skeleton)**

```tsx
export default function PortalInquiriesLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white shadow-sm" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/app/portal/media/loading.tsx` (grid skeleton)**

```tsx
export default function PortalMediaLoading() {
  return (
    <div>
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="lg:col-span-2 h-48 animate-pulse rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Standardize empty-state styling across list pages**

The four list pages already render a `<p className="text-sm text-gray-500">No X yet.</p>` empty state. Make the styling consistent by adding a shared `empty-state` class to each empty-state `<p>` and confirming the copy matches the spec:

- `cables/page.tsx`: `No cables in your scope yet.` (already correct — add `empty-state` class)
- `equipment/page.tsx`: `No equipment in your scope yet.` (add `empty-state` class)
- `inquiries/page.tsx`: `No inquiries yet.` (already correct — add `empty-state` class)
- `media/page.tsx`: `No folders.` / `No uploads.` (add `empty-state` class to both `<p>` elements)

Example: `<p className="empty-state text-sm text-gray-500">No cables in your scope yet.</p>`. Do NOT introduce a new `EmptyState` component — the existing `<p>` pattern is already consistent in structure; this step only adds the shared className and verifies copy.

- [ ] **Step 7: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/portal/loading.tsx frontend/app/portal/cables/loading.tsx frontend/app/portal/equipment/loading.tsx frontend/app/portal/inquiries/loading.tsx frontend/app/portal/media/loading.tsx frontend/app/portal/cables/page.tsx frontend/app/portal/equipment/page.tsx frontend/app/portal/inquiries/page.tsx frontend/app/portal/media/page.tsx
git commit -m "feat(portal): add loading skeletons and consistent empty states"
```

**Acceptance criteria:** `portal-error-resilience/spec.md` Requirement "Portal pages SHALL display loading states"; scenarios "Cables list loading", "Dashboard loading". Requirement "Portal pages SHALL display consistent empty states"; scenarios "No cables in scope", "No inquiries".

---

## Task 8: Token-Expiry Redirect & Dashboard Error Handling

**Files:**
- Modify: `frontend/middleware.ts` (add `x-pathname` header)
- Modify: `frontend/app/portal/layout.tsx` (redirect + parallel permissions fetch + `allowedModules` prop)
- Create: `frontend/components/portal/PortalDashboardContent.tsx` (extracted from `page.tsx`)
- Create: `frontend/components/portal/PortalDashboardErrorState.tsx` (client component)
- Modify: `frontend/app/portal/page.tsx` (try/catch + redirect + error state)

**Interfaces:**
- Consumes: `portalApi.auth.me()`, `portalApi.auth.permissions()` (both `| null`), `PortalDashboard` from Task 1, `PortalUser`/`PortalPermissions` from Task 1.
- Produces: server-side redirect to `/portal/login?from=<path>` on expired token; dashboard error UI on backend failure; `allowedModules` prop passed to sidebar (consumed in Task 9).

- [ ] **Step 1: Add `x-pathname` request header in `frontend/middleware.ts`**

The existing middleware returns `NextResponse.next()` at the end and `NextResponse.redirect(...)` in the no-cookie branches. Modify the final `return NextResponse.next();` to set the `x-pathname` header on the forwarded request. Replace the final `return NextResponse.next();` with:

```typescript
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-pathname', pathname);
return NextResponse.next({
  request: { headers: requestHeaders },
});
```

Do NOT change the existing redirect branches — they return early as before. `pathname` is already in scope (from `request.nextUrl`).

- [ ] **Step 2: Refactor `frontend/app/portal/layout.tsx` — parallel fetch + redirect + permissions prop**

```tsx
import { headers, redirect } from 'next/headers';
import { portalApi } from '@/lib/portalApi';
import { PortalSidebar } from '@/components/portal/layout/PortalSidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, perms] = await Promise.all([
    portalApi.auth.me(),
    portalApi.auth.permissions(),
  ]);
  const pathname = (await headers()).get('x-pathname') || '';

  if (!user && pathname !== '/portal/login') {
    redirect(`/portal/login?from=${encodeURIComponent(pathname)}`);
  }
  if (!user) {
    return <>{children}</>; // login page renders without sidebar
  }

  return (
    <div className="portal-shell flex min-h-screen">
      <PortalSidebar
        user={user}
        allowedModules={perms?.allowed_modules ?? []}
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

Notes: `user` is now `PortalUser | null`; pass it directly (the sidebar's `PortalUser` type will be updated in Task 9 to the shared `PortalUser` from `portal.ts`). `perms` is `PortalPermissions | null`.

- [ ] **Step 3: Create `frontend/components/portal/PortalDashboardContent.tsx`**

Extract the existing dashboard render from `frontend/app/portal/page.tsx` into a presentational component:

```tsx
import type { PortalDashboard } from '@/lib/types/portal';
import { DashboardStats } from '@/components/portal/DashboardStats';
import { InquiryTrendChart } from '@/components/portal/InquiryTrendChart';
import { ViewsTrendChart } from '@/components/portal/ViewsTrendChart';
import { RecentInquiries } from '@/components/portal/RecentInquiries';

export function PortalDashboardContent({ data }: { data: PortalDashboard }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.factory_name}</h1>
        <p className="text-sm text-gray-500">Factory Portal Dashboard</p>
      </div>
      <DashboardStats stats={data.stats} scopeType={data.scope_type} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InquiryTrendChart data={data.inquiry_trend} />
        <ViewsTrendChart data={data.views_trend} />
      </div>
      <RecentInquiries inquiries={data.recent_inquiries} />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/components/portal/PortalDashboardErrorState.tsx`**

Small client component with a Retry button that calls `router.refresh()`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function PortalDashboardErrorState() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <div className="rounded-lg bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-600">Failed to load dashboard data</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Refactor `frontend/app/portal/page.tsx` — try/catch + redirect + error state**

```tsx
import { redirect } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import type { PortalDashboard } from '@/lib/types/portal';
import { PortalDashboardContent } from '@/components/portal/PortalDashboardContent';
import { PortalDashboardErrorState } from '@/components/portal/PortalDashboardErrorState';

export default async function PortalDashboardPage() {
  let data: PortalDashboard;
  try {
    data = await portalApi.dashboard.get();
  } catch {
    const user = await portalApi.auth.me();
    if (!user) redirect('/portal/login?from=/portal');
    return <PortalDashboardErrorState />;
  }
  return <PortalDashboardContent data={data} />;
}
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors. (Note: the `PortalSidebar` prop signature change to accept `allowedModules` is applied in Task 9. If `tsc` errors here because `PortalSidebar` does not yet accept `allowedModules`, EITHER complete Task 9 Step 1 first in the same session OR temporarily pass the prop only after Task 9. To keep this task independently green, do Task 9 Step 1 immediately after Step 2 above — the two are coupled. Recommended order: Task 8 Step 2 → Task 9 Step 1 → Task 8 Steps 3–6.)

- [ ] **Step 7: Commit**

```bash
git add frontend/middleware.ts frontend/app/portal/layout.tsx frontend/app/portal/page.tsx frontend/components/portal/PortalDashboardContent.tsx frontend/components/portal/PortalDashboardErrorState.tsx frontend/components/portal/layout/PortalSidebar.tsx
git commit -m "feat(portal): redirect on expired token and handle dashboard errors"
```

**Acceptance criteria:** `portal-error-resilience/spec.md` Requirement "Portal pages SHALL handle expired tokens gracefully" (scenarios: expired token on dashboard, expired token on cable detail, login page does not redirect). Requirement "Portal dashboard SHALL not crash on backend errors" (scenarios: dashboard backend returns 500, dashboard token expired).

---

## Task 9: Permissions-Based Sidebar Gating

**Files:**
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx`

**Interfaces:**
- Consumes: `PortalUser` from Task 1, `allowedModules: string[]` prop from Task 8 layout.
- Produces: sidebar that filters nav items by `allowed_modules` (in addition to the existing `scope_type` selection).

- [ ] **Step 1: Update `PortalSidebar` to use the shared `PortalUser` type and filter nav by `allowedModules`**

Replace the local `PortalUser` interface with an import of the shared type, and add the `allowedModules` prop. Filter the selected nav list by `allowedModules.includes(item.module)`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Cable, Wrench, Mail, Image as ImageIcon,
  Settings, LogOut, ExternalLink, type LucideIcon,
} from 'lucide-react';
import type { PortalUser } from '@/lib/types/portal';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  module: string;
}

const MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Cables', href: '/portal/cables', icon: Cable, module: 'cables' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

const EQUIPMENT_MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Equipment', href: '/portal/equipment', icon: Wrench, module: 'equipment' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalSidebar({
  user,
  allowedModules,
}: {
  user: PortalUser | null;
  allowedModules: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState<number | null>(null);

  const scopeType = user?.scope_type ?? null;
  const baseNav = scopeType === 'equipment_manufacturer' ? EQUIPMENT_MANUFACTURER_NAV : MANUFACTURER_NAV;
  const nav = baseNav.filter((item) => allowedModules.includes(item.module));

  // ... keep the existing useEffect (fetchUnread) and handleLogout unchanged ...
  // ... keep the existing JSX; it already maps over `nav` ...
}
```

Keep the existing unread-count `useEffect` and `handleLogout` and the JSX `<nav>` map exactly as-is — only the `nav` computation and the prop signature change.

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/layout/PortalSidebar.tsx
git commit -m "feat(portal): gate sidebar nav by allowed_modules"
```

**Acceptance criteria:** `portal-error-resilience/spec.md` Requirement "Portal sidebar SHALL use permissions API for nav gating"; scenarios "Manufacturer with full permissions", "Manufacturer with restricted permissions".

---

## Task 10: Verification

**Files:** none (verification only)

- [ ] **Step 1: TypeScript type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Backend test suite**

Run: `pytest backend/tests/`
Expected: all tests pass, no regressions from the endpoint move (`test_portal_me.py` migrated in Task 5 runs against `/api/portal/auth/me`).

- [ ] **Step 3: Frontend production build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Smoke test — happy path**

Login as a `cable_manager` user. Verify:
- Dashboard loads at `/portal` (factory name, stats, charts, recent inquiries render).
- Open a cable, edit the Model field, click Save → "Saved" message appears.
- Open an inquiry, type a reply, click Send Reply → reply is sent, inquiry marked replied.
- Open Settings, change password (valid old + new ≥ 8 chars) → "Password changed successfully".

- [ ] **Step 5: Smoke test — token expiry**

Delete the `portal_token` cookie (devtools → Application → Cookies). Navigate to `/portal`, `/portal/cables`, `/portal/inquiries`. Verify each redirects to `/portal/login?from=<original-path>` (no 500, no sidebar-less bare page).

- [ ] **Step 6: Smoke test — permissions**

Login as a manufacturer user whose `allowed_modules` is `["dashboard", "cables", "me"]` (simulate by editing the role/scope or using a test fixture). Verify the sidebar shows only Dashboard, Cables, and Settings — Inquiries and Media are hidden.

- [ ] **Step 7: Smoke test — dashboard error**

With a valid `portal_token` cookie, stop the backend process (or point `INTERNAL_API_BASE` at a dead port). Reload `/portal`. Verify the dashboard shows "Failed to load dashboard data" with a Retry button (NOT a 500 page). Restart the backend, click Retry → dashboard loads.

- [ ] **Step 8: Smoke test — form validation**

- Cables: clear the Model field, click Save → inline "Model is required" error appears below the field; no API call is made (network tab shows no PUT).
- Equipment: same as cables.
- Reply: clear the reply textarea, click Send Reply → inline "Reply cannot be empty" error; no POST.
- Change Password: enter short new password (< 8 chars) → inline "Password must be at least 8 characters"; enter new password equal to old → inline "New password must differ from current password"; no PUT.

- [ ] **Step 9: Smoke test — `/api/portal/me` removed**

With the backend running, issue `GET /api/portal/me` (e.g. via curl or browser) → expect 404. `GET /api/portal/auth/me` with a valid token → 200 with profile JSON. `PUT /api/portal/auth/me` with `{ old_password, new_password }` → 200 `{ ok: true }`.

**Acceptance criteria:** All Design Doc "Testing & Verification Strategy" rows pass. Matches `portal-api-layer/spec.md` and `portal-error-resilience/spec.md` end-to-end.
