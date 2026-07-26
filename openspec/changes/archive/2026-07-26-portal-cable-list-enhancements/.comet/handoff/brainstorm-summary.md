# Brainstorm Summary

- Change: portal-cable-list-enhancements
- Date: 2026-07-26

## Confirmed Technical Approach

The portal cable list page will be enhanced to follow the admin cable list page pattern: a server component that reads URL query params (`search`, `industry_id`, `category_id`, `product_type_id`) and fetches cables via an extended `portalApi.cables.all(params)`. A new client component `CableListToolbar` will integrate the search box and three cascading filter dropdowns (industry → category → product_type), reading options from the existing `/api/taxonomy` tree.

The NAME column hyperlink will be removed; each row will display plain text and an "Edit" button at the end linking to `/portal/cables/{id}`. The sidebar brand will be replaced with fixed "Unowire" + scope-specific subtitle ("Cable Portal" or "Equipment Portal") derived from `user.scope_type`.

For bulk import, a new `app/api/routes/portal_cable_import.py` will reuse `app/services/cable_import.py` (parse_file, validate_rows, build_preview, commit_valid_rows) with a portal-specific route handler that forces `manufacturer_id = user.scope_id` on every parsed row BEFORE validation. This post-parse injection overrides any client-supplied value, satisfying the security-critical scope enforcement. CSV/JSON template endpoints will be added that pre-fill `manufacturer_id` with the user's scope.

A new BFF route `GET /api/portal/cables` will proxy query params + `portal_token` cookie to the backend. New BFF routes for `/api/portal/cables/import/{validate,commit,csv-template,json-example}` will follow the admin BFF multipart proxy pattern. The frontend import page (`/portal/cables/import`) will mirror the admin 3-stage workflow (upload → preview → result) and reuse the admin `ImportPreviewTable` component directly (it is generic, takes `ImportPreviewRow[]`).

## Key Trade-offs and Risks

- **[Risk] Import file could contain arbitrary `manufacturer_id`** → Mitigated by post-parse injection that overwrites `manufacturer_id` with `user.scope_id` BEFORE validation, so even if the file supplies a different manufacturer, the FK check passes against the user's own scope and the created cables are bound to the user. This mirrors the `POST /api/portal/cables` create-endpoint pattern.
- **[Risk] Large import files blocking event loop** → Reuses admin limits (MAX_ROWS=500, 5MB); same enforced by shared `parse_file` service.
- **[Trade-off] No pagination on portal cable list** → Accepted for MVP; current limit=50 with search/filter narrows results sufficiently. Full pagination deferred.
- **[Trade-off] Search is model-only (case-insensitive partial match)** → Accepted by user decision; matches admin behavior. Can extend later without breaking changes.
- **[Trade-off] Cascading filters require clearing descendant state on parent change** → Implemented client-side in `CableListToolbar` by removing descendant URL params when a parent changes. Adds slight UX complexity but matches user's chosen 3-level cascading pattern.

## Testing Strategy

**Backend pytest tests** (mirroring admin import test structure):
- `?search=AWG` returns matching cables (case-insensitive, scoped)
- `?industry_id=X`, `?category_id=Y`, `?product_type_id=Z` filters (exact match, scoped)
- Combined `?search=&industry_id=&category_id=&product_type_id=` AND logic
- No-params backward compatibility (returns up to 50 scoped cables)
- `?search=NONEXISTENT` returns 200 OK with empty list
- Import validate (CSV) returns preview, no persistence
- Import commit (CSV) creates cables with forced `manufacturer_id`
- Import forces `manufacturer_id = user.scope_id` (ignores file value)
- Import rejects >500 rows (400) and >5MB file (413)
- `equipment_manufacturer` user gets 403 on import endpoints
- Import JSON format (validate + commit) with nested structures

**Frontend verification**:
- `tsc --noEmit` — no type errors
- `next build` — build succeeds with new routes compiled
- Manual smoke: sidebar brand, search/filter/Edit-button, import workflow (CSV + JSON)

## Spec Patches

The original delta spec only mentioned `search`, `category_id`, `product_type_id` parameters. After the user selected 3-level cascading filters (industry → category → product_type), two patches were applied to `specs/portal-cable-crud/spec.md`:

1. **Added `industry_id` to search-and-filter requirement**: Extended the backend filter requirement to accept an optional `industry_id` query parameter (exact match), and added a corresponding scenario (`Filter by industry_id`) plus an updated combined-filter scenario covering all four parameters.

2. **Rewrote filter-dropdown requirement as cascading**: Replaced the original "category and product-type filter dropdowns" requirement with a new "cascading industry, category, and product-type filter dropdowns" requirement. Added 6 scenarios covering: industry filter, category cascade from industry, product-type cascade from category, changing industry clears descendants, changing category clears product-type, and clear filter behavior.
