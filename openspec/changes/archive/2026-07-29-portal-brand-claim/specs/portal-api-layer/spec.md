## ADDED Requirements

### Requirement: Portal sidebar SHALL display unified brand "Unowire Portal"

The Portal sidebar SHALL display "Unowire Portal" as the brand text for all authenticated users regardless of `scope_type`. The sidebar SHALL NOT append scope-type-specific subtitles like "Cable Portal" or "Equipment Portal". The Portal login form heading SHALL also display "Unowire Portal" instead of "Factory Portal".

#### Scenario: Cable manufacturer sees unified brand
- **WHEN** a cable manufacturer (scope_type "manufacturer") is logged in
- **THEN** the sidebar displays "Unowire Portal" without "Cable Portal" subtitle

#### Scenario: Equipment manufacturer sees unified brand
- **WHEN** an equipment manufacturer (scope_type "equipment_manufacturer") is logged in
- **THEN** the sidebar displays "Unowire Portal" without "Equipment Portal" subtitle

#### Scenario: Login form shows unified brand
- **WHEN** a user views the Portal login page
- **THEN** the login form heading displays "Unowire Portal"

### Requirement: Portal logout SHALL fully hide the sidebar

After a user clicks logout, the sidebar SHALL disappear immediately. The logout handler SHALL clear the authentication state and trigger a full page navigation to `/portal/login` so that the server-side layout re-evaluates authentication and renders the login page without the sidebar.

#### Scenario: Sidebar disappears after logout
- **WHEN** a logged-in user clicks the logout button in the sidebar
- **THEN** the page navigates to `/portal/login` and the sidebar is not rendered on the login page

#### Scenario: No sidebar flash during logout
- **WHEN** a user clicks logout
- **THEN** the sidebar does not remain visible during the navigation transition to the login page

### Requirement: Portal login page SHALL show "Claim Your Company" link instead of admin login

The Portal login page SHALL display a "Claim Your Company" link below the login form that navigates to `/portal/claim`. The page SHALL NOT display the "Operator? Admin login" link. The `/admin/login` page SHALL remain directly accessible via its URL.

#### Scenario: Login page shows claim link
- **WHEN** a user views the Portal login page
- **THEN** the page displays a "Claim Your Company" link pointing to `/portal/claim`

#### Scenario: Admin login link is removed from portal login
- **WHEN** a user views the Portal login page
- **THEN** the page does not display "Operator? Admin login" text or link

#### Scenario: Admin login page remains accessible
- **WHEN** a user navigates directly to `/admin/login`
- **THEN** the admin login page loads successfully
