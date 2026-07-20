# System Message Broadcast Design Spec

> **Branch:** `feat/media-picker-modal` (or new `feat/system-messages` branch)
> **Date:** 2026-07-20
> **Status:** Approved by user (2026-07-20 brainstorming session)

## Goal

Add a system message broadcast feature: admins publish title + plain-text-body messages from the admin panel (under the `Settings` group), and all active members receive them immediately. Members view messages at `/member/messages` with an unread badge in their sidebar. No email notifications. Admins can only create + delete (no edit).

## Scope

### In Scope

- New `system_messages` table (title, body, created_by, timestamps)
- New `system_message_reads` join table (member_id, message_id, read_at) for per-member read tracking
- New `messages` RBAC module registered in `ADMIN_MODULES` (backend + frontend mirror)
- New admin menu item `menu-messages` under the `Settings` group (page_id=`messages`, sort_order=7)
- New admin pages: `/admin/messages` (list), `/admin/messages/new` (create form)
- New admin API endpoints: `GET/POST/DELETE /api/admin/messages`, `GET /api/admin/messages/{id}`
- New member pages: `/member/messages` (list), `/member/messages/[id]` (detail)
- New member API endpoints: `GET /api/member/messages`, `GET /api/member/messages/unread-count`, `GET /api/member/messages/{id}` (marks read on first view)
- Member sidebar gains "Messages" entry with unread badge (reuses `UnreadBadge` pattern)
- Alembic migration: creates tables, seeds menu item, seeds `admin` role permission for `messages`
- Backend tests for admin and member routes

### Out of Scope (YAGNI)

- Email notifications on publish
- Rich text / Markdown body (plain text only)
- Editing published messages (only create + delete)
- Recipient segmentation or manual picker (broadcast to ALL active members only)
- Message categories/tags
- Pinned messages
- Member-side message deletion
- Message attachments
- Multi-round conversation

## Architecture

### Data Flow

```
Admin publishes message
  → POST /api/admin/messages {title, body}
  → INSERT INTO system_messages (title, body, created_by=staff.id)
  → Returns created message

Member opens /member/messages
  → GET /api/member/messages?page=1
  → SELECT m.*, (r.member_id IS NOT NULL) AS is_read
      FROM system_messages m
      LEFT JOIN system_message_reads r
        ON r.message_id = m.id AND r.member_id = :current_member_id
      ORDER BY m.created_at DESC
  → Renders list with read/unread state

Member sidebar badge
  → GET /api/member/messages/unread-count
  → SELECT COUNT(*) FROM system_messages m
      LEFT JOIN system_message_reads r
        ON r.message_id = m.id AND r.member_id = :current_member_id
      WHERE r.member_id IS NULL
  → Returns {unread: N}

Member opens /member/messages/[id]
  → GET /api/member/messages/{id}
  → SELECT message, check if read row exists
  → If not read: INSERT INTO system_message_reads (member_id, message_id, read_at=now)
  → Returns message body

Admin deletes message
  → DELETE /api/admin/messages/{id}
  → DELETE FROM system_message_reads WHERE message_id = {id} (cascade)
  → DELETE FROM system_messages WHERE id = {id}
```

### Rendering Strategy

- Admin list page (`/admin/messages`): server component, fetches `api.adminMessages.list()`, renders table. Delete button is a client component (`MessageActions`).
- Admin create page (`/admin/messages/new`): server component shell with a client form (`MessageForm`) handling submit via `api.adminMessages.create()`.
- Member list page (`/member/messages`): server component, fetches `api.memberMessages.list()`, renders list with unread styling.
- Member detail page (`/member/messages/[id]`): server component, fetches `api.memberMessages.get(id)` (which marks read server-side), renders body.
- Member sidebar badge: client component (`MessageUnreadBadge`), polls `api.memberMessages.unreadCount()` on mount.

## Data Model

### `system_messages` Table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BigInteger | PK, autoincrement | |
| `title` | String(200) | NOT NULL | |
| `body` | Text | NOT NULL | Plain text, no HTML/Markdown |
| `created_by` | Integer | FK→users.id, NOT NULL, ON DELETE SET NULL | Publishing staff member |
| `created_at` | DateTime | default now() | |
| `updated_at` | DateTime | default now(), onupdate now() | |

Indexes: primary key on `id`.

### `system_message_reads` Table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `member_id` | BigInteger | FK→members.id, NOT NULL, ON DELETE CASCADE | |
| `message_id` | BigInteger | FK→system_messages.id, NOT NULL, ON DELETE CASCADE | |
| `read_at` | DateTime | default now() | |

Constraints:
- Composite PK: `(member_id, message_id)` — prevents duplicate read rows
- Index `ix_system_message_reads_message_id` on `message_id` for "who read this message" queries

### Read Tracking Logic

- Unread for member M = `system_messages` rows where no matching row exists in `system_message_reads` for `(M.id, message_id)`
- On member detail view: if no read row exists, INSERT one (idempotent due to composite PK — use `INSERT ... ON CONFLICT DO NOTHING` or check-then-insert)
- On message delete: cascade removes all read rows
- On member delete: cascade removes all read rows

## RBAC Module Registration

Per the 4-step procedure documented in `backend/app/core/modules.py`:

### Step 1: Backend ADMIN_MODULES

File: `backend/app/core/modules.py`

Add new entry:
```python
{"id": "messages", "label": "Messages", "scope_aware": False, "scope_type": None},
```

`scope_aware=False` because broadcasts are global — no per-manufacturer filtering.

### Step 2: Frontend mirror

File: `frontend/lib/adminModules.ts`

Add new entry:
```typescript
{ id: 'messages', label: 'Messages', scopeAware: false, scopeType: null },
```

### Step 3: Seed role_permissions for admin role

Done in the Alembic migration (see below). Only `admin` role gets the `messages` module. Other preset roles (`content_editor`, `equipment_manager`, `cable_manager`) do NOT receive this permission.

### Step 4: scope_resolvers.py

No change required (`scope_aware=False`).

## Menu Integration

### Backend ALLOWED_PAGE_IDS

File: `backend/app/crud/menu.py` (lines 15-31)

Add `"messages"` to the `ALLOWED_PAGE_IDS` set.

### Frontend ADMIN_PAGES

File: `frontend/lib/adminMenuRegistry.ts` (lines 8-26)

Add new entry:
```typescript
{ pageId: 'messages', href: '/admin/messages', defaultLabel: 'Messages', defaultIcon: 'Megaphone' },
```

### AdminSidebar.tsx Icon

File: `frontend/components/admin/layout/AdminSidebar.tsx`

- Line 6-12 (lucide-react import): add `Megaphone`
- Line 17-20 (`FALLBACK_ICONS` map): add `messages: Megaphone`

### Alembic Migration

File: `backend/alembic/versions/<new_revision>_add_system_messages.py`

Operations:
1. Create `system_messages` table
2. Create `system_message_reads` table with composite PK and index
3. INSERT into `admin_menu_items`:
   ```sql
   INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
   VALUES ('menu-messages', 'settings', 'page', 'messages', NULL, 'Messages', 'Megaphone', 7, true, now(), now());
   ```
4. INSERT into `role_permissions`:
   ```sql
   INSERT INTO role_permissions (role_id, module)
   SELECT 'admin', 'messages'
   WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id = 'admin' AND module = 'messages');
   ```

Downgrade: drop `system_message_reads`, drop `system_messages`, delete `menu-messages` row, delete `admin`/`messages` role_permission row.

## Backend API

### Admin Routes

File: `backend/app/api/routes/admin_messages.py`

All endpoints use `Depends(require_module("messages"))`.

| Method | Path | Description | Request Body | Response |
|---|---|---|---|---|
| GET | `/api/admin/messages?page=1&page_size=20` | Paginated list (newest first) | — | `{items: AdminMessageRead[], total, page, page_size}` |
| GET | `/api/admin/messages/{id}` | Detail with publisher email | — | `AdminMessageRead` |
| POST | `/api/admin/messages` | Create new broadcast | `{title: str, body: str}` | `AdminMessageRead` (201) |
| DELETE | `/api/admin/messages/{id}` | Delete message (cascades reads) | — | 204 |

**Pydantic schemas** (`backend/app/schemas/system_message.py`):
- `MessageCreate { title: str (max 200), body: str }`
- `AdminMessageRead { id: int, title: str, body: str, created_by: int, created_by_email: str | None, created_at: datetime, updated_at: datetime }`
- `MessageListResponse { items: AdminMessageRead[], total: int, page: int, page_size: int }`

**CRUD** (`backend/app/crud/system_message.py`):
- `list_messages(db, page, page_size) -> (items, total)` — joins `users` for publisher email
- `get_message(db, message_id) -> AdminMessageRead | None`
- `create_message(db, title, body, created_by) -> AdminMessageRead`
- `delete_message(db, message_id) -> bool` — cascades reads via FK

### Member Routes

File: `backend/app/api/routes/member_messages.py` (new file, or extend `member.py`)

All endpoints use `Depends(get_current_member)`.

| Method | Path | Description | Response |
|---|---|---|---|
| GET | `/api/member/messages?page=1&page_size=20` | List for current member (with `is_read` field) | `{items: MemberMessageRead[], total, page, page_size}` |
| GET | `/api/member/messages/unread-count` | Unread count for badge | `{unread: int}` |
| GET | `/api/member/messages/{id}` | Detail (marks read on first view) | `MemberMessageRead` |

**Pydantic schemas** (extend `backend/app/schemas/system_message.py`):
- `MemberMessageRead { id: int, title: str, body: str, created_at: datetime, is_read: bool }`
- `MemberMessageListResponse { items: MemberMessageRead[], total: int, page: int, page_size: int }`
- `UnreadCountResponse { unread: int }`

**CRUD** (extend `backend/app/crud/system_message.py`):
- `list_for_member(db, member_id, page, page_size) -> (items, total)` — LEFT JOIN reads, computes `is_read`
- `unread_count_for_member(db, member_id) -> int` — COUNT where no read row
- `get_for_member(db, member_id, message_id) -> MemberMessageRead | None` — returns message, marks read (INSERT if not exists, idempotent)

**Read-marking implementation** (in `get_for_member`):
```python
# After fetching the message, ensure a read row exists
existing = await db.execute(
    select(SystemMessageRead).where(
        SystemMessageRead.member_id == member_id,
        SystemMessageRead.message_id == message_id,
    )
)
if existing.scalar_one_or_none() is None:
    await db.execute(
        insert(SystemMessageRead).values(
            member_id=member_id,
            message_id=message_id,
            read_at=datetime.utcnow(),
        ).on_conflict_do_nothing()  # PostgreSQL: ON CONFLICT (member_id, message_id) DO NOTHING
    )
    await db.commit()
```

The `on_conflict_do_nothing` guards against race conditions when multiple tabs/tokens hit the endpoint concurrently.

### Route Registration

File: `backend/app/main.py` (or wherever routers are included)

Register both routers:
```python
from .api.routes.admin_messages import router as admin_messages_router
from .api.routes.member_messages import router as member_messages_router

app.include_router(admin_messages_router, prefix="/api/admin")
app.include_router(member_messages_router, prefix="/api/member")
```

## Frontend — Admin

### Pages

**`frontend/app/admin/messages/page.tsx`** (server component)
- Fetches `api.adminMessages.list({ page: 1, page_size: 20 })`
- Renders table: Title | Publisher | Created At | Actions
- Top-right "New Message" button links to `/admin/messages/new`
- Empty state: "No messages yet. Click 'New Message' to broadcast."
- Pagination if total > page_size

**`frontend/app/admin/messages/new/page.tsx`** (server component shell)
- Renders page header "New Message"
- Renders `<MessageForm />` (client component)

**`frontend/app/admin/messages/components/MessageForm.tsx`** (client component)
- Form fields: title (input, max 200 chars), body (textarea, no char limit)
- Submit handler: calls `api.adminMessages.create({ title, body })`
- On success: `router.push('/admin/messages')` + toast notification
- On error: display inline error message
- Cancel button: `router.back()`
- Form validation: title required, body required (client-side)

**`frontend/app/admin/messages/components/MessageActions.tsx`** (client component)
- Delete button with confirmation dialog
- On confirm: calls `api.adminMessages.delete(id)`
- On success: `router.refresh()` + toast
- On error: display error

### API Client

File: `frontend/lib/api.ts`

Add new namespaces:
```typescript
adminMessages: {
  list: (params?: { page?: number; page_size?: number }) => Promise<MessageListResponse>,
  get: (id: number) => Promise<AdminMessageRead>,
  create: (data: { title: string; body: string }) => Promise<AdminMessageRead>,
  delete: (id: number) => Promise<void>,
},
memberMessages: {
  list: (params?: { page?: number; page_size?: number }) => Promise<MemberMessageListResponse>,
  unreadCount: () => Promise<{ unread: number }>,
  get: (id: number) => Promise<MemberMessageRead>,
},
```

### Types

File: `frontend/lib/types.ts`

Add new interfaces (mirroring Pydantic schemas):
- `AdminMessage`, `MemberMessage`, `MessageListResponse`, `MemberMessageListResponse`

## Frontend — Member

### Pages

**`frontend/app/(site)/member/messages/page.tsx`** (server component)
- Fetches `api.memberMessages.list({ page: 1, page_size: 20 })`
- Renders list: each item shows title + created_at + read/unread indicator
- Unread items: bold title + blue dot indicator
- Read items: normal weight + gray dot
- Click navigates to `/member/messages/[id]`
- Empty state: "No messages."

**`frontend/app/(site)/member/messages/[id]/page.tsx`** (server component)
- Fetches `api.memberMessages.get(id)` — this marks the message as read server-side
- Renders: title (h1), created_at, body (preserved line breaks via `whitespace-pre-wrap`)
- Back button to `/member/messages`

### Member Sidebar Update

File: `frontend/app/(site)/member/layout.tsx`

Add new sidebar entry between "Inbox" and "Profile" (or after "My Inquiries"):
- Label: "Messages"
- Href: `/member/messages`
- Icon: `Mail` or `Megaphone` (consistent with admin)
- Renders `<MessageUnreadBadge />` next to the label

**`frontend/components/member/MessageUnreadBadge.tsx`** (client component)
- Clones `UnreadBadge.tsx` pattern (lines identical except endpoint)
- On mount: calls `api.memberMessages.unreadCount()`
- If `unread > 0`: renders red pill with count (or just dot if count > 99)
- If `unread === 0`: renders nothing
- Polling: refresh on window focus (optional, matches UnreadBadge behavior)

## Testing

Per project constraint: "Frontend MVP does not require automated tests". Backend tests required.

### Backend Tests

**`backend/tests/test_admin_messages.py`** — mirrors `test_admin_members.py` pattern

Test cases (≈10):
1. `test_list_messages_as_admin` — returns paginated list
2. `test_list_messages_unauthenticated` — 401
3. `test_list_messages_without_permission` — non-admin role gets 403
4. `test_get_message_by_id` — returns single message with publisher email
5. `test_get_message_not_found` — 404
6. `test_create_message` — 201, returns created message
7. `test_create_message_invalid_payload` — missing title or body → 422
8. `test_delete_message` — 204, message removed
9. `test_delete_message_not_found` — 404
10. `test_delete_message_cascades_reads` — verify `system_message_reads` rows are removed

**`backend/tests/test_member_messages.py`** — tests member-side endpoints

Test cases (≈8):
1. `test_member_list_messages` — returns list with `is_read` field
2. `test_member_list_messages_unauthenticated` — 401
3. `test_member_unread_count_initial` — all messages are unread for new member
4. `test_member_unread_count_after_read` — count decreases after viewing
5. `test_member_get_message_marks_read` — first GET inserts read row
6. `test_member_get_message_idempotent` — second GET does not duplicate read row
7. `test_member_get_message_not_found` — 404
8. `test_member_inactive_account` — 401 if `is_active=False`

## File Structure Summary

### New Backend Files
- `backend/app/models/system_message.py` — `SystemMessage`, `SystemMessageRead` models
- `backend/app/schemas/system_message.py` — Pydantic schemas
- `backend/app/crud/system_message.py` — CRUD functions
- `backend/app/api/routes/admin_messages.py` — admin router
- `backend/app/api/routes/member_messages.py` — member router
- `backend/alembic/versions/<rev>_add_system_messages.py` — migration
- `backend/tests/test_admin_messages.py`
- `backend/tests/test_member_messages.py`

### Modified Backend Files
- `backend/app/core/modules.py` — add `messages` module
- `backend/app/crud/menu.py` — add `"messages"` to `ALLOWED_PAGE_IDS`
- `backend/app/models/__init__.py` — export new models (if applicable)
- `backend/app/main.py` — register new routers

### New Frontend Files
- `frontend/app/admin/messages/page.tsx` — list page
- `frontend/app/admin/messages/new/page.tsx` — new page
- `frontend/app/admin/messages/components/MessageForm.tsx`
- `frontend/app/admin/messages/components/MessageActions.tsx`
- `frontend/app/(site)/member/messages/page.tsx` — member list
- `frontend/app/(site)/member/messages/[id]/page.tsx` — member detail
- `frontend/components/member/MessageUnreadBadge.tsx`

### Modified Frontend Files
- `frontend/lib/adminModules.ts` — add `messages` module
- `frontend/lib/adminMenuRegistry.ts` — add `messages` page
- `frontend/lib/api.ts` — add `adminMessages` + `memberMessages` namespaces
- `frontend/lib/types.ts` — add message types
- `frontend/components/admin/layout/AdminSidebar.tsx` — add Megaphone icon
- `frontend/app/(site)/member/layout.tsx` — add Messages sidebar entry

### Deleted Files
- None

## Error Handling

- **Admin create with empty title/body:** 422 Validation Error (Pydantic enforced)
- **Admin/Member GET non-existent message:** 404
- **Member tries to access admin endpoint:** 401 (no staff token)
- **Non-admin staff tries to access admin endpoints:** 403 (no `messages` module permission)
- **Inactive member tries to access member endpoints:** 401 (enforced by `get_current_member`)
- **Race condition on read-marking:** guarded by `ON CONFLICT DO NOTHING` (idempotent insert)
- **Message delete with non-existent ID:** 404 (check existence before delete)

## Performance

- `system_messages` table grows linearly with broadcasts (low write volume — a few per week at most)
- `system_message_reads` table grows as `messages × members` — could reach thousands of rows. Composite PK + index on `message_id` keeps queries fast.
- List endpoints use `LIMIT/OFFSET` pagination (standard pattern, matches existing inquiry endpoints)
- Unread count query uses `LEFT JOIN ... WHERE r.member_id IS NULL` + `COUNT(*)` — indexed by `message_id`
- No N+1 queries: list endpoints join publishers in a single query

## Security

- All admin endpoints require `require_module("messages")` dependency
- All member endpoints require `get_current_member` dependency
- `created_by` is set from the authenticated staff user's ID, NOT from request body (prevents spoofing)
- Member cannot see other members' read state (queries are scoped to `current_member.id`)
- Body is plain text — rendered with `whitespace-pre-wrap`, no `dangerouslySetInnerHTML`, no XSS risk
- Title is plain text — rendered as-is, no HTML injection risk

## Acceptance Criteria

1. ✅ `system_messages` and `system_message_reads` tables exist with correct schema
2. ✅ `messages` module registered in `ADMIN_MODULES` (backend + frontend)
3. ✅ `menu-messages` row seeded under `settings` group (sort_order=7)
4. ✅ `admin` role has `messages` permission in `role_permissions`
5. ✅ Admin can access `/admin/messages` (list) and `/admin/messages/new` (create)
6. ✅ Admin can create a message with title + body, redirected to list on success
7. ✅ Admin can delete a message; `system_message_reads` rows cascade-deleted
8. ✅ Admin cannot edit a message (no edit route, no edit UI)
9. ✅ Non-admin staff gets 403 on admin message endpoints
10. ✅ Member sees "Messages" entry in sidebar with unread badge
11. ✅ Member can access `/member/messages` (list) — unread items are bold
12. ✅ Member can access `/member/messages/[id]` (detail) — message body shown
13. ✅ First view of message detail marks it as read (idempotent)
14. ✅ Unread count decreases after viewing a message
15. ✅ Inactive member gets 401 on member endpoints
16. ✅ Backend tests pass: `test_admin_messages.py` + `test_member_messages.py`
17. ✅ Docker backend + frontend builds succeed
18. ✅ 0 new tsc errors

## Rollback

Single Alembic downgrade reverts: drops tables, removes menu item, removes role_permission. Code changes reverted via `git revert` of the feature commits.

## Future Extensions (Out of Scope)

- Email notification on publish (optional checkbox on create form)
- Markdown body (rendered with `react-markdown` + sanitize)
- Recipient segmentation (all / by company / by registration date / manual picker)
- Message categories/tags
- Pinned messages
- Member-side delete
- Edit published messages (with re-mark-unread semantics)
