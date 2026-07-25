## Why

The manufacturer portal currently only supports viewing and updating existing cables and equipment — users cannot create new records or delete their own. The cable and equipment edit forms are also skeletal: the cable form exposes only `model` and `base_description` (missing slug, size_system, SEO metadata, image, and taxonomy), and the equipment form exposes only `model` and `description` (missing slug, image, external URL, sort order, and category). The list pages are equally sparse — the cable list shows only Name/Manufacturer/Created, and the equipment list shows only Name/Created. This change adds full create/delete capabilities (scope-enforced) and expands the forms and list pages to surface the fields portal users need to manage their catalogs without relying on the admin backend.

## What Changes

- **Cable create**: Add `POST /api/portal/cables` backend route + BFF route + `portalApiClient.cables.create()` + "New Cable" form page at `/portal/cables/new`.
- **Cable delete**: Add `DELETE /api/portal/cables/{id}` backend route + BFF route + `portalApiClient.cables.remove()` + delete button with confirmation modal on the cable detail page.
- **Equipment create**: Add `POST /api/portal/equipment` backend route + BFF route + `portalApiClient.equipment.create()` + "New Equipment" form page at `/portal/equipment/new`.
- **Equipment delete**: Add `DELETE /api/portal/equipment/{id}` backend route + BFF route + `portalApiClient.equipment.remove()` + delete button with confirmation modal on the equipment detail page.
- **Cable edit form expansion**: Add slug, size_system, meta_title, meta_description, image_url, and taxonomy fields (industry_id, category_id, product_type_id) to `CableEditForm`.
- **Equipment edit form expansion**: Add slug, image_url, external_url, sort_order, and category_id to `EquipmentEditForm`.
- **Cable list expansion**: Add Category, Product Type, and Size System columns to the cable list table; add "New Cable" button.
- **Equipment list expansion**: Add Category column to the equipment list table; add "New Equipment" button.
- **Portal create schemas**: Add `PortalCableCreate` and `PortalEquipmentCreate` backend schemas that omit `manufacturer_id` (server-forced to `scope_id`) and `id` (server-generated); `PortalCableCreate` also excludes `common_specs` and `variants`.

## Capabilities

### New Capabilities

- `portal-cable-crud`: Cable create and delete operations with scope-based ownership enforcement, expanded cable edit form (slug, size_system, meta fields, image, taxonomy), and expanded cable list page (category, product type, size system columns).
- `portal-equipment-crud`: Equipment create and delete operations with scope-based ownership enforcement, expanded equipment edit form (slug, image, external_url, sort_order, category), and expanded equipment list page (category column).

### Modified Capabilities

<!-- No existing specs to modify — this is the second change in a 3-change batch. It builds on portal-api-layer and portal-error-resilience from change 1 (portal-foundation-refactor), which are not yet archived. -->

## Impact

- **Backend routes**: `backend/app/api/routes/portal_cables.py` — add `POST` and `DELETE`; `backend/app/api/routes/portal_equipment.py` — add `POST` and `DELETE`.
- **Backend schemas**: `backend/app/schemas/cable.py` — add `PortalCableCreate`; `backend/app/schemas/equipment.py` — add `PortalEquipmentCreate`.
- **Frontend BFF routes**: `frontend/app/api/portal/cables/route.ts` (new, POST); `frontend/app/api/portal/cables/[id]/route.ts` (add DELETE handler); `frontend/app/api/portal/equipment/route.ts` (new, POST); `frontend/app/api/portal/equipment/[id]/route.ts` (add DELETE handler).
- **Frontend lib**: `frontend/lib/portalApiClient.ts` — add `cables.create()`, `cables.remove()`, `equipment.create()`, `equipment.remove()`; `frontend/lib/types/portal.ts` — add `PortalCableCreate` and `PortalEquipmentCreate` payload types.
- **Frontend pages**: `frontend/app/portal/cables/page.tsx` — expand table columns, add "New Cable" button; `frontend/app/portal/cables/new/page.tsx` (new); `frontend/app/portal/cables/[id]/page.tsx` — add delete button; `frontend/app/portal/equipment/page.tsx` — expand table columns, add "New Equipment" button; `frontend/app/portal/equipment/new/page.tsx` (new); `frontend/app/portal/equipment/[id]/page.tsx` — add delete button.
- **Frontend components**: `frontend/components/portal/form/CableEditForm.tsx` — expand fields; `frontend/components/portal/form/EquipmentEditForm.tsx` — expand fields; new `CableCreateForm.tsx` and `EquipmentCreateForm.tsx` components; new `DeleteConfirmDialog.tsx` shared component.
- **No database changes**: No schema migrations required.
- **No new dependencies**: Uses existing Next.js, React, TypeScript, and FastAPI stack.
