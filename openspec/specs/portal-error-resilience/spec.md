# portal-error-resilience Specification

## Purpose
TBD - created by archiving change portal-foundation-refactor. Update Purpose after archive.
## Requirements
### Requirement: Portal pages SHALL handle expired tokens gracefully

When a portal user's JWT token expires, all protected portal pages SHALL redirect the user to `/portal/login` with a `from` query parameter preserving the original path, instead of rendering a broken sidebar-less page or throwing a 500 error.

#### Scenario: Expired token on dashboard page
- **WHEN** a user with an expired `portal_token` cookie navigates to `/portal`
- **THEN** the system redirects to `/portal/login?from=/portal`

#### Scenario: Expired token on cable detail page
- **WHEN** a user with an expired token navigates to `/portal/cables/abc123`
- **THEN** the system redirects to `/portal/login?from=/portal/cables/abc123`

#### Scenario: Login page does not redirect
- **WHEN** an unauthenticated user is on `/portal/login`
- **THEN** the login page renders normally without redirect

### Requirement: Portal dashboard SHALL not crash on backend errors

The dashboard page SHALL wrap all backend API calls in error handling. On auth failure, it SHALL redirect to login. On non-auth backend errors, it SHALL display an error message with a retry option instead of throwing an unhandled 500.

#### Scenario: Dashboard backend returns 500
- **WHEN** the dashboard API call fails with a 500 error but the user's token is valid
- **THEN** the dashboard displays an error message "Failed to load dashboard data" with a retry button

#### Scenario: Dashboard token expired
- **WHEN** the dashboard API call fails and `auth.me()` returns null
- **THEN** the system redirects to `/portal/login?from=/portal`

### Requirement: Portal pages SHALL display loading states

All portal pages SHALL show loading skeletons while data is being fetched, using Next.js `loading.tsx` convention. Skeletons SHALL match the approximate layout of the page content.

#### Scenario: Cables list loading
- **WHEN** the cables list page is loading data
- **THEN** a table skeleton with placeholder rows is displayed

#### Scenario: Dashboard loading
- **WHEN** the dashboard page is loading
- **THEN** stat card skeletons and chart placeholders are displayed

### Requirement: Portal pages SHALL display consistent empty states

All portal list pages SHALL display a user-friendly empty state message when no data is available, with consistent styling across pages.

#### Scenario: No cables in scope
- **WHEN** the cables list API returns an empty array
- **THEN** the page displays "No cables in your scope yet." with consistent empty-state styling

#### Scenario: No inquiries
- **WHEN** the inquiries list API returns an empty array
- **THEN** the page displays "No inquiries yet." with consistent empty-state styling

### Requirement: Portal sidebar SHALL use permissions API for nav gating

The portal sidebar SHALL fetch `auth/me/permissions` and use the `allowed_modules` list to filter navigation items, instead of relying solely on `scope_type`.

#### Scenario: Manufacturer with full permissions
- **WHEN** a manufacturer user has `allowed_modules: ["dashboard", "cables", "inquiries", "media", "me"]`
- **THEN** the sidebar shows Dashboard, Cables, Inquiries, Media, and Settings nav items

#### Scenario: Manufacturer with restricted permissions
- **WHEN** a manufacturer user has `allowed_modules: ["dashboard", "cables", "me"]`
- **THEN** the sidebar shows only Dashboard, Cables, and Settings nav items (Inquiries and Media are hidden)

