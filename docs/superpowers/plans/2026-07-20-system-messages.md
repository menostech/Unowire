# System Message Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-side message broadcast + member-side read tracking with unread badge, gated by a new `messages` RBAC module, accessible via a new "Messages" menu item under the Settings group.

**Architecture:** Two new tables (`system_messages`, `system_message_reads`). Admin routes under `/api/admin/messages` gated by `require_module("messages")`. Member endpoints added to the existing `/api/member` router. Member-side pages at `/member/messages` with an unread badge in the sidebar. No email notifications; no edit; admin can only create + delete; broadcasts go to all active members.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Pydantic v2 + Alembic (backend); Next.js 15 App Router + Tailwind (frontend); pytest (tests).

---

## File Structure

### New Backend Files
- `backend/app/models/system_message.py` — `SystemMessage`, `SystemMessageRead` models
- `backend/app/schemas/system_message.py` — Pydantic schemas
- `backend/app/crud/system_message.py` — CRUD singleton
- `backend/app/api/routes/admin_messages.py` — admin router (4 endpoints)
- `backend/alembic/versions/f1a2b3c4d5e6_add_system_messages.py` — migration
- `backend/tests/api/test_admin_messages.py` — admin integration tests
- `backend/tests/api/test_member_messages.py` — member integration tests

### Modified Backend Files
- `backend/app/models/__init__.py` — export new models
- `backend/app/core/modules.py` — add `messages` module entry
- `backend/app/crud/menu.py` — add `"messages"` to `ALLOWED_PAGE_IDS`
- `backend/app/api/routes/member.py` — add 3 member endpoints (list, unread-count, get-by-id)
- `backend/app/main.py` — import + include `admin_messages` router

### New Frontend Files
- `frontend/app/admin/(dashboard)/messages/page.tsx` — admin list page
- `frontend/app/admin/(dashboard)/messages/new/page.tsx` — admin create page
- `frontend/app/admin/(dashboard)/messages/[id]/page.tsx` — admin detail page
- `frontend/components/admin/form/MessageForm.tsx` — client form
- `frontend/components/admin/MessageActions.tsx` — delete button
- `frontend/app/(site)/member/messages/page.tsx` — member list
- `frontend/app/(site)/member/messages/[id]/page.tsx` — member detail
- `frontend/components/member/MessagesUnreadBadge.tsx` — sidebar badge

### Modified Frontend Files
- `frontend/lib/adminModules.ts` — add `messages` module
- `frontend/lib/adminMenuRegistry.ts` — add `messages` page entry
- `frontend/lib/adminApi.ts` — add `messages` namespace
- `frontend/lib/types.ts` — add `SystemMessage` + related interfaces
- `frontend/components/admin/layout/AdminSidebar.tsx` — add `Megaphone` icon
- `frontend/app/(site)/member/layout.tsx` — add Messages nav link + badge

---

### Task 1: Backend Models + Alembic Migration + RBAC Module Registration

**Files:**
- Create: `backend/app/models/system_message.py`
- Create: `backend/alembic/versions/f1a2b3c4d5e6_add_system_messages.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/core/modules.py`
- Modify: `backend/app/crud/menu.py`

- [ ] **Step 1: Create the SystemMessage + SystemMessageRead models**

Create `backend/app/models/system_message.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemMessage(Base):
    __tablename__ = "system_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SystemMessageRead(Base):
    __tablename__ = "system_message_reads"

    member_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("members.id", ondelete="CASCADE"),
        primary_key=True,
    )
    message_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("system_messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    read_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    __table_args__ = (
        Index("ix_system_message_reads_message_id", "message_id"),
    )
```

- [ ] **Step 2: Register models in `__init__.py`**

Modify `backend/app/models/__init__.py`:

Add to the imports block (alphabetical order — after `site_menu` if present, or wherever `system_message` fits):

```python
from app.models.system_message import SystemMessage, SystemMessageRead
```

Add both names to the `__all__` list in alphabetical order. `SystemMessage` goes after `SpecItem` (or wherever fits alphabetically); `SystemMessageRead` immediately after.

- [ ] **Step 3: Register the `messages` module in `ADMIN_MODULES`**

Modify `backend/app/core/modules.py`. Add a new entry to the `ADMIN_MODULES` list (after the `pages` entry):

```python
    {"id": "messages",         "label": "Messages",         "scope_aware": False, "scope_type": None},
```

- [ ] **Step 4: Add `messages` to `ALLOWED_PAGE_IDS`**

Modify `backend/app/crud/menu.py`. Add `"messages"` to the `ALLOWED_PAGE_IDS` set (after `"members"`):

```python
ALLOWED_PAGE_IDS = {
    "dashboard",
    "cables",
    "brands",
    "manufacturers",
    "industries",
    "equipment-mfrs",
    "equipment-cats",
    "equipment-list",
    "media",
    "menu-config",
    "users",
    "roles",
    "inquiries",
    "email_config",
    "members",
    "messages",
}
```

- [ ] **Step 5: Create the Alembic migration**

Create `backend/alembic/versions/f1a2b3c4d5e6_add_system_messages.py`:

```python
"""add system_messages tables and menu item

Revision ID: f1a2b3c4d5e6
Revises: <LATEST_REVISION_ON_CURRENT_BRANCH>
Create Date: 2026-07-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: str | None = '<LATEST_REVISION_ON_CURRENT_BRANCH>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. system_messages table
    op.create_table(
        'system_messages',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['created_by'], ['users.id'], ondelete='SET NULL',
            name='fk_system_messages_created_by_users',
        ),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. system_message_reads join table
    op.create_table(
        'system_message_reads',
        sa.Column('member_id', sa.BigInteger(), nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ['member_id'], ['members.id'], ondelete='CASCADE',
            name='fk_system_message_reads_member_id_members',
        ),
        sa.ForeignKeyConstraint(
            ['message_id'], ['system_messages.id'], ondelete='CASCADE',
            name='fk_system_message_reads_message_id_system_messages',
        ),
        sa.PrimaryKeyConstraint('member_id', 'message_id'),
    )
    op.create_index(
        'ix_system_message_reads_message_id',
        'system_message_reads',
        ['message_id'],
    )

    # 3. Seed 'Messages' menu item under settings group (sort_order=7)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-messages', 'settings', 'page', 'messages', NULL, 'Messages', 'Megaphone', 7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # 4. Grant admin role access to messages module
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'messages')
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module = 'messages'")
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-messages'")
    op.drop_index('ix_system_message_reads_message_id', table_name='system_message_reads')
    op.drop_table('system_message_reads')
    op.drop_table('system_messages')
```

**IMPORTANT before running:** Find the latest revision on the current branch by running `cd backend && alembic heads` (or read `alembic/versions/` to find the file with the highest `Create Date` matching today's session). Replace `<LATEST_REVISION_ON_CURRENT_BRANCH>` with that revision ID.

- [ ] **Step 6: Run the migration**

Run from `d:\projects\unowire\backend`:
```
docker compose --env-file ../.env.docker exec backend alembic upgrade head
```

Expected: `INFO [alembic.runtime.migration] Running upgrade <prev> -> f1a2b3c4d5e6, add system_messages tables and menu item`

Verify the tables exist:
```
docker compose --env-file ../.env.docker exec db psql -U unowire -d unowire -c "\dt system_messages"
docker compose --env-file ../.env.docker exec db psql -U unowire -d unowire -c "\dt system_message_reads"
```

Both should show the table name.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/system_message.py backend/app/models/__init__.py backend/app/core/modules.py backend/app/crud/menu.py backend/alembic/versions/f1a2b3c4d5e6_add_system_messages.py
git commit -m "feat(messages): add models, migration, and RBAC module registration"
```

---

### Task 2: Backend Schemas + CRUD

**Files:**
- Create: `backend/app/schemas/system_message.py`
- Create: `backend/app/crud/system_message.py`

- [ ] **Step 1: Create Pydantic schemas**

Create `backend/app/schemas/system_message.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)


class AdminMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_by: int
    created_by_email: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    items: list[AdminMessageRead]
    total: int
    page: int
    page_size: int


class MemberMessageRead(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime
    is_read: bool

    model_config = {"from_attributes": True}


class MemberMessageListResponse(BaseModel):
    items: list[MemberMessageRead]
    total: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    unread: int
```

- [ ] **Step 2: Create CRUD module**

Create `backend/app/crud/system_message.py`:

```python
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.system_message import SystemMessage, SystemMessageRead
from app.models.user import User
from app.schemas.system_message import MessageCreate


class CRUDSystemMessage(
    CRUDBase[SystemMessage, MessageCreate, MessageCreate]
):
    async def list_for_admin(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, str | None]], int]:
        """Return (items, total) where items are (message, publisher_email) tuples."""
        # Total count
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage)
        )
        total = total_result.scalar() or 0

        # Paginated items with publisher email
        offset = (page - 1) * page_size
        stmt = (
            select(SystemMessage, User.email)
            .outerjoin(User, SystemMessage.created_by == User.id)
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1]) for row in result.all()]
        return items, total

    async def get_for_admin(
        self, db: AsyncSession, message_id: int
    ) -> tuple[SystemMessage, str | None] | None:
        stmt = (
            select(SystemMessage, User.email)
            .outerjoin(User, SystemMessage.created_by == User.id)
            .where(SystemMessage.id == message_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1])

    async def create_message(
        self, db: AsyncSession, *, obj_in: MessageCreate, created_by: int
    ) -> SystemMessage:
        data = obj_in.model_dump()
        db_obj = SystemMessage(created_by=created_by, **data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete_message(self, db: AsyncSession, message_id: int) -> bool:
        msg = await self.get(db, message_id)
        if msg is None:
            return False
        await db.delete(msg)
        await db.commit()
        return True

    async def list_for_member(
        self,
        db: AsyncSession,
        *,
        member_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[tuple[SystemMessage, bool]], int]:
        """Return (items, total) where items are (message, is_read) tuples."""
        total_result = await db.execute(
            select(func.count()).select_from(SystemMessage)
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
            .order_by(SystemMessage.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        items = [(row[0], row[1] is not None) for row in result.all()]
        return items, total

    async def unread_count_for_member(
        self, db: AsyncSession, member_id: int
    ) -> int:
        """Count messages where no read row exists for this member."""
        stmt = (
            select(func.count())
            .select_from(SystemMessage)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .where(SystemMessageRead.member_id.is_(None))
        )
        result = await db.execute(stmt)
        return result.scalar() or 0

    async def get_for_member(
        self, db: AsyncSession, *, member_id: int, message_id: int
    ) -> tuple[SystemMessage, bool] | None:
        """Get a message for a member. Returns (message, is_read) or None."""
        stmt = (
            select(SystemMessage, SystemMessageRead.member_id)
            .outerjoin(
                SystemMessageRead,
                and_(
                    SystemMessageRead.message_id == SystemMessage.id,
                    SystemMessageRead.member_id == member_id,
                ),
            )
            .where(SystemMessage.id == message_id)
        )
        result = await db.execute(stmt)
        row = result.first()
        if row is None:
            return None
        return (row[0], row[1] is not None)

    async def mark_read(
        self, db: AsyncSession, *, member_id: int, message_id: int
    ) -> None:
        """Idempotently mark a message as read by a member."""
        existing = await db.execute(
            select(SystemMessageRead).where(
                SystemMessageRead.member_id == member_id,
                SystemMessageRead.message_id == message_id,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(
                SystemMessageRead(
                    member_id=member_id,
                    message_id=message_id,
                    read_at=datetime.utcnow(),
                )
            )
            await db.commit()


crud_system_message = CRUDSystemMessage(SystemMessage)
```

- [ ] **Step 3: Verify imports work**

Run from `d:\projects\unowire\backend`:
```
docker compose --env-file ../.env.docker exec backend python -c "from app.crud.system_message import crud_system_message; from app.schemas.system_message import MessageCreate, AdminMessageRead, MemberMessageRead; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/system_message.py backend/app/crud/system_message.py
git commit -m "feat(messages): add Pydantic schemas and CRUD module"
```

---

### Task 3: Backend Admin Routes + Tests

**Files:**
- Create: `backend/app/api/routes/admin_messages.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/api/test_admin_messages.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_admin_messages.py`:

```python
"""Tests for admin system message endpoints."""


def test_list_messages_requires_auth(client):
    res = client.get("/api/admin/messages")
    assert res.status_code == 401


def test_list_messages_returns_all(client, admin_headers):
    # Create a message first
    client.post(
        "/api/admin/messages",
        json={"title": "Test Message", "body": "Hello members"},
        headers=admin_headers,
    )
    res = client.get("/api/admin/messages", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    last = data["items"][0]
    assert last["title"] == "Test Message"
    assert last["body"] == "Hello members"
    assert "created_by_email" in last


def test_get_message_by_id(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "Get Me", "body": "Body content"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["id"] == msg_id
    assert res.json()["title"] == "Get Me"


def test_get_message_not_found(client, admin_headers):
    res = client.get("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404


def test_create_message(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "New Message", "body": "Body text"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    assert res.json()["id"] > 0
    assert res.json()["title"] == "New Message"
    # Cleanup
    client.delete(f"/api/admin/messages/{res.json()['id']}", headers=admin_headers)


def test_create_message_invalid_payload(client, admin_headers):
    res = client.post(
        "/api/admin/messages",
        json={"title": "", "body": ""},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_delete_message(client, admin_headers):
    create_res = client.post(
        "/api/admin/messages",
        json={"title": "To Delete", "body": "Bye"},
        headers=admin_headers,
    )
    msg_id = create_res.json()["id"]
    res = client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert res.status_code == 204
    # Verify gone
    get_res = client.get(f"/api/admin/messages/{msg_id}", headers=admin_headers)
    assert get_res.status_code == 404


def test_delete_message_not_found(client, admin_headers):
    res = client.delete("/api/admin/messages/999999", headers=admin_headers)
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `d:\projects\unowire\backend`:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_admin_messages.py -v
```

Expected: All tests FAIL with 404 (route does not exist yet) or import errors. The errors confirm tests are wired up.

- [ ] **Step 3: Create the admin router**

Create `backend/app/api/routes/admin_messages.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.crud.system_message import crud_system_message
from app.models.user import User
from app.schemas.system_message import (
    AdminMessageRead,
    MessageCreate,
    MessageListResponse,
)

router = APIRouter(prefix="/api/admin/messages", tags=["admin-messages"])


def _to_admin_read(msg, publisher_email: str | None) -> AdminMessageRead:
    return AdminMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_by=msg.created_by,
        created_by_email=publisher_email,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
    )


@router.get("", response_model=MessageListResponse)
async def list_messages(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await crud_system_message.list_for_admin(
        db, page=page, page_size=page_size
    )
    return MessageListResponse(
        items=[_to_admin_read(m, email) for m, email in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{message_id}", response_model=AdminMessageRead)
async def get_message(
    message_id: int,
    user: User = Depends(require_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    result = await crud_system_message.get_for_admin(db, message_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, email = result
    return _to_admin_read(msg, email)


@router.post("", response_model=AdminMessageRead, status_code=201)
async def create_message(
    body: MessageCreate,
    user: User = Depends(require_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    msg = await crud_system_message.create_message(
        db, obj_in=body, created_by=user.id
    )
    return _to_admin_read(msg, user.email)


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    user: User = Depends(require_module("messages")),
    db: AsyncSession = Depends(get_db),
):
    deleted = await crud_system_message.delete_message(db, message_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    return None
```

- [ ] **Step 4: Register the router in `main.py`**

Modify `backend/app/main.py`:

Find the import line (around line 12):
```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members
```

Add `admin_messages` to the import (alphabetical order — after `admin_members`):

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, pages, product_types, taxonomy, uploads, site_menu, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members, admin_messages
```

Find the router registration block (around lines 95-107) and add (after `app.include_router(admin_members.router)`):

```python
app.include_router(admin_messages.router)
```

- [ ] **Step 5: Restart backend and run tests**

Restart:
```
docker compose --env-file ../.env.docker restart backend
```

Wait for health:
```
docker compose --env-file ../.env.docker exec backend wget -qO- http://localhost:8000/api/health
```

Run tests:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_admin_messages.py -v
```

Expected: All 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/admin_messages.py backend/app/main.py backend/tests/api/test_admin_messages.py
git commit -m "feat(messages): add admin CRUD routes with tests"
```

---

### Task 4: Backend Member Routes + Tests

**Files:**
- Modify: `backend/app/api/routes/member.py`
- Create: `backend/tests/api/test_member_messages.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_member_messages.py`:

```python
"""Tests for member system message endpoints."""
import asyncio

from app.core.database import async_session
from app.models.member import Member
from sqlalchemy import select


def _register_and_verify_member(client, email: str) -> dict:
    """Register + verify a member, return Authorization headers."""
    client.post(
        "/api/member/register",
        json={
            "email": email,
            "password": "password123",
            "name": email.split("@")[0],
        },
    )

    async def get_token():
        async with async_session() as db:
            result = await db.execute(select(Member).where(Member.email == email))
            m = result.scalar_one()
            return m.verification_token

    token = asyncio.run(get_token())
    client.post("/api/member/verify", json={"token": token})
    client.post("/api/member/login", json={"email": email, "password": "password123"})
    member_token = client.cookies.get("member_token")
    return {"Authorization": f"Bearer {member_token}"}


def _create_message_as_admin(client, admin_headers, title: str, body: str) -> int:
    res = client.post(
        "/api/admin/messages",
        json={"title": title, "body": body},
        headers=admin_headers,
    )
    return res.json()["id"]


def test_member_list_messages_requires_auth(client):
    res = client.get("/api/member/messages")
    assert res.status_code == 401


def test_member_list_messages(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-list@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "List Title", "Body"
    )
    res = client.get("/api/member/messages", headers=member_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert any(m["id"] == msg_id for m in data["items"])
    # New message should be unread
    item = next(m for m in data["items"] if m["id"] == msg_id)
    assert item["is_read"] is False
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_unread_count_initial(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-cnt@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Count Msg", "Body"
    )
    res = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    )
    assert res.status_code == 200
    assert res.json()["unread"] >= 1
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_marks_read(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-read@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Read Me", "Body"
    )
    # Initially unread
    res_count_before = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    ).json()["unread"]
    # View detail
    res = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res.status_code == 200
    assert res.json()["is_read"] is True  # Response shows it's read
    # After view, unread count decreases
    res_count_after = client.get(
        "/api/member/messages/unread-count", headers=member_headers
    ).json()["unread"]
    assert res_count_after == res_count_before - 1
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_idempotent(client, admin_headers):
    """Second GET on the same message does not error and stays read."""
    member_headers = _register_and_verify_member(
        client, "msg-idem@test-member.com"
    )
    msg_id = _create_message_as_admin(
        client, admin_headers, "Idempotent", "Body"
    )
    # First view
    res1 = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res1.status_code == 200
    # Second view
    res2 = client.get(
        f"/api/member/messages/{msg_id}", headers=member_headers
    )
    assert res2.status_code == 200
    assert res2.json()["is_read"] is True
    # Cleanup
    client.delete(f"/api/admin/messages/{msg_id}", headers=admin_headers)


def test_member_get_message_not_found(client, admin_headers):
    member_headers = _register_and_verify_member(
        client, "msg-404@test-member.com"
    )
    res = client.get(
        "/api/member/messages/999999", headers=member_headers
    )
    assert res.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `d:\projects\unowire\backend`:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_member_messages.py -v
```

Expected: All tests FAIL with 404 (endpoints do not exist yet).

- [ ] **Step 3: Add member endpoints to `member.py`**

Modify `backend/app/api/routes/member.py`. At the top of the file, add to imports (after the existing inquiry imports):

```python
from app.crud.system_message import crud_system_message
from app.schemas.system_message import (
    MemberMessageListResponse,
    MemberMessageRead,
    UnreadCountResponse,
)
from app.schemas.system_message import MessageCreate  # noqa: F401 (only for type hint)
```

Actually, `MessageCreate` is only used by admin routes — drop that line. The final import addition is:

```python
from app.crud.system_message import crud_system_message
from app.schemas.system_message import (
    MemberMessageListResponse,
    MemberMessageRead,
    UnreadCountResponse,
)
```

Add at the END of the file (after the existing inquiry endpoints):

```python
# --- System message endpoints (member-side) ---

@router.get("/messages", response_model=MemberMessageListResponse)
async def list_my_messages(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    items, total = await crud_system_message.list_for_member(
        db, member_id=member.id, page=page, page_size=page_size
    )
    return MemberMessageListResponse(
        items=[
            MemberMessageRead(
                id=msg.id,
                title=msg.title,
                body=msg.body,
                created_at=msg.created_at,
                is_read=is_read,
            )
            for msg, is_read in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/messages/unread-count", response_model=UnreadCountResponse)
async def my_messages_unread_count(
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    count = await crud_system_message.unread_count_for_member(db, member.id)
    return UnreadCountResponse(unread=count)


@router.get("/messages/{message_id}", response_model=MemberMessageRead)
async def get_my_message(
    message_id: int,
    member: Member = Depends(get_current_member),
    db: AsyncSession = Depends(get_db),
):
    result = await crud_system_message.get_for_member(
        db, member_id=member.id, message_id=message_id
    )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": 404, "message": "Message not found"},
        )
    msg, is_read = result
    # Mark as read on first view (idempotent)
    if not is_read:
        await crud_system_message.mark_read(
            db, member_id=member.id, message_id=message_id
        )
    return MemberMessageRead(
        id=msg.id,
        title=msg.title,
        body=msg.body,
        created_at=msg.created_at,
        is_read=True,
    )
```

**IMPORTANT route ordering:** The two routes `/messages/unread-count` and `/messages/{message_id}` could conflict. FastAPI matches routes in declaration order. Since `/messages/unread-count` is declared BEFORE `/messages/{message_id}`, requests to `/messages/unread-count` will hit the first handler, not the path-param handler. Ensure the `unread-count` route is declared before the `{message_id}` route in the file.

- [ ] **Step 4: Restart backend and run tests**

Restart:
```
docker compose --env-file ../.env.docker restart backend
```

Run tests:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_member_messages.py -v
```

Expected: All 6 tests PASS.

Also run admin tests to ensure no regression:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_admin_messages.py tests/api/test_member_messages.py -v
```

Expected: 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/member.py backend/tests/api/test_member_messages.py
git commit -m "feat(messages): add member read endpoints with tests"
```

---

### Task 5: Frontend Types + adminApi Namespace + Admin Module Mirror

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/adminApi.ts`
- Modify: `frontend/lib/adminModules.ts`
- Modify: `frontend/lib/adminMenuRegistry.ts`
- Modify: `frontend/components/admin/layout/AdminSidebar.tsx`

- [ ] **Step 1: Add types to `frontend/lib/types.ts`**

Append at the END of the file (after `EquipmentListResponse`):

```typescript

// === System Messages ===
export interface AdminMessage {
  id: number;
  title: string;
  body: string;
  created_by: number;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminMessageListResponse {
  items: AdminMessage[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemberMessage {
  id: number;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

export interface MemberMessageListResponse {
  items: MemberMessage[];
  total: number;
  page: number;
  page_size: number;
}

export interface UnreadCount {
  unread: number;
}
```

- [ ] **Step 2: Add `messages` namespace to `adminApi.ts`**

Modify `frontend/lib/adminApi.ts`. Find the imports block at the top and add the new types to the import:

```typescript
import type { Manufacturer, Brand, Cable, MenuItem, MenuItemTree, Role, AdminUserExtended, UserPermissions, ScopeOption, AdminMember, Page, PageListItem, SiteMenuItem, AdminMessage, AdminMessageListResponse } from './types';
```

Find the existing `members:` namespace in the `adminApi` object (around line 791) and add a new `messages:` namespace immediately after the `members:` block closes (i.e., after the `remove` method ends):

```typescript
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
    async create(payload: { title: string; body: string }): Promise<AdminMessage> {
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

- [ ] **Step 3: Mirror `messages` module in `adminModules.ts`**

Modify `frontend/lib/adminModules.ts`. Add a new entry to `ADMIN_MODULES` (after `pages`):

```typescript
  { id: "messages",     label: "Messages",      scopeAware: false, scopeType: null },
```

- [ ] **Step 4: Add `messages` page to `adminMenuRegistry.ts`**

Modify `frontend/lib/adminMenuRegistry.ts`. Add a new entry to `ADMIN_PAGES` (after `site-menu`):

```typescript
  { pageId: "messages",   href: "/admin/messages",                      defaultLabel: "Messages",      defaultIcon: "Megaphone" },
```

- [ ] **Step 5: Add `Megaphone` icon to `AdminSidebar.tsx`**

Modify `frontend/components/admin/layout/AdminSidebar.tsx`. In the lucide-react import (lines 6-12), add `Megaphone`:

```typescript
import {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image,
  Wrench, Settings, ExternalLink, LogOut, Circle,
  ChevronDown, ChevronRight, Users, Shield, Menu,
  Mail, FileText, List, Megaphone,
  type LucideIcon,
} from 'lucide-react';
```

In the `FALLBACK_ICONS` map (lines 18-20), add `Megaphone`:

```typescript
const FALLBACK_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Cable, Tag, Factory, FolderOpen, Image, Wrench, Settings,
  Users, Shield, Menu, Mail, FileText, List, Megaphone,
};
```

- [ ] **Step 6: Verify frontend typechecks**

Run from `d:\projects\unowire`:
```
docker compose --env-file .env.docker exec frontend npx tsc --noEmit
```

Expected: 0 new errors (8 pre-existing baseline allowed).

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/adminApi.ts frontend/lib/adminModules.ts frontend/lib/adminMenuRegistry.ts frontend/components/admin/layout/AdminSidebar.tsx
git commit -m "feat(messages): add frontend types, API namespace, module mirror, and icon"
```

---

### Task 6: Frontend Admin Pages (List + New + Detail + Components)

**Files:**
- Create: `frontend/app/admin/(dashboard)/messages/page.tsx`
- Create: `frontend/app/admin/(dashboard)/messages/new/page.tsx`
- Create: `frontend/app/admin/(dashboard)/messages/[id]/page.tsx`
- Create: `frontend/components/admin/form/MessageForm.tsx`
- Create: `frontend/components/admin/MessageActions.tsx`

- [ ] **Step 1: Create the admin list page**

Create `frontend/app/admin/(dashboard)/messages/page.tsx`:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function AdminMessagesPage() {
  const data = await adminApi.messages.all(1, 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Link
          href="/admin/messages/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Message
        </Link>
      </div>

      {data.items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No messages yet. Click &quot;New Message&quot; to broadcast.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Publisher</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-gray-600">#{m.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/messages/${m.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.created_by_email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/messages/${m.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the admin new-message page (server shell)**

Create `frontend/app/admin/(dashboard)/messages/new/page.tsx`:

```tsx
import Link from 'next/link';
import { MessageForm } from '@/components/admin/form/MessageForm';

export default function NewMessagePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Message</h1>
        <Link
          href="/admin/messages"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to list
        </Link>
      </div>
      <MessageForm />
    </div>
  );
}
```

- [ ] **Step 3: Create the `MessageForm` client component**

Create `frontend/components/admin/form/MessageForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function MessageForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
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

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
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
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
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

- [ ] **Step 4: Create the admin detail page**

Create `frontend/app/admin/(dashboard)/messages/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { MessageActions } from '@/components/admin/MessageActions';

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const message = await adminApi.messages.getById(parseInt(id));
  if (!message) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{message.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Published by {message.created_by_email ?? 'Unknown'} on{' '}
          {new Date(message.created_at).toLocaleString()}
        </p>
      </div>
      <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
        {message.body}
      </div>
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Actions</h2>
        <MessageActions messageId={message.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the `MessageActions` client component (delete)**

Create `frontend/components/admin/MessageActions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MessageActions({ messageId }: { messageId: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/messages');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">
          Are you sure? This will permanently delete the message for all members.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Yes, delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
    >
      Delete Message
    </button>
  );
}
```

- [ ] **Step 6: Build frontend to verify**

Run from `d:\projects\unowire`:
```
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds.

- [ ] **Step 7: Restart frontend and smoke-test**

```
docker compose --env-file .env.docker up -d frontend
```

Wait ~15s, then:
```
curl -sI http://localhost:3000/admin/messages | head -1
curl -sI http://localhost:3000/admin/messages/new | head -1
```

Expected: `HTTP/1.1 200` (or 307 redirect to login if not authenticated — both are healthy).

- [ ] **Step 8: Commit**

```bash
git add "frontend/app/admin/(dashboard)/messages/" frontend/components/admin/form/MessageForm.tsx frontend/components/admin/MessageActions.tsx
git commit -m "feat(messages): add admin list, new, and detail pages with form + actions"
```

---

### Task 7: Frontend Member Pages (List + Detail)

**Files:**
- Create: `frontend/app/(site)/member/messages/page.tsx`
- Create: `frontend/app/(site)/member/messages/[id]/page.tsx`

- [ ] **Step 1: Create the member list page**

Create `frontend/app/(site)/member/messages/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import Link from 'next/link';

export default async function MemberMessagesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(
    `${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/messages`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  const data = res.ok ? await res.json() : { items: [] };

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">Messages</h1>
      {data.items.length === 0 ? (
        <p className="text-sm text-gray-500">No messages.</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((m: any) => (
            <Link
              key={m.id}
              href={`/member/messages/${m.id}`}
              className={`block rounded border p-4 transition hover:shadow-sm ${
                !m.is_read
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-sm ${!m.is_read ? 'font-bold' : 'font-medium'}`}>
                    {m.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                {!m.is_read && (
                  <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                    New
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the member detail page**

Create `frontend/app/(site)/member/messages/[id]/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function MemberMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('member_token')?.value;

  const res = await fetch(
    `${process.env.INTERNAL_API_BASE || 'http://backend:8000'}/api/member/messages/${id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  if (res.status === 404) notFound();
  if (!res.ok) {
    return (
      <div>
        <p className="text-sm text-red-600">Failed to load message.</p>
        <Link href="/member/messages" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to messages
        </Link>
      </div>
    );
  }
  const message = await res.json();

  return (
    <div>
      <Link
        href="/member/messages"
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Back to messages
      </Link>
      <h1 className="text-xl font-bold">{message.title}</h1>
      <p className="mt-1 text-xs text-gray-500">
        {new Date(message.created_at).toLocaleString()}
      </p>
      <div className="mt-6 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-sm">
        {message.body}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build frontend to verify**

Run from `d:\projects\unowire`:
```
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds.

- [ ] **Step 4: Restart frontend and smoke-test**

```
docker compose --env-file .env.docker up -d frontend
```

Wait ~15s, then:
```
curl -sI http://localhost:3000/member/messages | head -1
```

Expected: `HTTP/1.1 200` (or 307 redirect to member login).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(site)/member/messages/"
git commit -m "feat(messages): add member list and detail pages"
```

---

### Task 8: Frontend Member Sidebar + Unread Badge

**Files:**
- Create: `frontend/components/member/MessagesUnreadBadge.tsx`
- Modify: `frontend/app/(site)/member/layout.tsx`

- [ ] **Step 1: Create the `MessagesUnreadBadge` client component**

Create `frontend/components/member/MessagesUnreadBadge.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export function MessagesUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/member/messages/unread-count')
      .then((res) => (res.ok ? res.json() : { unread: 0 }))
      .then((data) => setCount(data.unread || 0))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white" style={{ height: '1rem' }}>
      {count > 9 ? '9+' : count}
    </span>
  );
}
```

- [ ] **Step 2: Add the Messages link + badge to the member sidebar**

Modify `frontend/app/(site)/member/layout.tsx`. Add the import at the top of the file:

```tsx
import { MessagesUnreadBadge } from '@/components/member/MessagesUnreadBadge';
```

Find the `<nav className="space-y-1">` block and add a new `<Link>` for Messages. Place it BETWEEN "My Inquiries" and "Profile". Also add `relative` to the Link className so the badge positions correctly (or use `flex` layout to push the badge to the right):

Replace the existing nav block:
```tsx
        <nav className="space-y-1">
          <Link href="/member/inbox" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Inbox
          </Link>
          <Link href="/member/inquiries" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            My Inquiries
          </Link>
          <Link href="/member/profile" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Profile
          </Link>
        </nav>
```

With:
```tsx
        <nav className="space-y-1">
          <Link href="/member/inbox" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Inbox
          </Link>
          <Link href="/member/inquiries" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            My Inquiries
          </Link>
          <Link
            href="/member/messages"
            className="flex items-center px-3 py-2 rounded hover:bg-gray-100 text-sm"
          >
            <span>Messages</span>
            <MessagesUnreadBadge />
          </Link>
          <Link href="/member/profile" className="block px-3 py-2 rounded hover:bg-gray-100 text-sm">
            Profile
          </Link>
        </nav>
```

- [ ] **Step 3: Build frontend to verify**

Run from `d:\projects\unowire`:
```
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds.

- [ ] **Step 4: Restart frontend**

```
docker compose --env-file .env.docker up -d frontend
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/member/MessagesUnreadBadge.tsx "frontend/app/(site)/member/layout.tsx"
git commit -m "feat(messages): add Messages sidebar entry with unread badge"
```

---

### Task 9: Docker Build Verification + End-to-End Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Run full backend test suite**

Run from `d:\projects\unowire\backend`:
```
docker compose --env-file ../.env.docker exec backend pytest tests/api/test_admin_messages.py tests/api/test_member_messages.py -v
```

Expected: 14 tests PASS (8 admin + 6 member).

- [ ] **Step 2: Run full backend test suite (no regressions)**

```
docker compose --env-file ../.env.docker exec backend pytest -x --tb=short
```

Expected: all tests pass, no regressions. If any pre-existing test fails, investigate whether the new migration or model registration caused it.

- [ ] **Step 3: tsc check on frontend**

Run from `d:\projects\unowire`:
```
docker compose --env-file .env.docker exec frontend npx tsc --noEmit
```

Expected: 0 new errors (8 pre-existing baseline maintained).

- [ ] **Step 4: End-to-end HTTP smoke test**

For each URL, expect HTTP 200 or 307 (redirect to login):

```
curl -sI http://localhost:3000/ | head -1
curl -sI http://localhost:3000/admin/messages | head -1
curl -sI http://localhost:3000/admin/messages/new | head -1
curl -sI http://localhost:3000/member/messages | head -1
```

Backend endpoints (without auth → 401):
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/admin/messages
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/member/messages
```

Expected: `401` for both (no token provided).

- [ ] **Step 5: Manual verification (optional but recommended)**

Open http://localhost:3000/admin/login in a browser, log in as `admin@unowire.com` / `admin123456`, then:
1. Verify "Messages" appears in the admin sidebar under the Settings group with a Megaphone icon
2. Click "Messages" → list page renders (likely empty)
3. Click "New Message" → form renders with title + body fields
4. Submit a test message → redirected to list, message appears
5. Click on the message → detail page renders with delete button
6. Click "Delete Message" → confirmation prompt → confirm → redirected to list, message gone

Then test member-side:
1. Log in as a member (or register a new one at `/member/register`)
2. Visit `/member` → sidebar shows "Messages" entry with red unread badge (if admin posted a message)
3. Click "Messages" → list page renders with unread items highlighted
4. Click a message → detail page renders, badge count decreases on next list view

- [ ] **Step 6: Commit (if any cleanup needed)**

If no changes are needed, skip this step. Otherwise:
```bash
git add -A
git commit -m "chore(messages): final cleanup after smoke test"
```

---

### Task 10: Push to Remote

**Files:** none

- [ ] **Step 1: Check git status**

Run from `d:\projects\unowire`:
```
git status
git log --oneline -10
```

Verify all expected commits are present:
- spec doc commit
- plan doc commit
- models + migration + RBAC
- schemas + CRUD
- admin routes + tests
- member routes + tests
- frontend types + adminApi + module mirror + icon
- admin pages
- member pages
- sidebar + badge

- [ ] **Step 2: Push**

```
git push origin feat/media-picker-modal
```

If push fails due to network issues, retry later.

- [ ] **Step 3: Verify push succeeded**

```
git log origin/feat/media-picker-modal..HEAD
```

Expected: empty output (local and remote are in sync).

---

## Self-Review Notes

- Spec coverage: every spec section has a corresponding task (data model → Task 1; RBAC → Task 1; menu → Task 1 migration; admin API → Task 3; member API → Task 4; admin UI → Task 6; member UI → Tasks 7+8; tests → Tasks 3+4; verification → Task 9).
- No placeholders — all code blocks are complete and runnable.
- Type consistency: `AdminMessage`, `MemberMessage`, `UnreadCount` interfaces are consistent across types.ts, adminApi.ts, schemas, and CRUD.
- Route ordering for member `/messages/unread-count` vs `/messages/{message_id}` explicitly called out in Task 4 Step 3.
- Migration `down_revision` placeholder `<LATEST_REVISION_ON_CURRENT_BRANCH>` is explicitly called out in Task 1 Step 5 with instructions to resolve before running.
- Test file path corrected to `backend/tests/api/test_*.py` (matching existing convention).
- Frontend admin pages at `frontend/app/admin/(dashboard)/messages/` (route group, not `frontend/app/admin/messages/`).
