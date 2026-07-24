# Remove Brand — Cable Direct Manufacturer Association

**Date:** 2026-07-22
**Status:** Approved
**Author:** brainstorming session

## Background

Most manufacturers in the project have only one brand. The `Brand` entity acts as an intermediate layer between `Manufacturer` and `Cable`:

```
Cable.brand_id -> Brand.id -> Brand.manufacturer_id -> Manufacturer.id
```

This adds complexity (extra table, extra CRUD, extra routes, extra scope indirection) without business value when each manufacturer maps to exactly one brand. This spec removes `Brand` entirely and lets `Cable` associate directly with `Manufacturer`.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Cable-Manufacturer association | Direct FK `Cable.manufacturer_id -> Manufacturer.id` | Removes the indirection entirely; matches the one-brand-per-manufacturer reality |
| Public URL scheme | `/cable/{manufacturer_slug}/{cable_slug}` | Preserves the two-level URL structure; minimal SEO disruption; cable slugs become unique per manufacturer instead of per brand |
| Brand facet in search | Remove; keep existing Manufacturer facet | Brand and Manufacturer facets highly overlap when one manufacturer = one brand; removing reduces noise |
| Data migration strategy | Truncate cables + brands, rebuild schema, re-seed | MVP stage with only seed data; no production data to preserve; avoids complex backfill logic |

## Architecture

### Data Model Change

**Before:**
```
cables.brand_id (FK -> brands.id, NOT NULL, ondelete=RESTRICT)
brands.id (PK)
brands.manufacturer_id (FK -> manufacturers.id, NOT NULL, ondelete=RESTRICT)
UniqueConstraint(cables.brand_id, cables.slug)
```

**After:**
```
cables.manufacturer_id (FK -> manufacturers.id, NOT NULL, ondelete=RESTRICT)
UniqueConstraint(cables.manufacturer_id, cables.slug)
```

The `brands` table is dropped. `Cable.brand_id` and the `Cable.brand` relationship are removed and replaced by `Cable.manufacturer_id` and `Cable.manufacturer` (lazy="selectin").

### URL Scheme Change

| Before | After |
|---|---|
| `/cable/{brand_slug}/{cable_slug}` | `/cable/{manufacturer_slug}/{cable_slug}` |
| `GET /api/cables/by-url/{brand_slug}/{cable_slug}` | `GET /api/cables/by-url/{manufacturer_slug}/{cable_slug}` |

The frontend route folder `app/(site)/cable/[brand_slug]/[slug]/` keeps its name but `brand_slug` semantically becomes `manufacturer_slug`. No file rename required.

### Scope / Ownership Simplification

Portal ownership check simplifies from a two-hop join to a direct comparison:

```python
# Before
cable.brand.manufacturer_id != user.scope_id

# After
cable.manufacturer_id != user.scope_id
```

The fixed permission matrix for manufacturer-scoped portal users loses the `brands` module:

```python
# Before
_FACTORY_ALLOWED_BY_SCOPE["manufacturer"] = {"dashboard", "cables", "brands", "inquiries", "media", "me"}

# After
_FACTORY_ALLOWED_BY_SCOPE["manufacturer"] = {"dashboard", "cables", "inquiries", "media", "me"}
```

### SEO / JSON-LD

schema.org JSON-LD `brand` field accepts an `Organization` type. After removal:
- `buildCableJsonLd` emits `brand: {"@type": "Organization", "name": manufacturer.name}`
- Canonical URL uses `/cable/{manufacturer_slug}/{cable_slug}`

## Change Scope

### Backend Deletions (8 files)

| File | Content |
|---|---|
| `backend/app/models/brand.py` | `Brand` model |
| `backend/app/crud/brand.py` | `CRUDBrand` + `crud_brand` instance |
| `backend/app/schemas/brand.py` | `BrandBase`, `BrandRead`, `BrandCreate`, `BrandUpdate` |
| `backend/app/api/routes/brands.py` | Admin brand CRUD endpoints |
| `backend/app/api/routes/portal_brands.py` | Portal brand endpoints |
| `backend/tests/api/test_portal_brands.py` | Portal brand tests |
| `frontend/data/brands.json` | Seed data for brands |

### Backend Modifications (11 files)

| File | Change |
|---|---|
| `backend/app/models/cable.py` | `brand_id` -> `manufacturer_id`; drop `brand` relationship, add `manufacturer` relationship; change `UniqueConstraint` |
| `backend/app/models/__init__.py` | Remove `Brand` import/export |
| `backend/app/crud/cable.py` | Replace all `Brand` joins with direct `Manufacturer` joins; `get_by_url` filters by `Manufacturer.slug`; remove brand facet building; `list_by_manufacturer`/`count_by_manufacturer` use `Cable.manufacturer_id` directly (no join) |
| `backend/app/schemas/cable.py` | Remove `BrandFacet`, `BrandRead` import; `CableRead.brand` -> `CableRead.manufacturer` (type `ManufacturerRead`); `CableCreate.brand_id` -> `manufacturer_id`; `CableUpdate.brand_id` -> `manufacturer_id`; remove `FilterFacets.brands`; remove `CableFilterParams.brand` |
| `backend/app/api/routes/cables.py` | Scope check uses `cable.manufacturer_id`; remove `brand` query param; `by-url/{brand_slug}` param renamed `manufacturer_slug` |
| `backend/app/api/routes/portal_cables.py` | Ownership check uses `cable.manufacturer_id`; remove `crud_brand` import |
| `backend/app/api/routes/cable_import_templates.py` | Remove `brand_id` from CSV template headers and examples; add `manufacturer_id` |
| `backend/app/services/cable_import.py` | Replace `brand_id` required column with `manufacturer_id`; load manufacturer IDs for FK validation instead of brand IDs |
| `backend/app/api/deps.py` | Remove `"brands"` from `_FACTORY_ALLOWED_BY_SCOPE["manufacturer"]` |
| `backend/app/main.py` | Remove `brands` and `portal_brands` router registration and imports |
| `backend/scripts/seed.py` | Remove `seed_brands`; remove `Brand` import; `seed_cables` reads `manufacturer_id` from cables.json instead of `brand_id`; update `truncate_all` to remove `brands` |

### Database Migration

New Alembic migration (down_revision = latest):
1. `DROP TABLE IF EXISTS brands CASCADE`
2. `ALTER TABLE cables DROP COLUMN brand_id`
3. `ALTER TABLE cables ADD COLUMN manufacturer_id VARCHAR(100) NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT`
4. Drop old `UniqueConstraint(brand_id, slug)`
5. `ALTER TABLE cables ADD CONSTRAINT uq_cables_manufacturer_slug UNIQUE (manufacturer_id, slug)`
6. Seed data is reloaded via `scripts/seed.py` after migration

### Frontend Deletions

| Path | Content |
|---|---|
| `frontend/app/admin/(dashboard)/brands/` | Entire directory (list, new, edit pages) |
| `frontend/app/portal/brands/` | Entire directory (list, edit pages) |
| `frontend/components/admin/form/BrandForm.tsx` | Admin brand form |
| `frontend/components/portal/form/BrandEditForm.tsx` | Portal brand edit form |
| `frontend/app/api/admin/brands/` | Admin brand API proxy routes |
| `frontend/app/api/portal/brands/` | Portal brand API proxy routes |

### Frontend Modifications (14 files)

| File | Change |
|---|---|
| `frontend/lib/types.ts` | Remove `Brand` interface; `CableListItem.brand` -> `.manufacturer`; `CableDetailResponse.brand` -> `.manufacturer`; remove `FilterFacets.brands`; remove `CableQueryParams.brand` |
| `frontend/lib/api.ts` | Remove `api.brands` namespace; `getCableUrl` uses `cable.manufacturer.slug`; `adaptCable` attaches `manufacturer` instead of `brand`; `getCableDetail` no longer fetches brand separately |
| `frontend/lib/adminApi.ts` | Remove `BackendBrand` interface, `adaptBrand`, `adminApi.brands` namespace |
| `frontend/lib/portalApi.ts` | Remove `portalApi.brands` namespace |
| `frontend/lib/seo.ts` | `generateCableMetadata(cable, manufacturer)` uses `manufacturer.name`/`manufacturer.slug`; `buildCableJsonLd` brand field uses manufacturer |
| `frontend/lib/validate.ts` | Uniqueness check uses `(manufacturer.slug, cable.slug)` |
| `frontend/lib/adminModules.ts` | Remove `{ id: "brands", ... }` module registration |
| `frontend/lib/adminMenuRegistry.ts` | Remove `{ pageId: "brands", ... }` menu item |
| `frontend/components/cable/CableCard.tsx` | `brand` prop -> `manufacturer` prop |
| `frontend/components/cable/CableFilters.tsx` | Remove Brand facet checkbox group |
| `frontend/components/admin/form/ManufacturerShowcaseBlocks.tsx` | `cable.brand?.name` -> `cable.manufacturer?.name` |
| `frontend/components/admin/layout/AdminSidebar.tsx` | Remove `brands: 'brands'` from `PAGE_ID_TO_MODULE_ID` |
| `frontend/components/portal/layout/PortalSidebar.tsx` | Remove `{ label: 'Brands', ... }` from `MANUFACTURER_NAV` |
| `frontend/app/sitemap.ts` | No code change — `getCableUrl(cable)` is called as-is; the function's internal implementation changes (in `lib/api.ts`) to use `cable.manufacturer.slug`, so sitemap automatically picks up the new URL scheme |

### Test Updates (7 files)

| File | Change |
|---|---|
| `backend/tests/api/test_portal_brands.py` | Delete |
| `backend/tests/api/test_portal_crud.py` | Remove `crud_brand` import; update cable assertions to use `cable.manufacturer_id` |
| `backend/tests/api/test_rbac_permissions.py` | Remove `test_admin_can_create_brand` |
| `backend/tests/api/test_admin_roles.py` | Remove `"brands"` from role permission assertions |
| `backend/tests/api/test_portal_auth.py` | Remove `"brands"` from `allowed_modules` assertion |
| `backend/tests/api/test_admin_menu.py` | Remove `"pageId": "brands"` test payload |
| `backend/tests/api/test_page_views.py` | Update `real_entity_ids` fixture to use `Cable.manufacturer_id` directly (no Brand join) |
| `backend/tests/conftest.py` | Remove `DELETE FROM brands WHERE slug = 'test-brand-rbac'` cleanup |

### Seed Data Updates

| File | Change |
|---|---|
| `frontend/data/brands.json` | Delete |
| `frontend/data/cables.json` | Replace `brand_id` field with `manufacturer_id` in each cable object |

## Out of Scope (YAGNI)

- **URL redirects** from `/cable/{old_brand_slug}/...` to new URLs — MVP stage has no external backlinks to break
- **Backward compatibility shim** for `brand_id` field — clean break, no API consumers to support
- **Equipment module refactoring** — `RecommendedEquipment` already uses `manufacturer_id` directly and does not depend on `Brand`
- **Brand-to-manufacturer merge UI** — no data to merge (truncating and re-seeding)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed brand reference causes runtime error | Medium | Grep for `brand` (case-insensitive) across entire codebase post-implementation; run full test suite (205 tests) |
| Cable slug collision after switching uniqueness from brand to manufacturer | Low | Seed data cables already have unique slugs; validate during seed |
| Broken SEO for indexed pages | Low | MVP stage, no indexed pages yet |
| Migration fails on non-empty database | Low | Migration designed for truncate-and-rebuild; `truncate_all` in seed.py handles cleanup |
