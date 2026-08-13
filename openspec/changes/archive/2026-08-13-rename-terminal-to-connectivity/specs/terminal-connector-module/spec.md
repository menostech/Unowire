## MODIFIED Requirements

### Requirement: Terminal manufacturer management
The system SHALL provide full CRUD for connectivity manufacturers via admin API at `/api/connectivity-manufacturers`, scoped by the `connectivity_mfrs` admin module. Creating a manufacturer SHALL auto-provision a media folder tree (root + `logos`, `products`, `docs` subfolders) under the "Terminal Manufacturers" container (container name preserved for backward compatibility). Deleting a manufacturer SHALL clean up associated media folders and uploads. The admin module id `connectivity_mfrs` SHALL be accepted as an alias for the legacy `terminal_mfrs` id in permission checks.

#### Scenario: Admin creates a terminal manufacturer
- **NOTE** Renamed to "Admin creates a connectivity manufacturer" — preserved below.
- **WHEN** an operator with `terminal_mfrs` permission sends POST `/api/terminal-manufacturers` with name, slug, country, website
- **THEN** the system returns 410 Gone with `Location: /api/connectivity-manufacturers` (migration note; old scenarios retained explicitly so archive does not drop them)

#### Scenario: Admin creates a connectivity manufacturer
- **WHEN** an operator with `connectivity_mfrs` permission sends POST `/api/connectivity-manufacturers` with name, slug, country, website
- **THEN** the system creates the manufacturer record and provisions the media folder tree

#### Scenario: Terminal manufacturer edits their own profile via portal
- **NOTE** Renamed to "Connectivity manufacturer edits their own profile via portal" — preserved below.
- **WHEN** a portal user with legacy `scope_type=terminal_manufacturer` requests their manufacturer data
- **THEN** JWT scope_type is transparently remapped to `connectivity_manufacturer` and the system returns only the manufacturer matching their `scope_id`

#### Scenario: Connectivity manufacturer edits their own profile via portal
- **WHEN** a portal user with `scope_type=connectivity_manufacturer` requests their manufacturer data
- **THEN** the system returns only the manufacturer matching their `scope_id`

#### Scenario: Admin deletes a terminal manufacturer
- **NOTE** Renamed to "Admin deletes a connectivity manufacturer" — preserved below.
- **WHEN** an operator deletes a manufacturer that has associated products
- **THEN** the system rejects deletion with 409 Conflict (RESTRICT FK)

#### Scenario: Admin deletes a connectivity manufacturer
- **WHEN** an operator deletes a manufacturer that has associated products
- **THEN** the system rejects deletion with 409 Conflict (RESTRICT FK)

### Requirement: Terminal category management
The system SHALL provide a 2-level self-referential category tree via admin API at `/api/connectivity-categories`. Categories SHALL have composite IDs (`slug` for top-level, `parent_id/slug` for children). The system SHALL reject creating a 3rd-level category and reject deleting a category that has children. The legacy admin module id `terminal_cats` SHALL resolve to `connectivity_cats` for permission checks.

#### Scenario: Create top-level category
- **WHEN** operator creates a category with no parent
- **THEN** the system creates it with `id = slug`

#### Scenario: Create child category
- **WHEN** operator creates a category with `parent_id = "processing"`
- **THEN** the system creates it with `id = "processing/{slug}"`

#### Scenario: Reject 3rd-level category
- **WHEN** operator creates a category whose parent already has a parent
- **THEN** the system rejects with 400 Bad Request

#### Scenario: Reject deleting category with children
- **WHEN** operator deletes a category that has child categories
- **THEN** the system rejects with 409 Conflict

### Requirement: Terminal product management (admin)
The system SHALL provide full CRUD for connectivity products via admin API at `/api/connectivity`, scoped by the `connectivity_list` admin module. Each product SHALL have a manufacturer_id (FK to terminal_manufacturers table), category_id (FK to terminal_categories table), model, globally-unique slug, and `applicable_specs` JSONB for cable-matching rules. The admin module id `connectivity_list` SHALL be accepted as an alias for the legacy `terminal_list` id in permission checks.

#### Scenario: Admin creates a terminal product
- **NOTE** Renamed to "Admin creates a connectivity product" — preserved below.
- **WHEN** operator with `terminal_list` permission POSTs to legacy `/api/terminals`
- **THEN** the system returns 410 Gone with `Location: /api/connectivity`

#### Scenario: Admin creates a connectivity product
- **WHEN** operator with `connectivity_list` permission creates a product with manufacturer_id, category_id, model, slug, applicable_specs
- **THEN** the system creates the product record

#### Scenario: Terminal manufacturer role can only manage own products
- **NOTE** Renamed to "Connectivity manufacturer role can only manage own products" — preserved below.
- **WHEN** a portal user with legacy `scope_type=terminal_manufacturer` attempts to create a product for a different manufacturer_id
- **THEN** the system rejects with 403 Forbidden

#### Scenario: Connectivity manufacturer role can only manage own products
- **WHEN** a portal user with `scope_type=connectivity_manufacturer` attempts to create a product for a different manufacturer_id
- **THEN** the system rejects with 403 Forbidden

### Requirement: Terminal product management (portal)
The system SHALL provide scope-filtered CRUD for connectivity products via portal API at `/api/portal/connectivity`. The system SHALL force `manufacturer_id` to the authenticated user's `scope_id` on create, ignoring any client-supplied value. Product IDs SHALL be server-generated as `{manufacturer_slug}-{product_slug}`. Portal users with legacy JWT tokens encoding `scope_type=terminal_manufacturer` SHALL be transparently remapped to `scope_type=connectivity_manufacturer` on token decode.

#### Scenario: Portal user lists their own products
- **WHEN** a portal user with `scope_type=connectivity_manufacturer` (or remapped from `terminal_manufacturer`) requests GET `/api/portal/connectivity`
- **THEN** the system returns only products where `manufacturer_id == user.scope_id`

#### Scenario: Portal user creates a product
- **WHEN** portal user POST `/api/portal/connectivity` with category_id, model, slug, applicable_specs
- **THEN** the system creates the product with `manufacturer_id` forced to `user.scope_id` and `id` generated as `{manufacturer_slug}-{slug}`

#### Scenario: Portal user cannot access another manufacturer's product
- **WHEN** portal user requests GET `/api/portal/connectivity/{id}` for a product not belonging to their scope
- **THEN** the system returns 404 Not Found

### Requirement: Terminal public browsing
The system SHALL provide public pages at `/connectivity` (listing with category/manufacturer/spec filters), `/connectivity/[slug]` (product detail), and `/connectivity/manufacturers/[slug]` (manufacturer profile). Product detail SHALL render `applicable_specs` as a matching-rules table and include an inquiry form with `recipientType="terminal_manufacturer"` (recipient_type value preserved for backward compatibility). Old URLs at `/terminals/**` SHALL 308-redirect to the equivalent `/connectivity/**` path.

#### Scenario: Public user browses terminal listing
- **NOTE** Redirected path; renamed to "Public user browses connectivity listing" — preserved below.
- **WHEN** a visitor navigates to `/terminals`
- **THEN** the system responds with 308 redirect to `/connectivity`

#### Scenario: Public user browses connectivity listing
- **WHEN** a visitor navigates to `/connectivity`
- **THEN** the system renders all connectivity products with category navigation and faceted filters

#### Scenario: Public user views terminal product detail
- **NOTE** Redirected path; renamed to "Public user views connectivity product detail" — preserved below.
- **WHEN** a visitor navigates to `/terminals/{slug}`
- **THEN** the system responds with 308 redirect to `/connectivity/{slug}`

#### Scenario: Public user views connectivity product detail
- **WHEN** a visitor navigates to `/connectivity/{slug}`
- **THEN** the system renders the product with image, manufacturer link, category badge, applicable specs table, and inquiry form

#### Scenario: Public user views terminal manufacturer profile
- **NOTE** Redirected path; renamed to "Public user views connectivity manufacturer profile" — preserved below.
- **WHEN** a visitor navigates to `/terminals/manufacturers/{slug}`
- **THEN** the system responds with 308 redirect to `/connectivity/manufacturers/{slug}`

#### Scenario: Public user views connectivity manufacturer profile
- **WHEN** a visitor navigates to `/connectivity/manufacturers/{slug}`
- **THEN** the system renders the manufacturer profile with contact info and their product grid

#### Scenario: Old terminal URL redirects to connectivity
- **WHEN** a visitor navigates to `/terminals/ring-terminal-rt100`
- **THEN** the system responds with 308 redirect to `/connectivity/ring-terminal-rt100`

### Requirement: Terminal CSV/JSON import (admin)
The system SHALL provide admin import endpoints at `/api/admin/connectivity/import/validate` and `/api/admin/connectivity/import/commit`, scoped by `connectivity_list` module. CSV template and JSON example SHALL be available at `/api/admin/connectivity/import/csv-template` and `/api/admin/connectivity/import/json-example`. Old import paths at `/api/admin/terminals/import/**` SHALL return 410 Gone with a Location header pointing to the new path.

#### Scenario: Admin validates a CSV file
- **WHEN** operator uploads a CSV file to `/api/admin/connectivity/import/validate`
- **THEN** the system parses and validates rows, returning per-row success/error status without persisting

#### Scenario: Admin commits validated rows
- **WHEN** operator posts validated rows to `/api/admin/connectivity/import/commit`
- **THEN** the system creates the connectivity product records

### Requirement: Terminal CSV/JSON import (portal)
The system SHALL provide portal import endpoints at `/api/portal/connectivity/import/validate` and `/api/portal/connectivity/import/commit`, scoped by `connectivity_manufacturer` scope_type. The system SHALL force `manufacturer_id` to `user.scope_id` on all parsed rows before validation. Old import paths at `/api/portal/terminals/import/**` SHALL return 410 Gone with a Location header.

#### Scenario: Portal user imports products
- **WHEN** portal user uploads a CSV with manufacturer_id column set to a different manufacturer
- **THEN** the system overwrites manufacturer_id with the user's scope_id before validation

### Requirement: Terminal media folder provisioning
The system SHALL provision a media folder tree when a connectivity manufacturer is created: a root folder named after the manufacturer under the "Terminal Manufacturers" container (container name preserved for backward compatibility), with 3 protected subfolders (`logos`, `products`, `docs`). Renaming the manufacturer SHALL rename the root folder. Deleting the manufacturer SHALL remove all associated folders, upload records, and disk files.

#### Scenario: Media folders provisioned on manufacturer creation
- **WHEN** admin creates a connectivity manufacturer named "ACME Connectivity"
- **THEN** the system creates a root folder "ACME Connectivity" under "Terminal Manufacturers" container with `logos`, `products`, `docs` subfolders

#### Scenario: Media folders cleaned up on manufacturer deletion
- **WHEN** admin deletes a connectivity manufacturer
- **THEN** the system removes all media folders and uploads associated with that manufacturer's scope

### Requirement: Terminal inquiry linkage
The system SHALL allow public users to send inquiries to connectivity manufacturers via the existing inquiry system with `recipient_type="terminal_manufacturer"` (recipient_type value preserved for backward compatibility) and `recipient_id=<manufacturer_id>`. Portal users with `connectivity_manufacturer` scope (or remapped from `terminal_manufacturer`) SHALL receive and reply to these inquiries via `/api/portal/inquiries`.

#### Scenario: Public user sends inquiry to terminal manufacturer
- **NOTE** Renamed to "Public user sends inquiry to connectivity manufacturer" — preserved below. `recipient_type` value stays `"terminal_manufacturer"` for backward compatibility.
- **WHEN** a visitor submits the inquiry form on a connectivity manufacturer's product page
- **THEN** the system creates an inquiry with `recipient_type="terminal_manufacturer"` and `recipient_id` set to the manufacturer's ID

#### Scenario: Public user sends inquiry to connectivity manufacturer
- **WHEN** a visitor submits the inquiry form on a connectivity manufacturer's product page
- **THEN** the system creates an inquiry with `recipient_type="terminal_manufacturer"` and `recipient_id` set to the manufacturer's ID

#### Scenario: Portal terminal manufacturer views inquiries
- **NOTE** Renamed to "Portal connectivity manufacturer views inquiries" — preserved below. Legacy scope_type transparently remapped.
- **WHEN** a portal user with legacy `scope_type=terminal_manufacturer` requests their inquiries
- **THEN** the system returns inquiries where `recipient_type="terminal_manufacturer"` and `recipient_id == user.scope_id`

#### Scenario: Portal connectivity manufacturer views inquiries
- **WHEN** a portal user with `scope_type=connectivity_manufacturer` requests their inquiries
- **THEN** the system returns inquiries where `recipient_type="terminal_manufacturer"` and `recipient_id == user.scope_id`

### Requirement: Header search terminal category
The system SHALL include "Connectivity" as a third category option in the header search box dropdown. Selecting "Connectivity" SHALL route searches to `/connectivity?q=` and update the placeholder to "Search connectivity model, brand...". The old category value `"terminal"` SHALL be transparently mapped to `"connectivity"` for cached client bundles.

#### Scenario: User searches for terminals from header
- **NOTE** Renamed to "User searches for connectivity products from header" — preserved below. Old cached category value `"terminal"` continues to work via mapping.
- **WHEN** a stale cached JS bundle submits a search with category value `"terminal"`
- **THEN** the system maps it to `"connectivity"` and navigates to `/connectivity?q={query}`

#### Scenario: User searches for connectivity products from header
- **WHEN** a visitor selects "Connectivity" in the header search dropdown and submits a query
- **THEN** the system navigates to `/connectivity?q={query}`

#### Scenario: Cached JS bundle sends old terminal category value
- **WHEN** a stale cached JS bundle submits a search with category value `"terminal"`
- **THEN** the system maps it to `"connectivity"` and navigates to `/connectivity?q={query}`