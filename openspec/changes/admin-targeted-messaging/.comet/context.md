# Comet Design Handoff

- Change: admin-targeted-messaging
- Phase: design
- Mode: compact
- Context hash: 2b2c556c82003370987f9b2d262a3075ff2ff072590de39828a7db641b5e3347

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/admin-targeted-messaging/proposal.md

- Source: openspec/changes/admin-targeted-messaging/proposal.md
- Lines: 1-35
- SHA256: 7e9ccd4a8400dac84f73ddd731c9044005ed424589f901d4211533bc54f2129a

```md
## Why

The current system message feature is broadcast-only: every admin-published message is automatically visible to all registered members, with no recipient targeting. Admins cannot send messages to specific staff users (cable managers, equipment managers) and cannot single-message a user or member from the list page. Additionally, staff users (cable/equipment managers) have no inbox at all — only members can view system messages. This makes the messaging system unusable for operational communication with factory-side staff and prevents targeted notifications.

## What Changes

- Extend the `SystemMessage` model with `recipient_type` (`all_members` | `group_staff` | `individual_staff` | `individual_member`) and `recipient_targets` (JSON array storing role scope identifiers or user/member ids).
- Extend `MessageCreate` schema to accept `recipient_type` and `recipient_ids`; extend `AdminMessageRead` to echo recipient metadata.
- Add CRUD methods for targeted messaging: role-filtered recipient resolution (cable managers = Users with `role.scope_type='manufacturer'`; equipment managers = Users with `role.scope_type='equipment_manufacturer'`), single-send, and group-send logic.
- Extend `POST /api/admin/messages` to accept recipient fields; add `GET /api/admin/messages/recipients?role=...` endpoint to list candidate recipients by role group.
- Add portal-side staff inbox: `GET /api/portal/messages` and `GET /api/portal/messages/{id}` routes (guarded by `require_factory_module`) that filter messages by the caller's identity and scope.
- Add `/portal/messages` list page and `/portal/messages/[id]` detail page for cable/equipment managers to view their messages, mirroring the existing member messages UI.
- Extend `MessageForm` with a recipient selector: radio for recipient type + checkbox list for group/individual selection (members + staff filtered by role).
- Add a "Message" action button to each row in the admin users list and admin members list; clicking navigates to `/admin/messages/new?recipientType=...&recipientId=...` with the recipient pre-filled.
- Extend `adminApi.messages.create` payload and `AdminMessage` TypeScript type with recipient fields.
- Add an Alembic migration for the new `recipient_type` and `recipient_targets` columns on `system_messages`.

## Capabilities

### New Capabilities
- `admin-targeted-messaging`: Admin can target system messages to specific recipient groups (all members, cable managers, equipment managers) or individual recipients (staff users, members), and staff users can view their messages in a portal inbox.

### Modified Capabilities
<!-- No existing spec-level capability changes — the system message feature predates OpenSpec and has no prior spec. -->

## Impact

- **Backend model**: `backend/app/models/system_message.py` — add `recipient_type` + `recipient_targets` columns
- **Backend schema**: `backend/app/schemas/system_message.py` — extend `MessageCreate`, `AdminMessageRead`; add recipient-related response schemas
- **Backend CRUD**: `backend/app/crud/system_message.py` — add targeted create, role-filtered recipient lookup, staff-side list/get queries
- **Backend routes**: `backend/app/api/routes/admin_messages.py` (extend POST, add recipients endpoint); new `backend/app/api/routes/portal_messages.py` (staff inbox)
- **Backend migration**: new Alembic revision adding columns
- **Frontend admin**: `frontend/components/admin/form/MessageForm.tsx` (recipient selector); `frontend/app/admin/(dashboard)/users/page.tsx` + `members/page.tsx` (Message button); `frontend/lib/adminApi.ts` + `frontend/lib/types.ts` (recipient fields)
- **Frontend portal**: new `frontend/app/portal/messages/page.tsx` + `[id]/page.tsx`; new BFF routes `frontend/app/api/portal/messages/route.ts` + `[id]/route.ts`; extend `frontend/lib/portalApi.ts` + `frontend/lib/types/portal.ts`
- **No breaking changes**: existing broadcast behavior is preserved as `recipient_type=all_members` (default); existing member-side message routes continue to work unchanged.

```

## openspec/changes/admin-targeted-messaging/design.md

- Source: openspec/changes/admin-targeted-messaging/design.md
- Lines: 1-89
- SHA256: 1bab5b8921f75bb1ff3077b326e3d50f22f71c45397b2f4e30930d02f6cbd4f8

[TRUNCATED]

```md
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

```

Full source: openspec/changes/admin-targeted-messaging/design.md

## openspec/changes/admin-targeted-messaging/tasks.md

- Source: openspec/changes/admin-targeted-messaging/tasks.md
- Lines: 1-102
- SHA256: 265d22abea5d7f4b050707705efad110411825d1bda2b91b3cc0cdc0aad7ab66

[TRUNCATED]

```md
## 1. Backend Model + Migration

- [ ] 1.1 Add `recipient_type` (String(20), default `'broadcast'`) and `recipient_targets` (JSON, nullable) columns to `SystemMessage` model in `backend/app/models/system_message.py`
- [ ] 1.2 Add `SystemMessageUserRead` model (table `system_message_user_reads`) with `user_id` (FK users.id, PK, ondelete=CASCADE), `message_id` (FK system_messages.id, PK, ondelete=CASCADE), `read_at` (DateTime)
- [ ] 1.3 Create Alembic migration adding `recipient_type` + `recipient_targets` columns to `system_messages` (default `'broadcast'` for existing rows) and creating `system_message_user_reads` table
- [ ] 1.4 Register `SystemMessageUserRead` in `backend/app/models/__init__.py` if needed

## 2. Backend Schema

- [ ] 2.1 Extend `MessageCreate` schema in `backend/app/schemas/system_message.py` with `recipient_type: Literal['broadcast','targeted'] = 'broadcast'` and `recipient_targets: list[dict] | None = None`
- [ ] 2.2 Add `RecipientTarget` schema with `kind: Literal['group','user','member']` and `value: str | int` (use `RootModel` or union to accept both)
- [ ] 2.3 Extend `AdminMessageRead` schema with `recipient_type` and `recipient_targets` fields
- [ ] 2.4 Add `RecipientListResponse` schema with `cable_managers`, `equipment_managers`, `members` arrays (each item has `id`, `email`, `name`)

## 3. Backend CRUD

- [ ] 3.1 Update `create_message` in `backend/app/crud/system_message.py` to accept and persist `recipient_type` + `recipient_targets`
- [ ] 3.2 Add `list_recipients_by_group(db)` method returning cable managers (Users with role.scope_type='manufacturer'), equipment managers (scope_type='equipment_manufacturer'), and all members
- [ ] 3.3 Add `list_for_staff_user(db, user_id, role_scope_type, page, page_size)` — returns targeted messages matching the caller (group by scope_type OR kind='user' with their id), with read state from `system_message_user_reads`
- [ ] 3.4 Add `get_for_staff_user(db, user_id, role_scope_type, message_id)` — returns single message if targeted to caller, else None
- [ ] 3.5 Add `unread_count_for_staff_user(db, user_id, role_scope_type)` — counts targeted messages not yet read
- [ ] 3.6 Add `mark_read_for_user(db, user_id, message_id)` — idempotent upsert into `system_message_user_reads` via `ON CONFLICT DO NOTHING`
- [ ] 3.7 Update `list_for_member(db, member_id, page, page_size)` to return `broadcast` messages + `targeted` messages matching `kind='group'` + `value='members'` OR `kind='member'` + `value=<member_id>`

## 4. Backend Admin Routes

- [ ] 4.1 Extend `POST /api/admin/messages` in `backend/app/api/routes/admin_messages.py` to accept `recipient_type` + `recipient_targets` from `MessageCreate`; validate that `targeted` requires non-empty `recipient_targets`
- [ ] 4.2 Add `GET /api/admin/messages/recipients` endpoint returning `RecipientListResponse` (cable_managers, equipment_managers, members with id/email/name)
- [ ] 4.3 Update `AdminMessageRead` serialization in admin routes to include `recipient_type` + `recipient_targets`

## 5. Backend Portal Message Routes

- [ ] 5.1 Create `backend/app/api/routes/portal_messages.py` with `GET /api/portal/messages` (paginated, filtered by caller's user_id + role.scope_type)
- [ ] 5.2 Add `GET /api/portal/messages/{id}` — returns message if targeted to caller, else 404; auto-marks as read via `mark_read_for_user`
- [ ] 5.3 Add `GET /api/portal/messages/unread-count` — returns unread count for the staff user
- [ ] 5.4 Register `portal_messages` router in `backend/app/main.py` (or wherever portal routers are registered)
- [ ] 5.5 Verify portal message routes are guarded by portal auth dependency (`require_factory_module` or equivalent)

## 6. Backend Tests

- [ ] 6.1 Add tests for `POST /api/admin/messages` with `recipient_type='broadcast'` and `recipient_type='targeted'` (multiple groups, individual user, individual member)
- [ ] 6.2 Add test for `POST /api/admin/messages` with `recipient_type='targeted'` but empty `recipient_targets` → 422
- [ ] 6.3 Add test for `GET /api/admin/messages/recipients` returning correct grouped lists
- [ ] 6.4 Add tests for `GET /api/portal/messages` — cable manager sees cable_managers group + individual targets; equipment manager sees equipment_managers group + individual; neither sees broadcast
- [ ] 6.5 Add test for `GET /api/portal/messages/{id}` — 404 when not targeted to caller; 200 + read state when targeted
- [ ] 6.6 Add test for `mark_read_for_user` idempotency (calling twice does not duplicate row)
- [ ] 6.7 Add test for `GET /api/member/messages` returning broadcast + targeted-member messages, excluding staff-only targeted messages
- [ ] 6.8 Add test for `GET /api/portal/messages/unread-count` returning correct count

## 7. Frontend Types + API Client

- [ ] 7.1 Add `RecipientTarget` type (`{kind: 'group'|'user'|'member'; value: string | number}`) to `frontend/lib/types.ts`
- [ ] 7.2 Extend `AdminMessage` type with `recipient_type` and `recipient_targets` fields
- [ ] 7.3 Extend `adminApi.messages.create` payload in `frontend/lib/adminApi.ts` to accept `recipient_type` + `recipient_targets`
- [ ] 7.4 Add `adminApi.messages.recipients()` method calling `GET /api/admin/messages/recipients`
- [ ] 7.5 Add `RecipientListResponse` type to `frontend/lib/types.ts`
- [ ] 7.6 Add portal message types (`PortalMessage`, `PortalMessageListResponse`) to `frontend/lib/types/portal.ts`
- [ ] 7.7 Add `portalApi.messages` namespace (server-side) and `portalApiClient.messages` namespace (client-side) with `all()`, `getById(id)`, `unreadCount()` methods

## 8. Frontend BFF Routes (Portal)

- [ ] 8.1 Create `frontend/app/api/portal/messages/route.ts` — GET proxy forwarding `portal_token` to backend
- [ ] 8.2 Create `frontend/app/api/portal/messages/[id]/route.ts` — GET proxy
- [ ] 8.3 Create `frontend/app/api/portal/messages/unread-count/route.ts` — GET proxy

## 9. Frontend Admin — MessageForm Extension

- [ ] 9.1 Extend `frontend/components/admin/form/MessageForm.tsx` with recipient type radio (Broadcast | Targeted)
- [ ] 9.2 When `Targeted` selected, render checkbox list: "All Cable Managers", "All Equipment Managers", "All Members" + optional individual recipient picker (dropdown/search from `adminApi.messages.recipients()`)
- [ ] 9.3 Read URL search params (`recipientType`, `recipientKind`, `recipientId`, `recipientLabel`) on mount; when present, pre-fill recipient and hide selector
- [ ] 9.4 Build `recipient_targets` array from selected groups + individual recipients on submit
- [ ] 9.5 Show recipient label summary when pre-filled (e.g., "To: user@example.com")

## 10. Frontend Admin — List Page Message Buttons

- [ ] 10.1 Add "Message" link/button to each row in `frontend/app/admin/(dashboard)/users/page.tsx` linking to `/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=<id>&recipientLabel=<email>`
- [ ] 10.2 Add "Message" link/button to each row in `frontend/app/admin/(dashboard)/members/page.tsx` linking to `/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=<id>&recipientLabel=<email>`

## 11. Frontend Admin — Message List/Detail Recipient Display


```

Full source: openspec/changes/admin-targeted-messaging/tasks.md

## openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md

- Source: openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md
- Lines: 1-136
- SHA256: 56c3892a0a2bf819d3e44319fedb4139e8df01d7ec28ac532427801240836c55

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: SystemMessage SHALL track recipient type and targets

The `SystemMessage` model SHALL have a `recipient_type` column (`String(20)`) with values `broadcast` (visible to all members) or `targeted` (visible only to specified recipients). When `recipient_type='targeted'`, the model SHALL have a non-null `recipient_targets` JSON column containing an array of target objects. Each target object SHALL have a `kind` field (`group` | `user` | `member`) and a `value` field. For `kind='group'`, `value` SHALL be one of `cable_managers`, `equipment_managers`, or `members`. For `kind='user'` or `kind='member'`, `value` SHALL be the integer id of the recipient. Existing rows (created before this change) SHALL default to `recipient_type='broadcast'` with `recipient_targets=NULL`.

#### Scenario: Broadcast message has recipient_type broadcast
- **WHEN** admin creates a message with `recipient_type='broadcast'`
- **THEN** the `SystemMessage` row is stored with `recipient_type='broadcast'` and `recipient_targets=NULL`

#### Scenario: Targeted message has recipient_targets array
- **WHEN** admin creates a message with `recipient_type='targeted'` and `recipient_targets=[{"kind":"group","value":"cable_managers"},{"kind":"group","value":"equipment_managers"}]`
- **THEN** the `SystemMessage` row is stored with `recipient_type='targeted'` and the JSON array in `recipient_targets`

#### Scenario: Legacy messages default to broadcast
- **WHEN** the migration runs against existing `system_messages` rows
- **THEN** all existing rows have `recipient_type='broadcast'` and `recipient_targets=NULL`

### Requirement: Admin SHALL send mass messages to selected recipient groups

The admin `POST /api/admin/messages` endpoint SHALL accept `recipient_type` (`broadcast` | `targeted`) and `recipient_targets` (array of target objects) in the request body alongside `title` and `body`. When `recipient_type='targeted'`, the endpoint SHALL require a non-empty `recipient_targets` array. The endpoint SHALL validate that each target object has a valid `kind` and `value`. The admin frontend `MessageForm` SHALL display a radio button for recipient type selection and, when `targeted` is selected, a checkbox list of recipient groups (Cable Managers, Equipment Managers, Members) plus optional individual recipient selection. The form SHALL submit the selected targets as a JSON array.

#### Scenario: Admin sends broadcast message
- **WHEN** admin selects "Broadcast to all members", enters title + body, and submits
- **THEN** the frontend POSTs `{title, body, recipient_type:'broadcast', recipient_targets:null}` and the backend creates a `SystemMessage` visible to all members

#### Scenario: Admin sends targeted message to multiple groups
- **WHEN** admin selects "Targeted recipients", checks "Cable Managers" and "Equipment Managers", enters title + body, and submits
- **THEN** the frontend POSTs `{title, body, recipient_type:'targeted', recipient_targets:[{kind:'group',value:'cable_managers'},{kind:'group',value:'equipment_managers'}]}` and the backend creates a `SystemMessage` visible only to those groups

#### Scenario: Targeted message requires at least one recipient
- **WHEN** admin selects "Targeted recipients" but checks no groups and submits
- **THEN** the frontend validation prevents submission, or the backend returns `422` with a message requiring at least one recipient target

### Requirement: Admin SHALL send single messages to a specific user or member

The admin users list page (`/admin/users`) SHALL display a "Message" action button on each row. The admin members list page (`/admin/members`) SHALL display a "Message" action button on each row. Clicking the button SHALL navigate to `/admin/messages/new?recipientType=targeted&recipientKind=<user|member>&recipientId=<id>&recipientLabel=<email>`. The `MessageForm` SHALL read these URL search params and, when present, pre-fill the recipient (displaying the recipient label, hiding the recipient selector) and let the admin enter only title + body. The submit SHALL POST `recipient_type='targeted'` with `recipient_targets=[{kind:'<user|member>', value:<id>}]`.

#### Scenario: Admin clicks Message on a user row
- **WHEN** admin clicks "Message" on a cable manager user row in `/admin/users`
- **THEN** the browser navigates to `/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=<id>&recipientLabel=<email>` and the form shows the recipient pre-filled

#### Scenario: Admin clicks Message on a member row
- **WHEN** admin clicks "Message" on a member row in `/admin/members`
- **THEN** the browser navigates to `/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=<id>&recipientLabel=<email>` and the form shows the recipient pre-filled

#### Scenario: Single message submission
- **WHEN** admin fills title + body on the pre-filled form and submits
- **THEN** the frontend POSTs `{title, body, recipient_type:'targeted', recipient_targets:[{kind:'user', value:<id>}]}` and the backend creates a `SystemMessage` visible only to that user

### Requirement: Admin SHALL list candidate recipients by group

The backend SHALL expose `GET /api/admin/messages/recipients` (guarded by `require_operator("messages")`) returning a JSON object with three arrays: `cable_managers` (Users with `role.scope_type='manufacturer'`), `equipment_managers` (Users with `role.scope_type='equipment_manufacturer'`), and `members` (all Members). Each item SHALL include `id`, `email`, and `name`. The admin frontend SHALL call this endpoint once when rendering the `MessageForm` to populate the individual recipient selector.

#### Scenario: Fetch all candidate recipients
- **WHEN** the admin opens the message form
- **THEN** the frontend calls `GET /api/admin/messages/recipients` and receives `{cable_managers:[...], equipment_managers:[...], members:[...]}`

#### Scenario: Endpoint requires messages permission
- **WHEN** a user without `messages` operator permission calls `GET /api/admin/messages/recipients`
- **THEN** the backend returns `403 Forbidden`

### Requirement: Staff users SHALL view their messages in a portal inbox

The backend SHALL expose portal-side message routes guarded by portal auth: `GET /api/portal/messages` (paginated list), `GET /api/portal/messages/{id}` (single message, auto-marks as read on first view), and `GET /api/portal/messages/unread-count`. A message SHALL appear in a staff user's inbox if `recipient_type='targeted'` AND any target matches the caller:
- `kind='group'` + `value='cable_managers'` and caller's `role.scope_type='manufacturer'`
- `kind='group'` + `value='equipment_managers'` and caller's `role.scope_type='equipment_manufacturer'`
- `kind='user'` + `value=<caller.user_id>`

Broadcast messages (`recipient_type='broadcast'`) SHALL NOT appear in the staff inbox (broadcast is member-only).

The frontend SHALL add `/portal/messages` (list page) and `/portal/messages/[id]` (detail page) under the portal layout, mirroring the existing member messages UI. The portal sidebar SHALL include a "Messages" link with an unread badge.

#### Scenario: Cable manager views their inbox
- **WHEN** a cable manager (role.scope_type='manufacturer') calls `GET /api/portal/messages`
- **THEN** the response contains only `targeted` messages where any target has `kind='group'` + `value='cable_managers'` OR `kind='user'` + `value=<their user_id>`

#### Scenario: Equipment manager views their inbox
- **WHEN** an equipment manager (role.scope_type='equipment_manufacturer') calls `GET /api/portal/messages`
- **THEN** the response contains only `targeted` messages where any target has `kind='group'` + `value='equipment_managers'` OR `kind='user'` + `value=<their user_id>`

```

Full source: openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md
