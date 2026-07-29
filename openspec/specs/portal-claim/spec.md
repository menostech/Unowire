# portal-claim Specification

## Purpose
TBD - created by archiving change portal-brand-claim. Update Purpose after archive.
## Requirements
### Requirement: Portal SHALL provide a public claim page for manufacturers to claim their company

The portal SHALL provide a page at `/portal/claim` that is accessible without authentication. The page SHALL display a search input where users can search for their company by name. The search SHALL query both `cable_manufacturers` and `equipment_manufacturers` tables and display matching results. Each result SHALL show the company name, type (cable/equipment), and a "Claim This Company" button. Clicking the button SHALL open a claim form pre-filled with the selected company.

#### Scenario: Claim page is accessible without login
- **WHEN** an unauthenticated user navigates to `/portal/claim`
- **THEN** the page loads successfully without redirecting to login

#### Scenario: Search returns matching manufacturers
- **WHEN** a user types "Acme" in the search box
- **THEN** the page displays manufacturers whose name contains "Acme" (case-insensitive), showing name, type, and a "Claim This Company" button for each

#### Scenario: Search returns no results
- **WHEN** a user types a query that matches no manufacturers
- **THEN** the page displays "No companies found" message

#### Scenario: Claim form opens with company pre-filled
- **WHEN** a user clicks "Claim This Company" for a manufacturer
- **THEN** a form appears showing the selected company name and fields for contact name, email, phone, and proof description

### Requirement: Portal SHALL accept claim request submissions via public API

The backend SHALL expose `POST /api/portal/claim` (public, no auth required) that accepts a JSON body with `manufacturer_type` ("cable" | "equipment"), `manufacturer_id`, `contact_name`, `contact_email`, `contact_phone` (optional), and `proof_description`. The endpoint SHALL validate that the referenced manufacturer exists, then create a `claim_requests` record with status "pending". The endpoint SHALL return 201 on success, 404 if the manufacturer does not exist, and 422 for validation errors.

#### Scenario: Successful claim submission
- **WHEN** a POST to `/api/portal/claim` is sent with valid data referencing an existing manufacturer
- **THEN** a claim_requests record is created with status "pending" and the endpoint returns 201 with the claim id

#### Scenario: Claim submission for non-existent manufacturer
- **WHEN** a POST to `/api/portal/claim` references a manufacturer_id that does not exist
- **THEN** the endpoint returns 404

#### Scenario: Claim submission with missing required fields
- **WHEN** a POST to `/api/portal/claim` is missing contact_name or proof_description
- **THEN** the endpoint returns 422

### Requirement: Portal SHALL provide a public manufacturer search endpoint for claims

The backend SHALL expose `GET /api/portal/claim/search?q=<query>` (public, no auth required) that searches both `cable_manufacturers` and `equipment_manufacturers` by name (case-insensitive ilike), limited to 10 results. The endpoint SHALL return a JSON array of objects with `id`, `name`, `slug`, and `type` ("cable" | "equipment").

#### Scenario: Search returns matching manufacturers
- **WHEN** the backend receives `GET /api/portal/claim/search?q=acme`
- **THEN** it returns up to 10 manufacturers whose name matches "%acme%" (case-insensitive)

#### Scenario: Search with empty query
- **WHEN** the backend receives `GET /api/portal/claim/search?q=` or no q parameter
- **THEN** it returns an empty array

### Requirement: Admin SHALL be able to list and review claim requests

The backend SHALL expose `GET /api/admin/claims` (requires admin auth) that returns all claim_requests ordered by `created_at` descending, with optional `status` filter query parameter. The admin frontend SHALL provide a page at `/admin/claims` displaying a table of claim requests with columns: company name, type, contact name, email, phone, proof description, status, created date, and actions (Approve/Reject for pending claims).

#### Scenario: Admin lists all claims
- **WHEN** an admin navigates to `/admin/claims`
- **THEN** the page displays all claim requests ordered by newest first

#### Scenario: Admin filters claims by status
- **WHEN** an admin selects "pending" from a status filter dropdown
- **THEN** only pending claims are displayed

#### Scenario: Non-admin cannot access claims list
- **WHEN** a non-admin user sends `GET /api/admin/claims`
- **THEN** the endpoint returns 401 or 403

### Requirement: Admin SHALL be able to approve or reject claim requests

The backend SHALL expose `POST /api/admin/claims/{id}/approve` and `POST /api/admin/claims/{id}/reject` (requires admin auth). Approve SHALL set status to "approved", record `reviewed_by` and `reviewed_at`. Reject SHALL set status to "rejected", record `reviewed_by` and `reviewed_at`. Both SHALL return the updated claim request. Approving/rejecting an already-processed claim SHALL return 409.

#### Scenario: Admin approves a pending claim
- **WHEN** an admin sends POST to `/api/admin/claims/{id}/approve` for a pending claim
- **THEN** the claim status becomes "approved", reviewed_by and reviewed_at are set, and the updated claim is returned

#### Scenario: Admin rejects a pending claim
- **WHEN** an admin sends POST to `/api/admin/claims/{id}/reject` for a pending claim
- **THEN** the claim status becomes "rejected", reviewed_by and reviewed_at are set, and the updated claim is returned

#### Scenario: Approving an already-processed claim fails
- **WHEN** an admin sends POST to `/api/admin/claims/{id}/approve` for a claim that is already approved
- **THEN** the endpoint returns 409 Conflict

