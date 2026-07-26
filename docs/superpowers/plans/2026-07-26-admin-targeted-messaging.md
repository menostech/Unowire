---
change: admin-targeted-messaging
design-doc: docs/superpowers/specs/2026-07-26-admin-targeted-messaging-design.md
base-ref: d798934133e72085fec19416b6cf2d50330c7d81
archived-with: openspec/changes/archive/2026-07-26-admin-targeted-messaging
---

# Admin Targeted Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the system message feature from broadcast-only to targeted messaging — admins can mass-send to recipient groups (cable managers, equipment managers, members) or single-send to a specific user/member, and staff users get a portal inbox.

**Architecture:** JSONB `recipient_targets` column on `system_messages` with PostgreSQL `@>` containment queries for visibility filtering. A parallel `system_message_user_reads` table tracks staff read state (mirroring the existing member read table). New portal routes under `/api/portal/messages` reuse the existing factory auth pattern. Frontend adds a `MessageForm` mode selector, portal inbox pages, and BFF cookie-forwarding routes.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy 2.0 (async) / Pydantic v2 / Alembic / PostgreSQL (JSONB), Next.js 14 (App Router) / TypeScript / React.

**Design reference:** `docs/superpowers/specs/2026-07-26-admin-targeted-messaging-design.md`

## Global Constraints

- All `recipient_targets` `value` fields SHALL be stored as **string** in JSONB for type consistency (`@>` is type-strict: `'[{"value":42}]'` ≠ `'[{"value":"42"}]'`).
- FastAPI route ordering: `/recipients` and `/unread-count` MUST be registered **before** `/{message_id}` to avoid path-param collision.
- `recipient_type` values: `'broadcast'` (default, visible to all members) or `'targeted'` (visible only to specified recipients).
- Valid group values: `cable_managers`, `equipment_managers`, `members`.
- Valid target kinds: `group`, `user`, `member`.
- Frontend MVP skips automated tests (per project memory) — backend pytest only.
- Backend test command: `docker compose --env-file .env.docker exec backend pytest -v`
- Latest Alembic head at plan time: `n3o4p5q6r7s8` (new migration must chain from this).
- Broadcast messages are member-only — staff inbox excludes `recipient_type='broadcast'`.
- `mark_read_for_user` uses `pg_insert(...).on_conflict_do_nothing(index_elements=['user_id','message_id'])` for idempotency.
- No GIN index at MVP — sequential scan with `@>` filter is fine under 10K rows. Migration path documented.

---

## Section 1: Backend Model + Migration

### Task 1.1: Add recipient_type and recipient_targets columns to SystemMessage model

**Files:**
- Modify: `backend/app/models/system_message.py`

**Interfaces:**
- Produces: `SystemMessage.recipient_type` (`Mapped[str]`, default `'broadcast'`), `SystemMessage.recipient_targets` (`Mapped[list | None]`, JSONB, nullable)

- [x] **Step 1: Add the two new columns to SystemMessage**

```python
# backend/app/models/system_message.py — add JSONB import at top
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

# Inside class SystemMessage, after updated_at:
    recipient_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="broadcast", server_default="broadcast"
    )
    recipient_targets: Mapped[list | None] = mapped_column(JSONB, nullable=True)
```

- [x] **Step 2: Verify the model imports cleanly**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.models.system_message import SystemMessage; print(SystemMessage.recipient_type, SystemMessage.recipient_targets)"`
Expected: prints the column descriptors without error.

- [x] **Step 3: Commit**

```bash
git add backend/app/models/system_message.py
git commit -m "feat(messages): add recipient_type + recipient_targets columns to SystemMessage model"
```

---

### Task 1.2: Add SystemMessageUserRead model

**Files:**
- Modify: `backend/app/models/system_message.py`

**Interfaces:**
- Produces: `SystemMessageUserRead` model (table `system_message_user_reads`) with `user_id` (PK, FK users.id, ondelete=CASCADE), `message_id` (PK, FK system_messages.id, ondelete=CASCADE), `read_at` (DateTime), index `ix_system_message_user_reads_message_id`

- [x] **Step 1: Add the SystemMessageUserRead class**

```python
# backend/app/models/system_message.py — add after SystemMessageRead class:

class SystemMessageUserRead(Base):
    """Parallel read-tracking table for staff Users.
    Mirrors SystemMessageRead (which tracks member reads) — added additively
    to avoid changing the existing table's PK or query assumptions.
    """
    __tablename__ = "system_message_user_reads"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    message_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("system_messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    read_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    __table_args__ = (
        Index("ix_system_message_user_reads_message_id", "message_id"),
    )
```

- [x] **Step 2: Verify the model imports cleanly**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.models.system_message import SystemMessageUserRead; print(SystemMessageUserRead.__tablename__)"`
Expected: prints `system_message_user_reads`.

- [x] **Step 3: Commit**

```bash
git add backend/app/models/system_message.py
git commit -m "feat(messages): add SystemMessageUserRead model for staff read tracking"
```

---

### Task 1.3: Register SystemMessageUserRead in models __init__

**Files:**
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Produces: `SystemMessageUserRead` exported from `app.models` package

- [x] **Step 1: Update the import line and __all__ list**

In `backend/app/models/__init__.py`, change the system_message import line from:

```python
from app.models.system_message import SystemMessage, SystemMessageRead
```

to:

```python
from app.models.system_message import SystemMessage, SystemMessageRead, SystemMessageUserRead
```

And add `"SystemMessageUserRead",` to the `__all__` list (after `"SystemMessageRead",`).

- [x] **Step 2: Verify import works**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.models import SystemMessageUserRead; print('ok')"`
Expected: prints `ok`.

- [x] **Step 3: Commit**

```bash
git add backend/app/models/__init__.py
git commit -m "feat(messages): register SystemMessageUserRead in models __init__"
```

---

### Task 1.4: Create Alembic migration for columns + user reads table

**Files:**
- Create: `backend/alembic/versions/o4p5q6r7s8t9_add_targeted_messaging_columns.py`

**Interfaces:**
- Produces: Alembic revision `o4p5q6r7s8t9`, chains from `n3o4p5q6r7s8`

- [x] **Step 1: Create the migration file**

```python
"""add targeted messaging columns and system_message_user_reads table

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-07-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'o4p5q6r7s8t9'
down_revision: str | None = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add recipient_type column with server_default so existing rows get 'broadcast'
    op.add_column(
        'system_messages',
        sa.Column('recipient_type', sa.String(length=20), nullable=False,
                  server_default='broadcast'),
    )
    # 2. Add recipient_targets JSONB column (nullable)
    op.add_column(
        'system_messages',
        sa.Column('recipient_targets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # 3. Create system_message_user_reads table (parallel to system_message_reads)
    op.create_table(
        'system_message_user_reads',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], ondelete='CASCADE',
            name='fk_system_message_user_reads_user_id_users',
        ),
        sa.ForeignKeyConstraint(
            ['message_id'], ['system_messages.id'], ondelete='CASCADE',
            name='fk_system_message_user_reads_message_id_system_messages',
        ),
        sa.PrimaryKeyConstraint('user_id', 'message_id'),
    )
    op.create_index(
        'ix_system_message_user_reads_message_id',
        'system_message_user_reads',
        ['message_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_system_message_user_reads_message_id', table_name='system_message_user_reads')
    op.drop_table('system_message_user_reads')
    op.drop_column('system_messages', 'recipient_targets')
    op.drop_column('system_messages', 'recipient_type')
```

- [x] **Step 2: Run the migration**

Run: `docker compose --env-file .env.docker exec backend alembic upgrade head`
Expected: no errors; migration applies cleanly.

- [x] **Step 3: Verify columns exist**

Run: `docker compose --env-file .env.docker exec backend python -c "import asyncio; from app.core.database import async_session; from sqlalchemy import text; async def c(): async with async_session() as s: r = await s.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='system_messages' AND column_name IN ('recipient_type','recipient_targets')\")); print(sorted(r.scalars().all())); asyncio.run(c())"`
Expected: `['recipient_targets', 'recipient_type']`

- [x] **Step 4: Commit**

```bash
git add backend/alembic/versions/o4p5q6r7s8t9_add_targeted_messaging_columns.py
git commit -m "feat(messages): alembic migration for recipient columns + user reads table"
```

---

## Section 2: Backend Schema

### Task 2.1: Add RecipientTarget schema with value stringification

**Files:**
- Modify: `backend/app/schemas/system_message.py`

**Interfaces:**
- Produces: `RecipientTarget` Pydantic model with `kind: Literal['group','user','member']` and `value: str`. Field validator coerces incoming `int` to `str`.

- [ ] **Step 1: Add the RecipientTarget schema**

```python
# backend/app/schemas/system_message.py — add imports at top:
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator

# Add after the imports, before MessageCreate:

class RecipientTarget(BaseModel):
    """A single recipient target. `value` is always stored as string in JSONB
    for type consistency with PostgreSQL `@>` containment queries.
    """
    kind: Literal["group", "user", "member"]
    value: str

    @field_validator("value")
    @classmethod
    def stringify_value(cls, v: str | int) -> str:
        """Coerce int (from form inputs) to str for JSONB type consistency.
        PostgreSQL `@>` is type-strict: '[{"value":42}]' != '[{"value":"42"}]'.
        """
        return str(v)

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify it parses and stringifies**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.schemas.system_message import RecipientTarget; t = RecipientTarget(kind='user', value=42); print(t.model_dump())"`
Expected: `{'kind': 'user', 'value': '42'}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/system_message.py
git commit -m "feat(messages): add RecipientTarget schema with value stringification"
```

---

### Task 2.2: Extend MessageCreate with recipient fields and cross-field validator

**Files:**
- Modify: `backend/app/schemas/system_message.py`

**Interfaces:**
- Consumes: `RecipientTarget` (from Task 2.1)
- Produces: `MessageCreate` with `recipient_type: Literal['broadcast','targeted'] = 'broadcast'` and `recipient_targets: list[RecipientTarget] | None = None`, cross-field validator enforces invariants.

- [ ] **Step 1: Extend MessageCreate**

```python
# backend/app/schemas/system_message.py — replace the existing MessageCreate class:

class MessageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    recipient_type: Literal["broadcast", "targeted"] = "broadcast"
    recipient_targets: list[RecipientTarget] | None = None

    @model_validator(mode="after")
    def validate_recipient_targets(self) -> "MessageCreate":
        valid_groups = {"cable_managers", "equipment_managers", "members"}
        if self.recipient_type == "broadcast":
            if self.recipient_targets is not None and len(self.recipient_targets) > 0:
                raise ValueError(
                    "recipient_targets must be null/empty when recipient_type is 'broadcast'"
                )
        elif self.recipient_type == "targeted":
            if not self.recipient_targets or len(self.recipient_targets) == 0:
                raise ValueError(
                    "recipient_targets must be a non-empty array when recipient_type is 'targeted'"
                )
            for t in self.recipient_targets:
                if t.kind == "group" and t.value not in valid_groups:
                    raise ValueError(
                        f"Invalid group value: {t.value}. Must be one of {sorted(valid_groups)}"
                    )
        return self
```

- [ ] **Step 2: Verify broadcast default works**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.schemas.system_message import MessageCreate; m = MessageCreate(title='T', body='B'); print(m.recipient_type, m.recipient_targets)"`
Expected: `broadcast None`

- [ ] **Step 3: Verify targeted validation rejects empty targets**

Run: `docker compose --env-file .env.docker exec backend python -c "from pydantic import ValidationError; from app.schemas.system_message import MessageCreate;
try:
    MessageCreate(title='T', body='B', recipient_type='targeted', recipient_targets=[])
    print('FAIL: should have raised')
except ValidationError as e:
    print('OK: rejected empty targets')"`
Expected: `OK: rejected empty targets`

- [ ] **Step 4: Verify invalid group is rejected**

Run: `docker compose --env-file .env.docker exec backend python -c "from pydantic import ValidationError; from app.schemas.system_message import MessageCreate;
try:
    MessageCreate(title='T', body='B', recipient_type='targeted', recipient_targets=[{'kind':'group','value':'admins'}])
    print('FAIL: should have raised')
except ValidationError:
    print('OK: rejected invalid group')"`
Expected: `OK: rejected invalid group`

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/system_message.py
git commit -m "feat(messages): extend MessageCreate with recipient fields + cross-field validator"
```

---

### Task 2.3: Extend AdminMessageRead with recipient fields

**Files:**
- Modify: `backend/app/schemas/system_message.py`

**Interfaces:**
- Produces: `AdminMessageRead` with `recipient_type: str` and `recipient_targets: list[RecipientTarget] | None`

- [ ] **Step 1: Extend AdminMessageRead**

```python
# backend/app/schemas/system_message.py — replace the existing AdminMessageRead class:

class AdminMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_by: int | None = None
    created_by_email: str | None = None
    created_at: datetime
    updated_at: datetime
    recipient_type: str = "broadcast"
    recipient_targets: list[RecipientTarget] | None = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Verify the schema loads**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.schemas.system_message import AdminMessageRead; print(AdminMessageRead.model_fields.keys())"`
Expected: includes `recipient_type` and `recipient_targets` in the keys.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/system_message.py
git commit -m "feat(messages): extend AdminMessageRead with recipient fields"
```

---

### Task 2.4: Add RecipientListItem, RecipientListResponse, PortalMessageRead, PortalMessageListResponse schemas

**Files:**
- Modify: `backend/app/schemas/system_message.py`

**Interfaces:**
- Produces: `RecipientListItem` (`id`, `email`, `name`), `RecipientListResponse` (three arrays), `PortalMessageRead` (`id`, `title`, `body`, `created_at`, `is_read`), `PortalMessageListResponse`

- [ ] **Step 1: Add the new response schemas**

```python
# backend/app/schemas/system_message.py — add at the end of the file:

class RecipientListItem(BaseModel):
    id: int
    email: str
    name: str | None = None

    model_config = {"from_attributes": True}


class RecipientListResponse(BaseModel):
    cable_managers: list[RecipientListItem]
    equipment_managers: list[RecipientListItem]
    members: list[RecipientListItem]


class PortalMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime
    is_read: bool

    model_config = {"from_attributes": True}


class PortalMessageListResponse(BaseModel):
    items: list[PortalMessageRead]
    total: int
    page: int
    page_size: int
```

- [ ] **Step 2: Verify all new schemas import cleanly**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.schemas.system_message import RecipientListItem, RecipientListResponse, PortalMessageRead, PortalMessageListResponse; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/system_message.py
git commit -m "feat(messages): add recipient list + portal message response schemas"
```

---

## Section 3: Backend CRUD

### Task 3.1: Update create_message to persist recipient fields

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Consumes: `MessageCreate` (now includes `recipient_type`, `recipient_targets` from Task 2.2)
- Produces: `create_message` persists `recipient_type` + `recipient_targets` (converted from Pydantic objects to plain dicts for JSONB)

- [ ] **Step 1: Update create_message**

```python
# backend/app/crud/system_message.py — replace the existing create_message method:

    async def create_message(
        self, db: AsyncSession, *, obj_in: MessageCreate, created_by: int
    ) -> SystemMessage:
        data = obj_in.model_dump()
        # Convert RecipientTarget Pydantic objects to plain dicts for JSONB storage.
        # model_dump() already produces dicts, but we ensure value is string (enforced
        # by RecipientTarget.stringify_value validator).
        db_obj = SystemMessage(created_by=created_by, **data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj
```

Note: `obj_in.model_dump()` already serializes `recipient_targets` to `list[dict] | None` which JSONB accepts. The `RecipientTarget.stringify_value` validator ensures `value` is `str`.

- [ ] **Step 2: Verify the method signature is unchanged (backward compatible)**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; import inspect; print(inspect.signature(crud_system_message.create_message))"`
Expected: `(db: AsyncSession, *, obj_in: MessageCreate, created_by: int) -> SystemMessage`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): persist recipient_type + recipient_targets in create_message"
```

---

### Task 3.2: Add list_recipients_by_group CRUD method

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Produces: `list_recipients_by_group(db) -> tuple[list, list, list]` — returns (cable_managers, equipment_managers, members) where each item is `(id, email, name)`. Uses `asyncio.gather` for 3 parallel queries.
- Consumes: `User` model (with `role.scope_type`), `Member` model

- [ ] **Step 1: Add imports and the method**

```python
# backend/app/crud/system_message.py — add imports at top:
import asyncio
from app.models.member import Member
from app.models.role import Role

# Add the method inside CRUDSystemMessage class:

    async def list_recipients_by_group(
        self, db: AsyncSession
    ) -> tuple[list[tuple[int, str, str | None]], list[tuple[int, str, str | None]], list[tuple[int, str, str | None]]]:
        """Return (cable_managers, equipment_managers, members) recipient lists.
        Each list contains (id, email, name) tuples.
        - cable_managers: Users with role.scope_type='manufacturer'
        - equipment_managers: Users with role.scope_type='equipment_manufacturer'
        - members: all Members
        """
        cable_stmt = (
            select(User.id, User.email)
            .join(Role, User.role_id == Role.id)
            .where(Role.scope_type == "manufacturer")
            .order_by(User.email)
        )
        equip_stmt = (
            select(User.id, User.email)
            .join(Role, User.role_id == Role.id)
            .where(Role.scope_type == "equipment_manufacturer")
            .order_by(User.email)
        )
        member_stmt = (
            select(Member.id, Member.email, Member.name)
            .order_by(Member.email)
        )

        cable_result, equip_result, member_result = await asyncio.gather(
            db.execute(cable_stmt),
            db.execute(equip_stmt),
            db.execute(member_stmt),
        )

        cable_managers = [(r[0], r[1], None) for r in cable_result.all()]
        equipment_managers = [(r[0], r[1], None) for r in equip_result.all()]
        members = [(r[0], r[1], r[2]) for r in member_result.all()]
        return cable_managers, equipment_managers, members
```

- [ ] **Step 2: Verify the method is callable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; print(hasattr(crud_system_message, 'list_recipients_by_group'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): add list_recipients_by_group CRUD method"
```

---

### Task 3.3: Add list_for_staff_user CRUD method

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Consumes: `SystemMessageUserRead` model (from Task 1.2), `SystemMessage.recipient_targets` (JSONB)
- Produces: `list_for_staff_user(db, user_id, scope_type, page, page_size) -> tuple[list[tuple[SystemMessage, bool]], int]` — returns targeted messages matching the caller (group by scope_type OR kind=user with their id), with read state from `system_message_user_reads`.

- [ ] **Step 1: Add imports and the method**

```python
# backend/app/crud/system_message.py — update imports:
from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from app.models.system_message import SystemMessage, SystemMessageRead, SystemMessageUserRead

# Add the method inside CRUDSystemMessage class:

    async def list_for_staff_user(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        scope_type: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, bool]], int]:
        """List targeted messages visible to a staff user.
        Visible if recipient_type='targeted' AND any target matches:
        - kind='group' + value=<group_for_scope> where group_for_scope is
          'cable_managers' for scope_type='manufacturer',
          'equipment_managers' for scope_type='equipment_manufacturer'
        - kind='user' + value=str(user_id)
        Broadcast messages are excluded (member-only).
        """
        group_value = (
            "cable_managers" if scope_type == "manufacturer"
            else "equipment_managers" if scope_type == "equipment_manufacturer"
            else None
        )

        conditions = []
        if group_value is not None:
            group_filter = cast(
                [{"kind": "group", "value": group_value}],
                JSONB,
            )
            conditions.append(SystemMessage.recipient_targets.op("@>")(group_filter))
        # Individual user target — value stored as string in JSONB
        user_filter = cast(
            [{"kind": "user", "value": str(user_id)}],
            JSONB,
        )
        conditions.append(SystemMessage.recipient_targets.op("@>")(user_filter))

        base_filter = and_(
            SystemMessage.recipient_type == "targeted",
            or_(*conditions),
        )

        # Total count
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage).where(base_filter)
        )
        total = total_result.scalar() or 0

        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, SystemMessageUserRead.user_id)
            .outerjoin(
                SystemMessageUserRead,
                and_(
                    SystemMessageUserRead.message_id == SystemMessage.id,
                    SystemMessageUserRead.user_id == user_id,
                ),
            )
            .where(base_filter)
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1] is not None) for row in result.all()]
        return items, total
```

- [ ] **Step 2: Verify the method is callable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; print(hasattr(crud_system_message, 'list_for_staff_user'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): add list_for_staff_user CRUD with JSONB @> containment filter"
```

---

### Task 3.4: Add get_for_staff_user CRUD method

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Produces: `get_for_staff_user(db, user_id, scope_type, message_id) -> tuple[SystemMessage, bool] | None` — returns single message if targeted to caller, else None.

- [ ] **Step 1: Add the method**

```python
# backend/app/crud/system_message.py — add inside CRUDSystemMessage class:

    async def get_for_staff_user(
        self, db: AsyncSession, *, user_id: int, scope_type: str, message_id: int
    ) -> tuple[SystemMessage, bool] | None:
        """Get a single message for a staff user. Returns (message, is_read) or None
        if the message does not exist or is not targeted to the caller."""
        group_value = (
            "cable_managers" if scope_type == "manufacturer"
            else "equipment_managers" if scope_type == "equipment_manufacturer"
            else None
        )

        conditions = []
        if group_value is not None:
            group_filter = cast(
                [{"kind": "group", "value": group_value}],
                JSONB,
            )
            conditions.append(SystemMessage.recipient_targets.op("@>")(group_filter))
        user_filter = cast(
            [{"kind": "user", "value": str(user_id)}],
            JSONB,
        )
        conditions.append(SystemMessage.recipient_targets.op("@>")(user_filter))

        stmt = (
            select(SystemMessage, SystemMessageUserRead.user_id)
            .outerjoin(
                SystemMessageUserRead,
                and_(
                    SystemMessageUserRead.message_id == SystemMessage.id,
                    SystemMessageUserRead.user_id == user_id,
                ),
            )
            .where(
                and_(
                    SystemMessage.id == message_id,
                    SystemMessage.recipient_type == "targeted",
                    or_(*conditions),
                ),
            )
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1] is not None)
```

- [ ] **Step 2: Verify callable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; print(hasattr(crud_system_message, 'get_for_staff_user'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): add get_for_staff_user CRUD method"
```

---

### Task 3.5: Add unread_count_for_staff_user CRUD method

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Produces: `unread_count_for_staff_user(db, user_id, scope_type) -> int`

- [ ] **Step 1: Add the method**

```python
# backend/app/crud/system_message.py — add inside CRUDSystemMessage class:

    async def unread_count_for_staff_user(
        self, db: AsyncSession, *, user_id: int, scope_type: str
    ) -> int:
        """Count targeted messages visible to the staff user that have no read row."""
        group_value = (
            "cable_managers" if scope_type == "manufacturer"
            else "equipment_managers" if scope_type == "equipment_manufacturer"
            else None
        )

        conditions = []
        if group_value is not None:
            group_filter = cast(
                [{"kind": "group", "value": group_value}],
                JSONB,
            )
            conditions.append(SystemMessage.recipient_targets.op("@>")(group_filter))
        user_filter = cast(
            [{"kind": "user", "value": str(user_id)}],
            JSONB,
        )
        conditions.append(SystemMessage.recipient_targets.op("@>")(user_filter))

        stmt = (
            select(func.count())
            .select_from(SystemMessage)
            .outerjoin(
                SystemMessageUserRead,
                and_(
                    SystemMessageUserRead.message_id == SystemMessage.id,
                    SystemMessageUserRead.user_id == user_id,
                ),
            )
            .where(
                and_(
                    SystemMessage.recipient_type == "targeted",
                    or_(*conditions),
                    SystemMessageUserRead.user_id.is_(None),
                ),
            )
        )
        result = await db.execute(stmt)
        return result.scalar() or 0
```

- [ ] **Step 2: Verify callable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; print(hasattr(crud_system_message, 'unread_count_for_staff_user'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): add unread_count_for_staff_user CRUD method"
```

---

### Task 3.6: Add mark_read_for_user CRUD method

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Produces: `mark_read_for_user(db, user_id, message_id) -> None` — idempotent upsert via `ON CONFLICT DO NOTHING`.

- [ ] **Step 1: Add the method**

```python
# backend/app/crud/system_message.py — add inside CRUDSystemMessage class:

    async def mark_read_for_user(
        self, db: AsyncSession, *, user_id: int, message_id: int
    ) -> None:
        """Idempotently mark a message as read by a staff user.
        Uses ON CONFLICT DO NOTHING — if the (user_id, message_id) row already
        exists, the original read_at is preserved (no update).
        """
        stmt = pg_insert(SystemMessageUserRead).values(
            user_id=user_id,
            message_id=message_id,
            read_at=datetime.utcnow(),
        ).on_conflict_do_nothing(
            index_elements=["user_id", "message_id"],
        )
        await db.execute(stmt)
        await db.commit()
```

- [ ] **Step 2: Verify callable**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; print(hasattr(crud_system_message, 'mark_read_for_user'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): add mark_read_for_user CRUD with idempotent upsert"
```

---

### Task 3.7: Update list_for_member to include targeted member messages

**Files:**
- Modify: `backend/app/crud/system_message.py`

**Interfaces:**
- Produces: `list_for_member` now returns `broadcast` messages + `targeted` messages matching `kind=group,value=members` OR `kind=member,value=str(member_id)`. Excludes staff-only targeted messages.

- [ ] **Step 1: Update the list_for_member method**

```python
# backend/app/crud/system_message.py — replace the existing list_for_member method:

    async def list_for_member(
        self,
        db: AsyncSession,
        *,
        member_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, bool]], int]:
        """Return (items, total) where items are (message, is_read) tuples.
        Visible messages:
        - recipient_type='broadcast' (all members)
        - recipient_type='targeted' AND any target matches:
            kind='group' + value='members'
            kind='member' + value=str(member_id)
        """
        members_group_filter = cast(
            [{"kind": "group", "value": "members"}],
            JSONB,
        )
        member_filter = cast(
            [{"kind": "member", "value": str(member_id)}],
            JSONB,
        )
        visibility = or_(
            SystemMessage.recipient_type == "broadcast",
            and_(
                SystemMessage.recipient_type == "targeted",
                or_(
                    SystemMessage.recipient_targets.op("@>")(members_group_filter),
                    SystemMessage.recipient_targets.op("@>")(member_filter),
                ),
            ),
        )

        # Total count
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage).where(visibility)
        )
        total = total_result.scalar() or 0

        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, SystemMessageRead.member_id)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .where(visibility)
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1] is not None) for row in result.all()]
        return items, total
```

- [ ] **Step 2: Verify the method still has the same signature**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.crud.system_message import crud_system_message; import inspect; print(inspect.signature(crud_system_message.list_for_member))"`
Expected: `(db: AsyncSession, *, member_id: int, page: int = 1, page_size: int = 20)`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/system_message.py
git commit -m "feat(messages): extend list_for_member with targeted member message filter"
```

---

## Section 4: Backend Admin Routes

### Task 4.1: Extend POST /api/admin/messages to accept recipient fields

**Files:**
- Modify: `backend/app/api/routes/admin_messages.py`

**Interfaces:**
- Consumes: extended `MessageCreate` (from Task 2.2), `create_message` (from Task 3.1)
- Produces: `POST /api/admin/messages` accepts `recipient_type` + `recipient_targets`; `_to_admin_read` helper echoes recipient fields.

- [ ] **Step 1: Update _to_admin_read helper**

```python
# backend/app/api/routes/admin_messages.py — replace _to_admin_read:

def _to_admin_read(msg, publisher_email: str | None) -> AdminMessageRead:
    return AdminMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_by=msg.created_by,
        created_by_email=publisher_email,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
        recipient_type=msg.recipient_type,
        recipient_targets=msg.recipient_targets,
    )
```

- [ ] **Step 2: Verify the POST route works (MessageCreate already extended, no route change needed)**

The existing `create_message` route already passes `body: MessageCreate` to `crud_system_message.create_message(db, obj_in=body, created_by=user.id)`. Since `MessageCreate` now includes recipient fields and `create_message` persists them (Task 3.1), no route handler change is needed — FastAPI + Pydantic handle the new fields automatically.

Run: `docker compose --env-file .env.docker exec backend python -c "from app.api.routes.admin_messages import _to_admin_read; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/admin_messages.py
git commit -m "feat(messages): echo recipient fields in admin message read serialization"
```

---

### Task 4.2: Add GET /api/admin/messages/recipients endpoint

**Files:**
- Modify: `backend/app/api/routes/admin_messages.py`

**Interfaces:**
- Consumes: `list_recipients_by_group` (from Task 3.2), `RecipientListResponse`, `RecipientListItem` (from Task 2.4)
- Produces: `GET /api/admin/messages/recipients` guarded by `require_operator("messages")`. **Route MUST be registered before `GET /{message_id}`** to avoid FastAPI matching `"recipients"` as a path-param.

- [ ] **Step 1: Add the recipients endpoint BEFORE the /{message_id} route**

In `backend/app/api/routes/admin_messages.py`, add the new route **immediately after the `list_messages` route (the `""` GET) and BEFORE the `get_message` route (`/{message_id}`)**:

```python
# Add imports at top:
from app.schemas.system_message import (
    AdminMessageRead,
    MessageCreate,
    MessageListResponse,
    RecipientListItem,
    RecipientListResponse,
)

# Add AFTER the list_messages route (GET "") and BEFORE get_message route (GET "/{message_id}"):
@router.get("/recipients", response_model=RecipientListResponse)
async def list_recipients(
    user: User = Depends(require_operator("messages")),
    db: AsyncSession = Depends(get_db),
):
    """List candidate recipients grouped by role.
    NOTE: This route MUST be registered BEFORE GET /{message_id} to avoid
    FastAPI matching "recipients" as a path-param.
    """
    cable_managers, equipment_managers, members = await crud_system_message.list_recipients_by_group(db)
    return RecipientListResponse(
        cable_managers=[RecipientListItem(id=r[0], email=r[1], name=r[2]) for r in cable_managers],
        equipment_managers=[RecipientListItem(id=r[0], email=r[1], name=r[2]) for r in equipment_managers],
        members=[RecipientListItem(id=r[0], email=r[1], name=r[2]) for r in members],
    )
```

- [ ] **Step 2: Verify route ordering is correct**

Run: `docker compose --env-file .env.docker exec backend python -c "
from app.api.routes.admin_messages import router
paths = [r.path for r in router.routes]
print(paths)
# Verify /recipients appears before /{message_id}
ri = paths.index('/api/admin/messages/recipients')
mi = paths.index('/api/admin/messages/{message_id}')
assert ri < mi, f'/recipients ({ri}) must come before /{{message_id}} ({mi})'
print('Route order OK')"`
Expected: `Route order OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/admin_messages.py
git commit -m "feat(messages): add GET /api/admin/messages/recipients endpoint (before /{message_id})"
```

---

### Task 4.3: Verify AdminMessageRead serialization includes recipient fields in list/detail

**Files:**
- Modify: `backend/app/api/routes/admin_messages.py` (only if needed)

**Interfaces:**
- Consumes: `_to_admin_read` (from Task 4.1, already echoes recipient fields)

- [ ] **Step 1: Verify list and detail routes already use _to_admin_read**

The existing `list_messages` and `get_message` routes already call `_to_admin_read(m, email)`. Since Task 4.1 updated `_to_admin_read` to include `recipient_type` and `recipient_targets`, the list and detail endpoints automatically echo recipient fields. No additional code change needed.

Run: `docker compose --env-file .env.docker exec backend python -c "
from app.api.routes.admin_messages import list_messages, get_message
print('list and get routes exist')
# Verify _to_admin_read includes recipient fields
from app.api.routes.admin_messages import _to_admin_read
import inspect
src = inspect.getsource(_to_admin_read)
assert 'recipient_type' in src and 'recipient_targets' in src
print('OK: _to_admin_read includes recipient fields')"`
Expected: `OK: _to_admin_read includes recipient fields`

- [ ] **Step 2: Commit (if any changes were needed — likely none)**

If no changes were needed, skip the commit. If adjustments were made:

```bash
git add backend/app/api/routes/admin_messages.py
git commit -m "feat(messages): ensure admin list/detail routes echo recipient fields"
```

---

## Section 5: Backend Portal Message Routes

### Task 5.1: Add "messages" to factory allowed scopes in deps.py

**Files:**
- Modify: `backend/app/api/deps.py`

**Interfaces:**
- Produces: `"messages"` added to `_FACTORY_ALLOWED_BY_SCOPE` for both `manufacturer` and `equipment_manufacturer` scopes.

- [ ] **Step 1: Update _FACTORY_ALLOWED_BY_SCOPE**

```python
# backend/app/api/deps.py — replace the _FACTORY_ALLOWED_BY_SCOPE dict:

_FACTORY_ALLOWED_BY_SCOPE: dict[str, set[str]] = {
    "manufacturer": {"dashboard", "cables", "inquiries", "media", "me", "messages"},
    "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me", "messages"},
}
```

- [ ] **Step 2: Verify the module is allowed**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.api.deps import _FACTORY_ALLOWED_BY_SCOPE; assert 'messages' in _FACTORY_ALLOWED_BY_SCOPE['manufacturer']; assert 'messages' in _FACTORY_ALLOWED_BY_SCOPE['equipment_manufacturer']; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/deps.py
git commit -m "feat(messages): allow 'messages' module for factory portal scopes"
```

---

### Task 5.2: Create portal_messages.py with GET /api/portal/messages, unread-count, and /{id}

**Files:**
- Create: `backend/app/api/routes/portal_messages.py`

**Interfaces:**
- Consumes: `require_factory_module` (from deps.py), `crud_system_message` methods `list_for_staff_user`, `get_for_staff_user`, `unread_count_for_staff_user`, `mark_read_for_user` (from Tasks 3.3-3.6), `PortalMessageRead`, `PortalMessageListResponse`, `UnreadCountResponse` (from Task 2.4)
- Produces: New router with prefix `/api/portal/messages`. **Route ordering: `/unread-count` registered BEFORE `/{message_id}`**.

- [ ] **Step 1: Create the portal_messages.py file**

```python
# backend/app/api/routes/portal_messages.py
"""Portal staff inbox routes: list, unread-count, detail.
Guarded by require_factory_module('messages'). Auto-marks read on detail view.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_factory_module
from app.core.database import get_db
from app.crud.system_message import crud_system_message
from app.models.user import User
from app.schemas.system_message import (
    PortalMessageRead,
    PortalMessageListResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/portal/messages", tags=["portal-messages"])


def _to_portal_read(msg, is_read: bool) -> PortalMessageRead:
    return PortalMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_at=msg.created_at,
        is_read=is_read,
    )


@router.get("", response_model=PortalMessageListResponse)
async def list_portal_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """List targeted messages visible to the calling staff user.
    Broadcast messages are excluded (member-only).
    """
    items, total = await crud_system_message.list_for_staff_user(
        db,
        user_id=user.id,
        scope_type=user.role.scope_type,
        page=page,
        page_size=page_size,
    )
    return PortalMessageListResponse(
        items=[_to_portal_read(m, r) for m, r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def portal_unread_count(
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """Return unread count for the calling staff user.
    NOTE: This route MUST be registered BEFORE GET /{message_id} to avoid
    FastAPI matching "unread-count" as a path-param.
    """
    count = await crud_system_message.unread_count_for_staff_user(
        db, user_id=user.id, scope_type=user.role.scope_type
    )
    return UnreadCountResponse(unread=count)


@router.get("/{message_id}", response_model=PortalMessageRead)
async def get_portal_message(
    message_id: int,
    user: User = Depends(require_factory_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single message. Auto-marks as read on first view (idempotent).
    Returns 404 if the message is not targeted to the caller.
    """
    result = await crud_system_message.get_for_staff_user(
        db,
        user_id=user.id,
        scope_type=user.role.scope_type,
        message_id=message_id,
    )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, is_read = result
    # Auto-mark read (idempotent via ON CONFLICT DO NOTHING)
    if not is_read:
        await crud_system_message.mark_read_for_user(
            db, user_id=user.id, message_id=message_id
        )
    return _to_portal_read(msg, True)
```

- [ ] **Step 2: Verify the module imports**

Run: `docker compose --env-file .env.docker exec backend python -c "from app.api.routes.portal_messages import router; print(router.prefix)"`
Expected: `/api/portal/messages`

- [ ] **Step 3: Verify route ordering**

Run: `docker compose --env-file .env.docker exec backend python -c "
from app.api.routes.portal_messages import router
paths = [r.path for r in router.routes]
print(paths)
ui = paths.index('/api/portal/messages/unread-count')
mi = paths.index('/api/portal/messages/{message_id}')
assert ui < mi, f'/unread-count ({ui}) must come before /{{message_id}} ({mi})'
print('Route order OK')"`
Expected: `Route order OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/portal_messages.py
git commit -m "feat(messages): add portal staff inbox routes (list, unread-count, detail)"
```

---

### Task 5.3: Register portal_messages router in main.py

**Files:**
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `portal_messages` router (from Task 5.2)
- Produces: Portal messages routes accessible in the running app.

- [ ] **Step 1: Add the import and include_router call**

```python
# backend/app/main.py — update the import line (add portal_messages to the tuple):
from app.api.routes import auth, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages, portal_auth, page_views, portal_dashboard, portal_cables, portal_equipment, portal_inquiries, portal_media, portal_messages

# Add after the portal_media include_router line (near line 118):
app.include_router(portal_messages.router)
```

- [ ] **Step 2: Verify the app starts and routes are registered**

Run: `docker compose --env-file .env.docker exec backend python -c "
from app.main import app
paths = [r.path for r in app.routes if hasattr(r, 'path')]
assert '/api/portal/messages' in paths, 'missing /api/portal/messages'
assert '/api/portal/messages/unread-count' in paths, 'missing /api/portal/messages/unread-count'
assert '/api/portal/messages/{message_id}' in paths, 'missing /api/portal/messages/{message_id}'
print('All portal message routes registered')"`
Expected: `All portal message routes registered`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(messages): register portal_messages router in main app"
```

---

## Section 6: Backend Tests

> **Note:** Test files referenced: extend `backend/tests/api/test_admin_messages.py`, new `backend/tests/api/test_portal_messages.py`, extend `backend/tests/api/test_member_messages.py` (the existing member messages test file; design doc refers to it as `test_member.py`), extend/create `backend/tests/crud/test_system_message.py`.

### Task 6.1: Add admin POST tests (broadcast default, targeted groups, empty 422, invalid group 422, broadcast+non-null 422)

**Files:**
- Modify: `backend/tests/api/test_admin_messages.py`

**Interfaces:**
- Consumes: `admin_headers` fixture (from conftest.py), extended `MessageCreate` schema

- [ ] **Step 1: Add the test functions**

Append to `backend/tests/api/test_admin_messages.py`:

```python
def test_create_broadcast_message_defaults(client, admin_headers):
    """POST with no recipient_type defaults to broadcast."""
    res = client.post(
        "/api/admin/messages",
        json={"title": "Broadcast Default", "body": "Body"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["recipient_type"] == "broadcast"
    assert data["recipient_targets"] is None
    # Cleanup
    client.delete(f"/api/admin/messages/{data['id']}", headers=admin_headers)


def test_create_targeted_message_multiple_groups(client, admin_headers):
    """POST targeted with multiple groups succeeds."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Targeted Multi",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [
                {"kind": "group", "value": "cable_managers"},
                {"kind": "group", "value": "equipment_managers"},
            ],
        },
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["recipient_type"] == "targeted"
    assert len(data["recipient_targets"]) == 2
    # Cleanup
    client.delete(f"/api/admin/messages/{data['id']}", headers=admin_headers)


def test_create_targeted_message_empty_targets_returns_422(client, admin_headers):
    """POST targeted with empty recipient_targets returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Targeted",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_create_targeted_message_invalid_group_returns_422(client, admin_headers):
    """POST targeted with invalid group value returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Group",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "admins"}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_create_broadcast_with_non_null_targets_returns_422(client, admin_headers):
    """POST broadcast with non-null recipient_targets returns 422."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Bad Broadcast",
            "body": "Body",
            "recipient_type": "broadcast",
            "recipient_targets": [{"kind": "group", "value": "members"}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 422
```

- [ ] **Step 2: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_admin_messages.py -v -k "broadcast_default or targeted_message or broadcast_with_non_null"`
Expected: all 5 new tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_messages.py
git commit -m "test(messages): add admin POST recipient validation tests"
```

---

### Task 6.2: Add GET /api/admin/messages/recipients tests

**Files:**
- Modify: `backend/tests/api/test_admin_messages.py`

**Interfaces:**
- Consumes: `admin_headers`, `cable_manager_headers` fixtures (cable_manager provides a manufacturer-scope user)

- [ ] **Step 1: Add the test functions**

Append to `backend/tests/api/test_admin_messages.py`:

```python
def test_get_recipients_returns_three_groups(client, admin_headers, db_session):
    """GET /recipients returns cable_managers, equipment_managers, members arrays."""
    # db_session fixture seeds cable_manager@test.com and equip_manager@test.com
    res = client.get("/api/admin/messages/recipients", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "cable_managers" in data
    assert "equipment_managers" in data
    assert "members" in data
    assert isinstance(data["cable_managers"], list)
    assert isinstance(data["equipment_managers"], list)
    assert isinstance(data["members"], list)
    # Each item has id, email, name
    if data["cable_managers"]:
        item = data["cable_managers"][0]
        assert "id" in item and "email" in item and "name" in item


def test_get_recipients_requires_permission(client):
    """GET /recipients without admin token returns 401."""
    res = client.get("/api/admin/messages/recipients")
    assert res.status_code == 401
```

- [ ] **Step 2: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_admin_messages.py -v -k "recipients"`
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_messages.py
git commit -m "test(messages): add GET /recipients endpoint tests"
```

---

### Task 6.3: Add admin list/detail echo recipient fields tests

**Files:**
- Modify: `backend/tests/api/test_admin_messages.py`

**Interfaces:**
- Consumes: `admin_headers` fixture

- [ ] **Step 1: Add the test functions**

Append to `backend/tests/api/test_admin_messages.py`:

```python
def test_admin_list_echoes_recipient_fields(client, admin_headers):
    """Admin message list includes recipient_type + recipient_targets."""
    # Create a targeted message
    create_res = client.post(
        "/api/admin/messages",
        json={
            "title": "Echo Test",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "members"}],
        },
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get("/api/admin/messages", headers=admin_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    found = [m for m in items if m["id"] == msg_id]
    assert len(found) == 1
    assert found[0]["recipient_type"] == "targeted"
    assert found[0]["recipient_targets"] == [{"kind": "group", "value": "members"}]
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_admin_detail_echoes_recipient_fields(client, admin_headers):
    """Admin message detail includes recipient_type + recipient_targets."""
    create_res = client.post(
        "/api/admin/messages",
        json={
            "title": "Detail Echo",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "cable_managers"}],
        },
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["recipient_type"] == "targeted"
    assert data["recipient_targets"] == [{"kind": "group", "value": "cable_managers"}]
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
```

- [ ] **Step 2: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_admin_messages.py -v -k "echoes_recipient"`
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_messages.py
git commit -m "test(messages): add admin list/detail recipient field echo tests"
```

---

### Task 6.4: Create test_portal_messages.py with staff inbox filtering tests

**Files:**
- Create: `backend/tests/api/test_portal_messages.py`

**Interfaces:**
- Consumes: `cable_manager_headers`, `equipment_manager_headers` fixtures (from conftest.py), `admin_headers` for creating messages

- [ ] **Step 1: Create the test file**

```python
# backend/tests/api/test_portal_messages.py
"""Tests for portal staff inbox endpoints."""


def _create_targeted(client, admin_headers, targets):
    """Helper: create a targeted message and return its id."""
    res = client.post(
        "/api/admin/messages",
        json={
            "title": "Portal Test",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": targets,
        },
        headers=admin_headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def test_portal_messages_requires_auth(client):
    res = client.get("/api/portal/messages")
    assert res.status_code == 401


def test_cable_manager_sees_cable_managers_group(client, admin_headers, cable_manager_headers, db_session):
    """Cable manager sees messages targeting group=cable_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "cable_managers"}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_equipment_manager_sees_equipment_managers_group(client, admin_headers, equipment_manager_headers, db_session):
    """Equipment manager sees messages targeting group=equipment_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "equipment_managers"}])
    res = client.get("/api/portal/messages", headers=equipment_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_cable_manager_does_not_see_equipment_managers_group(client, admin_headers, cable_manager_headers, db_session):
    """Cable manager does NOT see messages targeting only group=equipment_managers."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "equipment_managers"}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id not in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_broadcast_excluded_from_portal(client, admin_headers, cable_manager_headers):
    """Broadcast messages are NOT visible in the staff inbox."""
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Broadcast", "body": "Body"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id not in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_staff_sees_individual_user_target(client, admin_headers, cable_manager_headers, db_session):
    """Staff user sees messages targeting kind=user with their user_id.
    We need to know the cable_manager's user_id — query it via /api/portal/auth/me.
    """
    me_res = client.get("/api/portal/auth/me", headers=cable_manager_headers)
    assert me_res.status_code == 200
    user_id = me_res.json()["id"]
    msg_id = _create_targeted(client, admin_headers, [{"kind": "user", "value": user_id}])
    res = client.get("/api/portal/messages", headers=cable_manager_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
```

- [ ] **Step 2: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_portal_messages.py -v`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_messages.py
git commit -m "test(messages): add portal staff inbox filtering tests"
```

---

### Task 6.5: Add portal GET /{id} auto-mark-read and 404 tests

**Files:**
- Modify: `backend/tests/api/test_portal_messages.py`

**Interfaces:**
- Consumes: `cable_manager_headers` fixture

- [ ] **Step 1: Add the test functions**

Append to `backend/tests/api/test_portal_messages.py`:

```python
def test_portal_get_message_auto_marks_read(client, admin_headers, cable_manager_headers, db_session):
    """GET /{id} for a targeted message auto-marks it as read."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "cable_managers"}])
    # First view — should return is_read=True (auto-marked)
    res = client.get(f"/api/portal/messages/{msg_id}", headers=cable_manager_headers)
    assert res.status_code == 200
    assert res.json()["is_read"] is True
    # Verify unread count is now 0 for this message
    list_res = client.get("/api/portal/messages", headers=cable_manager_headers)
    items = {m["id"]: m["is_read"] for m in list_res.json()["items"]}
    assert items[msg_id] is True
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_portal_get_message_stays_read_on_reopen(client, admin_headers, cable_manager_headers, db_session):
    """Reopening a message keeps is_read=True (idempotent mark_read)."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "cable_managers"}])
    # First view
    client.get(f"/api/portal/messages/{msg_id}", headers=cable_manager_headers)
    # Second view
    res = client.get(f"/api/portal/messages/{msg_id}", headers=cable_manager_headers)
    assert res.status_code == 200
    assert res.json()["is_read"] is True
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_portal_get_message_404_when_not_targeted(client, admin_headers, cable_manager_headers, db_session):
    """GET /{id} for a message NOT targeted to caller returns 404."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "equipment_managers"}])
    res = client.get(f"/api/portal/messages/{msg_id}", headers=cable_manager_headers)
    assert res.status_code == 404
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
```

- [ ] **Step 2: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_portal_messages.py -v -k "auto_marks_read or stays_read or 404_when_not_targeted"`
Expected: all 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_messages.py
git commit -m "test(messages): add portal GET /{id} auto-mark-read + 404 tests"
```

---

### Task 6.6: Add portal unread-count test

**Files:**
- Modify: `backend/tests/api/test_portal_messages.py`

**Interfaces:**
- Consumes: `cable_manager_headers` fixture

- [ ] **Step 1: Add the test function**

Append to `backend/tests/api/test_portal_messages.py`:

```python
def test_portal_unread_count(client, admin_headers, cable_manager_headers, db_session):
    """unread-count returns correct count before and after reading."""
    msg_id = _create_targeted(client, admin_headers, [{"kind": "group", "value": "cable_managers"}])
    # Before reading — should be >= 1
    res = client.get("/api/portal/messages/unread-count", headers=cable_manager_headers)
    assert res.status_code == 200
    assert res.json()["unread"] >= 1
    # Read the message
    client.get(f"/api/portal/messages/{msg_id}", headers=cable_manager_headers)
    # After reading — count should decrease by 1
    res2 = client.get("/api/portal/messages/unread-count", headers=cable_manager_headers)
    assert res2.status_code == 200
    assert res2.json()["unread"] == res.json()["unread"] - 1
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
```

- [ ] **Step 2: Run the new test**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_portal_messages.py -v -k "unread_count"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_portal_messages.py
git commit -m "test(messages): add portal unread-count test"
```

---

### Task 6.7: Add member inbox targeted message tests

**Files:**
- Modify: `backend/tests/api/test_member_messages.py`

**Interfaces:**
- Consumes: existing member message test patterns, `admin_headers` for creating messages

- [ ] **Step 1: Read the existing test_member_messages.py to understand fixtures**

Read `backend/tests/api/test_member_messages.py` to see the existing member fixture pattern (member registration + login + member_token).

- [ ] **Step 2: Add the test functions**

Append to `backend/tests/api/test_member_messages.py`:

```python
def test_member_sees_targeted_group_members(client, admin_headers):
    """Member sees targeted messages with kind=group, value=members."""
    # Register + verify + login a member
    client.post("/api/member/register", json={
        "email": "targeted-mbr@test-member.com",
        "password": "password123",
        "name": "Targeted Mbr",
    })
    import asyncio
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.member import Member

    async def get_token():
        async with async_session() as db:
            result = await db.execute(
                select(Member).where(Member.email == "targeted-mbr@test-member.com")
            )
            return result.scalar_one().verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    client.post("/api/member/login", json={
        "email": "targeted-mbr@test-member.com",
        "password": "password123",
    })
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    # Create a targeted message for members group
    create_res = client.post(
        "/api/admin/messages",
        json={
            "title": "Targeted Members",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "members"}],
        },
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]

    res = client.get("/api/member/messages", headers=headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_does_not_see_staff_targeted(client, admin_headers):
    """Member does NOT see messages targeting kind=user or group=cable_managers."""
    client.post("/api/member/register", json={
        "email": "exclude-mbr@test-member.com",
        "password": "password123",
        "name": "Exclude Mbr",
    })
    import asyncio
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.member import Member

    async def get_token():
        async with async_session() as db:
            result = await db.execute(
                select(Member).where(Member.email == "exclude-mbr@test-member.com")
            )
            return result.scalar_one().verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    client.post("/api/member/login", json={
        "email": "exclude-mbr@test-member.com",
        "password": "password123",
    })
    member_token = client.cookies.get("member_token")
    headers = {"Authorization": f"Bearer {member_token}"}

    # Create a staff-only targeted message
    create_res = client.post(
        "/api/admin/messages",
        json={
            "title": "Staff Only",
            "body": "Body",
            "recipient_type": "targeted",
            "recipient_targets": [{"kind": "group", "value": "cable_managers"}],
        },
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]

    res = client.get("/api/member/messages", headers=headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["items"]]
    assert msg_id not in ids
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
```

- [ ] **Step 3: Run the new tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/api/test_member_messages.py -v -k "targeted"`
Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/api/test_member_messages.py
git commit -m "test(messages): add member inbox targeted message visibility tests"
```

---

### Task 6.8: Add CRUD-level tests for list_for_staff_user, mark_read_for_user, list_recipients_by_group

**Files:**
- Create: `backend/tests/crud/test_system_message.py`

**Interfaces:**
- Consumes: `db_session` fixture, `crud_system_message` methods

- [ ] **Step 1: Create the crud test directory and file**

Create `backend/tests/crud/__init__.py` (empty file) and `backend/tests/crud/test_system_message.py`:

```python
# backend/tests/crud/test_system_message.py
"""Unit tests for system_message CRUD methods."""
import asyncio
import pytest

from app.core.database import async_session
from app.crud.system_message import crud_system_message
from app.models.system_message import SystemMessage, SystemMessageUserRead
from app.schemas.system_message import MessageCreate, RecipientTarget
from sqlalchemy import select


@pytest.mark.asyncio
async def test_list_recipients_by_group_returns_three_lists(db_session):
    """list_recipients_by_group returns a 3-tuple of lists."""
    cable, equip, members = await crud_system_message.list_recipients_by_group(db_session)
    assert isinstance(cable, list)
    assert isinstance(equip, list)
    assert isinstance(members, list)


@pytest.mark.asyncio
async def test_mark_read_for_user_is_idempotent(db_session):
    """Calling mark_read_for_user twice does not duplicate the row."""
    # Create a test message
    msg = SystemMessage(
        title="Idempotency Test",
        body="Body",
        recipient_type="targeted",
        recipient_targets=[{"kind": "group", "value": "cable_managers"}],
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    user_id = 1  # admin user (always exists)

    # First mark
    await crud_system_message.mark_read_for_user(db_session, user_id=user_id, message_id=msg.id)
    # Second mark (idempotent)
    await crud_system_message.mark_read_for_user(db_session, user_id=user_id, message_id=msg.id)

    # Verify only one row exists
    result = await db_session.execute(
        select(SystemMessageUserRead).where(
            SystemMessageUserRead.user_id == user_id,
            SystemMessageUserRead.message_id == msg.id,
        )
    )
    rows = result.all()
    assert len(rows) == 1

    # Cleanup
    await db_session.delete(msg)
    await db_session.commit()


@pytest.mark.asyncio
async def test_list_for_staff_user_filters_by_scope(db_session):
    """list_for_staff_user returns only messages matching the caller's scope."""
    # Create a message targeted to cable_managers
    msg = SystemMessage(
        title="Cable Only",
        body="Body",
        recipient_type="targeted",
        recipient_targets=[{"kind": "group", "value": "cable_managers"}],
    )
    db_session.add(msg)
    # Create a message targeted to equipment_managers
    msg2 = SystemMessage(
        title="Equip Only",
        body="Body",
        recipient_type="targeted",
        recipient_targets=[{"kind": "group", "value": "equipment_managers"}],
    )
    db_session.add(msg2)
    await db_session.commit()
    await db_session.refresh(msg)
    await db_session.refresh(msg2)

    # Cable manager (scope_type='manufacturer') should see msg but not msg2
    items, total = await crud_system_message.list_for_staff_user(
        db_session, user_id=99999, scope_type="manufacturer"
    )
    ids = [m.id for m, _ in items]
    assert msg.id in ids
    assert msg2.id not in ids

    # Cleanup
    await db_session.delete(msg)
    await db_session.delete(msg2)
    await db_session.commit()
```

- [ ] **Step 2: Run the CRUD tests**

Run: `docker compose --env-file .env.docker exec backend pytest backend/tests/crud/test_system_message.py -v`
Expected: all 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/crud/__init__.py backend/tests/crud/test_system_message.py
git commit -m "test(messages): add CRUD-level tests for staff user + idempotent mark_read"
```

---

## Section 7: Frontend Types + API Client

### Task 7.1: Add RecipientTarget type to frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

**Interfaces:**
- Produces: `RecipientTargetKind`, `RecipientGroupValue`, `RecipientTarget` TypeScript types

- [ ] **Step 1: Add the types**

```typescript
// frontend/lib/types.ts — add after the AdminMessage interface (around line 408):

// === Targeted Messaging ===
export type RecipientTargetKind = 'group' | 'user' | 'member';
export type RecipientGroupValue = 'cable_managers' | 'equipment_managers' | 'members';

export interface RecipientTarget {
  kind: RecipientTargetKind;
  value: string;
}

export interface RecipientListItem {
  id: number;
  email: string;
  name: string | null;
}

export interface RecipientListResponse {
  cable_managers: RecipientListItem[];
  equipment_managers: RecipientListItem[];
  members: RecipientListItem[];
}
```

- [ ] **Step 2: Extend AdminMessage interface**

```typescript
// frontend/lib/types.ts — replace the existing AdminMessage interface:

export interface AdminMessage {
  id: number;
  title: string;
  body: string;
  created_by: number;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  recipient_type: 'broadcast' | 'targeted';
  recipient_targets: RecipientTarget[] | null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors related to the new types.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(messages): add RecipientTarget + recipient list frontend types"
```

---

### Task 7.2: Add PortalMessage types to portal types

**Files:**
- Modify: `frontend/lib/types/portal.ts`

**Interfaces:**
- Produces: `PortalMessage`, `PortalMessageListResponse` types

- [ ] **Step 1: Add the types**

```typescript
// frontend/lib/types/portal.ts — add at the end of the file:

// Matches backend PortalMessageRead (backend/app/schemas/system_message.py).
export interface PortalMessage {
  id: number;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

export interface PortalMessageListResponse {
  items: PortalMessage[];
  total: number;
  page: number;
  page_size: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/portal.ts
git commit -m "feat(messages): add PortalMessage frontend types"
```

---

### Task 7.3: Extend adminApi.messages.create payload and add messages.recipients

**Files:**
- Modify: `frontend/lib/adminApi.ts`

**Interfaces:**
- Consumes: `RecipientTarget`, `RecipientListResponse` types (from Task 7.1)
- Produces: `adminApi.messages.create` accepts `recipient_type` + `recipient_targets`; new `adminApi.messages.recipients()` method.

- [ ] **Step 1: Update the messages namespace in adminApi**

```typescript
// frontend/lib/adminApi.ts — replace the messages namespace (around line 790):

  messages: {
    async all(page = 1, page_size = 20): Promise<AdminMessageListResponse> {
      return adminGet<AdminMessageListResponse>(
        `/api/admin/messages?page=${page}&page_size=${page_size}`
      );
    },
    async getById(id: number): Promise<AdminMessage | null> {
      try {
        return await adminGet<AdminMessage>(`/api/admin/messages/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: {
      title: string;
      body: string;
      recipient_type?: 'broadcast' | 'targeted';
      recipient_targets?: RecipientTarget[] | null;
    }): Promise<AdminMessage> {
      const res = await adminFetch(`/api/admin/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async recipients(): Promise<RecipientListResponse> {
      return adminGet<RecipientListResponse>(`/api/admin/messages/recipients`);
    },
    async remove(id: number): Promise<void> {
      const res = await adminFetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },
```

- [ ] **Step 2: Add RecipientTarget + RecipientListResponse to the imports**

```typescript
// frontend/lib/adminApi.ts — update the import line at the top:
import type { AdminMessage, AdminMessageListResponse, Manufacturer, Cable, MenuItem, MenuItemTree, Role, AdminUserExtended, UserPermissions, ScopeOption, AdminMember, Page, PageListItem, SiteMenuItem, RecipientTarget, RecipientListResponse } from './types';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/adminApi.ts
git commit -m "feat(messages): extend adminApi.messages.create + add recipients method"
```

---

### Task 7.4: Add portalApi.messages and portalApiClient.messages namespaces

**Files:**
- Modify: `frontend/lib/portalApi.ts` (server-side)
- Modify: `frontend/lib/portalApiClient.ts` (client-side)

**Interfaces:**
- Consumes: `PortalMessage`, `PortalMessageListResponse` types (from Task 7.2)
- Produces: `portalApi.messages` (`all`, `getById`, `unreadCount`) server-side; `portalApiClient.messages` (`all`, `getById`, `unreadCount`) client-side.

- [ ] **Step 1: Add messages namespace to portalApi.ts**

```typescript
// frontend/lib/portalApi.ts — add PortalMessage + PortalMessageListResponse to imports:
import type {
  PortalUser,
  PortalPermissions,
  PortalDashboard,
  PortalCable,
  PortalEquipment,
  PortalInquiry,
  PortalFolder,
  PortalUpload,
  PortalUploadPage,
  PortalMessage,
  PortalMessageListResponse,
} from '@/lib/types/portal';

// Add the messages namespace to the portalApi object (after uploads):
  messages: {
    async all(page = 1, pageSize = 20): Promise<PortalMessageListResponse> {
      return portalGet<PortalMessageListResponse>(
        `/api/portal/messages?page=${page}&page_size=${pageSize}`
      );
    },
    async getById(id: number): Promise<PortalMessage> {
      return portalGet<PortalMessage>(`/api/portal/messages/${id}`);
    },
    async unreadCount(): Promise<{ unread: number }> {
      return portalGet<{ unread: number }>('/api/portal/messages/unread-count');
    },
  },
```

- [ ] **Step 2: Add messages namespace to portalApiClient.ts**

```typescript
// frontend/lib/portalApiClient.ts — add PortalMessage + PortalMessageListResponse to imports:
import type {
  PortalCable,
  PortalCableCreate,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentCreate,
  PortalEquipmentUpdate,
  PortalFolder,
  PortalFolderCreate,
  PortalInquiry,
  PortalUpload,
  PortalUploadPage,
  PortalMessage,
  PortalMessageListResponse,
} from '@/lib/types/portal';

// Add the messages namespace to the portalApiClient object (after uploads):
  messages: {
    async all(page = 1, pageSize = 20): Promise<PortalMessageListResponse> {
      const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      const res = await bffFetch(`/api/portal/messages?${qs}`);
      return res.json();
    },
    async getById(id: number): Promise<PortalMessage> {
      const res = await bffFetch(`/api/portal/messages/${id}`);
      return res.json();
    },
    async unreadCount(): Promise<{ unread: number }> {
      const res = await bffFetch('/api/portal/messages/unread-count');
      return res.json();
    },
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/portalApi.ts frontend/lib/portalApiClient.ts
git commit -m "feat(messages): add portalApi.messages + portalApiClient.messages namespaces"
```

---

## Section 8: Frontend BFF Routes (Portal + Admin)

### Task 8.1: Create portal messages BFF routes (list, detail, unread-count)

**Files:**
- Create: `frontend/app/api/portal/messages/route.ts`
- Create: `frontend/app/api/portal/messages/[id]/route.ts`
- Create: `frontend/app/api/portal/messages/unread-count/route.ts`

**Interfaces:**
- Produces: Three BFF GET proxies forwarding `portal_token` cookie to backend `/api/portal/messages*`.

- [ ] **Step 1: Create the list route**

```typescript
// frontend/app/api/portal/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  const searchParams = req.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const res = await fetch(`${API_BASE}/api/portal/messages${queryString ? `?${queryString}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the detail route**

```typescript
// frontend/app/api/portal/messages/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.cookies.get('portal_token')?.value;
  const res = await fetch(`${API_BASE}/api/portal/messages/${params.id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create the unread-count route**

```typescript
// frontend/app/api/portal/messages/unread-count/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('portal_token')?.value;
  const res = await fetch(`${API_BASE}/api/portal/messages/unread-count`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/portal/messages/route.ts frontend/app/api/portal/messages/[id]/route.ts frontend/app/api/portal/messages/unread-count/route.ts
git commit -m "feat(messages): add portal messages BFF proxy routes"
```

---

### Task 8.2: Create admin recipients BFF route

**Files:**
- Create: `frontend/app/api/admin/messages/recipients/route.ts`

**Interfaces:**
- Produces: BFF GET proxy forwarding `admin_token` cookie to backend `/api/admin/messages/recipients`.

- [ ] **Step 1: Create the recipients route**

```typescript
// frontend/app/api/admin/messages/recipients/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/messages/recipients`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/messages/recipients/route.ts
git commit -m "feat(messages): add admin recipients BFF proxy route"
```

---

## Section 9: Frontend Admin — MessageForm Extension

### Task 9.1: Restructure MessageForm with broadcast/targeted/single modes

**Files:**
- Modify: `frontend/components/admin/form/MessageForm.tsx`

**Interfaces:**
- Consumes: `RecipientTarget`, `RecipientGroupValue` types (from Task 7.1), `adminApi.messages.create` (from Task 7.3)
- Produces: `MessageForm` with three modes: `broadcast` (default), `targeted` (3 group checkboxes), `single` (URL pre-fill, selector hidden).

- [ ] **Step 1: Rewrite the MessageForm component**

```tsx
// frontend/components/admin/form/MessageForm.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RecipientTarget, RecipientGroupValue } from '@/lib/types';

type Mode = 'broadcast' | 'targeted' | 'single';

const GROUP_LABELS: Record<RecipientGroupValue, string> = {
  cable_managers: 'Cable Managers',
  equipment_managers: 'Equipment Managers',
  members: 'All Members',
};

export function MessageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine mode from URL params
  const urlRecipientType = searchParams.get('recipientType');
  const urlRecipientKind = searchParams.get('recipientKind');
  const urlRecipientId = searchParams.get('recipientId');
  const urlRecipientLabel = searchParams.get('recipientLabel');

  const isSingleMode = urlRecipientType === 'targeted' && urlRecipientKind && urlRecipientId;
  const [mode, setMode] = useState<Mode>(isSingleMode ? 'single' : 'broadcast');
  const [selectedGroups, setSelectedGroups] = useState<Set<RecipientGroupValue>>(new Set());

  function toggleGroup(group: RecipientGroupValue) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function buildRecipientTargets(): RecipientTarget[] | null {
    if (mode === 'broadcast') return null;
    if (mode === 'single' && urlRecipientKind && urlRecipientId) {
      return [{ kind: urlRecipientKind as 'user' | 'member', value: urlRecipientId }];
    }
    if (mode === 'targeted') {
      return Array.from(selectedGroups).map((g) => ({ kind: 'group' as const, value: g }));
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Validation: targeted mode requires at least one group
    if (mode === 'targeted' && selectedGroups.size === 0) {
      setError('Select at least one recipient group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        body,
        recipient_type: mode === 'broadcast' ? 'broadcast' as const : 'targeted' as const,
        recipient_targets: buildRecipientTargets(),
      };
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/messages');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function clearSingleMode() {
    // "Change" link — return to broadcast mode by clearing URL params
    router.replace('/admin/messages/new');
    setMode('broadcast');
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Recipient selector — hidden in single mode */}
      {mode === 'single' ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">To:</span>{' '}
              <span className="text-sm font-medium text-gray-900">{urlRecipientLabel}</span>
            </div>
            <button
              type="button"
              onClick={clearSingleMode}
              className="text-xs text-blue-600 hover:underline"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm font-medium">Recipients</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recipient-mode"
                checked={mode === 'broadcast'}
                onChange={() => setMode('broadcast')}
              />
              Broadcast to all members
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recipient-mode"
                checked={mode === 'targeted'}
                onChange={() => setMode('targeted')}
              />
              Targeted recipients
            </label>
          </div>
          {mode === 'targeted' && (
            <div className="mt-3 space-y-2 pl-6">
              {(Object.keys(GROUP_LABELS) as RecipientGroupValue[]).map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(g)}
                    onChange={() => toggleGroup(g)}
                  />
                  {GROUP_LABELS[g]}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="msg_title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input
          id="msg_title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="msg_body" className="mb-1 block text-sm font-medium">
          Body
        </label>
        <textarea
          id="msg_body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={8}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || (mode === 'targeted' && selectedGroups.size === 0)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Publishing...' : 'Publish'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

Note: `useSearchParams` requires a Suspense boundary in Next.js 14 App Router. If the new message page doesn't already wrap the form in `<Suspense>`, the implementer should add it in the page file.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/MessageForm.tsx
git commit -m "feat(messages): restructure MessageForm with broadcast/targeted/single modes"
```

---

## Section 10: Frontend Admin — List Page Message Buttons

### Task 10.1: Add Message link to admin users list page

**Files:**
- Modify: `frontend/app/admin/(dashboard)/users/page.tsx`

**Interfaces:**
- Produces: "Message" link per user row pointing to `/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=<id>&recipientLabel=<email>`

- [ ] **Step 1: Read the existing users page to find the row action area**

Read `frontend/app/admin/(dashboard)/users/page.tsx` and locate the per-row actions (likely an "Edit" link).

- [ ] **Step 2: Add a Message link next to the Edit link**

Add a `Message` link in the row actions. The exact JSX depends on the existing structure, but the link should be:

```tsx
<Link
  href={`/admin/messages/new?recipientType=targeted&recipientKind=user&recipientId=${user.id}&recipientLabel=${encodeURIComponent(user.email)}`}
  className="text-blue-600 hover:underline"
>
  Message
</Link>
```

Place it alongside the existing "Edit" link in each row, following the same styling pattern.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/users/page.tsx
git commit -m "feat(messages): add Message link to admin users list page"
```

---

### Task 10.2: Add Message link to admin members list page

**Files:**
- Modify: `frontend/app/admin/(dashboard)/members/page.tsx`

**Interfaces:**
- Produces: "Message" link per member row pointing to `/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=<id>&recipientLabel=<email>`

- [ ] **Step 1: Read the existing members page to find the row action area**

Read `frontend/app/admin/(dashboard)/members/page.tsx` and locate the per-row actions.

- [ ] **Step 2: Add a Message link**

```tsx
<Link
  href={`/admin/messages/new?recipientType=targeted&recipientKind=member&recipientId=${member.id}&recipientLabel=${encodeURIComponent(member.email)}`}
  className="text-blue-600 hover:underline"
>
  Message
</Link>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/members/page.tsx
git commit -m "feat(messages): add Message link to admin members list page"
```

---

## Section 11: Frontend Admin — Message List/Detail Recipient Display

### Task 11.1: Add formatRecipientSummary helper

**Files:**
- Create: `frontend/lib/utils/messages.ts`

**Interfaces:**
- Consumes: `RecipientTarget` type (from Task 7.1)
- Produces: `formatRecipientSummary(targets: RecipientTarget[] | null, type: string) -> string`

- [ ] **Step 1: Create the helper file**

```typescript
// frontend/lib/utils/messages.ts
import type { RecipientTarget } from '@/lib/types';

const GROUP_LABELS: Record<string, string> = {
  cable_managers: 'Cable Managers',
  equipment_managers: 'Equipment Managers',
  members: 'All Members',
};

export function formatRecipientSummary(
  targets: RecipientTarget[] | null,
  type: string
): string {
  if (type === 'broadcast' || !targets || targets.length === 0) {
    return 'All Members';
  }
  return targets
    .map((t) => {
      if (t.kind === 'group') return GROUP_LABELS[t.value] ?? t.value;
      // For user/member, show the id (or email if available from a lookup)
      return t.value;
    })
    .join(', ');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/utils/messages.ts
git commit -m "feat(messages): add formatRecipientSummary helper"
```

---

### Task 11.2: Add recipients column to admin messages list page

**Files:**
- Modify: `frontend/app/admin/(dashboard)/messages/page.tsx`

**Interfaces:**
- Consumes: `formatRecipientSummary` (from Task 11.1), `AdminMessage` type (now includes `recipient_type` + `recipient_targets`)

- [ ] **Step 1: Read the existing messages list page**

Read `frontend/app/admin/(dashboard)/messages/page.tsx` to find the table columns.

- [ ] **Step 2: Add a Recipients column**

Add a "Recipients" column to the table header and each row. Use `formatRecipientSummary`:

```tsx
import { formatRecipientSummary } from '@/lib/utils/messages';

// In the table header:
<th className="px-4 py-2 text-left">Recipients</th>

// In each row:
<td className="px-4 py-2 text-sm text-gray-700">
  {formatRecipientSummary(msg.recipient_targets, msg.recipient_type)}
</td>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/messages/page.tsx
git commit -m "feat(messages): add recipients column to admin messages list"
```

---

### Task 11.3: Add recipient detail to admin message detail page

**Files:**
- Modify: `frontend/app/admin/(dashboard)/messages/[id]/page.tsx`

**Interfaces:**
- Consumes: `formatRecipientSummary` (from Task 11.1)

- [ ] **Step 1: Read the existing message detail page**

Read `frontend/app/admin/(dashboard)/messages/[id]/page.tsx` to find the detail layout.

- [ ] **Step 2: Add a recipient summary section**

Add a "Recipients" row in the message detail view:

```tsx
import { formatRecipientSummary } from '@/lib/utils/messages';

// In the detail layout, add after the title/body section:
<div>
  <dt className="text-sm font-medium text-gray-500">Recipients</dt>
  <dd className="mt-1 text-sm text-gray-900">
    {formatRecipientSummary(message.recipient_targets, message.recipient_type)}
  </dd>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin/(dashboard)/messages/[id]/page.tsx
git commit -m "feat(messages): add recipient detail to admin message detail page"
```

---

## Section 12: Frontend Portal — Staff Inbox

### Task 12.1: Create portal messages list page

**Files:**
- Create: `frontend/app/portal/messages/page.tsx`
- Create: `frontend/app/portal/messages/loading.tsx`

**Interfaces:**
- Consumes: `portalApi.messages.all` (from Task 7.4)
- Produces: Server component rendering message list with Title + Created + Read badge.

- [ ] **Step 1: Create the list page**

```tsx
// frontend/app/portal/messages/page.tsx
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';

export default async function PortalMessagesPage() {
  let items: { id: number; title: string; created_at: string; is_read: boolean }[] = [];
  try {
    const data = await portalApi.messages.all(1, 20);
    items = data.items;
  } catch {
    // empty state
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Messages</h1>
      {items.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No messages yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((msg) => (
            <Link
              key={msg.id}
              href={`/portal/messages/${msg.id}`}
              className="block rounded-lg bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm ${msg.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                  {msg.title}
                </span>
                <span className="text-xs text-gray-400">
                  {msg.created_at ? new Date(msg.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              {!msg.is_read && (
                <span className="mt-1 inline-block rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  New
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the loading skeleton**

```tsx
// frontend/app/portal/messages/loading.tsx
export default function Loading() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Messages</h1>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-white p-4 shadow-sm">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-1/4 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/portal/messages/page.tsx frontend/app/portal/messages/loading.tsx
git commit -m "feat(messages): add portal messages list page + loading skeleton"
```

---

### Task 12.2: Create portal message detail page

**Files:**
- Create: `frontend/app/portal/messages/[id]/page.tsx`

**Interfaces:**
- Consumes: `portalApi.messages.getById` (from Task 7.4)
- Produces: Server component rendering message title + body + created_at; backend auto-marks read.

- [ ] **Step 1: Create the detail page**

```tsx
// frontend/app/portal/messages/[id]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';

export default async function PortalMessageDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let message;
  try {
    message = await portalApi.messages.getById(Number(params.id));
  } catch {
    notFound();
  }
  return (
    <div>
      <Link
        href="/portal/messages"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        &larr; Back to Messages
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">{message.title}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {message.created_at ? new Date(message.created_at).toLocaleString() : ''}
      </p>
      <div className="prose max-w-none whitespace-pre-wrap text-sm text-gray-800">
        {message.body}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/portal/messages/[id]/page.tsx
git commit -m "feat(messages): add portal message detail page"
```

---

### Task 12.3: Create PortalMessagesUnreadBadge client component

**Files:**
- Create: `frontend/components/portal/PortalMessagesUnreadBadge.tsx`

**Interfaces:**
- Produces: Client component fetching `/api/portal/messages/unread-count` on mount, renders red pill badge. Mirrors existing `frontend/components/member/MessagesUnreadBadge.tsx`.

- [ ] **Step 1: Create the badge component**

```tsx
// frontend/components/portal/PortalMessagesUnreadBadge.tsx
'use client';

import { useEffect, useState } from 'react';

export function PortalMessagesUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/portal/messages/unread-count')
      .then((res) => (res.ok ? res.json() : { unread: 0 }))
      .then((data) => setCount(data.unread || 0))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <span
      className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white"
      style={{ height: '1rem' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/portal/PortalMessagesUnreadBadge.tsx
git commit -m "feat(messages): add PortalMessagesUnreadBadge client component"
```

---

### Task 12.4: Add Messages link to portal sidebar

**Files:**
- Modify: `frontend/components/portal/layout/PortalSidebar.tsx`

**Interfaces:**
- Consumes: `PortalMessagesUnreadBadge` (from Task 12.3)
- Produces: "Messages" nav item added to both `MANUFACTURER_NAV` and `EQUIPMENT_MANUFACTURER_NAV` arrays, between "Inquiries" and "Media".

- [ ] **Step 1: Add the Messages nav item and badge**

```tsx
// frontend/components/portal/layout/PortalSidebar.tsx — add Megaphone to lucide-react imports:
import {
  LayoutDashboard, Cable, Wrench, Mail, Image as ImageIcon, Megaphone,
  Settings, LogOut, ExternalLink, type LucideIcon,
} from 'lucide-react';

// Add PortalMessagesUnreadBadge import:
import { PortalMessagesUnreadBadge } from '@/components/portal/PortalMessagesUnreadBadge';

// Add Messages nav item to MANUFACTURER_NAV (between Inquiries and Media):
const MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Cables', href: '/portal/cables', icon: Cable, module: 'cables' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Messages', href: '/portal/messages', icon: Megaphone, module: 'messages' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];

// Add Messages nav item to EQUIPMENT_MANUFACTURER_NAV (between Inquiries and Media):
const EQUIPMENT_MANUFACTURER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Equipment', href: '/portal/equipment', icon: Wrench, module: 'equipment' },
  { label: 'Inquiries', href: '/portal/inquiries', icon: Mail, module: 'inquiries' },
  { label: 'Messages', href: '/portal/messages', icon: Megaphone, module: 'messages' },
  { label: 'Media', href: '/portal/media', icon: ImageIcon, module: 'media' },
  { label: 'Settings', href: '/portal/settings', icon: Settings, module: 'me' },
];
```

- [ ] **Step 2: Render the unread badge in the sidebar**

In the `nav.map` rendering, add the badge for the `messages` module (mirroring the existing `inquiries` badge pattern):

```tsx
// Inside the nav.map callback, after the inquiries badge condition:
{item.module === 'messages' && <PortalMessagesUnreadBadge />}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/portal/layout/PortalSidebar.tsx
git commit -m "feat(messages): add Messages link + unread badge to portal sidebar"
```

---

## Section 13: Verification

### Task 13.1: Run TypeScript type check

**Files:** None (verification only)

- [ ] **Step 1: Run tsc**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: 0 errors. If errors appear, fix them before proceeding.

---

### Task 13.2: Run backend test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `docker compose --env-file .env.docker exec backend pytest -v`
Expected: all tests pass, including the new `test_admin_messages.py`, `test_portal_messages.py`, `test_member_messages.py`, and `test_system_message.py` tests.

---

### Task 13.3: Run Next.js build

**Files:** None (verification only)

- [ ] **Step 1: Run next build**

Run: `cd frontend && npm run build`
Expected: all routes compile successfully, no type errors, no build failures.

---

### Task 13.4: Manual smoke test — broadcast message

**Files:** None (manual verification)

- [ ] **Step 1: Send a broadcast message and verify member sees it**

1. Log in as admin (`/admin/login`).
2. Navigate to `/admin/messages/new`.
3. Leave recipient type as "Broadcast to all members".
4. Enter title + body, click Publish.
5. Log in as a member (`/member/login`).
6. Verify the message appears in `/member/messages`.

---

### Task 13.5: Manual smoke test — targeted message to cable managers group

**Files:** None (manual verification)

- [ ] **Step 1: Send a targeted message and verify cable manager sees it**

1. Log in as admin.
2. Navigate to `/admin/messages/new`.
3. Select "Targeted recipients", check "Cable Managers".
4. Enter title + body, click Publish.
5. Log in as cable manager (`/portal/login` with `cable_manager@test.com`).
6. Verify the message appears in `/portal/messages`.
7. Log in as equipment manager (`equip_manager@test.com`).
8. Verify the message does NOT appear in `/portal/messages`.

---

### Task 13.6: Manual smoke test — single message to a user

**Files:** None (manual verification)

- [ ] **Step 1: Click Message on a user row and send**

1. Log in as admin.
2. Navigate to `/admin/users`.
3. Click "Message" on a cable manager user row.
4. Verify the form shows "To: <email>" with the recipient pre-filled.
5. Enter title + body, click Publish.
6. Log in as that user via portal.
7. Verify the message appears in `/portal/messages`.

---

### Task 13.7: Manual smoke test — single message to a member

**Files:** None (manual verification)

- [ ] **Step 1: Click Message on a member row and send**

1. Log in as admin.
2. Navigate to `/admin/members`.
3. Click "Message" on a member row.
4. Verify the form shows "To: <email>" with the recipient pre-filled.
5. Enter title + body, click Publish.
6. Log in as that member.
7. Verify the message appears in `/member/messages`.

---

### Task 13.8: Manual smoke test — portal sidebar unread badge

**Files:** None (manual verification)

- [ ] **Step 1: Verify unread badge updates**

1. Log in as cable manager via portal.
2. Note the current unread count badge on "Messages" in the sidebar.
3. Log in as admin, send a new targeted message to cable_managers group.
4. Log back in as cable manager (or refresh the portal).
5. Verify the unread badge count increased.
6. Open the new message.
7. Navigate back to the portal dashboard or another page.
8. Verify the unread badge count decreased.

---

## Summary

This plan covers all 13 task groups from `openspec/changes/admin-targeted-messaging/tasks.md`:

| Section | Tasks | Key Deliverables |
|---------|-------|-----------------|
| 1. Backend Model + Migration | 1.1–1.4 | `recipient_type` + `recipient_targets` columns, `SystemMessageUserRead` table, Alembic migration |
| 2. Backend Schema | 2.1–2.4 | `RecipientTarget`, extended `MessageCreate`/`AdminMessageRead`, recipient list + portal response schemas |
| 3. Backend CRUD | 3.1–3.7 | `create_message`, `list_recipients_by_group`, `list_for_staff_user`, `get_for_staff_user`, `unread_count_for_staff_user`, `mark_read_for_user`, extended `list_for_member` |
| 4. Backend Admin Routes | 4.1–4.3 | Extended POST, new `/recipients` endpoint (before `/{message_id}`), recipient field echo |
| 5. Backend Portal Routes | 5.1–5.3 | `messages` in factory scopes, `portal_messages.py`, router registration |
| 6. Backend Tests | 6.1–6.8 | Admin POST/GET tests, portal inbox tests, member inbox tests, CRUD tests |
| 7. Frontend Types + API | 7.1–7.4 | RecipientTarget types, portal message types, adminApi + portalApi extensions |
| 8. Frontend BFF Routes | 8.1–8.2 | Portal messages BFF proxies, admin recipients BFF proxy |
| 9. MessageForm Extension | 9.1 | Broadcast/targeted/single modes with URL pre-fill |
| 10. List Page Message Buttons | 10.1–10.2 | Message links on admin users + members list pages |
| 11. Recipient Display | 11.1–11.3 | `formatRecipientSummary` helper, list column, detail section |
| 12. Portal Staff Inbox | 12.1–12.4 | Portal messages list/detail pages, unread badge, sidebar link |
| 13. Verification | 13.1–13.8 | tsc, pytest, next build, 5 manual smoke tests |
