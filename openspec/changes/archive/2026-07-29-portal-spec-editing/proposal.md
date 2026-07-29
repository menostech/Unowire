## Why

Portal manufacturers currently cannot enter spec data when creating or editing cables and equipment through the portal UI — they must ask an admin to do it. This forces a context switch and delays product data completeness. Specs are already optional fields in the data model; exposing them in the portal forms (as optional JSON, matching the admin pattern) lets manufacturers self-serve and keeps spec data co-located with the product record.

## What Changes

- Add optional "Common Specs (JSON)" and "Variants (JSON)" textarea fields to the portal cable create/edit form, reusing the admin cable form's raw-JSON textarea + `JSON.parse` validation pattern.
- Add optional "Applicable Specs (JSON)" textarea field to the portal equipment create/edit form, reusing the admin equipment form's pattern.
- Extend `PortalCableCreate` schema to accept optional `common_specs` and `variants` fields (currently excluded by design).
- Extend `PortalEquipmentCreate` schema to accept optional `applicable_specs` (currently excluded by design).
- Remove the spec-stripping in the portal cable PUT route (`exclude={"common_specs", "variants"}`) so portal updates can persist specs; portal cable update path stays scope-guarded by `manufacturer_id`.
- Validation is JSON-syntax-only (matching admin): invalid JSON shows a red border + error message and blocks submit; valid JSON is parsed and sent to the backend. No structural/schema validation of spec field contents.
- No admin form changes, no new database columns, no migrations.

## Capabilities

### New Capabilities
<!-- None — this change extends existing portal CRUD capabilities. -->

### Modified Capabilities
- `portal-cable-crud`: Portal cable create/edit forms accept optional `common_specs` and `variants` JSON; backend `PortalCableCreate` and portal PUT route accept and persist these fields.
- `portal-equipment-crud`: Portal equipment create/edit forms accept optional `applicable_specs` JSON; backend `PortalEquipmentCreate` accepts and persists this field.

## Impact

- **Backend schemas**: `backend/app/schemas/cable.py` (`PortalCableCreate`), `backend/app/schemas/equipment.py` (`PortalEquipmentCreate`).
- **Backend routes**: `backend/app/api/routes/portal_cables.py` (remove spec exclusion in PUT), `backend/app/api/routes/portal_equipment.py` (no route change needed, create route passes through).
- **Frontend forms**: `frontend/components/portal/form/CableFormFields.tsx` (add 2 JSON textareas + validation state), `frontend/components/portal/form/EquipmentFormFields.tsx` (add 1 JSON textarea + validation state), corresponding create/edit form wrappers.
- **Frontend API client**: `frontend/lib/portalApi.ts` / `portalApiClient.ts` — types already include specs (reuses admin types); may need to extend portal create/update payloads.
- **BFF routes**: `frontend/app/api/portal/cables/route.ts` (POST/PUT forward body as-is, no change needed), `frontend/app/api/portal/equipment/route.ts` (same).
- **Tests**: Backend pytest for portal cable/equipment create+update with specs; frontend no automated tests (MVP).
- **No database migrations** — spec storage columns/tables already exist (`spec_items` for cables, `applicable_specs` JSONB for equipment).
