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
