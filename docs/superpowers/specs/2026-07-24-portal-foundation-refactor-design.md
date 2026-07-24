---
comet_change: portal-foundation-refactor
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-24-portal-foundation-refactor
status: final
---

# Portal Foundation Refactor — Technical Design Doc

Deep technical refinement of the open-phase design.md for `portal-foundation-refactor`. This doc specifies implementation approach, edge cases, and verification strategy without rewriting the OpenSpec proposal/spec scope.

## Context Recap

The manufacturer portal was built as an MVP and has structural issues that block the next two changes (cable/equipment CRUD and media management). Codebase exploration confirmed:

- `frontend/lib/portalApi.ts`: `cables`, `equipment`, `inquiries.getById`, `folders.all`, `uploads.all` all return `any`. No write methods exist (writes are scattered as raw `fetch` inside client components).
- `frontend/app/portal/layout.tsx`: returns `<>{children}</>` (sidebar-less bare page) when `me()` returns null instead of redirecting to login.
- `frontend/app/portal/page.tsx`: `await portalApi.dashboard.get()` has no try/catch — throws 500 on expired token.
- `frontend/components/portal/form/{CableEditForm,EquipmentEditForm,ReplyForm,ChangePasswordForm}.tsx`: raw `fetch`, generic message-only error display, no per-field validation.
- `frontend/components/portal/layout/PortalSidebar.tsx`: selects nav by `scope_type`, ignores the fetched `allowed_modules`.
- `backend/app/api/routes/portal_me.py` (`/api/portal/me`) and `backend/app/api/routes/portal_auth.py` (`/api/portal/auth/me`) return identical profile data; password-change logic lives only in `portal_me.py`.
- `frontend/middleware.ts` already redirects no-cookie requests with `from` param — but cannot validate JWT, so expired-cookie case falls through to layout.

## Goals

- Replace all `any` types in `portalApi` with shared TypeScript interfaces
- Unify portal write operations through a typed `portalApiClient` (client-side) backed by BFF routes
- Make all portal pages resilient to expired tokens (redirect) and backend errors (error UI)
- Add inline form validation to all portal edit forms
- Wire `auth/me/permissions` to the sidebar for module-level nav gating
- Consolidate the redundant `/api/portal/me` endpoint into `/api/portal/auth/me`

## Non-Goals

- New CRUD capabilities (create/delete) — change 2
- Media upload UI — change 3
- Expanding edit form fields beyond current schema — change 2
- Admin portal changes
- Database schema changes
- New npm dependencies
- Automated frontend tests (per project constraint: frontend MVP does not require automated tests)

## Architecture

### Two-Layer API Client

```
┌─────────────────────────────────────────────────────────────┐
│  Server Components (layout, pages)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ portalApi (server-side, next/headers cookies)        │  │
│  │   auth.me() / permissions() / dashboard.get()        │  │
│  │   cables.all() / equipment.all() / inquiries.all()   │  │
│  │   folders.all() / uploads.all()                      │  │
│  │   → all return typed interfaces, NO `any`            │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Client Components (forms, sidebar)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ portalApiClient (client-side, browser httpOnly cookie)│  │
│  │   cables.update(id, data)                             │  │
│  │   equipment.update(id, data)                          │  │
│  │   inquiries.reply(id, replyBody)                      │  │
│  │   auth.changePassword(old, new)                       │  │
│  │   → throws PortalApiError on failure                  │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  BFF Routes /api/portal/* (Next.js route handlers)          │
│  → forward portal_token cookie as Bearer to FastAPI         │
└─────────────────────────────────────────────────────────────┘
```

**Boundary rule**: `portalApi` (server) reads cookies via `next/headers`; `portalApiClient` (client) lets the browser send the httpOnly cookie automatically. The two never share code — `next/headers` is server-only and would break a universal client module.

### Type System — `frontend/lib/types/portal.ts`

New file housing portal-specific interfaces. Shared types (Manufacturer, CableVariant) continue to be imported from existing `frontend/lib/types.ts`. Key interfaces:

```typescript
export type PortalScopeType = 'manufacturer' | 'equipment_manufacturer';

export interface PortalUser {
  id: number;
  email: string;
  role_id: string;
  role_name: string;
  scope_type: PortalScopeType;
  scope_id: string;
}

export interface PortalPermissions extends PortalUser {
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
  scope_type: PortalScopeType;
  stats: PortalDashboardStats;
  inquiry_trend: { date: string; count: number }[];
  views_trend: { date: string; count: number }[];
  recent_inquiries: {
    id: number;
    subject: string;
    created_at: string;
    is_read: boolean;
  }[];
}

export interface PortalCable {
  id: number;
  model: string;
  slug: string;
  base_description: string | null;
  manufacturer_id: number;
  manufacturer?: { id: number; name: string };
  created_at: string;
  updated_at: string;
}

export interface PortalCableUpdate {
  model: string;
  base_description: string | null;
}

export interface PortalEquipment {
  id: number;
  model: string;
  slug: string;
  description: string | null;
  manufacturer_id: number;
  created_at: string;
  updated_at: string;
}

export interface PortalEquipmentUpdate {
  model: string;
  description: string | null;
}

export interface PortalInquiry {
  id: number;
  subject: string;
  body: string;
  reply_body: string | null;
  created_at: string;
  is_read: boolean;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;
  sender_id: number;
  replied_at: string | null;
  replied_by: number | null;
}

export interface PortalFolder {
  id: number;
  name: string;
  manufacturer_id: number;
  parent_id: number | null;
  created_at: string;
}

export interface PortalUpload {
  id: number;
  filename: string;
  url: string;
  size: number;
  mime_type: string;
  folder_id: number | null;
  manufacturer_id: number;
  created_at: string;
}
```

**Risk — schema field mismatch**: Each interface must match its backend Pydantic schema exactly. Implementation step 1.2 verifies against `backend/app/schemas/{cable,equipment,inquiry}.py` and `backend/app/api/routes/portal_{media,auth,dashboard}.py`. Any field discovered missing or misnamed is corrected in `portal.ts` before proceeding — never in the backend (no DB/schema changes are in scope).

### portalApiClient + PortalApiError

`frontend/lib/portalApiClient.ts`:

```typescript
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
    async update(id: number, data: PortalCableUpdate): Promise<PortalCable> {
      const res = await bffFetch(`/api/portal/cables/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  equipment: {
    async update(id: number, data: PortalEquipmentUpdate): Promise<PortalEquipment> {
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

Forms catch `PortalApiError` and, when `fieldErrors` is present, map it to inline per-field messages; otherwise fall back to `error.message` displayed in the form-level message area.

### Layout Redirect — `x-pathname` Header

**Problem**: The layout is a Server Component — it cannot call `usePathname()`. But it needs the current path to (a) skip redirect on `/portal/login` and (b) populate the `from` query param.

**Solution**: Middleware sets a `x-pathname` request header that the layout reads via `headers()`.

`frontend/middleware.ts` (extend existing middleware, do not replace):

```typescript
const response = NextResponse.next({
  request: { headers: new Headers(request.headers) },
});
response.headers.set('x-pathname', pathname);
// ... existing token checks return responses as before, but using this response object
return response;
```

`frontend/app/portal/layout.tsx`:

```typescript
import { cookies, headers, redirect } from 'next/headers';

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

**Edge cases**:
- Middleware already redirects no-cookie requests; this handles the expired-cookie case (cookie exists, token invalid). No redirect loop because `/portal/login` is excluded.
- If `x-pathname` is absent (e.g. direct internal navigation), `from` defaults to empty string — login still works, just without a return target.

### Dashboard Error Handling

`frontend/app/portal/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { PortalDashboard, PortalDashboardErrorState } from '@/components/portal';

export default async function PortalDashboardPage() {
  let data: PortalDashboard;
  try {
    data = await portalApi.dashboard.get();
  } catch (err) {
    const user = await portalApi.auth.me();
    if (!user) redirect('/portal/login?from=/portal');
    return <PortalDashboardErrorState />;
  }
  return <PortalDashboardContent data={data} />;
}
```

`PortalDashboardErrorState` is a small client component rendering "Failed to load dashboard data" plus a Retry button that calls `router.refresh()`. `PortalDashboardContent` is the current dashboard render extracted into a component.

### Form Validation — Per-Form Manual Helpers

No external library. Each form keeps `errors: Record<string, string>` state and a `validate()` function. On submit, run `validate()`; if it returns false, do not call the API. On `PortalApiError`, if `fieldErrors` is present, merge into `errors`.

Example (`CableEditForm`):

```typescript
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
  try {
    await portalApiClient.cables.update(cable.id, { model, base_description: baseDescription });
    setMessage('Saved');
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) {
      setErrors(err.fieldErrors);
    } else if (err instanceof PortalApiError) {
      setMessage(err.message);
    } else {
      setMessage('Network error');
    }
  } finally {
    setSaving(false);
  }
}
```

Each field renders `{errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}` below it. Validation rules per form:

| Form | Rules |
|------|-------|
| CableEditForm | `model` required (non-empty) |
| EquipmentEditForm | `model` required (non-empty) |
| ReplyForm | `reply_body` required (non-empty after trim) |
| ChangePasswordForm | `old_password` required; `new_password` ≥ 8 chars; `new_password !== old_password` |

### Permissions Gating — Server-Side Fetch + Prop Pass

Layout already fetches `me()`; add `permissions()` fetch via `Promise.all` (parallel). Pass `allowedModules` to `PortalSidebar` as a prop. Sidebar filters:

```typescript
const nav = (user?.scope_type === 'equipment_manufacturer'
  ? EQUIPMENT_MANUFACTURER_NAV
  : MANUFACTURER_NAV
).filter(item => allowedModules.includes(item.module));
```

This keeps the sidebar a pure presentational component (no client fetch) and avoids redundant `permissions` calls.

### Backend Endpoint Consolidation

1. **Move** `change_password` logic from `backend/app/api/routes/portal_me.py` into `backend/app/api/routes/portal_auth.py` as a new `PUT /api/portal/auth/me` handler (same `ChangePasswordRequest` schema, same `verify_password`/`hash_password` logic, same 400 errors).
2. **Remove** `backend/app/api/routes/portal_me.py`.
3. **Unregister** its router in `backend/app/main.py` (delete the `portal_me.router` import + `include_router` call).
4. **Remove** `frontend/app/api/portal/me/route.ts` (the BFF route directory).
5. **Add** `PUT` handler to `frontend/app/api/portal/auth/me/route.ts` that forwards to backend `PUT /api/portal/auth/me`.
6. **Remove** the `portalApi.me.get()` block from `frontend/lib/portalApi.ts` — callers use `portalApi.auth.me()` instead.

**Pre-removal grep**: Before deleting `portal_me.py`, grep the codebase for `/api/portal/me` references to catch any caller the design didn't enumerate. Any found caller is migrated to `/api/portal/auth/me` in the same change.

## Spec Patches

### Patch 1: `reply_body` field name (portal-api-layer/spec.md)

The open-phase spec scenario "Inquiry reply via portalApiClient" says the payload is `{ body: string }`. The backend `InquiryReply` schema (used by `POST /api/portal/inquiries/{id}/reply` in `portal_inquiries.py`) requires `reply_body`. The spec scenario is corrected to `{ reply_body: string }` to match the backend contract.

This is a description correction, not a scope change.

## Loading & Empty States

`loading.tsx` files use Next.js streaming to show skeletons during server data fetch. Five files:

| Path | Skeleton |
|------|---------|
| `frontend/app/portal/loading.tsx` | Stat cards + chart placeholders |
| `frontend/app/portal/cables/loading.tsx` | Table with 5 placeholder rows |
| `frontend/app/portal/equipment/loading.tsx` | Table with 5 placeholder rows |
| `frontend/app/portal/inquiries/loading.tsx` | 3 card placeholders |
| `frontend/app/portal/media/loading.tsx` | 6-cell grid placeholders |

Empty-state audit: every list page already returns an array; ensure each renders a consistent "No X yet." message with the same `empty-state` class (gray icon + text) when the array is empty. Reuse the pattern already in place if present; otherwise introduce a small `<EmptyState icon label />` component.

## Testing & Verification Strategy

No new automated tests (project constraint). Verification is type-check + build + backend tests + manual smoke:

| Layer | Command / Action | Pass Criteria |
|-------|------------------|---------------|
| Types | `cd frontend && npx tsc --noEmit` | 0 errors |
| Backend | `pytest backend/tests/` | All existing tests pass (no regressions from endpoint move) |
| Build | `cd frontend && npm run build` | Succeeds |
| Smoke — happy path | Login as cable_manager → dashboard loads, edit a cable, reply to an inquiry, change password | All operations succeed |
| Smoke — token expiry | Delete `portal_token` cookie, navigate to `/portal`, `/portal/cables`, `/portal/inquiries` | All redirect to `/portal/login?from=...` |
| Smoke — permissions | Manufacturer with `allowed_modules: ["dashboard","cables","me"]` | Sidebar shows only Dashboard, Cables, Settings (Inquiries/Media hidden) |
| Smoke — dashboard error | Stop backend, reload `/portal` (with valid token) | Dashboard shows error message + Retry button (not 500) |
| Smoke — form validation | Clear "Model" field in CableEditForm, click Save | Inline "Model is required" error, no API call |

## Technical Risks & Mitigations

1. **Schema field mismatch in `portal.ts`**: Each interface must match the backend Pydantic schema exactly. Mitigation: step 1.2 verifies every interface against the actual backend schema file before any code consumes it. Mismatches are fixed in `portal.ts`, never in the backend.
2. **`x-pathname` header forwarding in Next.js 15**: If the header is not forwarded to Server Components for some reason, fallback is to read the `referer` header or accept losing the `from` param (login still works). The redirect itself does not depend on `x-pathname` — only the `from` query value does.
3. **Password change endpoint migration**: If any code beyond the enumerated callers references `/api/portal/me` PUT, it will break post-removal. Mitigation: pre-removal grep across the whole repo.
4. **Sidebar prop signature change**: `PortalSidebar` currently takes only `user`. Adding `allowedModules` is a breaking prop change for any consumer. Mitigation: layout is the only consumer (verified during exploration); update it in the same change.
5. **Loading.tsx placement**: Each segment needs its own file. Forgetting one means a missing skeleton for that route only — not a crash. Mitigation: task 6.1–6.5 enumerates each file.

## Out-of-Scope Drift Guards

If during implementation any of these come up, they are flagged as design findings and returned to the user rather than silently absorbed:
- New CRUD endpoints (belongs to change 2)
- Media upload UI (belongs to change 3)
- Form field expansion beyond current backend schema (belongs to change 2)
- Database migration (no DB changes are in scope)
- New npm dependencies (zod, react-hook-form, etc.)

## File Manifest (Implementation Targets)

**New files:**
- `frontend/lib/types/portal.ts`
- `frontend/lib/portalApiClient.ts`
- `frontend/app/portal/loading.tsx`
- `frontend/app/portal/cables/loading.tsx`
- `frontend/app/portal/equipment/loading.tsx`
- `frontend/app/portal/inquiries/loading.tsx`
- `frontend/app/portal/media/loading.tsx`
- `frontend/components/portal/PortalDashboardErrorState.tsx` (small client component)
- `frontend/components/portal/PortalDashboardContent.tsx` (extracted from page.tsx)
- `frontend/components/portal/EmptyState.tsx` (if not already present)

**Modified files:**
- `frontend/lib/portalApi.ts` (types, remove `.me`, remove `any`)
- `frontend/middleware.ts` (add `x-pathname` header)
- `frontend/app/portal/layout.tsx` (redirect, permissions prop)
- `frontend/app/portal/page.tsx` (try/catch + redirect + error state)
- `frontend/components/portal/layout/PortalSidebar.tsx` (permissions filter)
- `frontend/components/portal/form/CableEditForm.tsx` (portalApiClient + validation)
- `frontend/components/portal/form/EquipmentEditForm.tsx` (portalApiClient + validation)
- `frontend/components/portal/form/ReplyForm.tsx` (portalApiClient + validation, fix `reply_body` field)
- `frontend/components/portal/form/ChangePasswordForm.tsx` (portalApiClient + validation, switch to `/api/portal/auth/me`)
- `frontend/app/api/portal/auth/me/route.ts` (add PUT handler)
- `backend/app/api/routes/portal_auth.py` (add PUT `/me` handler)
- `backend/app/main.py` (unregister `portal_me.router`)

**Deleted files:**
- `backend/app/api/routes/portal_me.py`
- `frontend/app/api/portal/me/route.ts` (and the `me/` directory if empty)

**Spec patches:**
- `openspec/changes/portal-foundation-refactor/specs/portal-api-layer/spec.md` (Scenario: Inquiry reply — `body` → `reply_body`)
