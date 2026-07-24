## Context

The manufacturer portal uses Next.js 15 Server Components + a thin Next.js BFF layer + FastAPI backend. Server Components read the `portal_token` cookie via `next/headers` and call the backend directly through `portalApi`. Client-side mutations (form submissions) go through `/api/portal/*` BFF routes that forward the cookie as a Bearer token.

Current issues:
- `portalApi.ts` returns `any` for cables, equipment, inquiries detail, and folders — no type safety
- All write operations (cable update, equipment update, inquiry reply, password change) use raw `fetch` inside client components, bypassing `portalApi`
- Dashboard page (`/portal/page.tsx`) calls `portalApi.dashboard.get()` without try/catch — throws 500 on expired token
- Layout returns a sidebar-less bare page when `me()` returns null (expired token) instead of redirecting to login
- `portal_me.py` (`/api/portal/me`) and `portal_auth.py` (`/api/portal/auth/me`) return identical profile data
- `auth/me/permissions` endpoint is called but the returned `allowed_modules` list is never used for UI gating
- No loading skeletons, no consistent empty states, no inline form validation

## Goals / Non-Goals

**Goals:**
- Make all portal pages resilient to backend errors and expired tokens (no unhandled 500s)
- Replace all `any` types in `portalApi` with shared TypeScript interfaces
- Unify all portal write operations through typed `portalApi` methods + BFF routes
- Add inline form validation to all portal edit forms
- Wire `auth/me/permissions` to the sidebar for module-level nav gating
- Consolidate the redundant `/me` endpoint

**Non-Goals:**
- Adding new CRUD capabilities (create/delete cables/equipment) — change 2
- Media upload UI — change 3
- Expanding edit form fields beyond what currently exists — change 2
- Admin portal changes
- Database schema changes
- New npm dependencies

## Decisions

### 1. TypeScript type definitions location: `frontend/lib/types/portal.ts`

**Choice**: Create a new `frontend/lib/types/portal.ts` file for portal-specific types, importing shared types from existing `frontend/lib/types.ts` where possible.

**Rationale**: The existing `types.ts` is already large and shared between admin and site. Portal types (PortalUser, PortalDashboard, PortalCable, etc.) are portal-specific and should be isolated. Shared types (Manufacturer, CableVariant) can be imported from `types.ts`.

**Alternative considered**: Adding portal types directly to `types.ts` — rejected to avoid bloating the shared file.

### 2. Token-expiry redirect: Server-side `redirect()` in layout

**Choice**: When `portalApi.auth.me()` returns null on a protected page (not `/portal/login`), call `redirect('/portal/login?from=<current_path>')` from the layout.

**Rationale**: Server-side redirect is the cleanest approach — the user never sees a broken page. The login page is already excluded from this check (it renders without sidebar when `me()` returns null).

**Alternative considered**: Client-side redirect via middleware — rejected because middleware only checks cookie presence, not token validity. Adding JWT verification to middleware would require async crypto in the edge runtime, which is complex and fragile.

### 3. Dashboard error handling: try/catch + redirect on auth failure

**Choice**: Wrap `portalApi.dashboard.get()` in try/catch. On error, check if `portalApi.auth.me()` returns null (auth failure) → redirect to login. If me() succeeds but dashboard fails, show an error message with retry.

**Rationale**: Distinguishes auth failures (redirect) from backend errors (show error UI). Consistent with the pattern already used by list pages.

### 4. Unified BFF write methods: Add write methods to `portalApi` (client-side)

**Choice**: Add client-side write methods to `portalApi` (e.g., `portalApi.cables.update(id, data)`, `portalApi.equipment.update(id, data)`) that call the BFF routes. These methods are in a separate `portalApiClient` object (client-side) since `portalApi` is server-side only.

**Rationale**: Server-side `portalApi` uses `next/headers` cookies; client-side needs the browser's httpOnly cookie. A separate client-side API object keeps the boundary clean.

**Alternative considered**: Making `portalApi` universal (both server and client) — rejected because `next/headers` only works server-side.

### 5. Endpoint consolidation: Deprecate `portal_me.py`, keep `portal_auth.py`

**Choice**: Move the password-change logic from `portal_me.py` to `portal_auth.py` (new `PUT /api/portal/auth/me` endpoint), then remove `portal_me.py`. Update BFF routes and `portalApi` accordingly.

**Rationale**: `portal_auth.py` already has `GET /api/portal/auth/me` (profile). Adding `PUT` to the same router is cleaner than maintaining a separate file. The frontend BFF route `/api/portal/me` is replaced by `/api/portal/auth/me`.

**Alternative considered**: Keeping both and marking `portal_me.py` as deprecated — rejected to avoid confusion and maintenance burden.

### 6. Form validation: Client-side validation with inline error display

**Choice**: Add basic client-side validation to each form (required fields, min length, format checks). Display errors inline below each field. No external library (zod/react-hook-form) — keep it lightweight with manual validation functions.

**Rationale**: Portal forms are simple (2-4 fields each). Adding form libraries would be over-engineering. Manual validation keeps the bundle small and the code readable.

### 7. Loading states: Next.js `loading.tsx` files

**Choice**: Add `loading.tsx` files to each portal route segment for streaming-based loading skeletons.

**Rationale**: Next.js App Router has built-in support for `loading.tsx` — no code changes needed in page components. Skeletons match the page layout for a smooth UX.

## Risks / Trade-offs

- **[Breaking existing portal mutations]** → All form components will be refactored to use the new `portalApiClient`. Mitigation: test each form manually after migration; backend routes are unchanged.
- **[Type mismatch between frontend and backend]** → TypeScript interfaces are manually maintained. Mitigation: generate types from backend schemas in a future change; for now, keep types minimal and verify against backend code.
- **[Redirect loop on login page]** → If `me()` is called on `/portal/login` and returns null, the redirect must NOT trigger. Mitigation: layout explicitly skips redirect for `/portal/login` path.
- **[Removing portal_me.py breaks existing tokens]** → Tokens are JWT with user info, not endpoint-specific. Removing the route only affects the endpoint URL, not existing tokens. Mitigation: deploy frontend and backend changes together.
