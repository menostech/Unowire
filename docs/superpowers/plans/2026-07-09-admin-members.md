# Admin Members Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend admin module for managing registered Members (frontend site users) with list/search/filter, edit, activate/deactivate, manual email verification, and delete (protected by inquiry existence).

**Architecture:** Mirrors the existing staff Users management pattern. Backend: routes → CRUD → model (no new model, `Member` already exists). Frontend: server component pages → `adminApi.members.*` → proxy routes → backend. New RBAC module `members` (scope_aware=False).

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Next.js 15 + React (frontend), Alembic (migrations), pytest (backend tests)

---

## File Structure

### New Files

**Backend**:
- `backend/app/schemas/admin_member.py` — Pydantic schemas for admin member operations
- `backend/app/api/routes/admin_members.py` — Admin member endpoints
- `backend/tests/api/test_admin_members.py` — Endpoint tests
- `backend/alembic/versions/d5e6f7a8b9c0_add_members_menu_item.py` — Migration for menu item + permission

**Frontend**:
- `frontend/app/admin/(dashboard)/members/page.tsx` — List page (server component)
- `frontend/app/admin/(dashboard)/members/[id]/page.tsx` — Detail/edit page (server component)
- `frontend/components/admin/form/MemberForm.tsx` — Edit form (client component)
- `frontend/components/admin/MemberActions.tsx` — Activate/Verify/Delete buttons (client component)
- `frontend/app/api/admin/members/route.ts` — GET proxy (list)
- `frontend/app/api/admin/members/[id]/route.ts` — GET/PUT proxy (detail/edit)
- `frontend/app/api/admin/members/[id]/activate/route.ts` — PUT proxy (activate)
- `frontend/app/api/admin/members/[id]/verify/route.ts` — PUT proxy (verify)
- `frontend/app/api/admin/members/[id]/delete/route.ts` — DELETE proxy

### Modified Files

**Backend**:
- `backend/app/core/modules.py` — Add `members` module to `ADMIN_MODULES`
- `backend/app/crud/member.py` — Add admin CRUD methods
- `backend/app/crud/menu.py` — Add `"members"` to `ALLOWED_PAGE_IDS`
- `backend/app/main.py` — Register `admin_members` router

**Frontend**:
- `frontend/lib/adminModules.ts` — Mirror `members` module
- `frontend/lib/adminMenuRegistry.ts` — Register `members` page
- `frontend/lib/adminApi.ts` — Add `members` namespace
- `frontend/lib/types.ts` — Add `AdminMember` type

---

## Global Constraints

- All code, comments, and documentation must be in English (project is global-facing)
- All middleware must use async/await (no callback style)
- Admin menu items support maximum 2 levels of hierarchy (group as parent, page as child)
- Menu item type=page must reference a valid page_id from frontend registry
- Frontend and backend maintain synchronized module/page registries
- Project-wide font is Arial, Sans-serif; frontend and admin use same font size
- Next.js 15 async params: dynamic routes use `params: Promise<{ id: string }>` with `await params`
- Frontend proxy routes read `admin_token` cookie and forward as `Authorization: Bearer {token}` header
- tsc baseline: 8 pre-existing errors in `.next/dev/types/validator.ts` line 440 — verify 0 NEW errors via delta comparison
- `role_permissions` table columns: `role_id` (string FK to `roles.id`), `module` (string, NOT `module_id`)
- `admin_menu_items.parent_id` for Settings group is `'settings'` (not `'menu-settings'`)

---

## Task 1: Add `members` RBAC Module to Backend Registry

**Files:**
- Modify: `backend/app/core/modules.py:10-25`

- [ ] **Step 1: Add `members` module entry**

Edit `backend/app/core/modules.py`. Add the new module after the `email_config` entry (line 24), before the closing `]`:

```python
    {"id": "email_config",    "label": "Email Config",    "scope_aware": False, "scope_type": None},
    {"id": "members",         "label": "Members",         "scope_aware": False, "scope_type": None},
]
```

- [ ] **Step 2: Verify the module is registered**

Run: `python -c "from app.core.modules import MODULE_BY_ID; assert 'members' in MODULE_BY_ID; print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/modules.py
git commit -m "feat(rbac): add members module to backend registry"
```

---

## Task 2: Add `members` to Frontend Module Registry

**Files:**
- Modify: `frontend/lib/adminModules.ts:11-26`

- [ ] **Step 1: Add `members` module entry**

Edit `frontend/lib/adminModules.ts`. Add the new module after the `email_config` entry (line 25), before the closing `];`:

```typescript
  { id: "email_config", label: "Email Config", scopeAware: false, scopeType: null },
  { id: "members",      label: "Members",      scopeAware: false, scopeType: null },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors in `.next/dev/types/validator.ts` line 440, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/adminModules.ts
git commit -m "feat(rbac): add members module to frontend registry"
```

---

## Task 3: Register `members` Page in Frontend Menu Registry

**Files:**
- Modify: `frontend/lib/adminMenuRegistry.ts:8-23`

- [ ] **Step 1: Add `members` page entry**

Edit `frontend/lib/adminMenuRegistry.ts`. Add the new page after the `email_config` entry (line 22), before the closing `];`:

```typescript
  { pageId: "email_config", href: "/admin/settings/email",                 defaultLabel: "Email Config", defaultIcon: "Mail" },
  { pageId: "members",      href: "/admin/members",                        defaultLabel: "Members",      defaultIcon: "Users" },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/adminMenuRegistry.ts
git commit -m "feat(menu): register members page in frontend registry"
```

---

## Task 4: Add `"members"` to Backend `ALLOWED_PAGE_IDS`

**Files:**
- Modify: `backend/app/crud/menu.py:15-30`

- [ ] **Step 1: Add `"members"` to the set**

Edit `backend/app/crud/menu.py`. Add `"members"` to the `ALLOWED_PAGE_IDS` set, after `"email_config"`:

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
}
```

- [ ] **Step 2: Verify Python compiles**

Run: `python -c "from app.crud.menu import ALLOWED_PAGE_IDS; assert 'members' in ALLOWED_PAGE_IDS; print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/menu.py
git commit -m "feat(menu): add members to ALLOWED_PAGE_IDS"
```

---

## Task 5: Create Admin Member Schemas

**Files:**
- Create: `backend/app/schemas/admin_member.py`

- [ ] **Step 1: Create the schema file**

Create `backend/app/schemas/admin_member.py` with this exact content:

```python
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminMemberRead(BaseModel):
    id: int
    email: EmailStr
    name: str
    company: str | None
    phone: str | None
    is_active: bool
    is_verified: bool
    created_at: datetime
    inquiry_count: int  # total inquiries sent by this member

    model_config = {"from_attributes": True}


class AdminMemberUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    company: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)


class AdminMemberActivate(BaseModel):
    is_active: bool
```

- [ ] **Step 2: Verify Python compiles**

Run: `python -c "from app.schemas.admin_member import AdminMemberRead, AdminMemberUpdate, AdminMemberActivate; print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/admin_member.py
git commit -m "feat(schemas): add admin member schemas"
```

---

## Task 6: Add Admin CRUD Methods to `crud/member.py`

**Files:**
- Modify: `backend/app/crud/member.py`

- [ ] **Step 1: Add imports and admin CRUD methods**

Edit `backend/app/crud/member.py`. Replace the entire file with:

```python
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.crud.base import CRUDBase
from app.models.inquiry import Inquiry
from app.models.member import Member
from app.schemas.member import MemberRegister, MemberUpdate


class CRUDMember(CRUDBase[Member, MemberRegister, MemberUpdate]):
    async def get_by_email(self, db: AsyncSession, email: str) -> Member | None:
        result = await db.execute(select(Member).where(Member.email == email))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: MemberRegister) -> Member:
        """Override to hash password and set defaults."""
        data = obj_in.model_dump()
        password = data.pop("password")
        db_obj = Member(
            email=data["email"],
            password_hash=hash_password(password),
            name=data["name"],
            company=data.get("company"),
            phone=data.get("phone"),
            is_active=True,
            is_verified=False,
            verification_token=secrets.token_urlsafe(32),
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    # === Admin methods ===

    async def list_with_filters(
        self,
        db: AsyncSession,
        q: str | None = None,
        is_verified: bool | None = None,
        is_active: bool | None = None,
    ) -> list[Member]:
        """List members with optional search and filters."""
        stmt = select(Member).order_by(Member.created_at.desc())
        if q:
            pattern = f"%{q}%"
            stmt = stmt.where(
                (Member.email.ilike(pattern)) | (Member.name.ilike(pattern))
            )
        if is_verified is not None:
            stmt = stmt.where(Member.is_verified == is_verified)
        if is_active is not None:
            stmt = stmt.where(Member.is_active == is_active)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def count_inquiries(self, db: AsyncSession, member_id: int) -> int:
        """Count inquiries sent by a member."""
        result = await db.execute(
            select(func.count(Inquiry.id)).where(Inquiry.sender_id == member_id)
        )
        return int(result.scalar() or 0)

    async def has_inquiries(self, db: AsyncSession, member_id: int) -> bool:
        """Check if a member has any inquiries (used for delete protection)."""
        result = await db.execute(
            select(func.count(Inquiry.id)).where(Inquiry.sender_id == member_id)
        )
        return int(result.scalar() or 0) > 0

    async def set_active(
        self, db: AsyncSession, member: Member, is_active: bool
    ) -> Member:
        member.is_active = is_active
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member

    async def set_verified(self, db: AsyncSession, member: Member) -> Member:
        """Manually mark a member as verified and clear the verification token."""
        member.is_verified = True
        member.verification_token = None
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member

    async def update_profile(
        self, db: AsyncSession, member: Member, *, name: str, company: str | None, phone: str | None
    ) -> Member:
        """Update editable member fields (email is immutable)."""
        member.name = name
        member.company = company
        member.phone = phone
        db.add(member)
        await db.commit()
        await db.refresh(member)
        return member


crud_member = CRUDMember(Member)
```

- [ ] **Step 2: Verify Python compiles**

Run: `python -c "from app.crud.member import crud_member; assert hasattr(crud_member, 'list_with_filters'); assert hasattr(crud_member, 'count_inquiries'); assert hasattr(crud_member, 'has_inquiries'); assert hasattr(crud_member, 'set_active'); assert hasattr(crud_member, 'set_verified'); assert hasattr(crud_member, 'update_profile'); print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/crud/member.py
git commit -m "feat(crud): add admin member CRUD methods"
```

---

## Task 7: Create Admin Members Route File

**Files:**
- Create: `backend/app/api/routes/admin_members.py`

- [ ] **Step 1: Create the route file**

Create `backend/app/api/routes/admin_members.py` with this exact content:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_module
from app.core.database import get_db
from app.crud.member import crud_member
from app.models.user import User
from app.schemas.admin_member import (
    AdminMemberActivate,
    AdminMemberRead,
    AdminMemberUpdate,
)

router = APIRouter(prefix="/api/admin/members", tags=["admin-members"])


def _member_to_read(member, inquiry_count: int) -> AdminMemberRead:
    return AdminMemberRead(
        id=member.id,
        email=member.email,
        name=member.name,
        company=member.company,
        phone=member.phone,
        is_active=member.is_active,
        is_verified=member.is_verified,
        created_at=member.created_at,
        inquiry_count=inquiry_count,
    )


@router.get("", response_model=list[AdminMemberRead])
async def list_members(
    q: str | None = None,
    is_verified: bool | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    members = await crud_member.list_with_filters(
        db, q=q, is_verified=is_verified, is_active=is_active
    )
    result = []
    for m in members:
        count = await crud_member.count_inquiries(db, m.id)
        result.append(_member_to_read(m, count))
    return result


@router.get("/{member_id}", response_model=AdminMemberRead)
async def get_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}", response_model=AdminMemberRead)
async def update_member(
    member_id: int,
    obj_in: AdminMemberUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.update_profile(
        db, member, name=obj_in.name, company=obj_in.company, phone=obj_in.phone
    )
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}/activate", response_model=AdminMemberRead)
async def activate_member(
    member_id: int,
    obj_in: AdminMemberActivate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.set_active(db, member, obj_in.is_active)
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.put("/{member_id}/verify", response_model=AdminMemberRead)
async def verify_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    member = await crud_member.set_verified(db, member)
    count = await crud_member.count_inquiries(db, member.id)
    return _member_to_read(member, count)


@router.delete("/{member_id}", status_code=204)
async def delete_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_module("members")),
):
    member = await crud_member.get(db, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail={"code": 404, "message": "Member not found"})
    if await crud_member.has_inquiries(db, member_id):
        raise HTTPException(
            status_code=409,
            detail={"code": 409, "message": "Cannot delete member with inquiries. Deactivate instead."},
        )
    await crud_member.remove(db, id=member_id)
```

- [ ] **Step 2: Verify Python compiles**

Run: `python -c "from app.api.routes.admin_members import router; assert len(router.routes) == 6; print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/admin_members.py
git commit -m "feat(api): add admin members route with 6 endpoints"
```

---

## Task 8: Register `admin_members` Router in `main.py`

**Files:**
- Modify: `backend/app/main.py:12` (import line)
- Modify: `backend/app/main.py:106` (after `app.include_router(admin_email.router)`)

- [ ] **Step 1: Add import**

Edit `backend/app/main.py` line 12. Add `admin_members` to the import list. The current line is:

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, product_types, taxonomy, uploads, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email
```

Change it to (append `admin_members` before the closing):

```python
from app.api.routes import auth, brands, cable_import, cable_import_templates, cables, categories, equipment, equipment_categories, equipment_manufacturers, folders, health, industries, manufacturers, product_types, taxonomy, uploads, admin_menu, admin_roles, admin_users, member, admin_inquiries, admin_email, admin_members
```

- [ ] **Step 2: Register the router**

Edit `backend/app/main.py`. After line 106 (`app.include_router(admin_email.router)`), add:

```python
app.include_router(admin_members.router)
```

- [ ] **Step 3: Verify Python compiles**

Run: `python -c "from app.main import app; routes = [r.path for r in app.routes]; assert any('/api/admin/members' in r for r in routes); print('OK')"`
Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(api): register admin_members router in main.py"
```

---

## Task 9: Create Database Migration for Menu Item + Permission

**Files:**
- Create: `backend/alembic/versions/d5e6f7a8b9c0_add_members_menu_item.py`

- [ ] **Step 1: Create the migration file**

Create `backend/alembic/versions/d5e6f7a8b9c0_add_members_menu_item.py` with this exact content:

```python
"""add members menu item under settings group

Revision ID: d5e6f7a8b9c0
Revises: ed9b79c7e9b6
Create Date: 2026-07-09 00:00:00.000000

"""
from alembic import op


revision: str = 'd5e6f7a8b9c0'
down_revision: str | None = 'ed9b79c7e9b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'members' menu item under 'settings' group (idempotent)
    op.execute("""
        INSERT INTO admin_menu_items (id, parent_id, type, page_id, url, label, icon, sort_order, is_visible, created_at, updated_at)
        VALUES ('menu-members', 'settings', 'page', 'members', NULL, 'Members', 'Users', 4, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # Grant admin role access to members module
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'members')
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module = 'members'")
    op.execute("DELETE FROM admin_menu_items WHERE id = 'menu-members'")
```

- [ ] **Step 2: Verify Python compiles**

Run: `python -c "import importlib.util; spec = importlib.util.spec_from_file_location('m', 'backend/alembic/versions/d5e6f7a8b9c0_add_members_menu_item.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); assert m.revision == 'd5e6f7a8b9c0'; assert m.down_revision == 'ed9b79c7e9b6'; print('OK')"`
Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/d5e6f7a8b9c0_add_members_menu_item.py
git commit -m "feat(db): add migration for members menu item and admin permission"
```

---

## Task 10: Write Backend Tests — List and Filter Endpoints

**Files:**
- Create: `backend/tests/api/test_admin_members.py`

- [ ] **Step 1: Create the test file with list/filter tests**

Create `backend/tests/api/test_admin_members.py` with this exact content:

```python
"""Tests for admin member management endpoints."""


def test_list_members_requires_auth(client):
    res = client.get("/api/admin/members")
    assert res.status_code == 401


def test_list_members_returns_all(client, admin_headers):
    # Ensure at least one test member exists
    client.post(
        "/api/member/auth/register",
        json={
            "email": "list-all@test-member.com",
            "password": "password123",
            "name": "List All",
        },
    )
    res = client.get("/api/admin/members", headers=admin_headers)
    assert res.status_code == 200
    members = res.json()
    assert len(members) >= 1
    # Verify schema has inquiry_count
    assert "inquiry_count" in members[0]
    assert "is_verified" in members[0]


def test_list_members_with_search_query(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "search-target@test-member.com",
            "password": "password123",
            "name": "Search Target",
        },
    )
    res = client.get(
        "/api/admin/members?q=search-target",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert any(m["email"] == "search-target@test-member.com" for m in members)


def test_list_members_filter_by_is_verified(client, admin_headers):
    # Register but do NOT verify
    client.post(
        "/api/member/auth/register",
        json={
            "email": "unverified@test-member.com",
            "password": "password123",
            "name": "Unverified",
        },
    )
    res = client.get(
        "/api/admin/members?is_verified=false",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert all(m["is_verified"] is False for m in members)
    assert any(m["email"] == "unverified@test-member.com" for m in members)


def test_list_members_filter_by_is_active(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "active-filter@test-member.com",
            "password": "password123",
            "name": "Active Filter",
        },
    )
    res = client.get(
        "/api/admin/members?is_active=true",
        headers=admin_headers,
    )
    assert res.status_code == 200
    members = res.json()
    assert all(m["is_active"] is True for m in members)
```

- [ ] **Step 2: Run the tests**

Run: `cd backend; python -m pytest tests/api/test_admin_members.py -v -k "list or filter"`
Expected: 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_members.py
git commit -m "test(admin-members): add list and filter endpoint tests"
```

---

## Task 11: Add Backend Tests — Get, Update, Activate, Verify

**Files:**
- Modify: `backend/tests/api/test_admin_members.py`

- [ ] **Step 1: Append get/update/activate/verify tests**

Append the following tests to `backend/tests/api/test_admin_members.py`:

```python


def test_get_member_by_id(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "get-by-id@test-member.com",
            "password": "password123",
            "name": "Get By Id",
        },
    )
    # Find the member in the list
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member = next(m for m in listing if m["email"] == "get-by-id@test-member.com")
    member_id = member["id"]

    res = client.get(f"/api/admin/members/{member_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "get-by-id@test-member.com"
    assert res.json()["inquiry_count"] == 0


def test_get_member_by_id_not_found_returns_404(client, admin_headers):
    res = client.get("/api/admin/members/999999", headers=admin_headers)
    assert res.status_code == 404


def test_update_member_fields(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "update-test@test-member.com",
            "password": "password123",
            "name": "Original Name",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "update-test@test-member.com")

    res = client.put(
        f"/api/admin/members/{member_id}",
        headers=admin_headers,
        json={"name": "Updated Name", "company": "ACME Corp", "phone": "+1234567890"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Updated Name"
    assert data["company"] == "ACME Corp"
    assert data["phone"] == "+1234567890"


def test_update_member_not_found_returns_404(client, admin_headers):
    res = client.put(
        "/api/admin/members/999999",
        headers=admin_headers,
        json={"name": "Ghost", "company": None, "phone": None},
    )
    assert res.status_code == 404


def test_activate_member_toggles_is_active(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "activate-test@test-member.com",
            "password": "password123",
            "name": "Activate Test",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "activate-test@test-member.com")

    # Deactivate
    res = client.put(
        f"/api/admin/members/{member_id}/activate",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Reactivate
    res = client.put(
        f"/api/admin/members/{member_id}/activate",
        headers=admin_headers,
        json={"is_active": True},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is True


def test_verify_member_sets_is_verified_true(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "verify-test@test-member.com",
            "password": "password123",
            "name": "Verify Test",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member = next(m for m in listing if m["email"] == "verify-test@test-member.com")
    assert member["is_verified"] is False  # not verified yet

    res = client.put(
        f"/api/admin/members/{member['id']}/verify",
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_verified"] is True


def test_verify_member_clears_verification_token(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "token-clear@test-member.com",
            "password": "password123",
            "name": "Token Clear",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "token-clear@test-member.com")

    # Manually verify
    client.put(f"/api/admin/members/{member_id}/verify", headers=admin_headers)

    # Verify the member can now login WITHOUT needing the token
    # (login should work for verified members)
    login_res = client.post(
        "/api/member/auth/login",
        json={"email": "token-clear@test-member.com", "password": "password123"},
    )
    assert login_res.status_code == 200
```

- [ ] **Step 2: Run the tests**

Run: `cd backend; python -m pytest tests/api/test_admin_members.py -v -k "get_by_id or update or activate or verify"`
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_members.py
git commit -m "test(admin-members): add get, update, activate, verify tests"
```

---

## Task 12: Add Backend Tests — Delete and Permission

**Files:**
- Modify: `backend/tests/api/test_admin_members.py`

- [ ] **Step 1: Append delete and permission tests**

Append the following tests to `backend/tests/api/test_admin_members.py`:

```python


def test_delete_member_without_inquiries_succeeds(client, admin_headers):
    client.post(
        "/api/member/auth/register",
        json={
            "email": "delete-no-inq@test-member.com",
            "password": "password123",
            "name": "Delete No Inq",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "delete-no-inq@test-member.com")

    res = client.delete(f"/api/admin/members/{member_id}", headers=admin_headers)
    assert res.status_code == 204

    # Verify gone
    res = client.get(f"/api/admin/members/{member_id}", headers=admin_headers)
    assert res.status_code == 404


def test_delete_member_with_inquiries_returns_409(client, admin_headers):
    # Register a member
    client.post(
        "/api/member/auth/register",
        json={
            "email": "delete-with-inq@test-member.com",
            "password": "password123",
            "name": "Delete With Inq",
        },
    )
    listing = client.get("/api/admin/members", headers=admin_headers).json()
    member_id = next(m["id"] for m in listing if m["email"] == "delete-with-inq@test-member.com")

    # Login as the member to get a token
    login_res = client.post(
        "/api/member/auth/login",
        json={"email": "delete-with-inq@test-member.com", "password": "password123"},
    )
    assert login_res.status_code == 200
    member_token = login_res.json()["token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}

    # Send an inquiry as the member
    inquiry_res = client.post(
        "/api/member/inquiries",
        headers=member_headers,
        json={
            "recipient_type": "manufacturer",
            "recipient_id": "any-manufacturer-id",
            "subject": "Test inquiry",
            "body": "This is a test inquiry body.",
        },
    )
    assert inquiry_res.status_code in (200, 201), f"Inquiry creation failed: {inquiry_res.text}"

    # Now try to delete the member — should be blocked
    res = client.delete(f"/api/admin/members/{member_id}", headers=admin_headers)
    assert res.status_code == 409
    assert "inquiries" in res.json()["detail"]["message"].lower()


def test_delete_member_not_found_returns_404(client, admin_headers):
    res = client.delete("/api/admin/members/999999", headers=admin_headers)
    assert res.status_code == 404


def test_unauthorized_user_cannot_access_members(client):
    """A user without the members module permission gets 403."""
    # Register a staff user with content_editor role (no members access)
    # First, login as admin to create the user
    admin_login = client.post(
        "/api/auth/login",
        json={"email": "admin@unowire.com", "password": "admin123456"},
    )
    admin_token = admin_login.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create a content_editor user
    client.post(
        "/api/admin/users",
        headers=admin_headers,
        json={
            "email": "editor-no-members@unowire.com",
            "password": "password123",
            "role_id": "content_editor",
        },
    )

    # Login as the content_editor
    editor_login = client.post(
        "/api/auth/login",
        json={"email": "editor-no-members@unowire.com", "password": "password123"},
    )
    assert editor_login.status_code == 200
    editor_token = editor_login.json()["token"]
    editor_headers = {"Authorization": f"Bearer {editor_token}"}

    # Try to access members endpoint
    res = client.get("/api/admin/members", headers=editor_headers)
    assert res.status_code == 403
```

- [ ] **Step 2: Run all member tests**

Run: `cd backend; python -m pytest tests/api/test_admin_members.py -v`
Expected: 15 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_admin_members.py
git commit -m "test(admin-members): add delete and permission tests"
```

---

## Task 13: Add `AdminMember` Type to Frontend

**Files:**
- Modify: `frontend/lib/types.ts` (append after `ScopeOption` interface, around line 303)

- [ ] **Step 1: Add the `AdminMember` interface**

Edit `frontend/lib/types.ts`. After the `ScopeOption` interface (line 301-303), append:

```typescript

export interface AdminMember {
  id: number;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  inquiry_count: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(types): add AdminMember interface"
```

---

## Task 14: Add `members` Namespace to `adminApi.ts`

**Files:**
- Modify: `frontend/lib/adminApi.ts:2` (import)
- Modify: `frontend/lib/adminApi.ts` (add namespace before closing `};`)

- [ ] **Step 1: Add `AdminMember` to the import**

Edit `frontend/lib/adminApi.ts` line 2. Add `AdminMember` to the type import. The current line is:

```typescript
import type { Manufacturer, Brand, Cable, MenuItem, MenuItemTree, Role, AdminUserExtended, UserPermissions, ScopeOption } from './types';
```

Change to:

```typescript
import type { Manufacturer, Brand, Cable, MenuItem, MenuItemTree, Role, AdminUserExtended, UserPermissions, ScopeOption, AdminMember } from './types';
```

- [ ] **Step 2: Add the `members` namespace**

Edit `frontend/lib/adminApi.ts`. Before the final closing `};` of the `adminApi` object (after the `me` namespace, around line 789), add:

```typescript

  members: {
    async all(filters?: { q?: string; is_verified?: boolean; is_active?: boolean }): Promise<AdminMember[]> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.is_verified !== undefined) params.set('is_verified', String(filters.is_verified));
      if (filters?.is_active !== undefined) params.set('is_active', String(filters.is_active));
      const query = params.toString();
      return adminGet<AdminMember[]>(`/api/admin/members${query ? `?${query}` : ''}`);
    },
    async getById(id: number): Promise<AdminMember | null> {
      try {
        return await adminGet<AdminMember>(`/api/admin/members/${id}`);
      } catch {
        return null;
      }
    },
    async update(id: number, payload: { name: string; company?: string | null; phone?: string | null }): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async activate(id: number, is_active: boolean): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}/activate`, {
        method: 'PUT',
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async verify(id: number): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}/verify`, {
        method: 'PUT',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: number): Promise<void> {
      const res = await adminFetch(`/api/admin/members/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/adminApi.ts
git commit -m "feat(api): add members namespace to adminApi"
```

---

## Task 15: Create Frontend Proxy Routes — List and Detail

**Files:**
- Create: `frontend/app/api/admin/members/route.ts`
- Create: `frontend/app/api/admin/members/[id]/route.ts`

- [ ] **Step 1: Create the list proxy route**

Create `frontend/app/api/admin/members/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const res = await fetch(`${API_BASE}/api/admin/members${queryString ? `?${queryString}` : ''}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the detail proxy route**

Create `frontend/app/api/admin/members/[id]/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/members/${id}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/members/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/api/admin/members/route.ts frontend/app/api/admin/members/[id]/route.ts
git commit -m "feat(proxy): add admin members list and detail proxy routes"
```

---

## Task 16: Create Frontend Proxy Routes — Activate, Verify, Delete

**Files:**
- Create: `frontend/app/api/admin/members/[id]/activate/route.ts`
- Create: `frontend/app/api/admin/members/[id]/verify/route.ts`
- Create: `frontend/app/api/admin/members/[id]/delete/route.ts`

- [ ] **Step 1: Create the activate proxy route**

Create `frontend/app/api/admin/members/[id]/activate/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/admin/members/${id}/activate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 2: Create the verify proxy route**

Create `frontend/app/api/admin/members/[id]/verify/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/members/${id}/verify`, {
    method: 'PUT',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 3: Create the delete proxy route**

Create `frontend/app/api/admin/members/[id]/delete/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.cookies.get('admin_token')?.value;
  const res = await fetch(`${API_BASE}/api/admin/members/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/admin/members/[id]/activate/route.ts frontend/app/api/admin/members/[id]/verify/route.ts frontend/app/api/admin/members/[id]/delete/route.ts
git commit -m "feat(proxy): add admin members activate, verify, delete proxy routes"
```

---

## Task 17: Create `MemberForm` Component

**Files:**
- Create: `frontend/components/admin/form/MemberForm.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/components/admin/form/MemberForm.tsx` with this exact content:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdminMember } from '@/lib/types';

interface MemberFormProps {
  initialData: AdminMember;
}

export function MemberForm({ initialData }: MemberFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialData.name);
  const [company, setCompany] = useState(initialData.company ?? '');
  const [phone, setPhone] = useState(initialData.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${initialData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company: company || null,
          phone: phone || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.push('/admin/members');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="member_name" className="mb-1 block text-sm font-medium">Name</label>
          <input
            id="member_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="member_company" className="mb-1 block text-sm font-medium">Company</label>
          <input
            id="member_company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={200}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="member_phone" className="mb-1 block text-sm font-medium">Phone</label>
          <input
            id="member_phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={50}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <Link
          href="/admin/members"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/MemberForm.tsx
git commit -m "feat(ui): add MemberForm component for editing member profile"
```

---

## Task 18: Create `MemberActions` Component

**Files:**
- Create: `frontend/components/admin/MemberActions.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/components/admin/MemberActions.tsx` with this exact content:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminMember } from '@/lib/types';

interface MemberActionsProps {
  member: AdminMember;
}

export function MemberActions({ member }: MemberActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleActivate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/activate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/verify`, {
        method: 'PUT',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${member.id}/delete`, {
        method: 'DELETE',
      });
      if (res.status === 204) {
        router.push('/admin/members');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(data?.detail?.message || 'Cannot delete — member has inquiries. Deactivate instead.');
      } else {
        throw new Error(data?.detail?.message || `Failed (${res.status})`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {!member.is_verified && (
          <button
            onClick={handleVerify}
            disabled={busy}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? 'Working...' : 'Verify Email'}
          </button>
        )}
        <button
          onClick={handleActivate}
          disabled={busy}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            member.is_active
              ? 'bg-gray-600 hover:bg-gray-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {busy ? 'Working...' : member.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {confirmDelete && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700 mb-3">
            Are you sure you want to delete this member? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/MemberActions.tsx
git commit -m "feat(ui): add MemberActions component for activate/verify/delete"
```

---

## Task 19: Create Members List Page

**Files:**
- Create: `frontend/app/admin/(dashboard)/members/page.tsx`

- [ ] **Step 1: Create the list page**

Create `frontend/app/admin/(dashboard)/members/page.tsx` with this exact content:

```tsx
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; is_verified?: string; is_active?: string }>;
}) {
  const sp = await searchParams;
  const filters: { q?: string; is_verified?: boolean; is_active?: boolean } = {};
  if (sp.q) filters.q = sp.q;
  if (sp.is_verified === 'true') filters.is_verified = true;
  if (sp.is_verified === 'false') filters.is_verified = false;
  if (sp.is_active === 'true') filters.is_active = true;
  if (sp.is_active === 'false') filters.is_active = false;

  const members = await adminApi.members.all(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
      </div>

      {/* Search and filters */}
      <form className="flex flex-wrap gap-3" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search email or name..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          name="is_verified"
          defaultValue={sp.is_verified ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All (verified)</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select
          name="is_active"
          defaultValue={sp.is_active ?? ''}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All (active)</option>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Apply
        </button>
        <Link
          href="/admin/members"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear
        </Link>
      </form>

      {/* Members table */}
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">ID</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Company</th>
              <th className="px-4 py-2 text-left font-medium">Verified</th>
              <th className="px-4 py-2 text-left font-medium">Active</th>
              <th className="px-4 py-2 text-left font-medium">Inquiries</th>
              <th className="px-4 py-2 text-left font-medium">Created</th>
              <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No members found.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-xs text-gray-500">{member.id}</td>
                  <td className="px-4 py-2">{member.email}</td>
                  <td className="px-4 py-2">{member.name}</td>
                  <td className="px-4 py-2 text-gray-500">{member.company ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${member.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {member.is_verified ? 'Verified' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {member.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{member.inquiry_count}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/members/${member.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/members/page.tsx
git commit -m "feat(ui): add admin members list page with search and filters"
```

---

## Task 20: Create Member Detail/Edit Page

**Files:**
- Create: `frontend/app/admin/(dashboard)/members/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `frontend/app/admin/(dashboard)/members/[id]/page.tsx` with this exact content:

```tsx
import { notFound } from 'next/navigation';
import { adminApi } from '@/lib/adminApi';
import { MemberForm } from '@/components/admin/form/MemberForm';
import { MemberActions } from '@/components/admin/MemberActions';

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await adminApi.members.getById(parseInt(id));
  if (!member) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Member: {member.email}</h1>

      {/* Read-only email display */}
      <div className="max-w-2xl">
        <div className="mb-1 block text-sm font-medium text-gray-700">Email (read-only)</div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {member.email}
        </div>
      </div>

      {/* Editable profile form */}
      <MemberForm initialData={member} />

      {/* Action buttons */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Actions</h2>
        <MemberActions member={member} />
      </div>

      {/* Metadata */}
      <div className="border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Metadata</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Member ID</dt>
          <dd>{member.id}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{new Date(member.created_at).toLocaleString()}</dd>
          <dt className="text-gray-500">Inquiries</dt>
          <dd>{member.inquiry_count}</dd>
          <dt className="text-gray-500">Verified</dt>
          <dd>{member.is_verified ? 'Yes' : 'No'}</dd>
          <dt className="text-gray-500">Active</dt>
          <dd>{member.is_active ? 'Yes' : 'No'}</dd>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/members/[id]/page.tsx
git commit -m "feat(ui): add admin member detail/edit page"
```

---

## Task 21: Run Full Backend Test Suite

**Files:**
- None (verification only)

- [ ] **Step 1: Run the admin members tests**

Run: `cd backend; python -m pytest tests/api/test_admin_members.py -v`
Expected: 15 tests PASS

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend; python -m pytest -v`
Expected: All tests PASS (previous baseline + 15 new tests, no regressions)

- [ ] **Step 3: If any tests fail, fix and re-run**

If failures occur, examine the error, fix the code, and re-run until all pass.

- [ ] **Step 4: Commit any fixes (if needed)**

```bash
git add -A
git commit -m "fix: resolve test failures in admin members module"
```

---

## Task 22: Run Alembic Migration and Final TypeScript Check

**Files:**
- None (verification only)

- [ ] **Step 1: Run the Alembic migration**

Run: `cd backend; python -m alembic upgrade head`
Expected: Migration `d5e6f7a8b9c0` applies successfully, no errors.

- [ ] **Step 2: Verify the menu item was inserted**

Run (via database query or API): Check that `menu-members` appears in the admin menu tree. The menu tree endpoint is `GET /api/admin/menu/tree` with admin auth.

- [ ] **Step 3: Final TypeScript check**

Run: `cd frontend; npx tsc --noEmit`
Expected: 8 pre-existing errors, 0 new errors.

- [ ] **Step 4: Commit (if any fixes were needed)**

If fixes were made:
```bash
git add -A
git commit -m "fix: resolve migration or TypeScript issues"
```

---

## Task 23: Frontend Build Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Build the frontend Docker image**

Run: `docker compose build frontend`
Expected: Build succeeds, no errors.

- [ ] **Step 2: Restart the frontend container**

Run: `docker compose up -d frontend`
Expected: Container starts and is healthy.

- [ ] **Step 3: Verify the admin members page loads**

Access `http://localhost:3000/admin/members` (requires admin login). Verify:
- The page renders without errors
- The table displays (empty or with members)
- The search and filter controls are visible

- [ ] **Step 4: Commit any fixes (if needed)**

```bash
git add -A
git commit -m "fix: resolve frontend build issues"
```

---

## Task 24: Manual Smoke Test

**Files:**
- None (manual testing)

- [ ] **Step 1: Test the full member management workflow**

Perform the following manual smoke tests:

1. **Access Members page**: Login as admin → navigate to Settings → Members. Verify the page loads.
2. **Register a test member**: On the public site, register a new member (e.g., `smoke@test-member.com`).
3. **Verify member appears**: Refresh the admin Members page. The new member should appear with "Pending" verification badge.
4. **Edit member**: Click "Edit" on the new member. Change name/company/phone. Click "Save Changes". Verify redirect to list and updated data.
5. **Manual verify**: Click "Edit" again. Click "Verify Email". Verify the badge changes to "Verified".
6. **Deactivate**: Click "Deactivate". Verify the badge changes to "Disabled".
7. **Reactivate**: Click "Activate". Verify the badge changes to "Active".
8. **Delete without inquiries**: Register another test member (no inquiries). Click "Delete" → confirm. Verify the member is removed.
9. **Delete with inquiries**: Have a member send an inquiry. Try to delete that member. Verify the 409 error message appears: "Cannot delete — member has inquiries. Deactivate instead."
10. **Search and filter**: Use the search box and filter dropdowns. Verify the results update correctly.

- [ ] **Step 2: Document any issues found**

If any issues are found during smoke testing, document them for follow-up fixes.

---

## Self-Review Notes

### Spec Coverage Check

- ✅ New RBAC module `members` (scope_aware=False) — Tasks 1, 2
- ✅ Admin API: list (with search/filter), get, update, activate/deactivate, manual verify, delete — Tasks 5-8, 10-12
- ✅ Admin frontend: list page, detail/edit page, MemberForm component, action buttons — Tasks 17-20
- ✅ Database migration: insert `menu-members` menu item, grant admin role permission — Task 9
- ✅ Backend tests covering all endpoints — Tasks 10-12
- ✅ Proxy routes — Tasks 15-16
- ✅ `AdminMember` type — Task 13
- ✅ `members` namespace in `adminApi` — Task 14
- ✅ `ALLOWED_PAGE_IDS` update — Task 4
- ✅ Menu registry update — Task 3

### Placeholder Scan

No placeholders found. All code blocks contain complete implementations.

### Type Consistency

- `AdminMemberRead` (backend) ↔ `AdminMember` (frontend) — fields match
- `AdminMemberUpdate` schema ↔ `MemberForm` payload — `name`, `company`, `phone` match
- `AdminMemberActivate` schema ↔ `MemberActions` activate payload — `is_active` matches
- CRUD method signatures consistent across `crud_member` calls in routes
- Proxy routes forward to correct backend paths (`/api/admin/members`, `/api/admin/members/{id}`, `/api/admin/members/{id}/activate`, `/api/admin/members/{id}/verify`, `/api/admin/members/{id}` for DELETE)

### Notes for Implementer

- The `members` module is `scope_aware=False`, so no scope filtering is needed in the admin endpoints. All admins with the `members` permission can see all members.
- The `MemberForm` component does NOT include an email field (email is immutable per spec).
- The `MemberActions` component handles three actions (activate/deactivate, verify, delete) in a single client component to avoid creating three separate components.
- The delete proxy route is at `/api/admin/members/[id]/delete/route.ts` (uses DELETE method) — this matches the pattern of having the HTTP method in the route file, with the path segment `delete` for clarity (though the backend DELETE goes to `/api/admin/members/{id}` directly).
- The list page uses native HTML form GET submission for filters (simpler than client-side state management).
