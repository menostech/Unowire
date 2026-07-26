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

- [ ] 11.1 Add "Recipients" column to `/admin/messages` list page showing "All Members" or human-readable target summary
- [ ] 11.2 Add recipient detail section to `/admin/messages/[id]` detail page showing full recipient target list
- [ ] 11.3 Add helper function to format `recipient_targets` into human-readable string (e.g., "Cable Managers, Equipment Managers" or "user@example.com")

## 12. Frontend Portal — Staff Inbox

- [ ] 12.1 Create `frontend/app/portal/messages/page.tsx` (server shell) fetching `portalApi.messages.all()` and rendering message list with unread badges
- [ ] 12.2 Create `frontend/app/portal/messages/[id]/page.tsx` (server shell) fetching `portalApi.messages.getById(id)` and rendering message detail
- [ ] 12.3 Create `frontend/app/portal/messages/loading.tsx` skeleton
- [ ] 12.4 Add "Messages" link with unread badge to `frontend/components/portal/layout/PortalSidebar.tsx`
- [ ] 12.5 Add `MessagesUnreadBadge` client component for portal (polling `/api/portal/messages/unread-count`) mirroring the existing member `MessagesUnreadBadge`

## 13. Verification

- [ ] 13.1 Run `tsc --noEmit` in frontend — 0 errors
- [ ] 13.2 Run backend tests — all pass including new message tests
- [ ] 13.3 Run `next build` — all routes compile
- [ ] 13.4 Manual smoke test: admin sends broadcast message → member sees it in inbox
- [ ] 13.5 Manual smoke test: admin sends targeted message to cable managers group → cable manager sees it in `/portal/messages`, equipment manager does not
- [ ] 13.6 Manual smoke test: admin clicks "Message" on a user row → form pre-fills → submit → user sees message in `/portal/messages`
- [ ] 13.7 Manual smoke test: admin clicks "Message" on a member row → form pre-fills → submit → member sees message in `/member/messages`
- [ ] 13.8 Manual smoke test: portal sidebar unread badge updates when new targeted message arrives
