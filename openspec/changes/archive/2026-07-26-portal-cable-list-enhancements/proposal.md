## Why

The portal cable list page currently lacks basic list-management features that admin users already enjoy: no search, no category/product-type filters, no bulk import, and the NAME column uses a hyperlink instead of a conventional Edit button. The portal sidebar also shows a dynamic role name instead of a fixed brand identity. These gaps make it harder for cable manufacturers to find and manage their cables efficiently, especially as catalog size grows.

## What Changes

- **Sidebar brand**: Replace dynamic `user.role_name || 'Factory Portal'` with a fixed "Unowire" brand label plus a scope-specific subtitle ("Cable Portal" for manufacturers, "Equipment Portal" for equipment manufacturers).
- **List row Edit button**: Remove the hyperlink from the NAME column; display NAME as plain text and add an "Edit" button at the end of each row linking to the detail page.
- **Category filter**: Add a category dropdown on the cable list page that filters cables by `category_id`. Populated from the existing `/api/taxonomy` endpoint.
- **Product type filter**: Add a product-type dropdown on the cable list page that filters cables by `product_type_id`. Populated from the existing `/api/taxonomy` endpoint.
- **Search**: Add a search box on the cable list page that filters cables by `model` field (case-insensitive partial match), matching admin-side behavior.
- **Bulk import**: Add a bulk-import entry point on the cable list page. The import page follows the admin 3-stage workflow (upload → preview → result) and supports CSV and JSON formats. Imported cables are force-bound to the authenticated user's `scope_id` (manufacturer_id), preventing cross-scope data leakage.
- **Backend API extensions**: Extend `GET /api/portal/cables` to accept `search`, `category_id`, and `product_type_id` query parameters. Add `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints scoped to the manufacturer.

## Capabilities

### New Capabilities

(None — all changes extend the existing `portal-cable-crud` capability.)

### Modified Capabilities

- `portal-cable-crud`: Extends the existing cable CRUD spec with list-view enhancements (search, category/product-type filters, Edit-button row action) and a new bulk-import workflow (CSV/JSON upload → preview → commit, force-bound to manufacturer scope).

## Impact

- **Frontend**:
  - `components/portal/layout/PortalSidebar.tsx` — brand label change
  - `app/portal/cables/page.tsx` — list page: remove NAME hyperlink, add Edit button, add search box, add filter dropdowns, add import link
  - `app/portal/cables/import/page.tsx` — new import page (3-stage workflow)
  - `lib/portalApi.ts` / `lib/portalApiClient.ts` — extend `cables.all()` with query params; add `cables.import` namespace
  - `app/api/portal/cables/route.ts` — add GET BFF proxy with query params
  - `app/api/portal/cables/import/{validate,commit,csv-template,json-example}/route.ts` — new BFF proxies
- **Backend**:
  - `app/api/routes/portal_cables.py` — extend GET with search/filter params; add import routes
  - `app/crud/cable.py` — extend `list_by_manufacturer` with search/filter
  - `app/services/cable_import.py` — adapt existing service for portal-scoped import (force manufacturer_id)
- **No database schema changes** — `category_id` and `product_type_id` fields already exist on the Cable model.
- **No breaking changes** — all new parameters are optional with backward-compatible defaults.
