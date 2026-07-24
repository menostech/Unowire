# Comet Design Handoff

- Change: portal-foundation-refactor
- Phase: design
- Mode: compact
- Context hash: 8d4776660dee49b4966aedac26ae4728b4158ae2c921d4306256bed0e019e396

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/portal-foundation-refactor/proposal.md

- Source: openspec/changes/portal-foundation-refactor/proposal.md
- Lines: 1-33
- SHA256: 3d1274ff7f4cee91da1e5337771a55c362a9d48343a151facb79a9ea457801e7

```md
## Why

The manufacturer portal ("生产商后台") was built as an MVP. It has several structural issues that will block feature work: the dashboard page crashes with a 500 error when the portal token expires (no try/catch), expired-token users see a broken sidebar-less page instead of being redirected to login, `portalApi` uses `any` types throughout with no shared contracts, all write operations are scattered as raw `fetch` calls inside components, and the `/api/portal/me` and `/api/portal/auth/me` endpoints are functionally duplicated. These issues must be fixed before adding new CRUD capabilities (change 2) and media management (change 3).

## What Changes

- **Portal error resilience**: Add try/catch to the dashboard page, implement token-expiry redirect to `/portal/login` for all protected pages, add consistent loading skeletons and empty states across all portal pages.
- **Type-safe portalApi**: Replace all `any` return types in `portalApi.ts` with TypeScript interfaces matching backend schemas (Cable, Equipment, Inquiry, Dashboard, User, Folder, Upload).
- **Unified BFF write layer**: Move all portal write operations (cable update, equipment update, inquiry reply, password change) from raw `fetch` in components to typed `portalApi` methods backed by BFF routes.
- **Eliminate redundant endpoint**: Consolidate `/api/portal/me` into `/api/portal/auth/me`; deprecate the `portal_me.py` route.
- **Form validation feedback**: Add inline validation errors to portal edit forms (CableEditForm, EquipmentEditForm, ChangePasswordForm, ReplyForm).
- **Use permissions API**: Wire the `auth/me/permissions` endpoint to the sidebar for module-level UI gating (currently fetched but unused).

## Capabilities

### New Capabilities

- `portal-error-resilience`: Graceful handling of expired tokens, backend errors, loading states, and empty states across all portal pages. Includes token-expiry redirect and dashboard crash prevention.
- `portal-api-layer`: Type-safe portal API client with shared TypeScript types, unified BFF write operations, and elimination of redundant endpoints. All portal mutations go through typed `portalApi` methods.

### Modified Capabilities

<!-- No existing specs to modify — this is a fresh OpenSpec installation. -->

## Impact

- **Frontend lib**: `frontend/lib/portalApi.ts` — full rewrite of types and addition of write methods
- **Frontend pages**: `frontend/app/portal/` — all pages (dashboard, cables, equipment, inquiries, media, settings) get error handling and loading states
- **Frontend components**: `frontend/components/portal/` — all forms get validation; PortalSidebar uses permissions API
- **Frontend BFF routes**: `frontend/app/api/portal/` — ensure all write routes exist and are typed
- **Backend routes**: `backend/app/api/routes/portal_me.py` — deprecate or consolidate into `portal_auth.py`
- **No database changes**: No schema migrations required
- **No new dependencies**: Uses existing Next.js, React, and TypeScript stack

```

## openspec/changes/portal-foundation-refactor/design.md

- Source: openspec/changes/portal-foundation-refactor/design.md
- Lines: 1-89
- SHA256: bda9f106d9b0391300485f743b04db2e2426ec0b670d75f1426309462d2af6ad

[TRUNCATED]

```md
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

```

Full source: openspec/changes/portal-foundation-refactor/design.md

## openspec/changes/portal-foundation-refactor/tasks.md

- Source: openspec/changes/portal-foundation-refactor/tasks.md
- Lines: 1-61
- SHA256: 2ae7f06ef3a01db52e3a34d74221b3f23aa095021130bbda5a488a23f6bd644d

```md
## 1. Portal TypeScript Types

- [ ] 1.1 Create `frontend/lib/types/portal.ts` with PortalUser, PortalDashboard, PortalDashboardStats, PortalCable, PortalCableUpdate, PortalEquipment, PortalEquipmentUpdate, PortalInquiry, PortalFolder, PortalUpload, PortalPermissions interfaces
- [ ] 1.2 Verify all types match backend schemas (cable.py, equipment.py, inquiry.py, portal_auth.py, portal_dashboard.py, portal_media.py)

## 2. Server-Side portalApi Type Safety

- [ ] 2.1 Replace all `any` return types in `frontend/lib/portalApi.ts` with interfaces from `types/portal.ts`
- [ ] 2.2 Add typed `PortalCableUpdate`, `PortalEquipmentUpdate` payload types to method signatures
- [ ] 2.3 Verify `portalApi.auth.me()` returns `PortalUser | null` (not `any`)
- [ ] 2.4 Run `tsc --noEmit` to verify 0 type errors in portalApi

## 3. Client-Side portalApiClient (Unified BFF Write Layer)

- [ ] 3.1 Create `frontend/lib/portalApiClient.ts` with client-side typed write methods: `cables.update(id, data)`, `equipment.update(id, data)`, `inquiries.reply(id, body)`, `auth.changePassword(old, new)`
- [ ] 3.2 Each method calls the corresponding BFF route at `/api/portal/*` with typed payloads
- [ ] 3.3 Add error handling that parses BFF error responses and throws typed errors

## 4. Backend Endpoint Consolidation

- [ ] 4.1 Add `PUT /api/portal/auth/me` endpoint to `portal_auth.py` for password change (move logic from `portal_me.py`)
- [ ] 4.2 Remove `backend/app/api/routes/portal_me.py` and unregister its router in `main.py`
- [ ] 4.3 Remove `frontend/app/api/portal/me/route.ts` BFF route
- [ ] 4.4 Update `portalApi.me.get()` to call `/api/portal/auth/me` instead of `/api/portal/me`
- [ ] 4.5 Run backend tests to verify no regressions

## 5. Token-Expiry Redirect & Dashboard Crash Fix

- [ ] 5.1 Update `frontend/app/portal/layout.tsx`: when `me()` returns null and path is not `/portal/login`, call `redirect('/portal/login?from=<current_path>')`
- [ ] 5.2 Wrap `portalApi.dashboard.get()` in `frontend/app/portal/page.tsx` with try/catch — on auth failure redirect to login, on other error show error UI with retry
- [ ] 5.3 Verify login page still renders normally when `me()` returns null (no redirect loop)

## 6. Loading States & Empty States

- [ ] 6.1 Create `frontend/app/portal/loading.tsx` (dashboard skeleton: stat cards + chart placeholders)
- [ ] 6.2 Create `frontend/app/portal/cables/loading.tsx` (table skeleton)
- [ ] 6.3 Create `frontend/app/portal/equipment/loading.tsx` (table skeleton)
- [ ] 6.4 Create `frontend/app/portal/inquiries/loading.tsx` (card list skeleton)
- [ ] 6.5 Create `frontend/app/portal/media/loading.tsx` (grid skeleton)
- [ ] 6.6 Audit all portal list pages for consistent empty-state styling (message + icon + consistent classes)

## 7. Form Validation & Migration to portalApiClient

- [ ] 7.1 Refactor `CableEditForm.tsx` to use `portalApiClient.cables.update()` and add inline validation (model required)
- [ ] 7.2 Refactor `EquipmentEditForm.tsx` to use `portalApiClient.equipment.update()` and add inline validation (model required)
- [ ] 7.3 Refactor `ReplyForm.tsx` to use `portalApiClient.inquiries.reply()` and add inline validation (body not empty)
- [ ] 7.4 Refactor `ChangePasswordForm.tsx` to use `portalApiClient.auth.changePassword()` and add inline validation (min 8 chars, new != old)

## 8. Permissions-Based Sidebar Gating

- [ ] 8.1 Update `PortalSidebar.tsx` to fetch `portalApi.auth.permissions()` server-side (pass as prop from layout) or fetch client-side
- [ ] 8.2 Filter nav items by `allowed_modules` list from permissions response
- [ ] 8.3 Verify nav items hidden when module not in allowed_modules

## 9. Verification

- [ ] 9.1 Run `tsc --noEmit` in frontend — 0 errors
- [ ] 9.2 Run backend tests — all pass
- [ ] 9.3 Run `next build` — succeeds
- [ ] 9.4 Smoke test: login as cable_manager, verify dashboard loads, edit a cable, reply to inquiry, change password
- [ ] 9.5 Smoke test: expire token (wait 4h or delete cookie), verify redirect to login on all protected pages

```

## openspec/changes/portal-foundation-refactor/specs/portal-api-layer/spec.md

- Source: openspec/changes/portal-foundation-refactor/specs/portal-api-layer/spec.md
- Lines: 1-65
- SHA256: 1e700814d492bf2df90f7154f86cb95601f659bd7b0d6b4a76842f3df2bf5874

```md
## ADDED Requirements

### Requirement: Portal API SHALL use typed interfaces for all responses

The `portalApi` server-side module and the `portalApiClient` client-side module SHALL use TypeScript interfaces for all request payloads and response types. No `any` types SHALL remain in portal API code.

#### Scenario: Typed cable response
- **WHEN** `portalApi.cables.all()` is called
- **THEN** the return type is `PortalCable[]` with fields `id`, `model`, `slug`, `manufacturer_id`, `manufacturer`, `created_at`, etc.

#### Scenario: Typed dashboard response
- **WHEN** `portalApi.dashboard.get()` is called
- **THEN** the return type is `PortalDashboard` with fields `factory_name`, `stats`, `inquiry_trend`, `views_trend`, `recent_inquiries`

#### Scenario: Typed inquiry response
- **WHEN** `portalApi.inquiries.getById(id)` is called
- **THEN** the return type is `PortalInquiry` with fields `id`, `subject`, `body`, `reply_body`, `created_at`, `is_read`, etc.

### Requirement: Portal write operations SHALL go through unified BFF client

All portal form mutations (cable update, equipment update, inquiry reply, password change) SHALL use the typed `portalApiClient` methods instead of raw `fetch` calls in components. The `portalApiClient` SHALL call the BFF routes at `/api/portal/*`.

#### Scenario: Cable update via portalApiClient
- **WHEN** a user submits the cable edit form
- **THEN** the form calls `portalApiClient.cables.update(id, data)` which PUTs to `/api/portal/cables/{id}` with a typed `PortalCableUpdate` payload

#### Scenario: Inquiry reply via portalApiClient
- **WHEN** a user submits an inquiry reply
- **THEN** the form calls `portalApiClient.inquiries.reply(id, replyBody)` which POSTs to `/api/portal/inquiries/{id}/reply` with a typed `{ reply_body: string }` payload matching the backend `InquiryReply` schema

#### Scenario: Password change via portalApiClient
- **WHEN** a user submits the change password form
- **THEN** the form calls `portalApiClient.auth.changePassword(old, new)` which PUTs to `/api/portal/auth/me` with a typed `{ old_password: string, new_password: string }` payload

### Requirement: Portal API SHALL eliminate redundant /me endpoint

The redundant `/api/portal/me` backend route and BFF route SHALL be removed. Profile retrieval SHALL use `/api/portal/auth/me` (GET) and password change SHALL use `/api/portal/auth/me` (PUT).

#### Scenario: Profile retrieval after consolidation
- **WHEN** the portal layout calls `portalApi.auth.me()`
- **THEN** the request goes to `GET /api/portal/auth/me` (not `/api/portal/me`)

#### Scenario: Password change after consolidation
- **WHEN** a user changes their password
- **THEN** the request goes to `PUT /api/portal/auth/me` (not `PUT /api/portal/me`)

#### Scenario: Old /api/portal/me endpoint removed
- **WHEN** a request is made to `GET /api/portal/me`
- **THEN** the backend returns 404 (endpoint no longer exists)

### Requirement: Portal forms SHALL display inline validation errors

All portal edit forms SHALL validate user input on the client side and display inline error messages below each field before submitting to the backend.

#### Scenario: Cable edit form required field validation
- **WHEN** a user clears the "Model" field in the cable edit form and clicks Save
- **THEN** an inline error "Model is required" is displayed below the field and the form is not submitted

#### Scenario: Password change form min length validation
- **WHEN** a user enters a new password shorter than 8 characters and clicks Save
- **THEN** an inline error "Password must be at least 8 characters" is displayed and the form is not submitted

#### Scenario: Reply form empty body validation
- **WHEN** a user submits an empty reply body
- **THEN** an inline error "Reply cannot be empty" is displayed and the form is not submitted

```

## openspec/changes/portal-foundation-refactor/specs/portal-error-resilience/spec.md

- Source: openspec/changes/portal-foundation-refactor/specs/portal-error-resilience/spec.md
- Lines: 1-65
- SHA256: 56b9b39b3e9dcab99473a638029332d2d84422057d17d747f0832521e4c86705

```md
## ADDED Requirements

### Requirement: Portal pages SHALL handle expired tokens gracefully

When a portal user's JWT token expires, all protected portal pages SHALL redirect the user to `/portal/login` with a `from` query parameter preserving the original path, instead of rendering a broken sidebar-less page or throwing a 500 error.

#### Scenario: Expired token on dashboard page
- **WHEN** a user with an expired `portal_token` cookie navigates to `/portal`
- **THEN** the system redirects to `/portal/login?from=/portal`

#### Scenario: Expired token on cable detail page
- **WHEN** a user with an expired token navigates to `/portal/cables/abc123`
- **THEN** the system redirects to `/portal/login?from=/portal/cables/abc123`

#### Scenario: Login page does not redirect
- **WHEN** an unauthenticated user is on `/portal/login`
- **THEN** the login page renders normally without redirect

### Requirement: Portal dashboard SHALL not crash on backend errors

The dashboard page SHALL wrap all backend API calls in error handling. On auth failure, it SHALL redirect to login. On non-auth backend errors, it SHALL display an error message with a retry option instead of throwing an unhandled 500.

#### Scenario: Dashboard backend returns 500
- **WHEN** the dashboard API call fails with a 500 error but the user's token is valid
- **THEN** the dashboard displays an error message "Failed to load dashboard data" with a retry button

#### Scenario: Dashboard token expired
- **WHEN** the dashboard API call fails and `auth.me()` returns null
- **THEN** the system redirects to `/portal/login?from=/portal`

### Requirement: Portal pages SHALL display loading states

All portal pages SHALL show loading skeletons while data is being fetched, using Next.js `loading.tsx` convention. Skeletons SHALL match the approximate layout of the page content.

#### Scenario: Cables list loading
- **WHEN** the cables list page is loading data
- **THEN** a table skeleton with placeholder rows is displayed

#### Scenario: Dashboard loading
- **WHEN** the dashboard page is loading
- **THEN** stat card skeletons and chart placeholders are displayed

### Requirement: Portal pages SHALL display consistent empty states

All portal list pages SHALL display a user-friendly empty state message when no data is available, with consistent styling across pages.

#### Scenario: No cables in scope
- **WHEN** the cables list API returns an empty array
- **THEN** the page displays "No cables in your scope yet." with consistent empty-state styling

#### Scenario: No inquiries
- **WHEN** the inquiries list API returns an empty array
- **THEN** the page displays "No inquiries yet." with consistent empty-state styling

### Requirement: Portal sidebar SHALL use permissions API for nav gating

The portal sidebar SHALL fetch `auth/me/permissions` and use the `allowed_modules` list to filter navigation items, instead of relying solely on `scope_type`.

#### Scenario: Manufacturer with full permissions
- **WHEN** a manufacturer user has `allowed_modules: ["dashboard", "cables", "inquiries", "media", "me"]`
- **THEN** the sidebar shows Dashboard, Cables, Inquiries, Media, and Settings nav items

#### Scenario: Manufacturer with restricted permissions
- **WHEN** a manufacturer user has `allowed_modules: ["dashboard", "cables", "me"]`
- **THEN** the sidebar shows only Dashboard, Cables, and Settings nav items (Inquiries and Media are hidden)

```
