---
comet_change: admin-targeted-messaging
role: technical-design
canonical_spec: openspec
---

# Design Doc — Admin Targeted Messaging

- Change: `admin-targeted-messaging`
- Date: 2026-07-26
- Status: Confirmed (deep technical refinement of open-phase `design.md`)
- Canonical spec: `openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md`

## Purpose

Deep technical design for extending the system message feature from broadcast-only to targeted messaging. Adds two delivery modes (mass-send to recipient groups, single-send from list pages) and a portal inbox for cable/equipment managers. The open-phase `design.md` captured the high-level decision directions; this doc refines them into implementation-grade detail: schema shapes, CRUD signatures, route ordering, type contracts, edge cases, and test coverage.

## Scope recap

- **In scope**: `SystemMessage` model + migration, `SystemMessageUserRead` parallel read table, extended schemas/CRUD/routes (admin POST + `/recipients`, portal inbox, member inbox filter), `MessageForm` recipient selector (mass mode with group checkboxes), `Message` button on admin user/member list pages, portal `/portal/messages` list + detail + sidebar badge, BFF routes, backend pytest tests.
- **Out of scope** (per open-phase design): message editing, real-time push, email notifications, threading/replies, scheduling/expiry, GIN index at MVP (migration path documented only).

## Architecture

### Recipient model — JSONB containment (Approach A)

`system_messages.recipient_targets` is a `JSONB` column holding an array of target objects. Visibility is computed at query time using PostgreSQL's `@>` containment operator.

```
system_messages
  + recipient_type: String(20)   'broadcast' | 'targeted'  (default 'broadcast')
  + recipient_targets: JSONB     null | array of {kind, value}

system_message_user_reads  (new, parallel to system_message_reads)
  user_id      BigInteger FK users.id           PK, ondelete=CASCADE
  message_id   BigInteger FK system_messages.id PK, ondelete=CASCADE
  read_at      DateTime
  + INDEX ix_system_message_user_reads_message_id (message_id)
```

**Why JSONB over a join table**: matches open-phase decision D1. Single column, no extra writes per recipient, recipients known at create time. Trade-off (no per-recipient delivery tracking) is acceptable because read state is tracked separately. Migration path to GIN index documented for scale.

**Why JSONB over plain JSON**: `JSONB` supports `@>` containment queries (the staff inbox filter), rejects duplicate keys, and is already used elsewhere in the project. Slightly more storage overhead is irrelevant at MVP scale.

### Data flow

```
Admin (mass mode):
  MessageForm (3 group checkboxes) -> POST /api/admin/messages
    {title, body, recipient_type:'targeted',
     recipient_targets:[{kind:'group',value:'cable_managers'}, ...]}
  -> SystemMessage row inserted with JSONB

Admin (single mode):
  user/member list -> "Message" link ->
    /admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=42&recipientLabel=...
  -> MessageForm (pre-filled, selector hidden) -> POST with single target

Cable manager opens portal inbox:
  GET /api/portal/messages (portal_token cookie)
  -> require_factory_module('messages') (auth: scope_type='manufacturer')
  -> crud.list_for_staff_user(user_id=42, scope_type='manufacturer')
  -> WHERE recipient_type='targeted' AND (
       recipient_targets @> '[{"kind":"group","value":"cable_managers"}]'::jsonb
       OR recipient_targets @> '[{"kind":"user","value":"42"}]'::jsonb
     )
  -> LEFT JOIN system_message_user_reads for is_read

Member opens inbox (existing route, extended filter):
  GET /api/member/messages
  -> crud.list_for_member(member_id=...)
  -> WHERE recipient_type='broadcast'
       OR (recipient_type='targeted' AND (
            recipient_targets @> '[{"kind":"group","value":"members"}]'::jsonb
            OR recipient_targets @> '[{"kind":"member","value":"<id>"}]'::jsonb))
```

## Components

### 1. Models (`backend/app/models/system_message.py`)

Extend `SystemMessage`:
```python
recipient_type: Mapped[str] = mapped_column(
    String(20), nullable=False, default="broadcast"
)
recipient_targets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

New `SystemMessageUserRead` parallel table (mirror of `SystemMessageRead` for staff Users). Registered in `backend/app/models/__init__.py`.

### 2. Migration

Single Alembic revision:
- `op.add_column("system_messages", Column("recipient_type", String(20), nullable=False, server_default="broadcast"))` — `server_default` populates existing rows without backfill step.
- `op.add_column("system_messages", Column("recipient_targets", JSONB, nullable=True))`.
- `op.create_table("system_message_user_reads", ...)` with composite PK + `ix_system_message_user_reads_message_id` index.

### 3. Schemas (`backend/app/schemas/system_message.py`)

- `RecipientTarget` — `kind: Literal['group','user','member']`, `value: str`. Field validator coerces incoming `int` (from form) to `str` for JSON type consistency.
- Extended `MessageCreate` — adds `recipient_type`, `recipient_targets`. Cross-field `model_validator(mode='after')` enforces: non-empty targets when `targeted`; null targets when `broadcast`; valid group values (`cable_managers`, `equipment_managers`, `members`).
- Extended `AdminMessageRead` — echoes `recipient_type` + `recipient_targets`.
- `RecipientListItem` (`id`, `email`, `name`) and `RecipientListResponse` (three arrays).
- `PortalMessageRead` (`id`, `title`, `body`, `created_at`, `is_read`) and `PortalMessageListResponse`.

### 4. CRUD (`backend/app/crud/system_message.py`)

- Extended `create_message` — persists recipient fields; converts `RecipientTarget` Pydantic objects to plain dicts for JSONB.
- New `list_recipients_by_group(db)` — 3 parallel queries via `asyncio.gather`: cable managers (`User.role.scope_type='manufacturer'`), equipment managers (`scope_type='equipment_manufacturer'`), all members.
- New `list_for_staff_user(db, user_id, scope_type, page, page_size)` — JSONB `@>` filter with group value derived from `scope_type` (`'manufacturer' -> 'cable_managers'`, `'equipment_manufacturer' -> 'equipment_managers'`) plus `kind=user,value=str(user_id)` individual filter; LEFT JOIN `SystemMessageUserRead` for `is_read`.
- New `unread_count_for_staff_user(db, user_id, scope_type)` and `get_for_staff_user(db, user_id, scope_type, message_id)` — same filter.
- New `mark_read_for_user(db, user_id, message_id)` — idempotent upsert via `pg_insert(...).on_conflict_do_nothing(index_elements=['user_id','message_id'])`, mirroring existing `mark_read`.
- Extended `list_for_member` — adds `OR` clause for `kind=group,value=members` and `kind=member,value=str(member_id)` targeted messages on top of existing broadcast behavior.

**Type-safety invariant**: all `value` fields are stored as string in JSONB. All Python-side lookups coerce `user_id`/`member_id` to `str` before constructing JSONB filter literals. Documented in code comments.

### 5. Routes

#### `backend/app/api/routes/admin_messages.py` (extend)

- Extended `POST /api/admin/messages` — accepts `recipient_type` + `recipient_targets`; `_to_admin_read` helper extended to echo recipient fields.
- New `GET /api/admin/messages/recipients` — guarded by `require_operator('messages')`, returns `RecipientListResponse`. **Route ordering: registered BEFORE `GET /{message_id}`** to avoid FastAPI matching `"recipients"` as a path-param.

#### `backend/app/api/routes/portal_messages.py` (new file)

- `GET /api/portal/messages` — paginated list, `require_factory_module('messages')`.
- `GET /api/portal/messages/unread-count` — **registered BEFORE `/{message_id}`**.
- `GET /api/portal/messages/{id}` — single message; auto-marks read on first view via `mark_read_for_user`; 404 if not targeted to caller.
- Registered in `backend/app/main.py` alongside other portal routers.

#### `backend/app/api/routes/member.py` (extend message section)

- `GET /api/member/messages` route signature unchanged — only underlying CRUD filter changes. Response schema unchanged.

#### `backend/app/api/deps.py`

Add `"messages"` to `_FACTORY_ALLOWED_BY_SCOPE` for both `manufacturer` and `equipment_manufacturer` scopes. No `role_permissions` row needed (factory auth path ignores that table per existing design).

### 6. Frontend types

- `frontend/lib/types.ts` — extend `AdminMessage` with `recipient_type` + `recipient_targets`. Add `RecipientTarget`, `RecipientTargetKind`, `RecipientGroupValue`, `RecipientListItem`, `RecipientListResponse`.
- `frontend/lib/types/portal.ts` — add `PortalMessage`, `PortalMessageListResponse`.

### 7. Frontend API clients

- `frontend/lib/adminApi.ts` — extend `messages.create()` payload with recipient fields; add `messages.recipients()`.
- `frontend/lib/portalApi.ts` (server) + `frontend/lib/portalApiClient.ts` (client) — add `messages` namespace (`all`, `getById`, `unreadCount`).

### 8. BFF routes (Next.js)

New files mirroring existing `frontend/app/api/admin/messages/route.ts` pattern (cookie forwarding):

| Path | Cookie | Forwards to |
|------|--------|-------------|
| `frontend/app/api/portal/messages/route.ts` | `portal_token` | `GET /api/portal/messages` |
| `frontend/app/api/portal/messages/[id]/route.ts` | `portal_token` | `GET /api/portal/messages/{id}` |
| `frontend/app/api/portal/messages/unread-count/route.ts` | `portal_token` | `GET /api/portal/messages/unread-count` |
| `frontend/app/api/admin/messages/recipients/route.ts` | `admin_token` | `GET /api/admin/messages/recipients` |

### 9. Admin UI

- `frontend/components/admin/form/MessageForm.tsx` — restructured with three modes:
  - `broadcast` (default): radio selected on "Broadcast to all members", no recipient selector.
  - `targeted`: radio selected on "Targeted recipients", shows 3 group checkboxes (Cable Managers, Equipment Managers, Members). Validation disables Publish if no group checked.
  - `single`: triggered by URL params (`recipientType=targeted&recipientKind=...&recipientId=...&recipientLabel=...`). Hides selector, shows "To: <label>" with "Change" link that returns to `broadcast` mode by clearing URL params.
  - Submit payload constructs `recipient_targets` from mode + state.
- `frontend/app/admin/(dashboard)/users/page.tsx` — add `Message` link per row pointing to `/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=...&recipientLabel=<email>`.
- `frontend/app/admin/(dashboard)/members/page.tsx` — same with `recipientKind=member`.
- `frontend/app/admin/(dashboard)/messages/page.tsx` + `[id]/page.tsx` — add recipient summary column / detail. Helper `formatRecipientSummary(targets, type)` in `frontend/lib/utils/messages.ts` returns `"All Members"` for broadcast or comma-separated group names / emails for targeted.

### 10. Portal UI

- `frontend/app/portal/messages/page.tsx` (new) — server component, `portalApi.messages.all(1, 20)`, table with Title + Created + Read badge.
- `frontend/app/portal/messages/[id]/page.tsx` (new) — server component, `portalApi.messages.getById(id)`, renders title + body + created_at; backend auto-marks read.
- `frontend/components/portal/layout/PortalSidebar.tsx` — add "Messages" link between "Inquiries" and "Media".
- `frontend/components/portal/PortalMessagesUnreadBadge.tsx` (new client component) — fetches `/api/portal/messages/unread-count` on mount, renders red pill badge. Mirrors existing `frontend/components/member/MessagesUnreadBadge.tsx`.

## Error handling

| Case | Status | Source |
|------|--------|--------|
| Targeted message with empty `recipient_targets` | 422 | Pydantic `MessageCreate` validator |
| Invalid group value in target | 422 | Pydantic `MessageCreate` validator |
| `broadcast` with non-null `recipient_targets` | 422 | Pydantic `MessageCreate` validator |
| Staff opens message not targeted to them | 404 | `get_for_staff_user` returns None |
| Non-factory user calls portal route | 403 | existing `require_factory_module` |
| `GET /api/admin/messages/recipients` without `messages` permission | 403 | existing `require_operator` |
| Concurrent read marking | — | `ON CONFLICT DO NOTHING` (atomic, no race) |

## Edge cases

| Edge case | Handling |
|-----------|----------|
| Legacy messages (pre-migration) | `recipient_type='broadcast'`, `recipient_targets=NULL`. Members see them; staff inbox excludes them (broadcast excluded by definition). |
| Targeted message to deleted user/member | JSON keeps stale `kind=user/member,value=<id>`. Harmless — query filter matches no rows. Documented. |
| Admin deletes a message | `SystemMessageRead` + `SystemMessageUserRead` cascade-delete via FK `ondelete=CASCADE`. |
| User deleted | `system_message_user_reads` rows cascade. Message remains visible to other recipients. |
| Staff role changes scope_type | Filter recomputed at query time from current `user.role.scope_type`; old messages become invisible, new scope's messages become visible. Correct. |
| Staff user has no `scope_id` | Existing `get_current_factory_user` already rejects with 403. |
| Targeted message but no recipients match (empty group) | Message created, visible to no one. Acceptable — admin's choice. |
| JSONB `@>` type sensitivity | All `value` fields stored as string; lookups coerce ids to `str`. Documented. |
| FastAPI route ordering | `/recipients` and `/unread-count` registered before `/{message_id}`. Code comments document why. |
| Form validation bypass (crafted POST) | Backend `MessageCreate` validator enforces invariants, returns 422. Defense in depth. |

## Performance considerations (MVP-scale, non-blocking)

- Expected message volume: low (operational comms, dozens/month).
- No GIN index at MVP — sequential scan with `@>` filter is fine under 10K rows.
- Future migration path: `CREATE INDEX ix_system_messages_recipient_targets_gin ON system_messages USING GIN (recipient_targets jsonb_path_ops);`
- `list_recipients_by_group` runs 3 queries in parallel via `asyncio.gather` — acceptable at MVP scale.

## Testing strategy

Per project memory: **frontend MVP skips automated tests** — backend pytest only.

### Backend tests

| File | Coverage |
|------|----------|
| `backend/tests/api/test_admin_messages.py` (extend) | POST broadcast default; POST targeted groups; POST targeted empty (422); POST invalid group (422); POST broadcast+non-null targets (422); GET `/recipients` returns 3 groups; GET `/recipients` requires permission (403); admin list/detail echo recipient fields |
| `backend/tests/api/test_portal_messages.py` (new) | Cable manager sees targeted `group=cable_managers` + `kind=user,value=<id>`; equipment manager sees `group=equipment_managers` + individual; broadcast excluded; targeted-to-other-group excluded; `GET /{id}` auto-marks read; reopening stays read; 404 for non-targeted; unread count correct |
| `backend/tests/api/test_member.py` (extend messages section) | Member sees broadcast + `kind=group,value=members` + `kind=member,value=<id>`; member does NOT see `kind=user` or `group=cable_managers` targeted messages |
| `backend/tests/crud/test_system_message.py` (extend or new) | `list_for_staff_user` filter correctness; `mark_read_for_user` idempotency; `list_recipients_by_group` scope filtering |

### Test fixtures

- Reuse existing `admin_user`, `factory_user`, `member` fixtures.
- Add `cable_manager_user` (role.scope_type='manufacturer') and `equipment_manager_user` (scope_type='equipment_manufacturer') if not present.
- Add `factory_client` (authenticated with `portal_token`); reuse `admin_client` / `member_client`.

### Test command

```bash
docker compose --env-file .env.docker exec backend pytest -v
```

## Spec patches

None. The OpenSpec delta spec at `openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md` is comprehensive. All acceptance scenarios for model, admin mass-send, admin single-send, recipients endpoint, staff inbox, staff read tracking, member inbox, and admin recipient display are present and unambiguous. No write-back required.

## Open items

None. Design confirmed by user on 2026-07-26 across all six sections (architecture, data model, schemas/CRUD, routes/auth, frontend, testing/edge cases).
