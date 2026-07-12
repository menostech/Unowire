# InMail Feature Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Branch:** feat/media-picker-modal

## Overview

Add an in-mail (inquiry) system that allows registered public members to send messages to manufacturers (both cable `Manufacturer` and `EquipmentManufacturer`). Manufacturer-side backend staff (users with `cable_manager` or `equipment_manager` roles) receive and reply to these inquiries in the admin dashboard. The system also includes a configurable SMTP email notification layer with editable templates.

## Confirmed Requirements

- **Member system**: New public registration with email verification, independent from backend staff RBAC
- **Message model**: Single-round Q&A (member sends one message, manufacturer replies once)
- **Recipients**: Both `Manufacturer` and `EquipmentManufacturer` types supported
- **Notifications**: In-app unread badges + email notifications to staff's `User.email`
- **Member center**: Members have an inbox page to view sent inquiries and replies
- **Email config**: Platform SMTP settings and email templates managed in admin backend (not env vars)
- **Nav change**: Public site nav keeps only Cables / Manufacturers links; register/login entry added after search box

## Architecture Decision: Independent Members Table (Approach A)

A new `members` table is created, completely separate from the existing `users` (staff) table. Members use independent auth endpoints (`/api/member/*`) and a separate cookie (`member_token`).

**Rationale:** Backend staff and public members are fundamentally different identity types. Data isolation is more important than code reuse. The existing RBAC system is designed for back-office use; forcing public members into it would add unnecessary complexity and security risk.

## 1. Data Models

### 1.1 Member Table

| Field | Type | Notes |
|-------|------|-------|
| id | BigInteger PK | autoincrement |
| email | String(200) UNIQUE NOT NULL | login email |
| password_hash | String(200) NOT NULL | bcrypt |
| name | String(100) NOT NULL | display name |
| company | String(200) | company name |
| phone | String(50) | phone number |
| is_active | Boolean DEFAULT TRUE | account status |
| is_verified | Boolean DEFAULT FALSE | email verification status |
| verification_token | String(200) NULLABLE | cleared after verification |
| created_at | DateTime | |
| updated_at | DateTime | |

### 1.2 Inquiry Table

| Field | Type | Notes |
|-------|------|-------|
| id | BigInteger PK | autoincrement |
| sender_id | BigInteger FK → members.id | sender (member) |
| recipient_type | String(20) NOT NULL | 'manufacturer' or 'equipment_manufacturer' |
| recipient_id | String(100) NOT NULL | Manufacturer.id or EquipmentManufacturer.id |
| subject | String(200) NOT NULL | message subject |
| body | Text NOT NULL | message body |
| reply_body | Text NULLABLE | manufacturer's reply |
| replied_at | DateTime NULLABLE | reply timestamp |
| replied_by | BigInteger NULLABLE FK → users.id | staff user who replied |
| is_read | Boolean DEFAULT FALSE | staff-side read status |
| is_member_read | Boolean DEFAULT FALSE | member-side read status (for replies) |
| created_at | DateTime | |

**Design notes:**
- `recipient_type` + `recipient_id` is a polymorphic foreign key supporting both manufacturer tables. This follows the existing `scope_resolvers` pattern.
- Single-round Q&A: one Inquiry record contains both the original message and the reply. No conversation/thread table needed.
- `replied_by` tracks which staff user replied, for accountability.
- `is_member_read` tracks whether the member has viewed the reply.

### 1.3 EmailConfig Table (Singleton)

| Field | Type | Notes |
|-------|------|-------|
| id | Integer PK | always 1 (singleton) |
| smtp_host | String(200) NOT NULL | SMTP server address |
| smtp_port | Integer NOT NULL | port (587/465 etc.) |
| smtp_user | String(200) NOT NULL | username |
| smtp_password | String(200) NOT NULL | encrypted (Fernet, key derived from JWT_SECRET) |
| from_name | String(100) NOT NULL | sender display name |
| from_email | String(200) NOT NULL | sender email |
| use_tls | Boolean DEFAULT TRUE | enable TLS |
| is_enabled | Boolean DEFAULT FALSE | master switch (when disabled, email is silently skipped) |
| updated_at | DateTime | |
| updated_by | BigInteger FK → users.id | last editor |

### 1.4 EmailTemplate Table

| Field | Type | Notes |
|-------|------|-------|
| id | String(50) PK | template identifier (e.g. 'verify_email') |
| name | String(100) NOT NULL | display name |
| subject | String(200) NOT NULL | subject template (with placeholders) |
| body | Text NOT NULL | body template (with placeholders) |
| is_system | Boolean DEFAULT FALSE | system templates cannot be deleted |
| is_active | Boolean DEFAULT TRUE | disabled templates are skipped |
| created_at | DateTime | |
| updated_at | DateTime | |

### 1.5 Preset Email Templates (seeded via migration)

| id | name | placeholders |
|----|------|--------------|
| verify_email | Email Verification | `{name}`, `{verify_url}` |
| inquiry_received | Inquiry Received | `{staff_name}`, `{member_name}`, `{member_company}`, `{subject}`, `{body}`, `{inquiry_url}` |
| inquiry_replied | Inquiry Replied | `{member_name}`, `{subject}`, `{reply_body}`, `{inquiry_url}` |

## 2. Authentication System

### 2.1 Member Authentication (Independent)

**JWT signing**: Reuses the existing `core/security.py` `create_access_token` utility, but the token subject stores `member.id` and the payload includes `"type": "member"` to distinguish from staff tokens.

**Cookie**: Separate cookie name `member_token`, distinct from the backend `admin_token`. Settings: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production.

**Dependency**: New `get_current_member` function in `api/deps.py` that parses `member_token`, queries the `members` table, and returns the Member object. Returns 401 if not logged in or token invalid.

### 2.2 Auth Endpoints (prefix `/api/member/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/member/register` | POST | Create member, generate verification_token, send verification email. Returns "please check your email" message. |
| `/api/member/verify` | POST | Validate token, set is_verified=true, clear token. |
| `/api/member/login` | POST | Verify password + is_verified, sign member_token cookie. |
| `/api/member/logout` | POST | Clear cookie. |
| `/api/member/me` | GET | Return current member info. |

### 2.3 Registration Flow

1. Member fills email + password + name + company + phone
2. Backend generates verification_token (UUID4), stores in members table with is_verified=false
3. Sends verification email to member.email with link `https://www.unowire.com/verify?token=xxx`
4. Member clicks link, frontend calls `/api/member/verify`
5. On success, member can log in

**Anti-abuse:** Duplicate email registration returns 409. Verification token expires after 24 hours.

## 3. API Endpoints

### 3.1 Member-Side Inquiry API (prefix `/api/member/inquiries`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/member/inquiries` | POST | get_current_member | Send inquiry: recipient_type + recipient_id + subject + body |
| `/api/member/inquiries` | GET | get_current_member | List my sent inquiries (with replies) |
| `/api/member/inquiries/{id}` | GET | get_current_member | Inquiry detail (marks is_member_read=true) |
| `/api/member/inquiries/unread-count` | GET | get_current_member | Unread reply count (for badge) |

### 3.2 Admin-Side Inquiry API (prefix `/api/admin/inquiries`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/inquiries` | GET | require_module('inquiries') + scope filter | List inquiries (scope-filtered) |
| `/api/admin/inquiries/{id}` | GET | require_module('inquiries') + scope check | Inquiry detail (marks is_read=true) |
| `/api/admin/inquiries/{id}/reply` | POST | require_module('inquiries') + scope check | Reply: writes reply_body + replied_at + replied_by, triggers email to member |
| `/api/admin/inquiries/unread-count` | GET | require_module('inquiries') + scope filter | Unread inquiry count (for badge) |

### 3.3 Scope Filtering Logic (Admin Inquiries)

```
if user.role.scope_type == 'manufacturer':
    return inquiries WHERE recipient_type='manufacturer' AND recipient_id=user.scope_id
elif user.role.scope_type == 'equipment_manufacturer':
    return inquiries WHERE recipient_type='equipment_manufacturer' AND recipient_id=user.scope_id
else (admin/content_editor):
    return all inquiries
```

### 3.4 Email Config API (prefix `/api/admin/email`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/email/config` | GET | require_module('email_config') | Get SMTP config |
| `/api/admin/email/config` | PUT | require_module('email_config') | Update SMTP config |
| `/api/admin/email/test` | POST | require_module('email_config') | Send test email to current staff's User.email |
| `/api/admin/email/templates` | GET | require_module('email_config') | List templates |
| `/api/admin/email/templates/{id}` | GET | require_module('email_config') | Template detail |
| `/api/admin/email/templates/{id}` | PUT | require_module('email_config') | Edit template |

### 3.5 RBAC Module Additions

`ADMIN_MODULES` constant gains 2 new entries:

```python
{"id": "inquiries", "name": "Inquiries", "scope_aware": True},
{"id": "email_config", "name": "Email Config", "scope_aware": False},
```

Preset role permission adjustments:
- admin: + inquiries, + email_config
- content_editor: unchanged (no inquiry access)
- cable_manager: + inquiries
- equipment_manager: + inquiries

### 3.6 Frontend Proxy Routes

Member-side (public):
- `/api/member/*` → proxy to backend `/api/member/*`

Admin-side:
- `/api/admin/inquiries/*` → proxy to backend `/api/admin/inquiries/*`
- `/api/admin/email/*` → proxy to backend `/api/admin/email/*`

## 4. Frontend Pages

### 4.1 Member-Side Pages (under `frontend/app/(site)/`)

| Route | Type | Description |
|-------|------|-------------|
| `/login` | Public | Member login page |
| `/register` | Public | Member registration page |
| `/verify` | Public | Email verification page (entered via email link with token param) |
| `/member` | Protected | Member center layout (sidebar: Inbox, My Inquiries, Profile) |
| `/member/inbox` | Protected | Inbox: replies from manufacturers, unread highlighted |
| `/member/inquiries` | Protected | My sent inquiries list |
| `/member/inquiries/[id]` | Protected | Inquiry detail (my message + manufacturer reply) |
| `/member/profile` | Protected | Account info editing |

**Manufacturer detail page entry**: Add "Contact this manufacturer" button on existing `/manufacturers/[slug]` and `/equipment/manufacturers/[slug]` pages. If not logged in, redirect to `/login`. If logged in, open a modal dialog with inquiry form (subject + body fields). The modal is a client component rendered within the manufacturer detail page.

### 4.2 Admin-Side Pages (under `frontend/app/admin/`)

| Route | Type | Description |
|-------|------|-------------|
| `/admin/inquiries` | Protected | Inquiry list (scope-filtered, unread highlighted) |
| `/admin/inquiries/[id]` | Protected | Inquiry detail + reply form |
| `/admin/settings/email` | Protected | SMTP config form + template list (two sections in one page) |
| `/admin/settings/email/templates/[id]` | Protected | Template edit page |

### 4.3 Nav Component Changes (`frontend/components/layout/Nav.tsx`)

**Current structure**: Logo | 5 nav links (Cables, Manufacturers, Automotive, Consumer Electronics, Industrial) | Search box

**Adjusted structure**: Logo | 2 nav links (Cables, Manufacturers) | Search box | Auth entry

Changes:
1. `links` array reduced to only Cables and Manufacturers (remove 3 category links)
2. New auth entry section after the search box:
   - **Not logged in**: "Register" and "Login" text links
   - **Logged in**: Member name (link to `/member/inbox`) + inbox icon (with unread badge) + logout button

**Implementation approach**: Nav remains a server component. Login state determined by checking `member_token` cookie via `cookies()` from `next/headers`. The unread badge is rendered as a small client component that fetches `/api/member/inquiries/unread-count`.

### 4.4 Navigation & Unread Badges

**Member-side**:
- Nav shows register/login links when logged out; member name + inbox icon when logged in
- `/member/inbox` and `/member/inquiries` sidebar shows unread counts

**Admin-side**:
- Settings group gains Email Config menu item
- New Inquiries menu item (near Media), with unread badge
- Top bar shows inquiry unread count

### 4.5 Menu Items (admin_menu_items)

Settings group new child:
- `menu-email-config` (page_id=email_config, sort_order=3)

Top-level new item:
- `menu-inquiries` (page_id=inquiries, sort_order=6, near Media)

### 4.6 Next.js Middleware Update

Current middleware only matches `/admin/:path*`. Add member route protection:
- `/member/*` paths check `member_token` cookie; if absent, redirect to `/login`

### 4.7 Frontend Page Registry Additions

`adminMenuRegistry.ts` ADMIN_PAGES gains:
- `{ pageId: "inquiries", href: "/admin/inquiries", defaultLabel: "Inquiries", defaultIcon: "Mail" }`
- `{ pageId: "email_config", href: "/admin/settings/email", defaultLabel: "Email Config", defaultIcon: "Mail" }`

Backend `ALLOWED_PAGE_IDS` gains: `"inquiries"`, `"email_config"`

## 5. Email Notification Flow

### 5.1 Trigger Scenarios

| Scenario | Recipient | Template | Trigger Point |
|----------|-----------|----------|---------------|
| Member registration | member.email | verify_email | `/api/member/register` success |
| Member sends inquiry | All bound staff User.email | inquiry_received | `/api/member/inquiries` POST success |
| Manufacturer replies | member.email | inquiry_replied | `/api/admin/inquiries/{id}/reply` success |

### 5.2 Email Sending Implementation

**Async**: Uses FastAPI `BackgroundTasks` to send email after response is returned, non-blocking.

**Email module** (`core/email.py`):
- `send_email(to_email, template_id, context: dict)` — main entry point
- Reads EmailConfig (cached in memory, 5-minute TTL)
- Reads EmailTemplate by id
- Replaces placeholders using `str.format_map` with a SafeDict (missing keys leave placeholder as-is)
- Sends via `aiosmtplib` (async SMTP)

**Fault tolerance**:
- EmailConfig.is_enabled=false → skip silently, no error
- SMTP connection failure → log error, do not block business flow
- Template not found or is_active=false → skip that email

### 5.3 Staff Recipient Resolution (for inquiry notifications)

```
Query manufacturer by recipient_type + recipient_id
Query all users WHERE scope_id = recipient_id AND role.scope_type = recipient_type
Collect these users' email addresses
```

### 5.4 Test Email

The "Test Send" button on the SMTP config page calls `/api/admin/email/test`, which sends a test email to the current staff user's `User.email` to verify the SMTP configuration.

## 6. Testing & Security

### 6.1 Backend Tests

| Test file | Coverage |
|-----------|----------|
| test_member_auth.py | register, verify, login, logout, me |
| test_member_inquiries.py | member sends inquiry, list, detail, unread count |
| test_admin_inquiries.py | staff list (scope filter), detail, reply, unread count |
| test_email_config.py | SMTP config CRUD, template CRUD, test send (mocked) |

Frontend: No automated tests required for MVP (per project convention).

### 6.2 Security Considerations

1. **Member password**: bcrypt hash, reuse `core/security.py` `hash_password` / `verify_password`
2. **Unverified members**: `is_verified=false` members cannot log in; prompt "please verify your email first"
3. **Inquiry ownership**: Members can only view inquiries where `sender_id == current_member.id`
4. **Staff scope check**: cable_manager can only view/reply inquiries WHERE `recipient_type='manufacturer' AND recipient_id=own scope_id`
5. **SMTP password**: Encrypted with Fernet symmetric encryption, key derived from `JWT_SECRET`
6. **Template injection prevention**: Placeholder replacement uses `str.format_map` + SafeDict, no Jinja2 engine, preventing SSTI
7. **Registration anti-abuse**: Duplicate email returns 409; verification_token expires after 24 hours

## 7. File Structure

### Backend additions

```
backend/app/
  models/
    member.py          # Member model
    inquiry.py         # Inquiry model
    email_config.py    # EmailConfig + EmailTemplate models
  schemas/
    member.py
    inquiry.py
    email_config.py
  crud/
    member.py
    inquiry.py
    email_config.py
  api/routes/
    member.py          # /api/member/* (auth + inquiries)
    admin_inquiries.py # /api/admin/inquiries/*
    admin_email.py     # /api/admin/email/*
  core/
    email.py           # SMTP send + template rendering
    security.py        # extended: member JWT helpers (reuses existing)
  alembic/versions/
    <new>_add_members_inquiries_email.py  # migration
```

### Frontend additions

```
frontend/app/
  (site)/
    login/page.tsx
    register/page.tsx
    verify/page.tsx
    member/
      layout.tsx
      inbox/page.tsx
      inquiries/page.tsx
      inquiries/[id]/page.tsx
      profile/page.tsx
  admin/(dashboard)/
    inquiries/page.tsx
    inquiries/[id]/page.tsx
    settings/email/page.tsx
    settings/email/templates/[id]/page.tsx
  api/member/          # member proxy routes
  api/admin/inquiries/ # inquiry proxy routes
  api/admin/email/     # email config proxy routes
frontend/components/
  layout/Nav.tsx              # modified
  member/                     # member-specific components
```

## 8. Out of Scope

The following are explicitly excluded from this spec:
- Multi-round conversations / threading (single-round Q&A only)
- Email notification to member when they send an inquiry (member is the sender, no need to notify themselves; member IS notified when manufacturer replies, per section 5.1)
- Member profile password change (can be added later)
- File attachments in inquiries
- Rate limiting on registration (basic duplicate-email check only)
- Internationalization (i18n) — MVP is English-only per project constraint
