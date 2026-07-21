# Inquiry Recipient Name Display — Design Spec

**Date:** 2026-07-21
**Status:** Approved
**Topic:** Show the actual manufacturer/factory name on inquiry replies and listings, replacing the generic "Manufacturer reply" placeholder and raw `recipient_id` displays.

---

## Goal

When a manufacturer (or equipment manufacturer) replies to a member's inquiry, the member-side UI should display the **real factory name** (e.g. "Komax reply") instead of the hardcoded string "Manufacturer reply". The same name should also appear on the member's inquiry list, inbox list, and admin-side inquiry pages, replacing the current raw `{recipient_type}: {recipient_id}` display.

## Background & Problem

The `Inquiry` model stores `recipient_type` (`manufacturer` | `equipment_manufacturer`) and `recipient_id` (a string FK to either `Manufacturer.id` or `EquipmentManufacturer.id`), but the `InquiryRead` schema does **not** expose the recipient's display name. As a result:

- The member inquiry detail page hardcodes `"Manufacturer reply"` as the reply-box header ([frontend/app/(site)/member/inquiries/[id]/page.tsx:36](file:///d:/projects/unowire/frontend/app/(site)/member/inquiries/[id]/page.tsx))
- The same page hardcodes `"Awaiting reply from manufacturer."` at line 44
- The member "My Inquiries" list shows no recipient info at all
- The member "Inbox" list (replies only) shows no sender info at all
- Both admin inquiry pages display `"{recipient_type}: {recipient_id}"` (e.g. `"manufacturer: komax-001"`), which is a raw ID meaningless to humans

## Scope

**In scope:**
- Add a `recipient_name` field to the `InquiryRead` backend schema, resolved at query time via a polymorphic LEFT JOIN
- Update member-side pages (4 locations): detail reply header, detail awaiting-reply hint, My Inquiries list cards, Inbox list cards
- Update admin-side pages (2 locations): inquiry list table cell, inquiry detail page
- Add a shared frontend helper `recipientDisplayName` to handle the deleted-manufacturer fallback
- Add backend tests covering: name resolution for both recipient types, deleted-manufacturer fallback, create/reply response includes name

**Out of scope:**
- Snapshotting the manufacturer name at inquiry/reply time (we use real-time lookup; if the factory renames, old inquiries show the new name)
- Adding a DB-level FK constraint on `Inquiry.recipient_id` (existing dangling-reference behavior preserved; frontend handles `null` name)
- Soft-delete on Manufacturer / EquipmentManufacturer
- Refactoring the "Inbox vs My Inquiries" overlap (separate concern)
- Frontend automated tests (per project convention: MVP frontend has no automated tests)

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Name freshness | **Real-time lookup** (no snapshot) | Simplest; always shows current name; no migration needed |
| Deleted-manufacturer fallback | **`"Unknown manufacturer"`** | Honest, non-crashing, gives the user a clue |
| Admin pages | **Also updated** | Same backend field; trivial frontend change; removes raw-ID display everywhere |
| Backend implementation | **CRUD polymorphic LEFT JOIN** (Approach A) | Single SQL query; best performance; SQLAlchemy 2.0 `case()` + `outerjoin()` is expressive enough |
| `recipient_name` persistence | **Not persisted** (transient field computed at query time) | No migration; name always current; no schema drift |
| POST create/reply response | **Re-query after write** | Reuses the JOIN path; single source of truth for name resolution |
| Helper location | **`frontend/lib/utils.ts`** | Matches existing pattern (`formatCoreStructure`, `formatShielding`, etc.) |

## Data Contract

### Backend Schema Change

`backend/app/schemas/inquiry.py` — `InquiryRead` gains one field:

```python
class InquiryRead(BaseModel):
    id: int
    sender_id: int
    recipient_type: str
    recipient_id: str
    recipient_name: str | None = None  # NEW — resolved at query time, None if manufacturer deleted
    subject: str
    body: str
    reply_body: str | None = None
    replied_at: datetime | None = None
    replied_by: int | None = None
    is_read: bool
    is_member_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
```

`InquiryListItem` exists in `schemas/inquiry.py` but is **dead code** (defined but never imported or referenced anywhere in the codebase). Do **not** modify it — leave it as-is to avoid scope creep; a future cleanup pass can remove it.

**No changes** to:
- `Inquiry` model (`backend/app/models/inquiry.py`)
- `Manufacturer` / `EquipmentManufacturer` models
- Database schema (no migration)
- `InquiryCreate` / `InquiryReply` schemas

## Backend Implementation

### CRUD Layer — `backend/app/crud/inquiry.py`

**Approach:** Polymorphic LEFT JOIN using SQLAlchemy 2.0 `case()` + two `outerjoin()` calls.

**Core query expression:**

```python
from sqlalchemy import case, select
from sqlalchemy.orm import aliased
from app.models.inquiry import Inquiry
from app.models.manufacturer import Manufacturer
from app.models.equipment import EquipmentManufacturer

MfrAlias = aliased(Manufacturer)
EquipMfrAlias = aliased(EquipmentManufacturer)

recipient_name_expr = case(
    (Inquiry.recipient_type == "manufacturer", MfrAlias.name),
    (Inquiry.recipient_type == "equipment_manufacturer", EquipMfrAlias.name),
    else_=None,
)
```

**Methods to update:**

1. **`list_by_member(member_id)`** — Add both outerjoins + `add_columns(recipient_name_expr)`. Return list of `(Inquiry, recipient_name)` tuples; Python layer assembles `inquiry.recipient_name = recipient_name` before returning.

2. **`get(id)`** (inherited from `CRUDBase`) — Override in `CRUDInquiry` to add the same JOIN. Note: ownership checks are **not** in the CRUD layer — the member route does `inquiry.sender_id != member.id` itself, the admin route does scope checks itself. The CRUD `get` only needs to return the row + name; route-layer ownership enforcement stays unchanged.

3. **`list_for_staff(scope_type, scope_id)`** — Same JOIN pattern. This is the admin list method (named `list_for_staff`, not `list_for_admin`).

**`reply()` method:** No change. It only mutates `reply_body`/`replied_at`/`replied_by`/`is_member_read` and does not touch recipient fields.

**Return shape:** The CRUD methods should return objects where Pydantic's `from_attributes=True` can read `recipient_name`. Two acceptable patterns:
- **Pattern A (preferred):** Return tuples `(Inquiry, str | None)` and have the route handler assemble `inquiry.recipient_name = name` before `InquiryRead.model_validate(inquiry)`.
- **Pattern B:** Use SQLAlchemy's `with_entities` or attach the name as a dynamic attribute on the Inquiry instance.

Pattern A is more explicit and avoids monkey-patching model instances.

### Route Layer

**`backend/app/api/routes/member.py`:**

| Endpoint | Change |
|---|---|
| `GET /api/member/inquiries` | Calls updated `list_by_member`; returns `list[InquiryRead]` with `recipient_name` populated |
| `GET /api/member/inquiries/{id}` | Calls updated `get`; route-layer ownership check (`inquiry.sender_id != member.id`) unchanged; returns `InquiryRead` with `recipient_name` |
| `GET /api/member/inquiries/unread-count` | No change (returns only a count) |
| `POST /api/member/inquiries` | After `crud_inquiry.create_for_member(...)`, **re-query** via `get(db, inquiry.id)` and return the fresh `InquiryRead` (with name) |

**`backend/app/api/routes/admin_inquiries.py`:**

| Endpoint | Change |
|---|---|
| `GET ""` (list) | Calls updated admin list; returns `list[InquiryRead]` with `recipient_name` |
| `GET /{id}` | Calls updated `get`; returns `InquiryRead` with `recipient_name` |
| `POST /{id}/reply` | After `crud_inquiry.reply(...)`, **re-query** via `get(inquiry_id)` and return fresh `InquiryRead` |
| `GET /unread-count` | No change |

**Fallback semantics:** If the manufacturer has been deleted, both LEFT JOINs miss and `recipient_name` resolves to `None`. The frontend helper handles the display fallback.

## Frontend Implementation

### Types — `frontend/lib/types.ts`

`InquiryRead` interface gains one field:

```typescript
interface InquiryRead {
  id: number;
  sender_id: number;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;  // NEW
  subject: string;
  body: string;
  reply_body: string | null;
  replied_at: string | null;
  replied_by: number | null;
  is_read: boolean;
  is_member_read: boolean;
  created_at: string;
}
```

No changes to `adminApi.ts` or `api.ts` — they transparently pass through JSON.

### Shared Helper — `frontend/lib/utils.ts`

Add at the end of the file, alongside existing `formatXxx` helpers:

```typescript
/**
 * Display name for an inquiry recipient. Falls back to a generic label
 * when the manufacturer has been deleted (recipient_name is null).
 */
export function recipientDisplayName(name: string | null): string {
  return name ?? 'Unknown manufacturer';
}
```

All 6 frontend display sites import this single helper.

### Member-side Display Changes

**1. Detail page reply header** — `frontend/app/(site)/member/inquiries/[id]/page.tsx:36`

```tsx
// Before
<p className="text-xs text-blue-600 mb-2">Manufacturer reply</p>

// After
<p className="text-xs text-blue-600 mb-2">
  {recipientDisplayName(inquiry.recipient_name)} reply
</p>
```

**2. Detail page awaiting-reply hint** — same file, line 44

```tsx
// Before
<p className="text-sm text-gray-500">Awaiting reply from manufacturer.</p>

// After
<p className="text-sm text-gray-500">
  Awaiting reply from {recipientDisplayName(inquiry.recipient_name)}.
</p>
```

**3. My Inquiries list cards** — `frontend/app/(site)/member/inquiries/page.tsx`

Add a recipient line above or below the subject on each card:

```tsx
<p className="text-xs text-gray-500 mb-1">
  To: {recipientDisplayName(i.recipient_name)}
</p>
```

Exact placement (above vs. below subject) follows the existing card visual rhythm; spec leaves this to the implementer.

**4. Inbox list cards** — `frontend/app/(site)/member/inbox/page.tsx`

Add at the top of each card:

```tsx
<p className="text-xs text-gray-500 mb-1">
  From {recipientDisplayName(i.recipient_name)}
</p>
```

### Admin-side Display Changes

**5. Admin inquiry list table** — `frontend/app/admin/(dashboard)/inquiries/page.tsx:40`

```tsx
// Before
<td>{i.recipient_type}: {i.recipient_id}</td>

// After
<td>{recipientDisplayName(i.recipient_name)}</td>
```

**6. Admin inquiry detail page** — `frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx:37`

```tsx
// Before
<p>{inquiry.recipient_type}: {inquiry.recipient_id}</p>

// After
<p>{recipientDisplayName(inquiry.recipient_name)}</p>
```

### Visual Consistency

- All 6 sites use the same `recipientDisplayName` helper
- Fallback text is uniformly `"Unknown manufacturer"`
- No new CSS classes — reuse existing `text-xs text-gray-500` / `text-xs text-blue-600` styles already present at each site
- No layout shifts; the new lines are additive

## Testing

### Backend Tests — `backend/tests/api/test_member_inquiries.py` and `backend/tests/api/test_admin_inquiries.py`

Add the following tests (mirror existing test patterns in these files):

1. **`test_list_inquiries_includes_recipient_name`** — Member lists their inquiries; every returned item has `recipient_name` equal to the corresponding `Manufacturer.name`.

2. **`test_get_inquiry_includes_recipient_name`** — Member fetches a single inquiry; `recipient_name` is populated.

3. **`test_inquiry_to_equipment_manufacturer_resolves_name`** — Inquiry with `recipient_type='equipment_manufacturer'` resolves via the `EquipmentManufacturer` JOIN branch. Covers both polymorphic branches.

4. **`test_inquiry_to_deleted_manufacturer_returns_none_name`** — Create inquiry → delete the manufacturer row directly via DB session → re-query the inquiry → `recipient_name` is `None` (and the request does not 500).

5. **`test_create_inquiry_response_includes_recipient_name`** — `POST /api/member/inquiries` returns an `InquiryRead` whose `recipient_name` is populated (verifies the re-query path).

6. **`test_admin_list_includes_recipient_name`** — Admin list endpoint returns inquiries with `recipient_name` populated.

### Regression Checks

- All existing inquiry tests still pass (schema field addition is backward-compatible)
- `GET /api/member/inquiries/unread-count` unaffected
- Admin reply flow unaffected (only the response shape gains a field)

### Manual Verification

Per project convention, no frontend automated tests. Manual checklist:

- [ ] Member creates an inquiry to a cable manufacturer → "My Inquiries" card shows "To: {factory name}"; detail page shows "Awaiting reply from {factory name}."
- [ ] Admin replies → member refreshes detail page; reply-box header shows "{factory name} reply"
- [ ] Member creates an inquiry to an equipment manufacturer → correct factory name shown (covers `equipment_manufacturer` branch)
- [ ] Admin inquiry list / detail pages show factory name (no more raw IDs)
- [ ] Delete a manufacturer directly in DB → that manufacturer's old inquiries show "Unknown manufacturer" (no crash)
- [ ] Inbox list cards show "From {factory name}" at the top of each card

## File Structure Summary

### Backend (6 files modified, 0 created)

| File | Change |
|---|---|
| `backend/app/schemas/inquiry.py` | Add `recipient_name: str \| None = None` to `InquiryRead` only (do **not** modify the unused `InquiryListItem`) |
| `backend/app/crud/inquiry.py` | Add polymorphic LEFT JOIN + `case()` to `list_by_member`, `get` (override from CRUDBase), `list_for_staff`; add imports for `case`, `Manufacturer`, `EquipmentManufacturer`, `aliased` |
| `backend/app/api/routes/member.py` | `POST /api/member/inquiries` re-queries after create; GET endpoints pass through (no code change beyond what CRUD returns) |
| `backend/app/api/routes/admin_inquiries.py` | `POST /{id}/reply` re-queries after reply; GET endpoints pass through |
| `backend/tests/api/test_member_inquiries.py` + `backend/tests/api/test_admin_inquiries.py` | Add 6 new tests |

### Frontend (7 files modified, 0 created)

| File | Change |
|---|---|
| `frontend/lib/types.ts` | Add `recipient_name: string \| null` to `InquiryRead` |
| `frontend/lib/utils.ts` | Add `recipientDisplayName(name)` helper |
| `frontend/app/(site)/member/inquiries/[id]/page.tsx` | Reply header + awaiting hint use helper |
| `frontend/app/(site)/member/inquiries/page.tsx` | Card shows "To: {name}" |
| `frontend/app/(site)/member/inbox/page.tsx` | Card top shows "From {name}" |
| `frontend/app/admin/(dashboard)/inquiries/page.tsx` | Table cell uses helper |
| `frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx` | Detail uses helper |

### Not Required

- No new Alembic migration
- No new model column on `Inquiry`
- No new API endpoint
- No new component file
- No change to `unread-count` endpoints
- No change to `InquiryCreate` / `InquiryReply` schemas

## Acceptance Criteria

1. `InquiryRead` schema has a `recipient_name: str | None` field populated for all GET list / GET detail / POST create / POST reply responses.
2. Member inquiry detail reply-box header shows `"{factory name} reply"` instead of `"Manufacturer reply"`.
3. Member inquiry detail awaiting-reply hint shows `"Awaiting reply from {factory name}."` instead of `"Awaiting reply from manufacturer."`.
4. Member "My Inquiries" list cards show `"To: {factory name}"`.
5. Member "Inbox" list cards show `"From {factory name}"` at the top.
6. Admin inquiry list table cell shows the factory name instead of `"{recipient_type}: {recipient_id}"`.
7. Admin inquiry detail page shows the factory name instead of `"{recipient_type}: {recipient_id}"`.
8. Inquiries to `equipment_manufacturer` recipients resolve names correctly (both JOIN branches covered).
9. Inquiries to a deleted manufacturer display `"Unknown manufacturer"` without errors (HTTP 200, `recipient_name=null`).
10. `POST /api/member/inquiries` response includes `recipient_name`.
11. `POST /api/admin/inquiries/{id}/reply` response includes `recipient_name`.
12. All existing inquiry tests continue to pass (no regression).
13. 6 new backend tests pass.
14. No new Alembic migration is introduced.
15. No new database column is added to the `inquiries` table.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Manufacturer deleted → dangling `recipient_id` | LEFT JOIN yields `null`; frontend helper shows "Unknown manufacturer" |
| Manufacturer renamed → old inquiries show new name | Accepted (per user decision: real-time lookup) |
| N+1 queries if name lookup is per-row | Avoided by using a single JOIN query |
| Polymorphic JOIN SQL complexity | Isolated in CRUD layer; one `case()` expression reused across 3 methods |
| `InquiryListItem` schema drift | Keep it in sync with `InquiryRead` if it remains in use |
| Test isolation (deleted-manufacturer test) | Use a direct DB session to delete the manufacturer; do not rely on a delete API endpoint |

## Out-of-Scope Notes

- The "Inbox vs My Inquiries" overlap (both call the same endpoint, Inbox is just a client-side filter) is a separate UX concern not addressed here.
- The `GET /api/member/inquiries/unread-count` endpoint exists but is not wired to the sidebar badge (the sidebar only badges `MessagesUnreadBadge` for system broadcasts). Wiring inquiry unread-count to the sidebar is a separate feature.
- The unused `InquiryListItem` schema (dead code in `schemas/inquiry.py`) could be removed in a future cleanup pass; not required for this feature. Do not modify it here.
