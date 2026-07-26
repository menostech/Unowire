# admin-targeted-messaging Specification

## Purpose
TBD - created by archiving change admin-targeted-messaging. Update Purpose after archive.
## Requirements
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

#### Scenario: Broadcast messages excluded from staff inbox
- **WHEN** a staff user calls `GET /api/portal/messages`
- **THEN** no `recipient_type='broadcast'` messages appear in the response

#### Scenario: Staff user opens a message
- **WHEN** a staff user calls `GET /api/portal/messages/{id}` for a message targeting them
- **THEN** the backend returns the message detail and inserts a row into `system_message_user_reads` (idempotent via `ON CONFLICT DO NOTHING`)

#### Scenario: Staff user cannot view message not targeted to them
- **WHEN** a staff user calls `GET /api/portal/messages/{id}` for a message that does not target them
- **THEN** the backend returns `404 Not Found`

#### Scenario: Portal sidebar shows unread badge
- **WHEN** a staff user has unread messages
- **THEN** the portal sidebar "Messages" link shows an unread count badge

### Requirement: Staff message reads SHALL be tracked in a parallel table

The system SHALL create a `system_message_user_reads` table with columns `user_id` (FK to `users.id`, `ondelete=CASCADE`, primary key), `message_id` (FK to `system_messages.id`, `ondelete=CASCADE`, primary key), and `read_at` (DateTime, default utcnow). This table is parallel to the existing `system_message_reads` table (which tracks member reads) and SHALL NOT modify the existing table's schema or queries. The `SystemMessageUserRead` model SHALL support an idempotent upsert via PostgreSQL `ON CONFLICT DO NOTHING` for `mark_read_for_user(db, user_id, message_id)`.

#### Scenario: Staff read state recorded
- **WHEN** a staff user opens a message for the first time
- **THEN** a row is inserted into `system_message_user_reads` with `(user_id, message_id, read_at)`

#### Scenario: Staff read state is idempotent
- **WHEN** a staff user opens the same message again
- **THEN** no new row is inserted (the existing row is preserved with the original `read_at`)

#### Scenario: Staff user deletes cascade reads
- **WHEN** a User is deleted
- **THEN** all rows in `system_message_user_reads` with that `user_id` are cascade-deleted

### Requirement: Member inbox SHALL support targeted member messages

The existing `GET /api/member/messages` endpoint SHALL continue returning `broadcast` messages (visible to all members) AND SHALL additionally return `targeted` messages where any target has `kind='group'` + `value='members'` OR `kind='member'` + `value=<caller_member_id>`. The member inbox UI does not change behavior — it already shows all visible messages; only the backend filter logic changes.

#### Scenario: Member sees broadcast and targeted messages
- **WHEN** a member calls `GET /api/member/messages`
- **THEN** the response contains all `broadcast` messages plus any `targeted` messages where a target matches `kind='group'` + `value='members'` OR `kind='member'` + `value=<their member_id>`

#### Scenario: Member does not see staff-only targeted messages
- **WHEN** a member calls `GET /api/member/messages`
- **THEN** no `targeted` messages with only `kind='user'` or `kind='group'` + `value='cable_managers'` targets appear in the response

### Requirement: Admin message list SHALL display recipient type

The admin message list page (`/admin/messages`) and detail page (`/admin/messages/[id]`) SHALL display the `recipient_type` and a human-readable summary of `recipient_targets` (e.g., "Cable Managers, Equipment Managers" or "All Members" or "user@example.com"). The `AdminMessageRead` response schema SHALL include `recipient_type` and `recipient_targets` fields. The `AdminMessage` TypeScript type SHALL be extended accordingly.

#### Scenario: Admin list shows recipient summary
- **WHEN** admin views `/admin/messages`
- **THEN** each row displays a "Recipients" column showing "All Members" for broadcast or a comma-separated list of group names/emails for targeted

#### Scenario: Admin detail shows recipient list
- **WHEN** admin views `/admin/messages/[id]`
- **THEN** the page displays the full recipient target list (group names, user emails, or member emails)

