# Inquiry Recipient Name Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "Manufacturer reply" placeholder and raw `recipient_id` displays with the actual factory name, resolved at query time via a polymorphic LEFT JOIN.

**Architecture:** Add a `recipient_name: str | None` field to the `InquiryRead` Pydantic schema. In the CRUD layer, add `get_with_recipient_name` and rewrite `list_by_member` / `list_for_staff` to LEFT JOIN `manufacturers` and `equipment_manufacturers` based on `recipient_type` and select the name via a `case()` expression. POST create/reply endpoints re-query after write so the response carries the name. Frontend gains a shared `recipientDisplayName` helper that falls back to `"Unknown manufacturer"` when the name is null (manufacturer deleted). Six display sites across member + admin pages consume the helper.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, Next.js 15 App Router (server components), TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-07-21-inquiry-recipient-name-design.md`

**Branch:** `feat/media-picker-modal` (continue on current branch)

**Production Docker constraint:** Backend and frontend production containers do NOT bind-mount source. After modifying source, rebuild the image: `docker compose --env-file .env.docker build <service>` then `docker compose --env-file .env.docker up -d <service>`.

**PowerShell curl quirk:** Use `curl.exe` (not `curl`) for HTTP smoke tests — PowerShell aliases `curl` to `Invoke-WebRequest` which doesn't accept `-sI`/`-w`.

---

## File Structure

### Backend (4 files modified)

| File | Responsibility |
|---|---|
| `backend/app/schemas/inquiry.py` | Add `recipient_name` field to `InquiryRead` |
| `backend/app/crud/inquiry.py` | Add `get_with_recipient_name`; rewrite `list_by_member` + `list_for_staff` with polymorphic LEFT JOIN + `case()` |
| `backend/app/api/routes/member.py` | `POST /api/member/inquiries` re-queries after create; GET endpoints assemble names |
| `backend/app/api/routes/admin_inquiries.py` | `POST /{id}/reply` re-queries after reply; GET endpoints assemble names |

### Backend tests (2 files modified)

| File | Tests added |
|---|---|
| `backend/tests/api/test_member_inquiries.py` | 5 new tests |
| `backend/tests/api/test_admin_inquiries.py` | 1 new test |

### Frontend (7 files modified)

| File | Responsibility |
|---|---|
| `frontend/lib/types.ts` | Add `recipient_name` field to `InquiryRead` interface |
| `frontend/lib/utils.ts` | Add `recipientDisplayName` helper |
| `frontend/app/(site)/member/inquiries/[id]/page.tsx` | Reply header + awaiting hint use helper |
| `frontend/app/(site)/member/inquiries/page.tsx` | Card shows "To: {name}" |
| `frontend/app/(site)/member/inbox/page.tsx` | Card top shows "From {name}" |
| `frontend/app/admin/(dashboard)/inquiries/page.tsx` | Table cell uses helper |
| `frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx` | Detail uses helper |

### Not created

- No Alembic migration
- No new model column
- No new component file
- No new API endpoint

---

## Task 1: Backend Schema — Add `recipient_name` to `InquiryRead`

**Files:**
- Modify: `backend/app/schemas/inquiry.py:13-27`

- [ ] **Step 1: Add the field to `InquiryRead`**

Edit `backend/app/schemas/inquiry.py`. In the `InquiryRead` class, insert `recipient_name: str | None = None` between `recipient_id` and `subject`:

```python
class InquiryRead(BaseModel):
    id: int
    sender_id: int
    recipient_type: str
    recipient_id: str
    recipient_name: str | None = None  # resolved at query time via polymorphic JOIN
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

Do **not** modify `InquiryListItem` (dead code; out of scope).

- [ ] **Step 2: Verify existing tests still pass (backward-compatible field addition)**

Rebuild backend image (production container has no bind-mount):

```bash
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker up -d backend
```

Wait ~8s, then run the inquiry test suites:

```bash
docker compose --env-file .env.docker exec backend pytest tests/api/test_member_inquiries.py tests/api/test_admin_inquiries.py -v --tb=short
```

Expected: all existing tests PASS (the new field defaults to `None`, so existing assertions don't break).

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/inquiry.py
git commit -m "feat(inquiries): add recipient_name field to InquiryRead schema"
```

---

## Task 2: Backend CRUD — Polymorphic LEFT JOIN for `recipient_name`

**Files:**
- Modify: `backend/app/crud/inquiry.py` (entire file)

**Context for the implementer:**

- `Inquiry.recipient_type` is `"manufacturer"` or `"equipment_manufacturer"`.
- `Inquiry.recipient_id` is a string FK (no DB-level constraint) to either `Manufacturer.id` or `EquipmentManufacturer.id`.
- Both `Manufacturer.name` and `EquipmentManufacturer.name` are `String(200), nullable=False`.
- `CRUDBase.get` (inherited) uses `db.get(self.model, id)` — a primary-key lookup that cannot be extended with a JOIN. We add a new method `get_with_recipient_name` instead of overriding `get`.
- Route-layer ownership checks stay in the routes (member route checks `inquiry.sender_id != member.id`; admin route does scope checks). The CRUD methods only need to return `(Inquiry, recipient_name)`; routes will assemble the name onto the inquiry before returning.
- **Pattern A (preferred):** CRUD returns tuples `(Inquiry, str | None)`; route handler sets `inquiry.recipient_name = name` before `InquiryRead.model_validate(inquiry)` (Pydantic's `from_attributes=True` reads it).

- [ ] **Step 1: Rewrite `backend/app/crud/inquiry.py`**

Replace the entire file with:

```python
from datetime import datetime

from sqlalchemy import case, select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.crud.base import CRUDBase
from app.models.equipment import EquipmentManufacturer
from app.models.inquiry import Inquiry
from app.models.manufacturer import Manufacturer
from app.schemas.inquiry import InquiryCreate, InquiryReply


# Polymorphic recipient-name resolution: LEFT JOIN both manufacturer tables
# and select the name via a CASE expression based on recipient_type.
# If the manufacturer has been deleted, both joins miss and name is None.
_MfrAlias = aliased(Manufacturer)
_EquipMfrAlias = aliased(EquipmentManufacturer)

_RECIPIENT_NAME_EXPR = case(
    (Inquiry.recipient_type == "manufacturer", _MfrAlias.name),
    (Inquiry.recipient_type == "equipment_manufacturer", _EquipMfrAlias.name),
    else_=None,
)


def _with_recipient_joins(stmt):
    """Apply both polymorphic LEFT JOINs to a select statement on Inquiry."""
    return (
        stmt
        .outerjoin(
            _MfrAlias,
            and_(
                Inquiry.recipient_type == "manufacturer",
                Inquiry.recipient_id == _MfrAlias.id,
            ),
        )
        .outerjoin(
            _EquipMfrAlias,
            and_(
                Inquiry.recipient_type == "equipment_manufacturer",
                Inquiry.recipient_id == _EquipMfrAlias.id,
            ),
        )
    )


class CRUDInquiry(CRUDBase[Inquiry, InquiryCreate, InquiryReply]):
    async def create_for_member(
        self, db: AsyncSession, *, obj_in: InquiryCreate, sender_id: int
    ) -> Inquiry:
        data = obj_in.model_dump()
        db_obj = Inquiry(sender_id=sender_id, **data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_with_recipient_name(
        self, db: AsyncSession, inquiry_id: int
    ) -> tuple[Inquiry, str | None] | None:
        """Fetch a single inquiry with its resolved recipient name.

        Returns (inquiry, recipient_name) or None if not found. If the
        manufacturer has been deleted, recipient_name is None.
        """
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR).where(Inquiry.id == inquiry_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return row[0], row[1]

    async def list_by_member(
        self, db: AsyncSession, member_id: int
    ) -> list[tuple[Inquiry, str | None]]:
        """List inquiries sent by a member, each with its resolved recipient name."""
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR)
            .where(Inquiry.sender_id == member_id)
            .order_by(Inquiry.created_at.desc())
        )
        result = await db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def list_for_staff(
        self,
        db: AsyncSession,
        *,
        scope_type: str | None,
        scope_id: str | None,
    ) -> list[tuple[Inquiry, str | None]]:
        """List inquiries filtered by staff scope, each with its resolved recipient name."""
        stmt = _with_recipient_joins(
            select(Inquiry, _RECIPIENT_NAME_EXPR).order_by(Inquiry.created_at.desc())
        )
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "equipment_manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        # else: admin/global — no scope filter
        result = await db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def unread_count_for_staff(
        self, db: AsyncSession, scope_type: str | None, scope_id: str | None
    ) -> int:
        stmt = select(func.count()).select_from(Inquiry).where(Inquiry.is_read == False)
        if scope_type == "manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        elif scope_type == "equipment_manufacturer":
            stmt = stmt.where(
                and_(
                    Inquiry.recipient_type == "equipment_manufacturer",
                    Inquiry.recipient_id == scope_id,
                )
            )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def unread_count_for_member(
        self, db: AsyncSession, member_id: int
    ) -> int:
        """Count inquiries with replies that the member hasn't read."""
        result = await db.execute(
            select(func.count())
            .select_from(Inquiry)
            .where(
                and_(
                    Inquiry.sender_id == member_id,
                    Inquiry.reply_body.isnot(None),
                    Inquiry.is_member_read == False,
                )
            )
        )
        return result.scalar() or 0

    async def mark_read_for_staff(self, db: AsyncSession, inquiry: Inquiry) -> Inquiry:
        inquiry.is_read = True
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry

    async def mark_read_for_member(self, db: AsyncSession, inquiry: Inquiry) -> Inquiry:
        inquiry.is_member_read = True
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry

    async def reply(
        self,
        db: AsyncSession,
        inquiry: Inquiry,
        *,
        reply_body: str,
        replied_by: int,
    ) -> Inquiry:
        inquiry.reply_body = reply_body
        inquiry.replied_at = datetime.utcnow()
        inquiry.replied_by = replied_by
        inquiry.is_member_read = False
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
        return inquiry


crud_inquiry = CRUDInquiry(Inquiry)
```

**Key changes from the original:**
- Added imports: `case`, `aliased`, `Manufacturer`, `EquipmentManufacturer`
- Added module-level aliases `_MfrAlias`, `_EquipMfrAlias`, `_RECIPIENT_NAME_EXPR`, and helper `_with_recipient_joins`
- New method `get_with_recipient_name(db, inquiry_id)` — used by routes that need the name
- `list_by_member` and `list_for_staff` now return `list[tuple[Inquiry, str | None]]` instead of `list[Inquiry]`

- [ ] **Step 2: Rebuild backend (do NOT run tests yet — routes haven't been updated; list endpoints will fail to serialize tuples, which is expected)**

```bash
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker up -d backend
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/inquiry.py
git commit -m "feat(inquiries): polymorphic LEFT JOIN for recipient_name in CRUD

Add get_with_recipient_name; rewrite list_by_member and list_for_staff
to LEFT JOIN manufacturers + equipment_manufacturers and select the name
via a CASE expression based on recipient_type. Returns tuples
(Inquiry, recipient_name|None); routes will assemble the name onto the
inquiry before serialization."
```

---

## Task 3: Backend Member Routes — Assemble `recipient_name` + Re-query on Create

**Files:**
- Modify: `backend/app/api/routes/member.py` (the 4 inquiry endpoints, lines ~114-198)

**Context for the implementer:**

- The CRUD methods now return tuples `(Inquiry, str | None)` for list/get-with-name operations. The route must set `inquiry.recipient_name = name` on the Inquiry instance before returning it, so Pydantic's `from_attributes=True` reads the new field.
- `POST /api/member/inquiries` currently returns the freshly-created Inquiry (no name). After this task, it re-queries via `get_with_recipient_name` so the response carries the name.
- `GET /api/member/inquiries/{id}` currently calls `crud_inquiry.get(db, inquiry_id)` (plain PK lookup). Switch to `crud_inquiry.get_with_recipient_name(db, inquiry_id)`.
- `GET /api/member/inquiries` (list) currently returns `list[Inquiry]` directly. Now must assemble names.
- `GET /api/member/inquiries/unread-count` — no change.

- [ ] **Step 1: Add an assembler helper at the top of `member.py` (just before the first inquiry endpoint, after `# --- Inquiry endpoints (member-side) ---`)**

```python
def _attach_recipient_name(inquiry: Inquiry, name: str | None) -> Inquiry:
    """Attach the resolved recipient name to an Inquiry instance so
    Pydantic's from_attributes=True can read it during serialization."""
    inquiry.recipient_name = name
    return inquiry
```

- [ ] **Step 2: Update `POST /api/member/inquiries` to re-query after create**

Before (lines ~114-135):
```python
@router.post("/inquiries", response_model=InquiryRead, status_code=201)
async def create_inquiry(
    body: InquiryCreate,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    # Validate recipient exists
    if body.recipient_type == "manufacturer":
        result = await db.execute(select(Manufacturer.id).where(Manufacturer.id == body.recipient_id))
    else:
        result = await db.execute(
            select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == body.recipient_id)
        )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Recipient not found"})

    inquiry = await crud_inquiry.create_for_member(db, obj_in=body, sender_id=member.id)

    # Notify staff (best-effort)
    await _notify_staff_of_inquiry(db, inquiry, member)

    return inquiry
```

After:
```python
@router.post("/inquiries", response_model=InquiryRead, status_code=201)
async def create_inquiry(
    body: InquiryCreate,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    # Validate recipient exists
    if body.recipient_type == "manufacturer":
        result = await db.execute(select(Manufacturer.id).where(Manufacturer.id == body.recipient_id))
    else:
        result = await db.execute(
            select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == body.recipient_id)
        )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=422, detail={"code": 422, "message": "Recipient not found"})

    inquiry = await crud_inquiry.create_for_member(db, obj_in=body, sender_id=member.id)

    # Notify staff (best-effort)
    await _notify_staff_of_inquiry(db, inquiry, member)

    # Re-query to attach the resolved recipient name
    row = await crud_inquiry.get_with_recipient_name(db, inquiry.id)
    if row is None:
        # Should not happen — we just created it
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Inquiry disappeared after create"})
    inquiry, name = row
    return _attach_recipient_name(inquiry, name)
```

- [ ] **Step 3: Update `GET /api/member/inquiries` (list) to assemble names**

Before (lines ~169-174):
```python
@router.get("/inquiries", response_model=list[InquiryRead])
async def list_my_inquiries(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    return await crud_inquiry.list_by_member(db, member.id)
```

After:
```python
@router.get("/inquiries", response_model=list[InquiryRead])
async def list_my_inquiries(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    rows = await crud_inquiry.list_by_member(db, member.id)
    return [_attach_recipient_name(inq, name) for inq, name in rows]
```

- [ ] **Step 4: Update `GET /api/member/inquiries/{inquiry_id}` (detail)**

Before (lines ~186-198):
```python
@router.get("/inquiries/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    inquiry = await crud_inquiry.get(db, inquiry_id)
    if inquiry is None or inquiry.sender_id != member.id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    # Mark as read by member (if there's a reply)
    if inquiry.reply_body is not None and not inquiry.is_member_read:
        await crud_inquiry.mark_read_for_member(db, inquiry)
    return inquiry
```

After:
```python
@router.get("/inquiries/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    row = await crud_inquiry.get_with_recipient_name(db, inquiry_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    inquiry, name = row
    if inquiry.sender_id != member.id:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    # Mark as read by member (if there's a reply)
    if inquiry.reply_body is not None and not inquiry.is_member_read:
        await crud_inquiry.mark_read_for_member(db, inquiry)
    return _attach_recipient_name(inquiry, name)
```

**Important:** Fetch first, then ownership check. The 404 is raised in both the not-found and not-owner cases (don't leak existence).

- [ ] **Step 5: Rebuild backend and run the member inquiry tests**

```bash
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker up -d backend
```

Wait ~8s, then:

```bash
docker compose --env-file .env.docker exec backend pytest tests/api/test_member_inquiries.py -v --tb=short
```

Expected: all existing tests PASS. The new `recipient_name` field defaults to `None` in old assertions, and the list/get endpoints now return properly assembled objects.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/member.py
git commit -m "feat(inquiries): member routes attach recipient_name + re-query on create"
```

---

## Task 4: Backend Admin Routes — Assemble `recipient_name` + Re-query on Reply

**Files:**
- Modify: `backend/app/api/routes/admin_inquiries.py` (list, get, reply endpoints)

**Context for the implementer:**

- The admin route file already imports `crud_inquiry` and `InquiryRead`.
- `GET ""` (list) currently returns `list[Inquiry]`. Now must assemble names.
- `GET /{id}` currently calls `crud_inquiry.get(db, inquiry_id)`. Switch to `crud_inquiry.get_with_recipient_name`.
- `POST /{id}/reply` currently returns the inquiry directly after `crud_inquiry.reply(...)`. Re-query via `get_with_recipient_name` so the response carries the name.
- `GET /unread-count` — no change.

- [ ] **Step 1: Add the assembler helper at the top of `admin_inquiries.py`**

After the existing imports (after `from sqlalchemy import select`), add:

```python
def _attach_recipient_name(inquiry: Inquiry, name: str | None) -> Inquiry:
    """Attach the resolved recipient name to an Inquiry instance so
    Pydantic's from_attributes=True can read it during serialization."""
    inquiry.recipient_name = name
    return inquiry
```

- [ ] **Step 2: Update `GET ""` (list)**

Before (lines ~29-38):
```python
@router.get("", response_model=list[InquiryRead])
async def list_inquiries(
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type if user.role else None
    scope_id = user.scope_id
    return await crud_inquiry.list_for_staff(
        db, scope_type=scope_type, scope_id=scope_id
    )
```

After:
```python
@router.get("", response_model=list[InquiryRead])
async def list_inquiries(
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    scope_type = user.role.scope_type if user.role else None
    scope_id = user.scope_id
    rows = await crud_inquiry.list_for_staff(
        db, scope_type=scope_type, scope_id=scope_id
    )
    return [_attach_recipient_name(inq, name) for inq, name in rows]
```

- [ ] **Step 3: Update `GET /{inquiry_id}` (detail)**

Before (lines ~52-65):
```python
@router.get("/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    inquiry = await crud_inquiry.get(db, inquiry_id)
    if inquiry is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    _check_scope_access(user, inquiry)
    # Mark as read by staff
    if not inquiry.is_read:
        await crud_inquiry.mark_read_for_staff(db, inquiry)
    return inquiry
```

After:
```python
@router.get("/{inquiry_id}", response_model=InquiryRead)
async def get_inquiry(
    inquiry_id: int,
    user: User = Depends(require_module("inquiries")),
    db: AsyncSession = Depends(get_db),
):
    row = await crud_inquiry.get_with_recipient_name(db, inquiry_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Inquiry not found"})
    inquiry, name = row
    _check_scope_access(user, inquiry)
    # Mark as read by staff
    if not inquiry.is_read:
        await crud_inquiry.mark_read_for_staff(db, inquiry)
    return _attach_recipient_name(inquiry, name)
```

- [ ] **Step 4: Update `POST /{inquiry_id}/reply` (return path)**

Before (lines ~83-102, just the return path after the reply + email notification):
```python
    inquiry = await crud_inquiry.reply(
        db, inquiry, reply_body=body.reply_body, replied_by=user.id
    )

    # Notify member (best-effort)
    member = await db.get(Member, inquiry.sender_id)
    if member is not None:
        inquiry_url = f"{settings.public_base_url}/member/inquiries/{inquiry.id}"
        send_email_background(
            member.email,
            "inquiry_replied",
            {
                "member_name": member.name,
                "subject": inquiry.subject,
                "reply_body": inquiry.reply_body,
                "inquiry_url": inquiry_url,
            },
        )

    return inquiry
```

After:
```python
    inquiry = await crud_inquiry.reply(
        db, inquiry, reply_body=body.reply_body, replied_by=user.id
    )

    # Notify member (best-effort)
    member = await db.get(Member, inquiry.sender_id)
    if member is not None:
        inquiry_url = f"{settings.public_base_url}/member/inquiries/{inquiry.id}"
        send_email_background(
            member.email,
            "inquiry_replied",
            {
                "member_name": member.name,
                "subject": inquiry.subject,
                "reply_body": inquiry.reply_body,
                "inquiry_url": inquiry_url,
            },
        )

    # Re-query to attach the resolved recipient name
    row = await crud_inquiry.get_with_recipient_name(db, inquiry.id)
    if row is None:
        # Should not happen — we just replied to it
        raise HTTPException(status_code=500, detail={"code": 500, "message": "Inquiry disappeared after reply"})
    inquiry, name = row
    return _attach_recipient_name(inquiry, name)
```

- [ ] **Step 5: Rebuild backend and run the admin inquiry tests**

```bash
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker up -d backend
```

Wait ~8s, then:

```bash
docker compose --env-file .env.docker exec backend pytest tests/api/test_admin_inquiries.py -v --tb=short
```

Expected: all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/admin_inquiries.py
git commit -m "feat(inquiries): admin routes attach recipient_name + re-query on reply"
```

---

## Task 5: Backend Tests — Add 6 New Tests for `recipient_name`

**Files:**
- Modify: `backend/tests/api/test_member_inquiries.py` (add 5 tests)
- Modify: `backend/tests/api/test_admin_inquiries.py` (add 1 test)

**Context for the implementer:**

- The existing tests use a `client` fixture (TestClient) and an `admin_headers` fixture (logs in as `admin@unowire.com`).
- The `_create_verified_member(client, email)` helper in `test_member_inquiries.py` registers + verifies + logs in a member, leaving the `member_token` cookie set.
- The `_setup_member_with_inquiry(client, admin_headers, email, mfr_id)` helper in `test_admin_inquiries.py` creates a manufacturer, registers + verifies a member, and sends an inquiry — returns the inquiry ID. The manufacturer's name will be `mfr_id.title()` (e.g. `"mfr-adm-name"` → `"Mfr-Adm-Name"`).
- Tests do NOT clean up after themselves (per `conftest.py`); session-scoped cleanup runs at the START of the next session. Each test below deletes the manufacturer via admin API at the end where feasible.
- For the equipment_manufacturer test, the admin API path needs to be verified — see Step 1.

- [ ] **Step 1: Verify the equipment-manufacturer admin API path**

Run:

```bash
docker compose --env-file .env.docker exec backend python -c "from app.main import app; [print(r.path, getattr(r, 'methods', None)) for r in app.routes if 'equipment' in str(r.path).lower() and 'manufacturer' in str(r.path).lower()]"
```

Note the actual collection path (e.g. `/api/equipment-manufacturers` or `/api/equipment_mfrs`). Use the actual path in Step 2's equipment_manufacturer test. The code below assumes `/api/equipment-manufacturers`; substitute if different.

- [ ] **Step 2: Add 5 new tests to `backend/tests/api/test_member_inquiries.py`**

Append at the end of the file (after `test_member_cannot_view_others_inquiry`):

```python
def test_list_inquiries_includes_recipient_name(client, admin_headers):
    """Member list endpoint should populate recipient_name from the JOIN."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-name-list", "name": "Name List Factory", "slug": "mfr-name-list"},
        headers=admin_headers,
    )
    _create_verified_member(client, "name-list@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-name-list", "subject": "NameListQ", "body": "B"},
        headers=headers,
    )

    res = client.get("/api/member/inquiries", headers=headers)
    assert res.status_code == 200
    items = res.json()
    matched = [i for i in items if i.get("subject") == "NameListQ"]
    assert len(matched) == 1
    assert matched[0]["recipient_name"] == "Name List Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-name-list", headers=admin_headers)


def test_get_inquiry_includes_recipient_name(client, admin_headers):
    """Member detail endpoint should populate recipient_name."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-name-get", "name": "Name Get Factory", "slug": "mfr-name-get"},
        headers=admin_headers,
    )
    _create_verified_member(client, "name-get@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-name-get", "subject": "NameGetQ", "body": "B"},
        headers=headers,
    )
    inquiry_id = create_res.json()["id"]

    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] == "Name Get Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-name-get", headers=admin_headers)


def test_inquiry_to_equipment_manufacturer_resolves_name(client, admin_headers):
    """recipient_type='equipment_manufacturer' should resolve via the EquipmentManufacturer JOIN branch."""
    # NOTE: substitute the actual equipment-manufacturer API path if different (see Task 5 Step 1).
    client.post(
        "/api/equipment-manufacturers",
        json={"id": "em-name-test", "name": "Equip Name Factory", "slug": "em-name-test"},
        headers=admin_headers,
    )
    _create_verified_member(client, "em-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={
            "recipient_type": "equipment_manufacturer",
            "recipient_id": "em-name-test",
            "subject": "EquipNameQ",
            "body": "B",
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    inquiry_id = create_res.json()["id"]

    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] == "Equip Name Factory"


def test_inquiry_to_deleted_manufacturer_returns_none_name(client, admin_headers):
    """If the manufacturer is deleted, recipient_name should be None (no 500)."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-del-test", "name": "Will Be Deleted", "slug": "mfr-del-test"},
        headers=admin_headers,
    )
    _create_verified_member(client, "del-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    create_res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-del-test", "subject": "DelQ", "body": "B"},
        headers=headers,
    )
    inquiry_id = create_res.json()["id"]

    # Delete the manufacturer via admin API
    client.delete("/api/manufacturers/mfr-del-test", headers=admin_headers)

    # Re-query — should NOT 500, recipient_name should be None
    res = client.get(f"/api/member/inquiries/{inquiry_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["recipient_name"] is None


def test_create_inquiry_response_includes_recipient_name(client, admin_headers):
    """POST /api/member/inquiries response should include recipient_name (re-query path)."""
    client.post(
        "/api/manufacturers",
        json={"id": "mfr-create-name", "name": "Create Name Factory", "slug": "mfr-create-name"},
        headers=admin_headers,
    )
    _create_verified_member(client, "create-name@test-member.com")
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    res = client.post(
        "/api/member/inquiries",
        json={"recipient_type": "manufacturer", "recipient_id": "mfr-create-name", "subject": "CreateNameQ", "body": "B"},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["recipient_name"] == "Create Name Factory"

    # Cleanup
    client.delete("/api/manufacturers/mfr-create-name", headers=admin_headers)
```

- [ ] **Step 3: Add 1 new test to `backend/tests/api/test_admin_inquiries.py`**

Append at the end of the file (after `test_admin_unread_count`):

```python
def test_admin_list_includes_recipient_name(client, admin_headers):
    """Admin list endpoint should populate recipient_name from the JOIN."""
    inquiry_id = _setup_member_with_inquiry(
        client, admin_headers, "adm-name@test-member.com", "mfr-adm-name"
    )
    res = client.get("/api/admin/inquiries", headers=admin_headers)
    assert res.status_code == 200
    matched = [i for i in res.json() if i["id"] == inquiry_id]
    assert len(matched) == 1
    # _setup_member_with_inquiry creates manufacturer with name = mfr_id.title() = "Mfr-Adm-Name"
    assert matched[0]["recipient_name"] == "Mfr-Adm-Name"
    # Cleanup
    client.delete("/api/manufacturers/mfr-adm-name", headers=admin_headers)
```

- [ ] **Step 4: Rebuild backend and run all inquiry tests**

```bash
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker up -d backend
```

Wait ~8s, then:

```bash
docker compose --env-file .env.docker exec backend pytest tests/api/test_member_inquiries.py tests/api/test_admin_inquiries.py -v --tb=short
```

Expected: all existing + 6 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/api/test_member_inquiries.py backend/tests/api/test_admin_inquiries.py
git commit -m "test(inquiries): add recipient_name tests for member + admin endpoints"
```

---

## Task 6: Frontend Types + Helper

**Files:**
- Modify: `frontend/lib/types.ts` (add `recipient_name` to `InquiryRead`)
- Modify: `frontend/lib/utils.ts` (add `recipientDisplayName` helper)

- [ ] **Step 1: Add `recipient_name` to the `InquiryRead` interface in `frontend/lib/types.ts`**

Find the `InquiryRead` interface. Insert `recipient_name: string | null;` between `recipient_id` and `subject`:

```typescript
interface InquiryRead {
  id: number;
  sender_id: number;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;  // resolved at query time; null if manufacturer deleted
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

(If the existing `InquiryRead` field order differs slightly, preserve the existing order and just insert the new field after `recipient_id`.)

- [ ] **Step 2: Add `recipientDisplayName` helper to `frontend/lib/utils.ts`**

Append at the end of the file:

```typescript
/**
 * Display name for an inquiry recipient. Falls back to a generic label
 * when the manufacturer has been deleted (recipient_name is null).
 */
export function recipientDisplayName(name: string | null): string {
  return name ?? 'Unknown manufacturer';
}
```

- [ ] **Step 3: Rebuild frontend (TypeScript compile check happens during build)**

```bash
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/utils.ts
git commit -m "feat(inquiries): add recipient_name type + recipientDisplayName helper"
```

---

## Task 7: Frontend Member Pages — Detail + My Inquiries + Inbox

**Files:**
- Modify: `frontend/app/(site)/member/inquiries/[id]/page.tsx` (reply header + awaiting hint)
- Modify: `frontend/app/(site)/member/inquiries/page.tsx` (card shows "To: {name}")
- Modify: `frontend/app/(site)/member/inbox/page.tsx` (card top shows "From {name}")

- [ ] **Step 1: Update `frontend/app/(site)/member/inquiries/[id]/page.tsx`**

Add the import at the top (after the existing imports):

```tsx
import { recipientDisplayName } from '@/lib/utils';
```

Replace the reply-box header (line 36):

Before:
```tsx
          <p className="text-xs text-blue-600 mb-2">Manufacturer reply</p>
```

After:
```tsx
          <p className="text-xs text-blue-600 mb-2">
            {recipientDisplayName(inquiry.recipient_name)} reply
          </p>
```

Replace the awaiting-reply hint (line 44):

Before:
```tsx
      <p className="text-sm text-gray-500 italic">Awaiting reply from manufacturer.</p>
```

After:
```tsx
      <p className="text-sm text-gray-500 italic">
        Awaiting reply from {recipientDisplayName(inquiry.recipient_name)}.
      </p>
```

- [ ] **Step 2: Update `frontend/app/(site)/member/inquiries/page.tsx`**

Add the import at the top:

```tsx
import { recipientDisplayName } from '@/lib/utils';
```

In the card render, the current structure is:

```tsx
<div>
  <p className="font-medium text-sm">{i.subject}</p>
  <p className="text-xs text-gray-500 mt-1">{i.body?.slice(0, 80) || ''}...</p>
</div>
```

After the change (add a "To:" line above the subject):

```tsx
<div>
  <p className="text-xs text-gray-500 mb-1">To: {recipientDisplayName(i.recipient_name)}</p>
  <p className="font-medium text-sm">{i.subject}</p>
  <p className="text-xs text-gray-500 mt-1">{i.body?.slice(0, 80) || ''}...</p>
</div>
```

- [ ] **Step 3: Update `frontend/app/(site)/member/inbox/page.tsx`**

Add the import at the top:

```tsx
import { recipientDisplayName } from '@/lib/utils';
```

In the card render, the current structure is:

```tsx
<div>
  <p className="font-medium text-sm">{i.subject}</p>
  <p className="text-xs text-gray-500 mt-1">Reply: {i.reply_body.slice(0, 80)}...</p>
</div>
```

After the change (add a "From" line above the subject):

```tsx
<div>
  <p className="text-xs text-gray-500 mb-1">From {recipientDisplayName(i.recipient_name)}</p>
  <p className="font-medium text-sm">{i.subject}</p>
  <p className="text-xs text-gray-500 mt-1">Reply: {i.reply_body.slice(0, 80)}...</p>
</div>
```

- [ ] **Step 4: Rebuild frontend and smoke-test the routes**

```bash
docker compose --env-file .env.docker build frontend
docker compose --env-file .env.docker up -d frontend
```

Wait ~15s, then smoke-test:

```bash
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/member/inquiries
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/member/inbox
```

Expected: `307` for both (redirect to member login — no cookie supplied; this is healthy).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(site)/member/inquiries/[id]/page.tsx" "frontend/app/(site)/member/inquiries/page.tsx" "frontend/app/(site)/member/inbox/page.tsx"
git commit -m "feat(inquiries): member pages show recipient_name (detail, list, inbox)"
```

---

## Task 8: Frontend Admin Pages — List + Detail

**Files:**
- Modify: `frontend/app/admin/(dashboard)/inquiries/page.tsx` (table cell)
- Modify: `frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx` (detail cell)

- [ ] **Step 1: Update `frontend/app/admin/(dashboard)/inquiries/page.tsx`**

Add the import at the top:

```tsx
import { recipientDisplayName } from '@/lib/utils';
```

Replace the recipient table cell (line 40):

Before:
```tsx
                  <td className="px-4 py-3 text-gray-600">{i.recipient_type}: {i.recipient_id}</td>
```

After:
```tsx
                  <td className="px-4 py-3 text-gray-600">{recipientDisplayName(i.recipient_name)}</td>
```

- [ ] **Step 2: Update `frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx`**

Add the import at the top (after the existing imports):

```tsx
import { recipientDisplayName } from '@/lib/utils';
```

Replace the recipient display in the metadata grid (line 37):

Before:
```tsx
          <p>{inquiry.recipient_type}: {inquiry.recipient_id}</p>
```

After:
```tsx
          <p>{recipientDisplayName(inquiry.recipient_name)}</p>
```

- [ ] **Step 3: Rebuild frontend and smoke-test the admin routes**

```bash
docker compose --env-file .env.docker build frontend
docker compose --env-file .env.docker up -d frontend
```

Wait ~15s, then:

```bash
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/admin/inquiries
```

Expected: `307` (redirect to admin login — healthy).

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/admin/(dashboard)/inquiries/page.tsx" "frontend/app/admin/(dashboard)/inquiries/[id]/page.tsx"
git commit -m "feat(inquiries): admin pages show recipient_name instead of raw IDs"
```

---

## Task 9: End-to-End Verification + Smoke Test

**Files:** None (verification only — no new code, no commits unless a real bug is found)

- [ ] **Step 1: Run the full backend inquiry test suite**

```bash
docker compose --env-file .env.docker exec backend pytest tests/api/test_member_inquiries.py tests/api/test_admin_inquiries.py -v --tb=short
```

Expected: all tests PASS (existing + 6 new).

- [ ] **Step 2: Run the full backend test suite (no regressions)**

```bash
docker compose --env-file .env.docker exec backend pytest --tb=short -q
```

Expected: no new failures vs. baseline. Known pre-existing failure `tests/api/test_site_menu.py::TestTree::test_tree_excludes_hidden` (DB state pollution from prior test runs) is acceptable — flag it but do not fix.

- [ ] **Step 3: HTTP smoke test (frontend routes)**

```bash
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/member/inquiries
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/member/inbox
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/admin/inquiries
```

Expected: `200` for `/`; `307` for the others (auth redirects — healthy).

- [ ] **Step 4: Manual verification (deferred to user)**

Do NOT perform browser-based manual verification. The user will do this after the branch is pushed. Just note in the report that this step was deferred.

- [ ] **Step 5: No commit (unless a real bug was found)**

If all checks pass, no commit is needed. If a real bug is discovered that requires a code fix, report BLOCKED with details — do not attempt to fix it in this task.

---

## Task 10: Push to Remote

**Files:** None

- [ ] **Step 1: Verify working tree is clean (or only has the unrelated `hero-bg.jpg` modification)**

```bash
git status --short
```

Expected: no untracked files related to this feature; the unrelated `frontend/public/hero-bg.jpg` modification (if present) should be left unstaged.

- [ ] **Step 2: Show the commit chain to be pushed**

```bash
git log --oneline 5042359..HEAD
```

Expected: ~9 commits (Task 1 through Task 8, plus any fix-ups).

- [ ] **Step 3: Push**

```bash
git push origin feat/media-picker-modal
```

Expected: push succeeds; `git log origin/feat/media-picker-modal..HEAD` is empty afterwards.

---

## Self-Review (completed by plan author)

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| `InquiryRead` schema gains `recipient_name: str \| None` | Task 1 |
| CRUD polymorphic LEFT JOIN for `list_by_member`, `get`, `list_for_staff` | Task 2 (adds `get_with_recipient_name` instead of overriding `get`; routes updated in Tasks 3+4) |
| Member `POST /inquiries` re-queries after create | Task 3 Step 2 |
| Member `GET /inquiries` assembles names | Task 3 Step 3 |
| Member `GET /inquiries/{id}` uses new CRUD method | Task 3 Step 4 |
| Admin `GET ""` assembles names | Task 4 Step 2 |
| Admin `GET /{id}` uses new CRUD method | Task 4 Step 3 |
| Admin `POST /{id}/reply` re-queries after reply | Task 4 Step 4 |
| Frontend `InquiryRead` type gains `recipient_name` | Task 6 Step 1 |
| Frontend `recipientDisplayName` helper | Task 6 Step 2 |
| Member detail reply header uses helper | Task 7 Step 1 |
| Member detail awaiting hint uses helper | Task 7 Step 1 |
| Member My Inquiries card shows "To: {name}" | Task 7 Step 2 |
| Member Inbox card shows "From {name}" | Task 7 Step 3 |
| Admin list table cell uses helper | Task 8 Step 1 |
| Admin detail uses helper | Task 8 Step 2 |
| 6 backend tests | Task 5 |
| No migration / no model change / no new endpoint | Confirmed — no task creates them |
| Acceptance criteria 1-15 | All covered by Tasks 1-9 |

No spec gaps found.

### 2. Placeholder scan

No "TBD", "TODO", "implement later", or "similar to Task N" found. Every step has complete code.

One conditional: Task 5 Step 1 asks the implementer to verify the equipment-manufacturer API path before writing the test. This is a verification step, not a placeholder — the test code in Step 2 uses `/api/equipment-manufacturers` and tells the implementer to substitute if the actual path differs.

### 3. Type consistency

- `recipient_name: str | None` (Python) ↔ `recipient_name: string | null` (TypeScript) — consistent
- `recipientDisplayName(name: string | null): string` — signature matches all 6 call sites
- CRUD return type `tuple[Inquiry, str | None]` — consistent across `get_with_recipient_name`, `list_by_member`, `list_for_staff`
- `_attach_recipient_name(inquiry, name) -> Inquiry` — defined in both `member.py` (Task 3) and `admin_inquiries.py` (Task 4); each file has its own copy (matches existing project pattern of per-route-file helpers like `_check_scope_access` and `_notify_staff_of_inquiry`)
- All test function names match the spec's testing section
- Test assertions use the exact manufacturer names created in the test setup

No type inconsistencies found.

### 4. Potential gotchas flagged for implementers

- **Parallel Edit race:** This project has hit the parallel-Edit race multiple times. Implementers MUST use sequential Edit calls on the same file, never parallel.
- **Production Docker:** Backend and frontend containers do NOT bind-mount source. Every code change requires an image rebuild + container restart.
- **PowerShell curl:** Use `curl.exe`, not `curl`.
- **`_attach_recipient_name` monkey-patches the Inquiry instance** by setting `inquiry.recipient_name = name`. This is safe because the Inquiry model does not have a `recipient_name` column (it's a transient attribute), and Pydantic's `from_attributes=True` reads it via `getattr`. SQLAlchemy doesn't track unknown attributes, so this won't trigger an UPDATE on commit.
- **Test cleanup:** Tests don't clean up after themselves (per `conftest.py`). The new tests follow this convention — manufacturers are deleted via the admin API at the end of each test where feasible, but members/inquiries are left for the session-scoped cleanup.
- **Equipment manufacturer API path:** Task 5 Step 1 verifies the path; Step 2's test code assumes `/api/equipment-manufacturers` but tells the implementer to substitute if different.
