# Brainstorm Summary

- Change: admin-targeted-messaging
- Date: 2026-07-26

## Confirmed Technical Approach

**Storage (Approach A — JSONB containment):**
- Add `recipient_type: String(20)` (default `'broadcast'`) and `recipient_targets: JSONB` (nullable) columns to `system_messages`.
- Add parallel `SystemMessageUserRead` table (`user_id`, `message_id`, `read_at`) mirroring existing `SystemMessageRead` for member reads.
- Use PostgreSQL JSONB `@>` operator for staff/member inbox containment queries.

**Schemas:**
- `RecipientTarget` schema with `kind` (`group` | `user` | `member`) and `value` (always stringified for JSON type consistency).
- Extended `MessageCreate` with Pydantic cross-field validator enforcing non-empty targets when `targeted`, null targets when `broadcast`, and valid group values.
- Extended `AdminMessageRead` to echo recipient fields. New `RecipientListResponse`, `PortalMessageRead`, `PortalMessageListResponse`.

**CRUD:**
- Extended `create_message` to persist recipient fields.
- New `list_recipients_by_group` (3 parallel queries via `asyncio.gather`).
- New `list_for_staff_user`, `unread_count_for_staff_user`, `get_for_staff_user`, `mark_read_for_user` (idempotent upsert via `ON CONFLICT DO NOTHING`).
- Extended `list_for_member` to include targeted messages matching `kind=group,value=members` OR `kind=member,value=<id>`.

**Routes:**
- Extended `POST /api/admin/messages` and new `GET /api/admin/messages/recipients` (registered BEFORE `/{message_id}`).
- New `portal_messages.py` with `GET /api/portal/messages`, `GET /api/portal/messages/unread-count`, `GET /api/portal/messages/{id}` (route order: `unread-count` before `{id}`).
- Add `"messages"` to `_FACTORY_ALLOWED_BY_SCOPE` for both `manufacturer` and `equipment_manufacturer` scopes.
- Member route `GET /api/member/messages` query only changes — no schema/route signature change.

**Frontend:**
- `MessageForm` modes: `broadcast` / `targeted` / `single` (URL pre-fill via `recipientType`, `recipientKind`, `recipientId`, `recipientLabel`).
- Mass mode shows 3 group checkboxes only (no individual picker in form — confirmed by user).
- `Message` link on each row of admin users and admin members list pages.
- Admin message list/detail shows recipient summary (helper `formatRecipientSummary` in `frontend/lib/utils/messages.ts`).
- New portal pages `/portal/messages` and `/portal/messages/[id]`; portal sidebar gets "Messages" link with `PortalMessagesUnreadBadge` client component.
- New BFF routes for `/api/portal/messages/*` and `/api/admin/messages/recipients` (cookie forwarding pattern).
- Extended `adminApi.messages` (add `recipients()`), new `portalApi.messages` and `portalApiClient.messages` namespaces.

## Key Trade-offs and Risks

- **JSONB type sensitivity**: PostgreSQL `@>` is type-strict (`'[{"value":42}]'` ≠ `'[{"value":"42"}]'`). Mitigated by stringify-on-write rule — all `value` fields stored as string; lookups coerce ids to `str`. Documented in code.
- **No GIN index at MVP**: Sequential scan with `@>` filter is fine under 10K rows. Migration path documented (`CREATE INDEX ... USING GIN (recipient_targets jsonb_path_ops)`).
- **Stale `recipient_targets` references**: After user/member deletion, the JSON keeps stale `kind=user/member,value=<id>`. Harmless — query filter simply matches no rows. Documented behavior.
- **FastAPI route ordering**: `/recipients` and `/unread-count` MUST be registered before `/{message_id}` to avoid path-param collision. Mitigated by route registration order + code comments.

## Testing Strategy

Backend-only pytest (per project memory: frontend MVP skips automated tests):
- Extend `backend/tests/api/test_admin_messages.py` — POST variations (broadcast default, targeted groups, empty targets 422, invalid group 422, broadcast+non-null targets 422), `/recipients` returns 3 groups, `/recipients` requires permission (403), admin list/detail echo recipient fields.
- New `backend/tests/api/test_portal_messages.py` — cable/equipment manager inbox filtering, broadcast excluded, `kind=user` filter, auto-mark-read, 404 for non-targeted, unread count.
- Extend `backend/tests/api/test_member.py` — member sees broadcast + group=members + member=<id>; does NOT see kind=user or group=cable_managers.
- Extend `backend/tests/crud/test_system_message.py` — `list_for_staff_user` filter correctness, `mark_read_for_user` idempotency, `list_recipients_by_group` scope filtering.

Existing test command: `docker compose --env-file .env.docker exec backend pytest -v`.

## Spec Patches

None — OpenSpec delta spec at `openspec/changes/admin-targeted-messaging/specs/admin-targeted-messaging/spec.md` is comprehensive. All acceptance scenarios for model, admin mass-send, admin single-send, recipients endpoint, staff inbox, staff read tracking, member inbox, admin recipient display are present and unambiguous. No write-back required.
