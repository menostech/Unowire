## Context

The current system message feature (`backend/app/api/routes/admin_messages.py` + `backend/app/models/system_message.py`) is a broadcast-only model: every admin-published message is automatically visible to all registered members. There is no `recipient_type` field, no recipient selection, and staff users (cable managers, equipment managers) have no inbox at all — only members can view messages via `GET /api/member/messages`.

The `SystemMessage` model has `id`, `title`, `body`, `created_by`, `created_at`, `updated_at`. The `SystemMessageRead` join table tracks per-member read state with composite PK `(member_id, message_id)`. There is no parallel read-tracking for staff Users.

The admin `MessageForm` (`frontend/components/admin/form/MessageForm.tsx`) has only `title` + `body` fields. The admin users list (`/admin/users`) and members list (`/admin/members`) have only an "Edit" action per row — no "Message" button.

## Goals / Non-Goals

**Goals:**
- Admin can mass-send a message to selected recipient groups (cable managers, equipment managers, members) in a single send
- Admin can single-send a message to a specific staff user or member from the list page
- Staff users (cable/equipment managers) can view their messages in a portal inbox
- Existing broadcast-to-all-members behavior is preserved as a backward-compatible option
- Read state is tracked separately for staff users and members

**Non-Goals:**
- Message editing (preserves prior design decision: admin can only create + delete)
- Real-time push notifications (polling/unread-count only, reusing existing pattern)
- Email notifications for new messages
- Message threading or replies
- Message scheduling or expiry

## Decisions

### D1: Recipient model — `recipient_type` + `recipient_targets` JSON array

Add two columns to `system_messages`:
- `recipient_type: String(20)` — `broadcast` (all members) or `targeted` (specific recipients)
- `recipient_targets: JSON` — nullable; when `targeted`, an array of target objects:
  - `{"kind": "group", "value": "cable_managers"}` — all Users with `role.scope_type='manufacturer'`
  - `{"kind": "group", "value": "equipment_managers"}` — all Users with `role.scope_type='equipment_manufacturer'`
  - `{"kind": "group", "value": "members"}` — all Members
  - `{"kind": "user", "value": <user_id>}` — specific staff User
  - `{"kind": "member", "value": <member_id>}` — specific Member

**Why over a join table**: A single JSON column is simpler for MVP — no extra table, no extra writes per recipient, and the recipient list is known at create time (no need to query joins for "who is a recipient"). The trade-off is no per-recipient delivery tracking, but that is acceptable since read state is tracked separately.

**Why over a single `recipient_type` enum**: The user wants to select multiple groups in one message (e.g., cable managers AND equipment managers). A single enum can only represent one group per message. The JSON array supports mixing groups + individuals freely.

### D2: Staff read tracking — parallel `system_message_user_reads` table

Create a new `SystemMessageUserRead` model:
- `user_id: BigInteger` (FK to `users.id`, `ondelete=CASCADE`, primary key)
- `message_id: BigInteger` (FK to `system_messages.id`, `ondelete=CASCADE`, primary key)
- `read_at: DateTime`

**Why not extend `SystemMessageRead`**: The existing table has composite PK `(member_id, message_id)` and all queries assume member_id. Adding a nullable `user_id` column would require changing the PK and all existing queries. A parallel table is additive, non-breaking, and mirrors the existing pattern.

### D3: Staff inbox location — `/portal/messages` + `/api/portal/messages`

Add portal-side routes guarded by `require_factory_module("messages")` (or a new `messages` module permission for portal users):
- `GET /api/portal/messages?page=1&page_size=20` — list messages targeting the caller
- `GET /api/portal/messages/{id}` — single message detail (auto-marks as read)
- `GET /api/portal/messages/unread-count` — unread count for badge

Matching logic for staff inbox: a message is visible to a staff user if:
- `recipient_type='broadcast'` AND the target includes `{"kind":"group","value":"members"}` is NOT required (broadcast = all members only, not staff). Actually, broadcast is member-only by definition. Staff see only `targeted` messages where they match a target.
- `recipient_type='targeted'` AND any target matches:
  - `kind='group'` + `value='cable_managers'` and caller's `role.scope_type='manufacturer'`
  - `kind='group'` + `value='equipment_managers'` and caller's `role.scope_type='equipment_manufacturer'`
  - `kind='user'` + `value=<caller.user_id>`

**Why portal not admin**: Cable/equipment managers already log in via `/portal/login` and have portal-side pages. They do not have admin backend access. The portal already has the BFF pattern (`/api/portal/*`) with `portal_token` cookie auth.

### D4: Single message UX — pre-filled form page navigation

When admin clicks "Message" on a user/member row, navigate to:
- `/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=<id>&recipientLabel=<email>`
- `/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=<id>&recipientLabel=<email>`

The `MessageForm` reads URL search params and pre-fills the recipient, hiding the recipient selector when pre-filled. Admin only fills title + body.

**Why not a modal**: A modal requires building a separate inline form component and handling state on the list page. Pre-filled navigation reuses the existing `MessageForm` page with minimal changes.

### D5: Admin recipients endpoint — `GET /api/admin/messages/recipients`

Add an endpoint to list candidate recipients for the form's checkbox list:
- `GET /api/admin/messages/recipients` — returns three lists: `cable_managers`, `equipment_managers`, `members` with `id`, `email`, `name` for each.

This avoids N+1 fetches from the frontend and lets the form render all checkboxes in one call.

## Risks / Trade-offs

- **[JSON column queryability]** `recipient_targets` JSON is harder to query than a normalized table. → Mitigation: for MVP, matching is done in application code (load message, parse targets, check membership). If message volume grows large, add a GIN index or migrate to a join table.
- **[Broadcast vs targeted ambiguity]** `recipient_type='broadcast'` means all members, not all staff. Staff only see targeted messages. → Mitigation: document clearly in schema comments and API docs; the admin form makes the distinction explicit with a radio button.
- **[Group membership changes]** If a cable manager is added/removed after a message is sent, they will/won't see it retroactively because group membership is evaluated at query time. → Mitigation: acceptable for MVP (messages are operational, not archival); document as known behavior.
- **[No per-recipient delivery log]** Cannot confirm "message delivered to user X". → Mitigation: read state tracking provides "message seen by user X", which is sufficient for MVP.
