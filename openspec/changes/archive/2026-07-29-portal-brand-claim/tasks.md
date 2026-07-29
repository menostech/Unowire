## 1. Backend: Claim Model + Migration

- [x] 1.1 Create `backend/app/models/claim_request.py` with `ClaimRequest` SQLAlchemy model (id uuid PK, manufacturer_type varchar, manufacturer_id varchar, contact_name varchar, contact_email varchar, contact_phone varchar nullable, proof_description text, status varchar default "pending", reviewed_by varchar nullable, reviewed_at timestamptz nullable, created_at, updated_at).
- [x] 1.2 Create Alembic migration to add `claim_requests` table.
- [x] 1.3 Register `ClaimRequest` model in `backend/app/models/__init__.py`.

## 2. Backend: Claim Schemas + CRUD

- [x] 2.1 Create `backend/app/schemas/claim.py` with `ClaimRequestCreate` (manufacturer_type, manufacturer_id, contact_name, contact_email, contact_phone optional, proof_description), `ClaimRequestRead` (all fields), `ClaimRequestWithManufacturer` (extends ClaimRequestRead with manufacturer_name).
- [x] 2.2 Create `backend/app/crud/claim.py` with `create_claim_request(db, data) -> ClaimRequest`, `get_claim_requests(db, status=None) -> list[ClaimRequestWithManufacturer]`, `get_claim_request(db, id) -> ClaimRequestWithManufacturer`, `update_claim_status(db, id, status, reviewed_by) -> ClaimRequest`.

## 3. Backend: Public Claim Routes

- [x] 3.1 Create `backend/app/api/routes/portal_claim.py` with router prefix `/api/portal/claim`.
- [x] 3.2 Add `GET /search` endpoint: public (no auth), accepts `q` query param, searches cable_manufacturers + equipment_manufacturers by name ilike, limit 10, returns `[{id, name, slug, type}]`.
- [x] 3.3 Add `POST /` endpoint: public (no auth), accepts `ClaimRequestCreate` body, validates manufacturer exists (by type + id), creates claim_requests record with status "pending", returns 201. Return 404 if manufacturer not found, 422 for validation errors.
- [x] 3.4 Register `portal_claim` router in `backend/app/main.py`.

## 4. Backend: Admin Claim Routes

- [x] 4.1 Create `backend/app/api/routes/admin_claims.py` with router prefix `/api/admin/claims`.
- [x] 4.2 Add `GET /` endpoint: requires admin auth (`require_operator`), returns all claim_requests ordered by created_at desc, optional `status` query filter, joins manufacturer tables for manufacturer_name.
- [x] 4.3 Add `POST /{id}/approve` and `POST /{id}/reject` endpoints: requires admin auth, sets status + reviewed_by + reviewed_at, returns updated claim. Return 409 if already processed.
- [x] 4.4 Register `admin_claims` router in `backend/app/main.py`.

## 5. Backend: Tests

- [x] 5.1 `test_portal_claim_search.py`: search returns matching manufacturers (cable + equipment), empty query returns [], no auth required.
- [x] 5.2 `test_portal_claim_submit.py`: successful submit returns 201, non-existent manufacturer returns 404, missing fields returns 422, no auth required.
- [x] 5.3 `test_admin_claims.py`: list returns all claims ordered desc, status filter works, approve sets status+reviewed_by+reviewed_at, reject sets status+reviewed_by+reviewed_at, approve already-processed returns 409, non-admin returns 401/403.

## 6. Frontend: Brand Unification

- [x] 6.1 Edit `frontend/components/portal/layout/PortalSidebar.tsx`: remove subtitle logic (lines 55-60), change brand text from `Unowire <span>{subtitle}</span>` to static `Unowire Portal`.
- [x] 6.2 Edit `frontend/app/portal/login/PortalLoginForm.tsx`: change heading from "Factory Portal" to "Unowire Portal".

## 7. Frontend: Logout Fix

- [x] 7.1 Edit `frontend/components/portal/layout/PortalSidebar.tsx`: change `handleLogout` to use `window.location.href = '/portal/login'` instead of `router.push('/portal/login')` after the logout API call.

## 8. Frontend: Claim Link on Login Page

- [x] 8.1 Edit `frontend/app/portal/login/PortalLoginForm.tsx`: replace `Operator? <Link href="/admin/login">Admin login</Link>` with `<Link href="/portal/claim">Claim Your Company</Link>`.

## 9. Frontend: Portal Claim Page

- [x] 9.1 Create `frontend/app/portal/claim/page.tsx`: public page (no auth), search input + results list, "Claim This Company" button per result, claim form (contact_name, contact_email, contact_phone, proof_description) with submit.
- [x] 9.2 Create `frontend/lib/api/claimApi.ts`: client functions `searchManufacturers(q)` and `submitClaim(data)` calling the public API endpoints.
- [x] 9.3 Update `frontend/middleware.ts`: add `/portal/claim` to the whitelist (no portal_token required).
- [x] 9.4 Update `frontend/app/portal/layout.tsx`: ensure `/portal/claim` renders without sidebar (same as login page — `if (!user)` renders children bare).

## 10. Frontend: Admin Claims Page

- [x] 10.1 Create `frontend/app/admin/(dashboard)/claims/page.tsx`: table of claim requests with columns (company, type, contact, email, phone, proof, status, created, actions), status filter dropdown, Approve/Reject buttons for pending claims.
- [x] 10.2 Create BFF routes `frontend/app/api/admin/claims/route.ts` (GET proxy) and `frontend/app/api/admin/claims/[id]/approve/route.ts` + `reject/route.ts` (POST proxies) with admin_token cookie forwarding.
- [x] 10.3 Add "Claims" nav item to `frontend/components/admin/layout/AdminSidebar.tsx` linking to `/admin/claims`.

## 11. Manual Verification

- [x] 11.1 Verify Portal sidebar shows "Unowire Portal" for both cable and equipment manufacturer logins.
- [x] 11.2 Verify logout immediately hides sidebar (no persistent sidebar on login page).
- [x] 11.3 Verify Portal login page shows "Claim Your Company" link (no "Admin login" link).
- [x] 11.4 Verify `/portal/claim` loads without login, search works, claim form submits successfully.
- [x] 11.5 Verify `/admin/claims` lists claims, approve/reject works.
