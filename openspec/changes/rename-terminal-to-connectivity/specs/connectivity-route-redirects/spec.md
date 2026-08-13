## ADDED Requirements

### Requirement: Public UI route redirect from terminal paths
The system SHALL redirect all inbound requests to `/terminals/**`, `/admin/terminals/**`, and `/portal/terminals/**` to the equivalent `/connectivity/**`, `/admin/connectivity/**`, and `/portal/connectivity/**` URLs using HTTP 308 Permanent Redirect, preserving query strings and path parameters.

#### Scenario: Old public terminal listing URL redirects
- **WHEN** a visitor navigates to `/terminals?q=ring`
- **THEN** the system responds with 308 and Location header `/connectivity?q=ring`

#### Scenario: Old admin terminal manufacturer URL redirects
- **WHEN** an admin navigates to `/admin/terminals/manufacturers/new`
- **THEN** the system responds with 308 and Location header `/admin/connectivity/manufacturers/new`

#### Scenario: Old portal terminal detail URL redirects
- **WHEN** a portal user navigates to `/portal/terminals/acme-rt-100`
- **THEN** the system responds with 308 and Location header `/portal/connectivity/acme-rt-100`

### Requirement: API backward-compat 410 Gone with Location
The system SHALL respond to any request to old API paths (`/api/terminals/**`, `/api/terminal-manufacturers/**`, `/api/terminal-categories/**`, `/api/portal/terminals/**`) with HTTP 410 Gone and a `Location` response header pointing to the equivalent new path under `/api/connectivity*`. The 410 response body SHALL include a JSON error message indicating the resource has moved.

#### Scenario: Old API terminal list path returns 410 with Location
- **WHEN** a client sends GET `/api/terminals?page_size=10`
- **THEN** the system responds with 410 and Location header `/api/connectivity?page_size=10`

#### Scenario: Old API terminal-manufacturers path returns 410 with Location
- **WHEN** a client sends GET `/api/terminal-manufacturers/acme`
- **THEN** the system responds with 410 and Location header `/api/connectivity-manufacturers/acme`

#### Scenario: Old portal API import validate path returns 410 with Location
- **WHEN** a client sends POST `/api/portal/terminals/import/validate`
- **THEN** the system responds with 410 and Location header `/api/portal/connectivity/import/validate`

### Requirement: JWT scope_type transparent remap
The system SHALL transparently remap `scope_type=terminal_manufacturer` to `scope_type=connectivity_manufacturer` during JWT token decoding in `get_current_portal_user`. Portal users with existing tokens encoded with the old scope_type SHALL NOT need to re-login after deployment.

#### Scenario: Portal user with old scope_type token accesses connectivity endpoint
- **WHEN** a portal user presents a JWT with `scope_type=terminal_manufacturer` and requests GET `/api/portal/connectivity`
- **THEN** the system decodes the token, remaps scope_type to `connectivity_manufacturer`, and returns the user's products successfully

#### Scenario: Portal user with old scope_type creates a connectivity product
- **WHEN** a portal user presents a JWT with `scope_type=terminal_manufacturer` and POST `/api/portal/connectivity` with product data
- **THEN** the system remaps scope_type, forces `manufacturer_id` to the user's scope_id, and creates the product

### Requirement: Admin module_id backward alias
The system SHALL accept both old module ids (`terminal_mfrs`, `terminal_cats`, `terminal_list`) and new module ids (`connectivity_mfrs`, `connectivity_cats`, `connectivity_list`) in permission checks via `MODULE_BY_ID` and `require_module`. Role permission rows keyed on old ids SHALL continue to resolve without data migration.

#### Scenario: Admin with old terminal_mfrs permission accesses connectivity manufacturers
- **WHEN** an admin whose role_permissions still reference `terminal_mfrs` requests GET `/api/connectivity-manufacturers`
- **THEN** the system resolves the old module id alias and grants access

#### Scenario: New role permission seed uses connectivity_mfrs
- **WHEN** the system seeds new role permissions for the admin role
- **THEN** the seed uses `connectivity_mfrs`, `connectivity_cats`, `connectivity_list` as module ids
