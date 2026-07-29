## Context

The portal equipment list page (`/portal/equipment`) currently provides a minimal experience: a 3-column table (Name, Category, Created) with the Name column as a hyperlink to the detail page, no search, no filtering, and no batch upload. In contrast, the portal cable list page (`/portal/cables`) has a mature feature set: plain-text Name with a separate Edit button, a `CableListToolbar` with search + cascading dropdown filters, and a 3-stage batch upload flow (upload → preview → result) supporting CSV and JSON.

This change brings the equipment list to feature parity with the cable list, adapting the cable patterns to the equipment data model (which has a simpler category tree and no variants).

## Goals / Non-Goals

**Goals:**
- Unify the equipment list UX with the cable list: plain-text Name + explicit Edit button in an Actions column
- Add search and category filter to the equipment list page
- Add batch upload (CSV/JSON) with validate→preview→commit flow, mirroring the cable import pattern
- Enforce manufacturer scope on all import operations (force `manufacturer_id` to `scope_id` after parsing)

**Non-Goals:**
- Equipment data model / database schema changes
- Cascading filter dropdowns (equipment has a flat category tree, not industry→category→product_type)
- Excel/XLSX format support (CSV + JSON only, matching cable import)
- Equipment variant support (equipment has no variants concept)

## Decisions

### D1: Equipment list toolbar uses a single Category dropdown (not cascading)

**Choice:** `EquipmentListToolbar` has one `<select>` for category, populated from `GET /api/equipment-categories`.

**Rationale:** Equipment categories are a flat tree (parent + children), not the 3-level industry→category→product_type hierarchy that cables use. A single dropdown is the correct UX for this data model.

**Alternative considered:** Replicate the cascading pattern with parent→child category dropdowns. Rejected — adds complexity for marginal value, since most equipment manufacturers have few categories.

### D2: Equipment import service mirrors `cable_import` pattern

**Choice:** Create `backend/app/services/equipment_import.py` with the same pipeline structure as `cable_import.py`: `parse_file → _force_manufacturer_id → validate_rows → build_preview / commit_valid_rows`.

**Rationale:** The cable import service is a proven, tested pattern with 4-layer validation (parse errors, field validation, FK existence, duplicate check). Reusing the same architecture ensures consistency and reduces risk.

**Alternative considered:** Generic/shared import service parameterized by model type. Rejected — the cable and equipment data models differ enough (variants vs. JSONB specs, different required fields, different FK sets) that a generic service would be more complex than two focused services.

### D3: Equipment CSV template fields

**Choice:** CSV required columns: `id`, `model`, `slug`, `manufacturer_id`, `category_id`. Optional columns: `description`, `image_url`, `external_url`, `sort_order`, `applicable_specs`.

**Rationale:** Mirrors the cable CSV approach where `id` and `manufacturer_id` are required columns (manufacturer_id is force-overwritten). `applicable_specs` in CSV is a JSON string column (same pattern as how cable CSV handles nested data — if empty, treated as `[]`).

### D4: Equipment JSON format supports nested `applicable_specs`

**Choice:** JSON format is an array of objects with the same fields as CSV, but `applicable_specs` is a native JSON array (not a string-encoded JSON).

**Rationale:** Mirrors cable JSON format where `common_specs` and `variants` are native JSON structures. This lets users with complex `applicable_specs` use the JSON format for richer data.

### D5: Import preview table reuses shared `ImportPreviewTable` component

**Choice:** The equipment import page reuses `frontend/components/admin/cable/ImportPreviewTable.tsx` (or a shared version of it).

**Rationale:** The preview table is generic — it shows row status (valid/skipped/error) and row data. No need to create an equipment-specific variant.

**Alternative considered:** Create `EquipmentImportPreviewTable`. Rejected — unnecessary duplication.

### D6: Equipment import endpoints under `/api/portal/equipment/import/`

**Choice:** Create `backend/app/api/routes/portal_equipment_import.py` with router prefix `/api/portal/equipment/import`, mounted separately from `portal_equipment.py`.

**Rationale:** Mirrors the cable import route structure (`portal_cable_import.py` separate from `portal_cables.py`). Keeps the import logic isolated and the main CRUD router clean.

### D7: Equipment list endpoint extends with optional `search` and `category_id` params

**Choice:** Add `search: str | None = None` and `category_id: str | None = None` query parameters to `GET /api/portal/equipment`, and extend `crud_equipment.list_by_manufacturer` to accept and apply them. Add `q: str | None = None` to `GET /api/recommended-equipments` (admin).

**Rationale:** Directly mirrors the cable list endpoint pattern. Search uses `ilike` on `model` field; category uses equality on `category_id`. Both are optional, so existing callers are unaffected.

### D8: Shared `equipment_import` service module used by both admin and portal

**Choice:** Create `backend/app/services/equipment_import.py` with the core import pipeline (parse, validate, build_preview, commit). Admin and portal routes both call this service. Portal routes add the `_force_manufacturer_id` wrapper; admin routes do not (admin can set any manufacturer_id, subject to RBAC).

**Rationale:** Mirrors the cable import architecture where `app.services.cable_import` is shared between `cable_import.py` (admin) and `portal_cable_import.py` (portal). Avoids duplicating the 4-layer validation logic.

### D9: Admin equipment search uses `q` parameter (not `search`)

**Choice:** Admin equipment list endpoint accepts `q` parameter (matching admin cable list's `q`), while portal equipment list endpoint accepts `search` (matching portal cable list's `search`).

**Rationale:** Each side mirrors its own counterpart — admin cable uses `q`, portal cable uses `search`. Keeping the parameter names consistent within each side avoids confusion.

### D10: Admin equipment import reuses `ImportPreviewTable` component

**Choice:** Admin equipment import page reuses the same `ImportPreviewTable` component as admin cable import and portal cable import.

**Rationale:** The preview table is generic — it shows row status and row data. No need for equipment-specific variant. If the component is cable-coupled, extract a shared generic version during implementation.

## Risks / Trade-offs

- **[Risk] `applicable_specs` in CSV is a JSON string column** → Users may find it awkward to embed JSON in a CSV cell. Mitigation: the JSON format exists for complex specs; CSV is for basic fields. Document clearly in the template.
- **[Risk] Import preview table may show too many columns for equipment** → The shared `ImportPreviewTable` may be cable-specific. Mitigation: check during implementation; if it's cable-coupled, extract a shared generic version or create a minimal equipment-specific table.
- **[Risk] Equipment category tree depth varies** → Some categories have children, some don't. Mitigation: the toolbar dropdown flattens the tree with "Parent — Child" labels, same as `EquipmentFormFields` already does.
- **[Risk] Scope expansion increases task count** → Adding admin-side work roughly doubles the frontend tasks. Mitigation: admin and portal import pages share the same service and similar UI patterns, so implementation is mostly copy-adapt.
