## Why

The Portal currently shows different brand names ("Unowire Cable Portal" / "Unowire Equipment Portal") based on the user's scope_type, which fragments brand identity. The logout flow has a bug where the sidebar persists after logout. Additionally, the Portal login page links to "Admin login" — there is no self-service path for manufacturers to claim their company, forcing manual onboarding.

## What Changes

- Unify the Portal sidebar brand from "Unowire Cable Portal" / "Unowire Equipment Portal" to "Unowire Portal" for all scope types
- Fix logout: clear user state before navigation so the sidebar disappears immediately after logout (no persistent sidebar on login page)
- Replace "Operator? Admin login" link on Portal login page with "Claim Your Company" link to `/portal/claim`
- New `/portal/claim` page: search manufacturers by name, select a company, submit a claim request with contact info and proof
- New backend: `claim_requests` table, public manufacturer search API, claim submission API, admin approval/rejection API
- New `/admin/claims` page: list pending claim requests, approve or reject

## Capabilities

### New Capabilities
- `portal-claim`: Manufacturer company claim flow — public search, claim request submission, admin approval workflow

### Modified Capabilities
- `portal-api-layer`: Add public manufacturer search endpoint and claim request CRUD endpoints

## Impact

- **Frontend**: PortalSidebar (brand), PortalLoginForm (link replacement), PortalLayout (logout fix), new `/portal/claim` page, new `/admin/claims` page
- **Backend**: New `claim_requests` model, new claim routes (portal + admin), new public manufacturer search route
- **Database**: New `claim_requests` table migration
- **Middleware**: `/portal/claim` must be accessible without portal_token (public page)
