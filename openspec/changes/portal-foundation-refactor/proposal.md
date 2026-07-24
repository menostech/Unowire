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
