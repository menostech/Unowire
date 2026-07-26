## Context

The portal cable list page (`/portal/cables`) currently provides only a flat list of cables with a "New Cable" button. The page lacks search, category/product-type filters, bulk import, and uses a hyperlink on the NAME column instead of a conventional Edit button. The portal sidebar shows a dynamic `user.role_name` instead of a fixed brand identity.

The admin side already has a mature cable-import workflow (`/admin/cables/import`) with a 3-stage upload → preview → result flow supporting CSV and JSON. The backend service (`app/services/cable_import.py`) is global (not scoped). The portal needs an equivalent capability but force-bound to the manufacturer's `scope_id` to prevent cross-scope data leakage.

The Cable model already has `category_id` and `product_type_id` FK fields. The `/api/taxonomy` endpoint already returns category and product-type trees. No schema changes are needed.

## Goals / Non-Goals

**Goals:**
- Improve portal cable list usability with search, category/product-type filters, and Edit-button row actions
- Add portal-scoped bulk import (CSV/JSON) reusing the admin 3-stage workflow pattern
- Fix portal sidebar brand to show "Unowire" + scope-specific subtitle
- All new list parameters are optional and backward-compatible

**Non-Goals:**
- Modify admin-side cable list or import (only portal)
- Database schema changes (fields already exist)
- Modify cable detail/edit page behavior
- Add pagination to portal cable list (deferred; current limit=50 is sufficient for MVP)
- Equipment list page enhancements (only cable list; sidebar change affects both scopes but is a text-only change)

## Decisions

### D1: Reuse admin cable_import service with portal-scoped wrapper

**Choice:** Reuse `app/services/cable_import.py` (parse_file, validate_rows, build_preview, commit_valid_rows) and add a portal-specific route handler that forces `manufacturer_id = user.scope_id` before calling the service.

**Rationale:** The admin import service is already tested and mature. Duplicating the parsing/validation logic would create maintenance burden. The only difference is scope enforcement, which belongs in the route handler (not the service).

**Alternatives considered:**
- *Copy the service into a portal-specific module*: rejected — duplicates ~200 lines of parsing/validation logic
- *Make the service accept an optional scope parameter*: rejected — mixes concerns; the service should remain scope-agnostic, and the route handler enforces scope

### D2: List search/filter via optional query parameters on existing endpoint

**Choice:** Extend `GET /api/portal/cables` with optional `search`, `category_id`, and `product_type_id` query parameters. All are optional and combine with AND logic. `search` performs case-insensitive partial match on `model` field only.

**Rationale:** Keeps the API backward-compatible (existing callers without params get the same behavior). Single endpoint avoids fragmenting the API. Model-only search matches admin-side behavior.

**Alternatives considered:**
- *Separate `/api/portal/cables/search` endpoint*: rejected — unnecessary endpoint proliferation; query params are the RESTful convention for filtering
- *Full-text search across multiple fields*: rejected by user decision (model-only for MVP)

### D3: Portal import forces manufacturer_id from user scope

**Choice:** The portal import commit route reads `user.scope_id` and forces it as `manufacturer_id` for every row, ignoring any client-supplied `manufacturer_id` in the import file. This mirrors the existing `POST /api/portal/cables` create-endpoint pattern (line 92 of portal_cables.py).

**Rationale:** Security-critical. Without forced scoping, a manufacturer could import cables under another manufacturer's scope. The create endpoint already follows this pattern; import must match.

### D4: Reuse /api/taxonomy for filter dropdown data

**Choice:** The portal cable list page fetches category and product-type options from the existing `/api/taxonomy` endpoint (already used by the list page for label resolution). No new endpoint needed.

**Rationale:** The endpoint already returns the full tree. Adding a dedicated filter-options endpoint would be redundant.

### D5: Sidebar brand shows "Unowire" + scope-specific subtitle

**Choice:** Replace `{user?.role_name || 'Factory Portal'}` with a fixed structure: `Unowire` as the main brand text + a subtitle span showing "Cable Portal" (for `manufacturer` scope) or "Equipment Portal" (for `equipment_manufacturer` scope). Styled to match the admin sidebar's `Unowire <span>Admin</span>` pattern.

**Rationale:** User requested fixed "Unowire" text. Adding a scope-specific subtitle preserves context (users know which portal they're in) without introducing a dynamic brand. Matches admin sidebar convention.

## Risks / Trade-offs

- **[Risk] Portal import file could contain cables with arbitrary manufacturer_id** → Mitigation: D3 forces scope_id at commit time; validation preview also strips/overrides manufacturer_id before showing preview
- **[Risk] Large import files could block the event loop** → Mitigation: existing admin import enforces MAX_ROWS=500 and MAX file size 5MB; portal reuses the same limits
- **[Trade-off] No pagination on portal cable list** → Accepted for MVP; current limit=50 is sufficient for most manufacturers. If a manufacturer exceeds 50 cables, they can use search/filter to narrow results. Full pagination deferred to a future change.
- **[Trade-off] Search is model-only** → Accepted by user decision; matches admin behavior. Can extend to more fields in a future change without breaking changes.
