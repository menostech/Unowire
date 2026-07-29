# portal-api-layer Specification

## Purpose
TBD - created by archiving change portal-foundation-refactor. Update Purpose after archive.
## Requirements
### Requirement: Portal API SHALL use typed interfaces for all responses

The `portalApi` server-side module and the `portalApiClient` client-side module SHALL use TypeScript interfaces for all request payloads and response types. No `any` types SHALL remain in portal API code.

#### Scenario: Typed cable response
- **WHEN** `portalApi.cables.all()` is called
- **THEN** the return type is `PortalCable[]` with fields `id`, `model`, `slug`, `manufacturer_id`, `manufacturer`, `created_at`, etc.

#### Scenario: Typed dashboard response
- **WHEN** `portalApi.dashboard.get()` is called
- **THEN** the return type is `PortalDashboard` with fields `factory_name`, `stats`, `inquiry_trend`, `views_trend`, `recent_inquiries`

#### Scenario: Typed inquiry response
- **WHEN** `portalApi.inquiries.getById(id)` is called
- **THEN** the return type is `PortalInquiry` with fields `id`, `subject`, `body`, `reply_body`, `created_at`, `is_read`, etc.

### Requirement: Portal write operations SHALL go through unified BFF client

All portal form mutations (cable update, equipment update, inquiry reply, password change) SHALL use the typed `portalApiClient` methods instead of raw `fetch` calls in components. The `portalApiClient` SHALL call the BFF routes at `/api/portal/*`.

#### Scenario: Cable update via portalApiClient
- **WHEN** a user submits the cable edit form
- **THEN** the form calls `portalApiClient.cables.update(id, data)` which PUTs to `/api/portal/cables/{id}` with a typed `PortalCableUpdate` payload

#### Scenario: Inquiry reply via portalApiClient
- **WHEN** a user submits an inquiry reply
- **THEN** the form calls `portalApiClient.inquiries.reply(id, replyBody)` which POSTs to `/api/portal/inquiries/{id}/reply` with a typed `{ reply_body: string }` payload matching the backend `InquiryReply` schema

#### Scenario: Password change via portalApiClient
- **WHEN** a user submits the change password form
- **THEN** the form calls `portalApiClient.auth.changePassword(old, new)` which PUTs to `/api/portal/auth/me` with a typed `{ old_password: string, new_password: string }` payload

### Requirement: Portal API SHALL eliminate redundant /me endpoint

The redundant `/api/portal/me` backend route and BFF route SHALL be removed. Profile retrieval SHALL use `/api/portal/auth/me` (GET) and password change SHALL use `/api/portal/auth/me` (PUT).

#### Scenario: Profile retrieval after consolidation
- **WHEN** the portal layout calls `portalApi.auth.me()`
- **THEN** the request goes to `GET /api/portal/auth/me` (not `/api/portal/me`)

#### Scenario: Password change after consolidation
- **WHEN** a user changes their password
- **THEN** the request goes to `PUT /api/portal/auth/me` (not `PUT /api/portal/me`)

#### Scenario: Old /api/portal/me endpoint removed
- **WHEN** a request is made to `GET /api/portal/me`
- **THEN** the backend returns 404 (endpoint no longer exists)

### Requirement: Portal forms SHALL display inline validation errors

All portal edit forms SHALL validate user input on the client side and display inline error messages below each field before submitting to the backend.

#### Scenario: Cable edit form required field validation
- **WHEN** a user clears the "Model" field in the cable edit form and clicks Save
- **THEN** an inline error "Model is required" is displayed below the field and the form is not submitted

#### Scenario: Password change form min length validation
- **WHEN** a user enters a new password shorter than 8 characters and clicks Save
- **THEN** an inline error "Password must be at least 8 characters" is displayed and the form is not submitted

#### Scenario: Reply form empty body validation
- **WHEN** a user submits an empty reply body
- **THEN** an inline error "Reply cannot be empty" is displayed and the form is not submitted

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

