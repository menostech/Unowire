## Context

The Portal frontend currently renders brand text dynamically based on `scope_type` ("Unowire Cable Portal" for cable manufacturers, "Unowire Equipment Portal" for equipment manufacturers). The logout flow has a bug where the sidebar persists because `router.push('/portal/login')` is client-side navigation — the layout's server-side `!user` check doesn't re-run until a full page reload or `router.refresh()`. The Portal login page links to "Admin login" which is useful for operators but provides no self-service onboarding path for manufacturers.

Thomasnet.com's claim flow (`/claim`) provides the reference UX: search for a company, find it, claim it. Unowire needs an analogous flow where manufacturers can find their company in the existing manufacturer tables and submit a claim request that admins review.

## Goals / Non-Goals

**Goals:**
- Unify Portal brand to "Unowire Portal" across all scope types
- Fix logout so sidebar disappears immediately (no persistent sidebar on login page)
- Replace "Admin login" link with "Claim Your Company" link on Portal login page
- Create `/portal/claim` page with search + claim submission flow (public, no auth required)
- Create `claim_requests` table and backend API for submit + admin approval
- Create `/admin/claims` page for admins to review, approve, or reject claims

**Non-Goals:**
- Automated claim verification (e.g., domain matching, email verification) — admin reviews manually
- Claim status tracking page for manufacturers (post-submission confirmation only)
- Email notifications for claim submission/approval (deferred)
- Removing the Admin login page or its separate access path (`/admin/login` remains directly accessible)

## Decisions

### D1: Brand unification — remove subtitle logic entirely
**Decision:** Remove the `scope_type`-based subtitle selection in `PortalSidebar.tsx` and render "Unowire Portal" as a static string. Also update `PortalLoginForm.tsx` heading from "Factory Portal" to "Unowire Portal".

**Rationale:** The subtitle added no functional value — both scope types use the same portal. A unified brand simplifies the UI and aligns with the "Claim Your Company" self-service model where the portal serves all manufacturer types.

### D2: Logout fix — use `window.location.href` instead of `router.push`
**Decision:** Change `handleLogout` in `PortalSidebar.tsx` to use `window.location.href = '/portal/login'` after the logout API call, instead of `router.push('/portal/login')`.

**Rationale:** `router.push` does client-side navigation without re-running the server layout's `!user` check, causing the sidebar to persist. `window.location.href` triggers a full page reload, so the server layout re-evaluates auth state and hides the sidebar. The Admin sidebar already uses `window.location.href` for its logout (via `router.push('/admin/login')` in `AdminSidebar.tsx` — but admin layout also does server-side redirect). Using full page reload for logout is the simplest, most reliable fix.

**Alternative considered:** Call `router.refresh()` after `router.push('/portal/login')`. Rejected because it's a race condition — refresh may run before the cookie is cleared, and the timing is unpredictable.

### D3: Claim page is public (no portal_token required)
**Decision:** `/portal/claim` is accessible without authentication. Add it to the middleware whitelist alongside `/portal/login`.

**Rationale:** A manufacturer who hasn't claimed their company yet has no account. The claim page must be reachable before login. The Portal layout already handles `!user` by rendering children without sidebar for whitelisted paths.

### D4: Public manufacturer search API
**Decision:** New `GET /api/portal/claim/search?q=<query>` endpoint (public, no auth) searches both `cable_manufacturers` and `equipment_manufacturers` tables by name (ilike, limit 10). Returns a unified list with `id`, `name`, `slug`, `type` ("cable" | "equipment").

**Rationale:** Claim flow needs to find the company before claiming it. Searching both tables covers all manufacturer types. Rate limiting via existing middleware applies. No sensitive fields exposed (only public-facing name/slug).

### D5: Claim request schema
**Decision:** New `claim_requests` table:
- `id` (uuid, PK, default gen_random_uuid())
- `manufacturer_type` (varchar: "cable" | "equipment")
- `manufacturer_id` (varchar, FK to cable_manufacturers.id or equipment_manufacturers.id)
- `contact_name` (varchar, not null)
- `contact_email` (varchar, not null)
- `contact_phone` (varchar, nullable)
- `proof_description` (text, not null — free-form description of why they're authorized)
- `status` (varchar: "pending" | "approved" | "rejected", default "pending")
- `reviewed_by` (varchar, nullable — admin user id)
- `reviewed_at` (timestamptz, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

**Rationale:** Stores all info admin needs to make a decision. `manufacturer_type` + `manufacturer_id` is a polymorphic FK (can't use a single FK constraint). Application-level validation ensures the manufacturer exists before insert.

### D6: Claim submission is public; approval requires admin auth
**Decision:** `POST /api/portal/claim` is public (no auth). `GET /api/admin/claims`, `POST /api/admin/claims/{id}/approve`, `POST /api/admin/claims/{id}/reject` require admin auth (`require_operator`).

**Rationale:** Manufacturers without accounts need to submit claims. Only admins can approve/reject. Rate limiting on the public submit endpoint prevents abuse.

### D7: Approve flow — admin creates the manufacturer user account
**Decision:** On approval, the admin manually creates the manufacturer's portal user account (existing `/admin` user management). The claim request status changes to "approved" and `reviewed_by`/`reviewed_at` are recorded. No automatic account creation.

**Rationale:** Automatic account creation would require an email verification flow, password setup, and manufacturer scope assignment — too complex for MVP. Admins already have user management tools. The claim request just serves as an intake form; approval is a signal to proceed with manual onboarding.

## Risks / Trade-offs

- **[Public endpoint abuse] → Rate limiting**: The public claim search and submit endpoints could be spammed. Mitigation: rely on existing rate-limiting middleware; add basic server-side validation (max proof_description length, email format).
- **[Polymorphic FK integrity] → Application-level validation**: `manufacturer_id` can't have a real FK constraint because it points to one of two tables. Mitigation: validate existence in the submit handler before insert; reject if manufacturer not found.
- **[No duplicate claim prevention] → Acceptable for MVP**: A user could submit multiple claims for the same manufacturer. Mitigation: admin sees all claims in the list and can identify duplicates. A uniqueness constraint (one pending claim per manufacturer) could be added later.
- **[Logout full-page reload UX] → Acceptable trade-off**: Full page reload is slightly slower than client-side navigation, but it's the most reliable way to ensure the sidebar disappears. The Admin sidebar already uses this pattern.
