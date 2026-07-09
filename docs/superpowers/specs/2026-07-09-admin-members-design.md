# Admin Members Management — Design Spec

**Date**: 2026-07-09
**Branch**: `feat/media-picker-modal` (InMail feature branch, to be merged first) or a follow-up branch
**Status**: Approved (pending implementation)

## Overview

Add a backend admin module for managing registered Members (frontend site users who create inquiries). Members register themselves on the public site; admins need visibility and operational controls (view, edit, activate/deactivate, manual email verification, delete) without leaving the admin dashboard.

This module mirrors the existing staff Users management pattern for consistency.

## Scope

**In scope**:
- New RBAC module `members` (scope_aware=False)
- Admin API: list (with search/filter), get, update, activate/deactivate, manual verify, delete
- Admin frontend: list page, detail/edit page, MemberForm component, action buttons
- Database migration: insert `menu-members` menu item, grant admin role permission
- Backend tests covering all endpoints

**Out of scope**:
- Admin creating members on behalf of users (members self-register only)
- Editing member email (email is the identity/login key)
- Password reset (deferred to a future phase)
- CSV export
- Pagination (member volume expected low; can be added later)

## Architecture

### RBAC Module Integration

New module registered in both backend and frontend registries:

**Backend** (`backend/app/core/modules.py`):
```python
{"id": "members", "label": "Members", "scope_aware": False, "scope_type": None}
```

**Frontend** (`frontend/lib/adminModules.ts`):
```typescript
{ id: 'members', label: 'Members', scope_aware: false, scope_type: null }
```

**Menu page registry** (`frontend/lib/adminMenuRegistry.ts`):
```typescript
{ page_id: 'members', href: '/admin/members', label: 'Members', icon: 'Users' }
```

**Allowed page IDs** (`backend/app/crud/menu.py`):
- Add `"members"` to `ALLOWED_PAGE_IDS`

### Layered Architecture (mirrors existing staff Users)

- **Backend**: routes → CRUD → model (no new model; `Member` already exists)
- **Frontend**: server component pages → `adminApi.members.*` → proxy routes → backend

### Key Design Decisions

1. **No Create operation**: Members self-register via `/api/member/auth/register`. Admins never create members.
2. **Email immutable**: Email is the member identity and login key. Admin cannot edit it.
3. **No password operations**: Password reset is deferred (out of scope).
4. **Delete protected**: A member with associated inquiries cannot be deleted (409). Admins should deactivate instead.
5. **Manual verification**: When SMTP is misconfigured or emails bounce, admins can mark a member as verified directly (clears `verification_token`).

## Backend API Design

### Route File

`backend/app/api/routes/admin_members.py`, registered in `main.py` with prefix `/api/admin/members`.

All endpoints protected by `Depends(require_module("members"))`.

### Endpoints

| Method | Path | Description |
|------|------|------|
| GET | `/api/admin/members` | List members (with optional query filters) |
| GET | `/api/admin/members/{id}` | Get member detail |
| PUT | `/api/admin/members/{id}` | Edit member (name/company/phone) |
| PUT | `/api/admin/members/{id}/activate` | Toggle is_active |
| PUT | `/api/admin/members/{id}/verify` | Manually verify email |
| DELETE | `/api/admin/members/{id}` | Delete (409 if has inquiries) |

### List Query Parameters

- `q` (string, optional): search by email or name (ILIKE `%q%`)
- `is_verified` (bool, optional): filter by verification status
- `is_active` (bool, optional): filter by active status
- No pagination (member volume expected low)

### Schemas (`backend/app/schemas/admin_member.py`)

```python
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

### CRUD Extensions (`backend/app/crud/member.py`)

New methods on the existing CRUD class:

- `list_with_filters(db, q, is_verified, is_active)` → `list[Member]`
- `count_inquiries(db, member_id)` → `int`
- `set_active(db, member, is_active)` → `Member`
- `set_verified(db, member)` → `Member` (sets `is_verified=True`, clears `verification_token`)
- `has_inquiries(db, member_id)` → `bool`

### Delete Protection Logic

1. Query `inquiries.sender_id == member_id` for existence
2. If exists → 409 `{"code": 409, "message": "Cannot delete member with inquiries. Deactivate instead."}`
3. If not exists → delete member, return 204

## Frontend Design

### adminApi Namespace (`frontend/lib/adminApi.ts`)

```typescript
members: {
  all(filters?: { q?: string; is_verified?: boolean; is_active?: boolean }): Promise<AdminMember[]>
  getById(id: number): Promise<AdminMember | null>
  update(id: number, payload: { name: string; company?: string | null; phone?: string | null }): Promise<AdminMember>
  activate(id: number, is_active: boolean): Promise<AdminMember>
  verify(id: number): Promise<AdminMember>
  remove(id: number): Promise<void>
}
```

`AdminMember` type added to `frontend/lib/types.ts`, fields mirroring backend `AdminMemberRead`.

### Pages

| Path | File | Type | Description |
|------|------|------|------|
| `/admin/members` | `frontend/app/admin/(dashboard)/members/page.tsx` | server | List page |
| `/admin/members/[id]` | `frontend/app/admin/(dashboard)/members/[id]/page.tsx` | server | Detail + edit page |

No New page (admins do not create members).

### List Page (`members/page.tsx`)

- Header: title + search input (email/name) + filter dropdowns (verified status, active status)
- Table columns: ID, Email, Name, Company, Verified (badge), Active (badge), Inquiries (count), Created, Actions (Edit link)
- Filters passed via URL query params (`?q=&is_verified=&is_active=`); server component reads and passes to `adminApi.members.all(filters)`
- Pattern consistent with existing `users/page.tsx` (table + colored badges)

### Detail/Edit Page (`members/[id]/page.tsx`)

- Title: `Edit Member: {email}`
- Read-only email display
- MemberForm (client component): name, company, phone inputs + Save button
- Action buttons (separate client components to avoid full-page client):
  - **Activate/Deactivate button**: label depends on current state — shows "Deactivate" when `is_active=true`, shows "Activate" when `is_active=false`; calls `activate` endpoint with the target boolean (opposite of current state), `router.refresh()` on success
  - **Verify Email button**: visible only when `is_verified=false`, calls `verify` endpoint
  - **Delete button**: red, with confirmation dialog, calls `remove` endpoint; on 409 displays inline message "Cannot delete — member has inquiries. Deactivate instead."
- Uses `params: Promise<{ id: string }>` with `await params` (Next.js 15 async params)

### MemberForm Component (`frontend/components/admin/form/MemberForm.tsx`)

- Client component
- `loadError` state + `.catch()` error handling (established pattern from Task 26/28)
- 3 inputs (name/company/phone) with `htmlFor`/`id` pairs
- No email field (read-only), no password field

### Proxy Routes (`frontend/app/api/admin/members/`)

| File | Method |
|------|--------|
| `route.ts` | GET (with query params passthrough) |
| `[id]/route.ts` | GET, PUT (edit) |
| `[id]/activate/route.ts` | PUT |
| `[id]/verify/route.ts` | PUT |
| `[id]/delete/route.ts` | DELETE |

All proxy routes read `admin_token` cookie and forward as `Authorization: Bearer {token}` header, consistent with existing `api/admin/users/*` pattern.

## Database Migration

### File

`backend/alembic/versions/{new_rev}_add_members_menu_item.py`

### Menu Item Insertion

```sql
INSERT INTO admin_menu_items (id, parent_id, type, label, page_id, icon, sort_order, is_visible, created_at, updated_at)
VALUES ('menu-members', 'menu-settings', 'page', 'Members', 'members', 'Users', 4, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

- `parent_id='menu-settings'` (same group as Users, Roles, Email Config)
- `sort_order=4` (Email Config is 3, Members follows)
- `icon='Users'` (shared with Users)
- `is_visible=true`

### Admin Role Permission Grant

```sql
INSERT INTO role_permissions (role_id, module_id)
SELECT r.id, 'members' FROM roles r
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

### Dependencies

- Depends on the latest InMail migration (current branch HEAD)
- `members` module must be defined in `modules.py` before migration runs (code first, migration syncs data)

### Downgrade

```sql
DELETE FROM role_permissions WHERE module_id = 'members';
DELETE FROM admin_menu_items WHERE id = 'menu-members';
```

## Error Handling

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| Member not found (GET/PUT/DELETE) | 404 | `{"code": 404, "message": "Member not found"}` |
| Delete with inquiries | 409 | `{"code": 409, "message": "Cannot delete member with inquiries. Deactivate instead."}` |
| No `members` module permission | 403 | Handled by `require_module` middleware |
| Edit validation failure | 422 | Pydantic automatic response |

### Frontend Error Handling

- `MemberForm`: `loadError` state + `.catch()` for network errors
- Activate/Verify/Delete buttons: try/catch with inline error messages
- Delete 409: inline red message "Cannot delete — member has inquiries. Deactivate instead."
- Proxy routes: forward non-2xx status codes and JSON body (consistent with existing pattern)

## Testing Strategy

### Backend Tests (`backend/tests/api/test_admin_members.py`)

```
test_list_members_returns_all
test_list_members_with_search_query
test_list_members_filter_by_is_verified
test_list_members_filter_by_is_active
test_get_member_by_id
test_get_member_by_id_not_found_returns_404
test_update_member_fields
test_update_member_not_found_returns_404
test_activate_member_toggles_is_active
test_verify_member_sets_is_verified_true
test_verify_member_clears_verification_token
test_delete_member_without_inquiries_succeeds
test_delete_member_with_inquiries_returns_409
test_delete_member_not_found_returns_404
test_unauthorized_user_cannot_access_members
```

Coverage:
- List + 3 filter parameters
- Detail (including 404)
- Edit (including 404)
- Activate/deactivate
- Manual verification (including token clearing assertion)
- Delete (success + 409 + 404)
- Permission (403 for users without `members` module access)

### Frontend Tests

No automated frontend tests (project MVP constraint). Manual smoke testing only.

## Files Summary

### New Files

**Backend**:
- `backend/app/api/routes/admin_members.py`
- `backend/app/schemas/admin_member.py`
- `backend/tests/api/test_admin_members.py`
- `backend/alembic/versions/{new_rev}_add_members_menu_item.py`

**Frontend**:
- `frontend/app/admin/(dashboard)/members/page.tsx`
- `frontend/app/admin/(dashboard)/members/[id]/page.tsx`
- `frontend/components/admin/form/MemberForm.tsx`
- `frontend/app/api/admin/members/route.ts`
- `frontend/app/api/admin/members/[id]/route.ts`
- `frontend/app/api/admin/members/[id]/activate/route.ts`
- `frontend/app/api/admin/members/[id]/verify/route.ts`
- `frontend/app/api/admin/members/[id]/delete/route.ts`

### Modified Files

**Backend**:
- `backend/app/core/modules.py` (add `members` module)
- `backend/app/crud/member.py` (add admin CRUD methods)
- `backend/app/crud/menu.py` (add `"members"` to `ALLOWED_PAGE_IDS`)
- `backend/app/main.py` (register `admin_members` router)

**Frontend**:
- `frontend/lib/adminModules.ts` (mirror `members` module)
- `frontend/lib/adminMenuRegistry.ts` (register `members` page)
- `frontend/lib/adminApi.ts` (add `members` namespace)
- `frontend/lib/types.ts` (add `AdminMember` type)
