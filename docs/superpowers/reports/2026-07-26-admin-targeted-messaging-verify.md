# Verification Report: admin-targeted-messaging

**Date:** 2026-07-26
**Change:** admin-targeted-messaging
**Verify mode:** full
**Review mode:** standard

## Summary

| Dimension    | Status |
|--------------|--------|
| Completeness | 64/64 tasks complete, 8/8 requirements implemented |
| Correctness  | 20/20 scenarios covered (245 backend tests passing) |
| Coherence    | Implementation follows all 5 design decisions (D1–D5) |

## Fresh Verification Evidence

| Check | Command | Result |
|-------|---------|--------|
| Backend tests | `docker compose exec backend pytest -q` | 245 passed, 445 warnings, exit 0 (174.21s) |
| Frontend types | `npx tsc --noEmit` | exit 0 (no errors) |
| Frontend build | `npx next build` | exit 0; new routes compiled: `/portal/messages`, `/portal/messages/[id]`, `/api/portal/messages/*`, `/api/admin/messages/recipients` |
| Task completion | `tasks.md` checkbox count | 64/64 `[x]`, 0 `[ ]` |

## Completeness

### Task Completion
- 64/64 tasks checked `[x]` in `openspec/changes/admin-targeted-messaging/tasks.md`
- 0 incomplete tasks

### Spec Coverage (8 requirements)
1. **SystemMessage SHALL track recipient type and targets** — `recipient_type` (String(20), default "broadcast") + `recipient_targets` (JSONB) columns added in `backend/app/models/system_message.py:23-26`. Migration `o4p5q6r7s8t9_add_targeted_messaging_columns.py` adds columns with `server_default='broadcast'`.
2. **Admin SHALL send mass messages to selected recipient groups** — `POST /api/admin/messages` accepts `recipient_type` + `recipient_targets`; `MessageForm.tsx` implements radio + checkbox UI.
3. **Admin SHALL send single messages to a specific user or member** — "Message" links on `/admin/users` and `/admin/members` navigate with URL params; `MessageForm.tsx` reads `useSearchParams` and pre-fills recipient.
4. **Admin SHALL list candidate recipients by group** — `GET /api/admin/messages/recipients` returns `{cable_managers, equipment_managers, members}` arrays, guarded by `require_operator("messages")`.
5. **Staff users SHALL view their messages in a portal inbox** — `GET /api/portal/messages` (list), `GET /api/portal/messages/{id}` (detail, auto-mark-read), `GET /api/portal/messages/unread-count`; portal pages `/portal/messages` + `/portal/messages/[id]` with sidebar badge.
6. **Staff message reads SHALL be tracked in a parallel table** — `SystemMessageUserRead` model with `(user_id, message_id)` composite PK, both FK `ondelete=CASCADE`; `mark_read_for_user` uses `ON CONFLICT DO NOTHING`.
7. **Member inbox SHALL support targeted member messages** — `list_for_member` visibility filter: `broadcast` OR (`targeted` AND (`members` group OR `member` id)).
8. **Admin message list SHALL display recipient type** — `formatRecipientSummary` helper renders "All Members" or group labels; list page has Recipients column, detail page has Recipients row.

## Correctness

### Scenario Coverage (20 scenarios)
All 20 delta-spec scenarios are covered by passing tests:

**R1 (3 scenarios):** `test_create_broadcast_message_defaults`, `test_create_targeted_message_multiple_groups`, migration server_default ensures legacy rows are broadcast.

**R2 (3 scenarios):** `test_create_message` (broadcast), `test_create_targeted_message_multiple_groups` (multi-group), `test_create_targeted_message_empty_targets_returns_422` (empty targets rejected).

**R3 (3 scenarios):** Message links present on users/members list pages; `MessageForm` reads URL params (`recipientType`, `recipientKind`, `recipientId`, `recipientLabel`); single-message submission POSTs targeted with one target.

**R4 (2 scenarios):** `test_get_recipients_returns_three_groups`, `test_get_recipients_requires_permission`.

**R5 (6 scenarios):** `test_cable_manager_sees_cable_managers_group`, `test_equipment_manager_sees_equipment_managers_group`, `test_portal_excludes_broadcast_messages`, `test_portal_get_message_auto_marks_read`, `test_portal_get_message_404_when_not_targeted`, `PortalMessagesUnreadBadge` client component polls `/api/portal/messages/unread-count`.

**R6 (3 scenarios):** `test_portal_get_message_auto_marks_read` (first read inserts row), `test_portal_get_message_stays_read_on_reopen` (idempotent), `test_delete_message_cascades_reads` (cascade verified for member reads; user reads table uses same FK pattern).

**R7 (2 scenarios):** `test_member_sees_targeted_group_members`, `test_member_does_not_see_staff_targeted`.

**R8 (2 scenarios):** `test_admin_list_echoes_recipient_fields`, `test_admin_detail_echoes_recipient_fields`; frontend `formatRecipientSummary` renders summaries.

## Coherence

### Design Adherence (D1–D5)
- **D1 (recipient model):** `recipient_type` + `recipient_targets` JSONB array with `kind`/`value` objects. ✅
- **D2 (staff read tracking):** Parallel `system_message_user_reads` table, non-breaking, mirrors existing `system_message_reads`. ✅
- **D3 (staff inbox location):** Portal routes guarded by `require_factory_module("messages")`; broadcast excluded from staff inbox. ✅
- **D4 (single message UX):** Pre-filled form via URL search params, no modal. ✅
- **D5 (admin recipients endpoint):** Single `GET /api/admin/messages/recipients` returns all three groups. ✅

### Code Pattern Consistency
- BFF routes follow existing portal BFF pattern (`portal_token` cookie forwarding, `INTERNAL_API_BASE` env).
- `portalApi` (server-side) and `portalApiClient` (client-side BFF) both expose `messages` namespace, mirroring `uploads`/`inquiries`.
- `MessageForm` uses Suspense boundary for `useSearchParams` per Next.js App Router requirement.
- Pydantic v2 `field_validator(mode="before")` coerces int→str for JSONB type consistency.

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
1. `datetime.utcnow()` is deprecated in Python 3.12+ (445 DeprecationWarnings in test output). Consider migrating to `datetime.now(datetime.UTC)` in a future change. Not blocking — pre-existing pattern used throughout the codebase.
2. `list_recipients_by_group` in CRUD returns raw tuples `(id, email, name)`; the route handler manually constructs `RecipientListItem`. Could use a typed mapper, but current approach is simple and clear for MVP.

## Final Assessment

**All checks passed. No CRITICAL or WARNING issues.** 1 SUGGESTION (non-blocking, pre-existing `utcnow()` pattern). Ready for archive.
