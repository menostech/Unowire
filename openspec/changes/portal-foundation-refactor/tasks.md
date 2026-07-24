## 1. Portal TypeScript Types

- [x] 1.1 Create `frontend/lib/types/portal.ts` with PortalUser, PortalDashboard, PortalDashboardStats, PortalCable, PortalCableUpdate, PortalEquipment, PortalEquipmentUpdate, PortalInquiry, PortalFolder, PortalUpload, PortalPermissions interfaces
- [x] 1.2 Verify all types match backend schemas (cable.py, equipment.py, inquiry.py, portal_auth.py, portal_dashboard.py, portal_media.py)

## 2. Server-Side portalApi Type Safety

- [x] 2.1 Replace all `any` return types in `frontend/lib/portalApi.ts` with interfaces from `types/portal.ts`
- [x] 2.2 Add typed `PortalCableUpdate`, `PortalEquipmentUpdate` payload types to method signatures
- [x] 2.3 Verify `portalApi.auth.me()` returns `PortalUser | null` (not `any`)
- [x] 2.4 Run `tsc --noEmit` to verify 0 type errors in portalApi

## 3. Client-Side portalApiClient (Unified BFF Write Layer)

- [x] 3.1 Create `frontend/lib/portalApiClient.ts` with client-side typed write methods: `cables.update(id, data)`, `equipment.update(id, data)`, `inquiries.reply(id, body)`, `auth.changePassword(old, new)`
- [x] 3.2 Each method calls the corresponding BFF route at `/api/portal/*` with typed payloads
- [x] 3.3 Add error handling that parses BFF error responses and throws typed errors

## 4. Backend Endpoint Consolidation

- [x] 4.1 Add `PUT /api/portal/auth/me` endpoint to `portal_auth.py` for password change (move logic from `portal_me.py`)
- [x] 4.2 Remove `backend/app/api/routes/portal_me.py` and unregister its router in `main.py`
- [x] 4.3 Remove `frontend/app/api/portal/me/route.ts` BFF route
- [x] 4.4 Update `portalApi.me.get()` to call `/api/portal/auth/me` instead of `/api/portal/me`
- [x] 4.5 Run backend tests to verify no regressions — DB unavailable; deferred to Task 10 (Verification)

## 5. Token-Expiry Redirect & Dashboard Crash Fix

- [x] 5.1 Update `frontend/app/portal/layout.tsx`: when `me()` returns null and path is not `/portal/login`, call `redirect('/portal/login?from=<current_path>')`
- [x] 5.2 Wrap `portalApi.dashboard.get()` in `frontend/app/portal/page.tsx` with try/catch — on auth failure redirect to login, on other error show error UI with retry
- [x] 5.3 Verify login page still renders normally when `me()` returns null (no redirect loop)

## 6. Loading States & Empty States

- [x] 6.1 Create `frontend/app/portal/loading.tsx` (dashboard skeleton: stat cards + chart placeholders)
- [x] 6.2 Create `frontend/app/portal/cables/loading.tsx` (table skeleton)
- [x] 6.3 Create `frontend/app/portal/equipment/loading.tsx` (table skeleton)
- [x] 6.4 Create `frontend/app/portal/inquiries/loading.tsx` (card list skeleton)
- [x] 6.5 Create `frontend/app/portal/media/loading.tsx` (grid skeleton)
- [x] 6.6 Audit all portal list pages for consistent empty-state styling (message + icon + consistent classes)

## 7. Form Validation & Migration to portalApiClient

- [x] 7.1 Refactor `CableEditForm.tsx` to use `portalApiClient.cables.update()` and add inline validation (model required)
- [x] 7.2 Refactor `EquipmentEditForm.tsx` to use `portalApiClient.equipment.update()` and add inline validation (model required)
- [x] 7.3 Refactor `ReplyForm.tsx` to use `portalApiClient.inquiries.reply()` and add inline validation (body not empty)
- [x] 7.4 Refactor `ChangePasswordForm.tsx` to use `portalApiClient.auth.changePassword()` and add inline validation (min 8 chars, new != old)

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
