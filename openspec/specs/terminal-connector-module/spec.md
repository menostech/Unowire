# terminal-connector-module Specification

## Purpose
TBD - created by archiving change add-terminal-connector-manufacturers. Update Purpose after archive.
## Requirements
### Requirement: Terminal manufacturer management
The system SHALL provide full CRUD for terminal manufacturers via admin API at `/api/terminal-manufacturers`, scoped by the `terminal_mfrs` admin module. Creating a manufacturer SHALL auto-provision a media folder tree (root + `logos`, `products`, `docs` subfolders) under the "Terminal Manufacturers" container. Deleting a manufacturer SHALL clean up associated media folders and uploads.

#### Scenario: Admin creates a terminal manufacturer
- **WHEN** an operator with `terminal_mfrs` permission sends POST `/api/terminal-manufacturers` with name, slug, country, website
- **THEN** the system creates the manufacturer record and provisions the media folder tree

#### Scenario: Terminal manufacturer edits their own profile via portal
- **WHEN** a portal user with `scope_type=terminal_manufacturer` requests their manufacturer data
- **THEN** the system returns only the manufacturer matching their `scope_id`

#### Scenario: Admin deletes a terminal manufacturer
- **WHEN** an operator deletes a manufacturer that has associated products
- **THEN** the system rejects deletion with 409 Conflict (RESTRICT FK)

### Requirement: Terminal category management
The system SHALL provide a 2-level self-referential category tree via admin API at `/api/terminal-categories`. Categories SHALL have composite IDs (`slug` for top-level, `parent_id/slug` for children). The system SHALL reject creating a 3rd-level category and reject deleting a category that has children.

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
The system SHALL provide full CRUD for terminal products via admin API at `/api/terminals`, scoped by the `terminal_list` admin module. Each product SHALL have a manufacturer_id (FK to terminal_manufacturers), category_id (FK to terminal_categories), model, globally-unique slug, and `applicable_specs` JSONB for cable-matching rules.

#### Scenario: Admin creates a terminal product
- **WHEN** operator with `terminal_list` permission creates a product with manufacturer_id, category_id, model, slug, applicable_specs
- **THEN** the system creates the product record

#### Scenario: Terminal manufacturer role can only manage own products
- **WHEN** a portal user with `scope_type=terminal_manufacturer` attempts to create a product for a different manufacturer_id
- **THEN** the system rejects with 403 Forbidden

### Requirement: Terminal product management (portal)
The system SHALL provide scope-filtered CRUD for terminal manufacturers via portal API at `/api/portal/terminals`. The system SHALL force `manufacturer_id` to the authenticated user's `scope_id` on create, ignoring any client-supplied value. Product IDs SHALL be server-generated as `{manufacturer_slug}-{product_slug}`.

#### Scenario: Portal user lists their own products
- **WHEN** a portal user with `scope_type=terminal_manufacturer` requests GET `/api/portal/terminals`
- **THEN** the system returns only products where `manufacturer_id == user.scope_id`

#### Scenario: Portal user creates a product
- **WHEN** portal user POST `/api/portal/terminals` with category_id, model, slug, applicable_specs
- **THEN** the system creates the product with `manufacturer_id` forced to `user.scope_id` and `id` generated as `{manufacturer_slug}-{slug}`

#### Scenario: Portal user cannot access another manufacturer's product
- **WHEN** portal user requests GET `/api/portal/terminals/{id}` for a product not belonging to their scope
- **THEN** the system returns 404 Not Found

### Requirement: Terminal public browsing
The system SHALL provide public pages at `/terminals` (listing with category/manufacturer/spec filters), `/terminals/[slug]` (product detail), and `/terminals/manufacturers/[slug]` (manufacturer profile). Product detail SHALL render `applicable_specs` as a matching-rules table and include an inquiry form with `recipientType="terminal_manufacturer"`.

#### Scenario: Public user browses terminal listing
- **WHEN** a visitor navigates to `/terminals`
- **THEN** the system renders all terminals with category navigation and faceted filters

#### Scenario: Public user views terminal product detail
- **WHEN** a visitor navigates to `/terminals/{slug}`
- **THEN** the system renders the product with image, manufacturer link, category badge, applicable specs table, and inquiry form

#### Scenario: Public user views terminal manufacturer profile
- **WHEN** a visitor navigates to `/terminals/manufacturers/{slug}`
- **THEN** the system renders the manufacturer profile with contact info and their product grid

### Requirement: Terminal CSV/JSON import (admin)
The system SHALL provide admin import endpoints at `/api/admin/terminals/import/validate` and `/api/admin/terminals/import/commit`, scoped by `terminal_list` module. CSV template and JSON example SHALL be available at `/api/admin/terminals/import/csv-template` and `/api/admin/terminals/import/json-example`.

#### Scenario: Admin validates a CSV file
- **WHEN** operator uploads a CSV file to `/api/admin/terminals/import/validate`
- **THEN** the system parses and validates rows, returning per-row success/error status without persisting

#### Scenario: Admin commits validated rows
- **WHEN** operator posts validated rows to `/api/admin/terminals/import/commit`
- **THEN** the system creates the terminal product records

### Requirement: Terminal CSV/JSON import (portal)
The system SHALL provide portal import endpoints at `/api/portal/terminals/import/validate` and `/api/portal/terminals/import/commit`, scoped by `terminal_manufacturer` scope_type. The system SHALL force `manufacturer_id` to `user.scope_id` on all parsed rows before validation.

#### Scenario: Portal user imports products
- **WHEN** portal user uploads a CSV with manufacturer_id column set to a different manufacturer
- **THEN** the system overwrites manufacturer_id with the user's scope_id before validation

### Requirement: Terminal media folder provisioning
The system SHALL provision a media folder tree when a terminal manufacturer is created: a root folder named after the manufacturer under the "Terminal Manufacturers" container, with 3 protected subfolders (`logos`, `products`, `docs`). Renaming the manufacturer SHALL rename the root folder. Deleting the manufacturer SHALL remove all associated folders, upload records, and disk files.

#### Scenario: Media folders provisioned on manufacturer creation
- **WHEN** admin creates a terminal manufacturer named "ACME Terminals"
- **THEN** the system creates a root folder "ACME Terminals" under "Terminal Manufacturers" container with `logos`, `products`, `docs` subfolders

#### Scenario: Media folders cleaned up on manufacturer deletion
- **WHEN** admin deletes a terminal manufacturer
- **THEN** the system removes all media folders and uploads associated with that manufacturer's scope

### Requirement: Terminal inquiry linkage
The system SHALL allow public users to send inquiries to terminal manufacturers via the existing inquiry system with `recipient_type="terminal_manufacturer"` and `recipient_id=<manufacturer_id>`. Portal users with `terminal_manufacturer` scope SHALL receive and reply to these inquiries via `/api/portal/inquiries`.

#### Scenario: Public user sends inquiry to terminal manufacturer
- **WHEN** a visitor submits the inquiry form on a terminal manufacturer's product page
- **THEN** the system creates an inquiry with `recipient_type="terminal_manufacturer"` and `recipient_id` set to the manufacturer's ID

#### Scenario: Portal terminal manufacturer views inquiries
- **WHEN** a portal user with `scope_type=terminal_manufacturer` requests their inquiries
- **THEN** the system returns inquiries where `recipient_type="terminal_manufacturer"` and `recipient_id == user.scope_id`

### Requirement: Header search terminal category
The system SHALL include "Terminal" as a third category option in the header search box dropdown. Selecting "Terminal" SHALL route searches to `/terminals?q=` and update the placeholder to "Search terminal model, brand...".

#### Scenario: User searches for terminals from header
- **WHEN** a visitor selects "Terminal" in the header search dropdown and submits a query
- **THEN** the system navigates to `/terminals?q={query}`

