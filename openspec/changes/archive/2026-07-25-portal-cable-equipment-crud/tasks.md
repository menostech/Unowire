## 1. Backend Schemas

- [x] 1.1 Add `PortalCableCreate` schema to `backend/app/schemas/cable.py` with fields: `product_type_id`, `industry_id`, `category_id`, `model`, `slug`, `size_system`, `base_description`, `meta_title`, `meta_description`, `image_url`, `category_ids` (omit `id`, `manufacturer_id`, `common_specs`, `variants`)
- [x] 1.2 Add `PortalEquipmentCreate` schema to `backend/app/schemas/equipment.py` with fields: `category_id`, `model`, `slug`, `description`, `image_url`, `external_url`, `sort_order` (omit `id`, `manufacturer_id`, `applicable_specs`)
- [x] 1.3 Verify both schemas use `model_config = {"from_attributes": True}` where applicable and match the existing field types from `CableCreate` / `RecommendedEquipmentCreate`

## 2. Backend Portal Cable Routes (POST + DELETE)

- [x] 2.1 Add `POST /api/portal/cables` to `backend/app/api/routes/portal_cables.py`: accept `PortalCableCreate`, force `manufacturer_id = user.scope_id`, auto-generate `id` (slug-based with UUID fallback), create `Cable` model (no common_specs/variants), return `201` with `CableRead`
- [x] 2.2 Add `DELETE /api/portal/cables/{cable_id}` to `backend/app/api/routes/portal_cables.py`: fetch cable via `crud_cable.get_detail`, call `_check_cable_ownership`, delete via `crud_cable.remove`, return `200` with `CableRead`
- [x] 2.3 Verify ID auto-generation handles collisions (check if ID exists before insert, append UUID suffix on collision)
- [x] 2.4 Run backend tests to verify create and delete work with scope enforcement

## 3. Backend Portal Equipment Routes (POST + DELETE)

- [x] 3.1 Add `POST /api/portal/equipment` to `backend/app/api/routes/portal_equipment.py`: accept `PortalEquipmentCreate`, force `manufacturer_id = user.scope_id`, auto-generate `id` (slug-based with UUID fallback), create via `crud_equipment.create`, return `201` with `RecommendedEquipmentRead`
- [x] 3.2 Add `DELETE /api/portal/equipment/{equipment_id}` to `backend/app/api/routes/portal_equipment.py`: fetch equipment via `crud_equipment.get`, call `_check_equipment_ownership`, delete via `crud_equipment.remove`, return `200` with `RecommendedEquipmentRead`
- [x] 3.3 Verify ID auto-generation handles collisions (check if ID exists before insert, append UUID suffix on collision)
- [x] 3.4 Run backend tests to verify create and delete work with scope enforcement

## 4. Frontend Types

- [x] 4.1 Add `PortalCableCreate` interface to `frontend/lib/types/portal.ts` matching the backend schema (product_type_id, industry_id, category_id, model, slug, size_system, base_description?, meta_title?, meta_description?, image_url?, category_ids?)
- [x] 4.2 Add `PortalEquipmentCreate` interface to `frontend/lib/types/portal.ts` matching the backend schema (category_id, model, slug, description?, image_url?, external_url?, sort_order?)

## 5. Frontend BFF Routes

- [x] 5.1 Create `frontend/app/api/portal/cables/route.ts` with a POST handler that forwards the body and `portal_token` cookie to backend `POST /api/portal/cables`
- [x] 5.2 Add a DELETE handler to `frontend/app/api/portal/cables/[id]/route.ts` that forwards the `portal_token` cookie to backend `DELETE /api/portal/cables/{id}`
- [x] 5.3 Create `frontend/app/api/portal/equipment/route.ts` with a POST handler that forwards the body and `portal_token` cookie to backend `POST /api/portal/equipment`
- [x] 5.4 Add a DELETE handler to `frontend/app/api/portal/equipment/[id]/route.ts` that forwards the `portal_token` cookie to backend `DELETE /api/portal/equipment/{id}`
- [x] 5.5 (Optional) Create `frontend/app/api/portal/taxonomy/route.ts` BFF proxy if the taxonomy endpoint requires auth — verify auth requirements first — **Skipped: taxonomy endpoint is public, server components fetch directly via `INTERNAL_API_BASE` per design**

## 6. Frontend portalApiClient Methods

- [x] 6.1 Add `cables.create(data: PortalCableCreate)` to `frontend/lib/portalApiClient.ts` — POSTs to `/api/portal/cables`, returns `PortalCable`
- [x] 6.2 Add `cables.remove(id: string)` to `frontend/lib/portalApiClient.ts` — DELETEs to `/api/portal/cables/{id}`
- [x] 6.3 Add `equipment.create(data: PortalEquipmentCreate)` to `frontend/lib/portalApiClient.ts` — POSTs to `/api/portal/equipment`, returns `PortalEquipment`
- [x] 6.4 Add `equipment.remove(id: string)` to `frontend/lib/portalApiClient.ts` — DELETEs to `/api/portal/equipment/{id}`
- [x] 6.5 Add error handling that parses BFF error responses and throws typed errors with the server message — `PortalApiError` parses `code`, `message`, `field_errors`

## 7. Cable Edit Form Expansion

- [x] 7.1 Expand `frontend/components/portal/form/CableEditForm.tsx` with state and inputs for: slug, size_system, meta_title, meta_description, image_url
- [x] 7.2 Add cascading taxonomy dropdowns (industry_id, category_id, product_type_id) to `CableEditForm` — fetch options from `GET /api/taxonomy` (via server component prop or BFF)
- [x] 7.3 Pre-select existing taxonomy values from the cable record
- [x] 7.4 Update the PUT submission to include all new fields in the payload via `portalApiClient.cables.update()`
- [x] 7.5 Add inline validation for required fields (model, slug, size_system, taxonomy)

## 8. Equipment Edit Form Expansion

- [x] 8.1 Expand `frontend/components/portal/form/EquipmentEditForm.tsx` with state and inputs for: slug, image_url, external_url, sort_order
- [x] 8.2 Add category dropdown (category_id) to `EquipmentEditForm` — fetch options from `GET /api/equipment-categories`
- [x] 8.3 Pre-select existing category value from the equipment record
- [x] 8.4 Update the PUT submission to include all new fields in the payload via `portalApiClient.equipment.update()`
- [x] 8.5 Add inline validation for required fields (model, slug, category_id); validate sort_order is numeric

## 9. Cable List Page Expansion

- [x] 9.1 Update `frontend/app/portal/cables/page.tsx` table to add columns: Category, Product Type, Size System (in addition to Name, Manufacturer, Created)
- [x] 9.2 Display human-readable category and product type labels (resolve IDs to names from taxonomy data, or fetch taxonomy tree in the server component)
- [x] 9.3 Add a "New Cable" button linking to `/portal/cables/new`

## 10. Equipment List Page Expansion

- [x] 10.1 Update `frontend/app/portal/equipment/page.tsx` table to add a Category column (in addition to Name, Created)
- [x] 10.2 Display the category label from the equipment's `category` relation (already returned by the list endpoint)
- [x] 10.3 Add a "New Equipment" button linking to `/portal/equipment/new`

## 11. Cable Create Page & Form

- [x] 11.1 Create `frontend/app/portal/cables/new/page.tsx` — server component that fetches taxonomy tree and renders `CableCreateForm`
- [x] 11.2 Create `frontend/components/portal/form/CableCreateForm.tsx` — client component with fields: model, slug, size_system, base_description, meta_title, meta_description, image_url, and cascading taxonomy dropdowns
- [x] 11.3 Add inline validation for required fields (model, slug, size_system, industry_id, category_id, product_type_id)
- [x] 11.4 On submit, call `portalApiClient.cables.create(data)` and redirect to `/portal/cables/{new_id}` on success
- [x] 11.5 Display server error messages (e.g., slug collision) without losing entered form values

## 12. Equipment Create Page & Form

- [x] 12.1 Create `frontend/app/portal/equipment/new/page.tsx` — server component that fetches equipment categories and renders `EquipmentCreateForm`
- [x] 12.2 Create `frontend/components/portal/form/EquipmentCreateForm.tsx` — client component with fields: model, slug, description, image_url, external_url, sort_order, and category dropdown
- [x] 12.3 Add inline validation for required fields (model, slug, category_id); validate sort_order is numeric
- [x] 12.4 On submit, call `portalApiClient.equipment.create(data)` and redirect to `/portal/equipment/{new_id}` on success
- [x] 12.5 Display server error messages without losing entered form values

## 13. Delete Confirmation Dialog & Delete Buttons

- [x] 13.1 Create `frontend/components/portal/form/DeleteConfirmDialog.tsx` — reusable modal component with configurable title, message, and onConfirm callback
- [x] 13.2 Add a "Delete" button to the cable detail page (`/portal/cables/[id]/page.tsx`) that opens `DeleteConfirmDialog` and calls `portalApiClient.cables.remove(id)` on confirm, then redirects to `/portal/cables`
- [x] 13.3 Add a "Delete" button to the equipment detail page (`/portal/equipment/[id]/page.tsx`) that opens `DeleteConfirmDialog` and calls `portalApiClient.equipment.remove(id)` on confirm, then redirects to `/portal/equipment`
- [x] 13.4 Handle delete API errors (e.g., 404 if already deleted) with an appropriate error message — `DeleteConfirmDialog` displays `err.message` from `PortalApiError`

## 14. Verification

- [x] 14.1 Run `tsc --noEmit` in frontend — 0 type errors
- [x] 14.2 Run backend tests — all pass (19/19 portal cable + equipment tests)
- [x] 14.3 Run `next build` — succeeds (all portal routes compiled)
- [x] 14.4 Smoke test (cable manufacturer): create a cable with required fields, verify it appears in the list with expanded columns, edit the cable's new fields, delete the cable with confirmation, verify it no longer appears
- [x] 14.5 Smoke test (equipment manufacturer): create equipment with required fields, verify it appears in the list with category column, edit the equipment's new fields, delete with confirmation, verify it no longer appears
- [x] 14.6 Smoke test (scope enforcement): attempt to DELETE a cable/equipment outside scope via direct API call — verify 404 response
- [x] 14.7 Smoke test (cross-module): attempt to POST equipment as a cable manufacturer — verify 403 response
