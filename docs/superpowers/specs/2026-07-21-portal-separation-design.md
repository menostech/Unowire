# Portal Separation: Factory Portal vs Operator Admin Design

**Date:** 2026-07-21
**Status:** Approved (pending implementation plan)
**Branch:** To be created during implementation planning (e.g., `feat/portal-separation` from current HEAD of `master`)

## Goal

Separate the operator admin backend (`/admin/*`) from the factory tenant portal (`/portal/*`) so that factory users (cable manufacturers and equipment manufacturers) get a dedicated, branded entry point with isolated authentication, a curated feature set, and strict scope isolation — while operators keep the existing admin experience unchanged.

## Background

The current system mixes operators and factory users in a single admin backend:
- Both log in via `/admin/login` with the same `admin_token` cookie
- Both see the same `AdminSidebar`, filtered only by `allowed_modules`
- Scope checks (`user.role.scope_type` / `user.scope_id`) are scattered across some routes (`cables.py`, `equipment.py`, `manufacturers.py`, `admin_inquiries.py`, `folders.py`, `uploads.py`) but absent from others (`admin_users.py`, `admin_roles.py`, `admin_menu.py`, `pages.py`)
- Factory users can access operator-only modules (users, roles, menu, pages) if permissions are misconfigured
- Token, rate-limit, and session policies cannot differ between operator and factory users

This design introduces a dedicated `/portal/*` route group with isolated authentication, while hardening the existing `/admin/*` routes to reject factory users.

## Architecture

```
Browser
  ├── /admin/*           → Next.js admin app (existing, unchanged routes)
  │   └── admin_token cookie
  ├── /portal/*          → Next.js portal app (new route group)
  │   └── portal_token cookie (new)
  ├── /api/admin/*       → FastAPI admin routes (existing, hardened with require_operator)
  ├── /api/portal/*      → FastAPI portal routes (new, require_factory_user)
  ├── /api/page-views    → FastAPI public route (new, unauthenticated view tracking)
  ├── /api/*             → FastAPI public/member routes (existing, unchanged)
  └── /media/*           → FastAPI static files (existing, unchanged)
```

### Core Principles

1. **Route-level isolation.** Portal and admin are two independent API route groups, each with its own authentication. Portal routes never share an endpoint with admin routes.
2. **CRUD layer reuse.** Portal routes call existing CRUD methods (e.g., `crud_cable.get`, `crud_inquiry.list_for_staff`). New CRUD methods are added only where scope-filtered variants don't exist yet (e.g., `count_by_manufacturer`, `list_by_manufacturer`). No business logic is duplicated.
3. **Scope auto-injection.** Portal routes derive `scope_type` / `scope_id` from the authenticated factory user's identity. Route handlers never accept `scope_type` / `scope_id` as parameters.
4. **Admin route hardening.** Existing admin routes gain a `require_operator` dependency that rejects factory users (`scope_type != null`), even if permissions are misconfigured.
5. **Dual-token isolation.** JWT payload gains a `type` field (`"admin"` / `"portal"`). `get_current_user` (admin) validates `type == "admin"`; `get_current_factory_user` (portal) validates `type == "portal"` + `scope_type != null`. The two tokens are not interchangeable.
6. **Strict scope isolation.** Every portal response — list, detail, nested relation, media upload — is filtered to the authenticated user's scope. Cross-scope access returns 404 (no existence leak).

### What Does NOT Change

- Single Next.js app (portal is a new route group, not a separate app)
- Single FastAPI app (portal routes are a new router group in the same process)
- Single Postgres database (no schema changes to existing tables; one new `page_views` table)
- `users` table structure unchanged (factory users identified by `role.scope_type != null`)
- Existing public routes and member routes unchanged
- Existing admin frontend pages and sidebar unchanged
- Single domain `www.unowire.com` (portal at `/portal/*`, admin at `/admin/*`)

## Authentication & Sessions

### Dual-Token Model

| Dimension | admin_token (existing, hardened) | portal_token (new) |
|-----------|----------------------------------|--------------------|
| Login endpoint | `POST /api/auth/login` (existing) | `POST /api/portal/auth/login` (new) |
| Login page | `/admin/login` (existing) | `/portal/login` (new) |
| JWT payload | `{sub, email, role_id, type: "admin"}` | `{sub, email, role_id, type: "portal"}` |
| Cookie name | `admin_token` | `portal_token` |
| Cookie attributes | `httponly, secure, samesite=lax, path=/, max_age=28800` (8h, existing) | `httponly, secure, samesite=lax, path=/, max_age=14400` (4h, shorter) |
| Rate limit | Shared existing 5min/10 attempts | Independent counter 5min/5 attempts (stricter) |
| Logout | `POST /api/auth/logout` (existing) | `POST /api/portal/auth/logout` (new) |

### JWT Type Field

- `create_access_token(user_id, email, role_id, token_type)` gains a `token_type` parameter.
- Existing admin token issuance passes `token_type="admin"` (backward compatible: old tokens without `type` field are treated as `admin`).
- Portal token issuance passes `token_type="portal"`.
- Old admin tokens (no `type` field) remain valid until natural expiry; `get_current_user` reads `payload.get("type", "admin")`.

### Backend Dependencies (`backend/app/api/deps.py`)

```python
async def get_current_user(token, db):
    """Existing, hardened: validates type == 'admin' (or missing type for legacy tokens)."""
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(401)
    if payload.get("type", "admin") != "admin":
        raise HTTPException(401, "Not authenticated")
    # ... existing user lookup ...

async def get_current_factory_user(token, db):
    """New: validates type == 'portal' + user has scope_type != null."""
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(401)
    if payload.get("type") != "portal":
        raise HTTPException(401)
    user = ...  # load with role
    if user is None or not user.is_active:
        raise HTTPException(401)
    if user.role.scope_type is None or user.scope_id is None:
        raise HTTPException(403, "Not a factory user")
    return user

def require_operator(module: str):
    """New: require_module + reject factory users (scope_type != null)."""
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role and user.role.scope_type is not None:
            raise HTTPException(403, "Operator access only")
        allowed = getattr(user, "role_permissions", None) or set()
        if module not in allowed:
            raise HTTPException(403, f"No access to module: {module}")
        return user
    return checker

def require_factory_module(module: str):
    """New: validates factory user + fixed permission matrix (ignores role_permissions)."""
    async def checker(user: User = Depends(get_current_factory_user)) -> User:
        scope_type = user.role.scope_type
        # Fixed permission matrix — factory users see a curated set, not dynamic role_permissions
        allowed_by_scope = {
            "manufacturer": {"dashboard", "cables", "brands", "inquiries", "media", "me"},
            "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me"},
        }
        allowed = allowed_by_scope.get(scope_type, set())
        if module not in allowed:
            raise HTTPException(403, f"No access to module: {module}")
        return user
    return checker
```

### Login Route Cross-Protection

- `POST /api/auth/login`: after successful credential verification, if `user.role.scope_type is not None` (factory user), return 403 `{"code":403,"message":"Use /portal/login"}`. Prevents factory users from using the operator login endpoint.
- `POST /api/portal/auth/login`: after successful credential verification, if `user.role.scope_type is None` (operator), return 403 `{"code":403,"message":"Use /admin/login"}`. Prevents operators from using the portal login endpoint.

### Frontend Middleware (`frontend/middleware.ts`)

```typescript
// Portal routes: skip login page
if (pathname.startsWith('/portal') && pathname === '/portal/login') {
  return NextResponse.next();
}

// Portal routes require portal_token
if (pathname.startsWith('/portal')) {
  const token = request.cookies.get('portal_token')?.value;
  if (!token) {
    const loginUrl = new URL('/portal/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

// Existing admin/member logic unchanged
```

Matcher updated: `['/admin/:path*', '/member/:path*', '/portal/:path*']`.

## Backend Route Design

### New `/api/portal/*` Route Group

Files: `backend/app/api/routes/portal_*.py`.

| Method | Path | Function | Reused CRUD |
|--------|------|----------|-------------|
| POST | `/api/portal/auth/login` | Factory user login, issue portal_token | — |
| POST | `/api/portal/auth/logout` | Clear portal_token | — |
| GET | `/api/portal/auth/me` | Current factory user info + scope | — |
| GET | `/api/portal/auth/me/permissions` | allowed_modules + scope_type/scope_id | — |
| GET | `/api/portal/dashboard` | Dashboard: scope stats, inquiry trend, views trend, recent inquiries | New count methods + `crud_inquiry.unread_count_for_staff` |
| GET | `/api/portal/cables` | List scope cables (auto-filter manufacturer_id == scope_id) | New `crud_cable.list_by_manufacturer` |
| GET | `/api/portal/cables/{id}` | Detail + ownership | `crud_cable.get` + ownership check |
| PUT | `/api/portal/cables/{id}` | Edit + ownership | `crud_cable.update` + ownership check |
| GET | `/api/portal/brands` | List scope brands | New `crud_brand.list_by_manufacturer` |
| GET | `/api/portal/brands/{id}` | Detail + ownership | `crud_brand.get` |
| PUT | `/api/portal/brands/{id}` | Edit + ownership | `crud_brand.update` |
| GET | `/api/portal/equipment` | List scope equipment (equipment_manufacturer scope) | New `crud_equipment.list_by_manufacturer` |
| GET | `/api/portal/equipment/{id}` | Detail + ownership | `crud_equipment.get` |
| PUT | `/api/portal/equipment/{id}` | Edit + ownership | `crud_equipment.update` |
| GET | `/api/portal/inquiries` | List scope inquiries | `crud_inquiry.list_for_staff` |
| GET | `/api/portal/inquiries/unread-count` | Unread count | `crud_inquiry.unread_count_for_staff` |
| GET | `/api/portal/inquiries/{id}` | Detail + ownership | `crud_inquiry.get_with_recipient_name` + scope check |
| POST | `/api/portal/inquiries/{id}/reply` | Reply + email notify | `crud_inquiry.reply` |
| GET | `/api/portal/folders` | List scope media folders | `crud_folder.list` with scope |
| POST | `/api/portal/folders` | Create folder | `crud_folder.create` with scope |
| GET | `/api/portal/uploads` | List scope uploads | `crud_upload.list` with scope |
| POST | `/api/portal/uploads` | Upload file | `crud_upload.create` with scope |
| DELETE | `/api/portal/uploads/{id}` | Delete + ownership | `crud_upload.remove` |
| GET | `/api/portal/me` | Profile view | — |
| PUT | `/api/portal/me` | Change password | `verify_password` + `hash_password` |

### Design Points

1. **Scope auto-injection.** Every portal route obtains `user` via `require_factory_module(module)`, deriving `scope_type` from `user.role.scope_type` and `scope_id` from `user.scope_id`. Route handlers never accept scope parameters from the client.

2. **Ownership check pattern.** All `/{id}` routes fetch the entity first, then validate `entity.manufacturer_id == user.scope_id` (cable_manager scope) or `entity.id == user.scope_id` (manufacturer scope) or `entity.manufacturer_id == user.scope_id` (equipment_manufacturer scope). Mismatch returns 404 (no existence leak).

3. **Fixed permission matrix.** Portal routes use a fixed `allowed_by_scope` map (in `require_factory_module`) instead of reading `role_permissions` dynamically. This ensures factory users can only ever access the curated feature set, even if an operator misconfigures role permissions. The matrix:
   - `manufacturer` scope: `{dashboard, cables, brands, inquiries, media, me}`
   - `equipment_manufacturer` scope: `{dashboard, equipment, inquiries, media, me}`

4. **Modules never exposed to portal.** `industries`, `pages`, `site-menu`, `members`, `roles`, `users`, `email`, `messages`, `menu-config` are operator-only — no portal route exists for them.

5. **CRUD layer extensions.** New methods added where scope-filtered variants don't exist:
   - `crud_cable.list_by_manufacturer(db, scope_id, skip, limit)`
   - `crud_cable.count_by_manufacturer(db, scope_id)`
   - `crud_brand.list_by_manufacturer(db, scope_id, skip, limit)`
   - `crud_brand.count_by_manufacturer(db, scope_id)`
   - `crud_equipment.list_by_manufacturer(db, scope_id, skip, limit)`
   - `crud_equipment.count_by_manufacturer(db, scope_id)`
   - `crud_inquiry.count_for_staff(db, scope_type, scope_id)`
   - `crud_inquiry.daily_trend_for_staff(db, scope_type, scope_id, days=30)`
   - `crud_inquiry.recent_for_staff(db, scope_type, scope_id, limit=5)`
   Existing admin route CRUD signatures are not modified.

### Admin Route Hardening

- All existing admin routes replace `require_module(module)` with `require_operator(module)`.
- `require_operator` adds: reject `user.role.scope_type is not None` (factory users).
- Existing scope checks in `cables.py`, `equipment.py`, `manufacturers.py`, `admin_inquiries.py`, `folders.py`, `uploads.py` remain unchanged (they already filter correctly).
- Routes without scope checks (`admin_users.py`, `admin_roles.py`, `admin_menu.py`, `pages.py`, etc.) are protected by `require_operator` rejecting factory users at the auth layer.

### Public View Tracking Endpoint

`POST /api/page-views` (unauthenticated, public):
- Request body: `{"entity_type": "cable" | "equipment", "entity_id": "<string>"}`
- Backend resolves the entity's `scope_type` / `scope_id` from the entity table, inserts a `page_views` row.
- Deduplication: same IP + same entity within 1 minute → ignore (in-memory counter with TTL, same pattern as `_login_attempts` in `auth.py`).
- Failure (DB error, entity not found) → silently dropped, returns 200 (does not block page render).

### Next.js API Route Proxies (`frontend/app/api/portal/`)

Mirrors the existing `/api/admin/` proxy pattern. Each portal backend route gets a corresponding Next.js route handler that forwards to `http://backend:8000/api/portal/*` with `Authorization: Bearer ${portal_token}` read from the `portal_token` cookie.

### Route Registration (`backend/app/main.py`)

```python
from app.api.routes import (
    portal_auth, portal_dashboard, portal_cables, portal_brands,
    portal_equipment, portal_inquiries, portal_media, portal_me,
    page_views,
)

app.include_router(portal_auth.router)
app.include_router(portal_dashboard.router)
app.include_router(portal_cables.router)
app.include_router(portal_brands.router)
app.include_router(portal_equipment.router)
app.include_router(portal_inquiries.router)
app.include_router(portal_media.router)
app.include_router(portal_me.router)
app.include_router(page_views.router)
```

## Frontend Structure

### New `frontend/app/portal/` Route Group

```
frontend/app/portal/
├── layout.tsx              # Portal root layout (independent sidebar + header)
├── login/
│   └── page.tsx            # Factory user login (POST /api/portal/auth/login)
├── page.tsx                # Dashboard (GET /api/portal/dashboard)
├── cables/
│   ├── page.tsx            # List (scope-filtered)
│   └── [id]/
│       └── page.tsx        # Detail/edit
├── brands/
│   ├── page.tsx
│   └── [id]/
│       └── page.tsx
├── equipment/
│   ├── page.tsx
│   └── [id]/
│       └── page.tsx
├── inquiries/
│   ├── page.tsx            # List
│   └── [id]/
│       └── page.tsx        # Detail + reply form
├── media/
│   └── page.tsx            # Media library (scope-filtered)
└── settings/
    └── page.tsx            # Personal settings (change password)
```

### New `frontend/app/api/portal/` Proxy Routes

Mirrors existing `/api/admin/` proxy pattern — one Next.js route handler per portal backend route, forwarding requests with `portal_token` cookie as `Authorization` header.

### New `frontend/components/portal/`

```
frontend/components/portal/
├── layout/
│   └── PortalSidebar.tsx   # Factory portal sidebar (independent from AdminSidebar)
├── form/
│   ├── CableEditForm.tsx   # Factory cable edit form (simplified)
│   ├── BrandEditForm.tsx
│   ├── EquipmentEditForm.tsx
│   └── ReplyForm.tsx        # Inquiry reply form
├── DashboardStats.tsx       # Stat cards
├── InquiryTrendChart.tsx    # recharts line chart (client component)
├── ViewsTrendChart.tsx      # recharts line chart (client component)
└── RecentInquiries.tsx      # Recent inquiries list
```

### PortalSidebar Design

Fixed menu (not read from `admin_menu_items` table — factory portal feature set is curated):

| Menu Item | Path | Visibility |
|-----------|------|------------|
| Dashboard | `/portal` | All factory users |
| Cables | `/portal/cables` | `scope_type == "manufacturer"` only |
| Brands | `/portal/brands` | `scope_type == "manufacturer"` only |
| Equipment | `/portal/equipment` | `scope_type == "equipment_manufacturer"` only |
| Inquiries | `/portal/inquiries` | All factory users (with unread badge) |
| Media | `/portal/media` | All factory users |
| Settings | `/portal/settings` | All factory users |

Menu visibility determined by `user.role.scope_type` fetched from `/api/portal/auth/me`.

### New `frontend/lib/portalApi.ts`

Mirrors existing `adminApi.ts` — encapsulates portal API calls, reads `portal_token` from cookies.

### Visual Differentiation

- Admin sidebar: dark gray (`bg-gray-900`), title "Unowire Admin"
- Portal sidebar: blue (`bg-blue-900`), title displays factory name (e.g., "Acme Cable Co.")

### Existing Admin Frontend Changes

- `AdminSidebar.tsx`: unchanged (operators still use `/admin/*`)
- Existing admin pages: unchanged
- `middleware.ts`: new `/portal/*` matcher added (see Authentication section)

### Nginx Configuration (`deploy/nginx/nginx.conf`)

```nginx
# New: portal API proxy (same pattern as admin)
location /api/portal/ {
    proxy_pass http://frontend:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Existing location / covers /portal page routes — no new location needed.
# Existing location /api/ covers /api/page-views — no new location needed.
```

### Deployment Model Unchanged

- Single Next.js app (new portal route group)
- Single docker-compose (frontend container unchanged)
- Single domain `www.unowire.com` (new `/portal/*` path)

## Dashboard

### `GET /api/portal/dashboard` Response

```json
{
  "factory_name": "Acme Cable Co.",
  "scope_type": "manufacturer",
  "stats": {
    "cables_count": 12,
    "views_total": 3420,
    "views_trend_30d": 870,
    "inquiries_total": 45,
    "inquiries_unread": 2
  },
  "inquiry_trend": [
    {"date": "2026-06-22", "count": 3},
    {"date": "2026-06-23", "count": 1},
    {"date": "2026-06-24", "count": 0}
  ],
  "views_trend": [
    {"date": "2026-06-22", "count": 45},
    {"date": "2026-06-23", "count": 38}
  ],
  "recent_inquiries": [
    {
      "id": 1024,
      "subject": "Price quote for ABC-100 cable",
      "created_at": "2026-07-21T08:30:00Z",
      "is_read": false
    }
  ]
}
```

For `scope_type == "equipment_manufacturer"`, `stats.cables_count` is replaced by `stats.equipment_count`, and cable/brand-related stats are omitted.

### New `page_views` Table

```python
class PageView(Base):
    __tablename__ = "page_views"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "cable" | "equipment"
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False)  # denormalized for fast scope aggregation
    scope_id: Mapped[str] = mapped_column(String(100), nullable=False)
    viewed_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    # Index: (scope_type, scope_id, viewed_at) for trend queries
    # Index: (entity_type, entity_id) for per-entity queries
```

### View Tracking Instrumentation

- `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`: during SSR, fire-and-forget `POST /api/page-views` with `{entity_type: "cable", entity_id: cable.id}`. Errors are silently caught; never block render.
- `frontend/app/(site)/equipment/[slug]/page.tsx`: same with `{entity_type: "equipment", entity_id: equipment.id}`.
- `POST /api/page-views`: unauthenticated public endpoint. Resolves entity's scope from the entity table, inserts a `page_views` row. Dedup: same IP + same entity within 1 minute → ignore (in-memory counter with TTL).

### New CRUD Methods

- `crud_page_view.record(db, entity_type, entity_id, request_ip)`: resolve scope, insert (with dedup)
- `crud_page_view.count_by_scope(db, scope_type, scope_id)`: total views
- `crud_page_view.count_by_scope_since(db, scope_type, scope_id, days)`: views in last N days
- `crud_page_view.daily_trend_by_scope(db, scope_type, scope_id, days=30)`: daily aggregation, zero-filled

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│  Welcome, Acme Cable Co.                                │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Cables   │ │ Views    │ │ Inquiries│ │ Unread   │   │
│  │   12     │ │  3,420   │ │    45    │ │    2     │   │
│  │          │ │ +870 30d │ │          │ │          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                         │
│  ┌──────────────────────────┐ ┌──────────────────────┐  │
│  │ Inquiry Trend (30 days)  │ │ Recent Inquiries     │  │
│  │  [line chart]            │ │  • Price quote for   │  │
│  └──────────────────────────┘ │    ABC-100 cable     │  │
│                               │    2026-07-21  [NEW] │  │
│  ┌──────────────────────────┐ │                      │  │
│  │ Views Trend (30 days)    │ │  • Specifications    │  │
│  │  [line chart]            │ │    for XYZ-200       │  │
│  └──────────────────────────┘ │    2026-07-20        │  │
│                               │                      │  │
│                               │  ... (5 items)       │  │
│                               │                      │  │
│                               │ [View All →]         │  │
│                               └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Chart Implementation

`recharts` (lightweight React charting library, Next.js 16 compatible). New `InquiryTrendChart.tsx` / `ViewsTrendChart.tsx` client components using `LineChart` with `ResponsiveContainer`.

New frontend dependency: `recharts` (~50KB gzipped, loaded only on portal dashboard page).

### Note on Recent Inquiries "Product" Field

The `inquiries` table has no `cable_id` / `equipment_id` foreign key — inquiries describe products via free-text `subject` + `body`. For MVP, `recent_inquiries` uses `inquiry.subject` as the product label. Structured product association would require a separate spec extending the `inquiries` table.

## Error Handling & Boundaries

### Authentication Errors

| Scenario | HTTP | Response | Frontend Behavior |
|----------|------|----------|-------------------|
| Portal route no token | 401 | `{"code":401,"message":"Not authenticated"}` | Middleware redirects to `/portal/login` |
| Portal token invalid/expired | 401 | Same | API proxy catches 401, redirects to `/portal/login` |
| Factory user uses admin_token on portal | 401 | Same | Token type mismatch, rejected |
| Operator uses portal_token on admin | 401 | Same | Token type mismatch, rejected |
| Factory user accesses other scope's data | 404 | `{"code":404,"message":"Not found"}` | No existence leak |
| Operator logs in at `/portal/auth/login` | 403 | `{"code":403,"message":"Use /admin/login"}` | Show message, link to `/admin/login` |
| Factory user logs in at `/api/auth/login` | 403 | `{"code":403,"message":"Use /portal/login"}` | Show message, link to `/portal/login` |

### Ownership Check Pattern

All `/{id}` portal routes:

```python
entity = await crud.get(db, entity_id)
if entity is None:
    raise HTTPException(404)  # does not exist
# Validate ownership
if not _owns(user, entity):
    raise HTTPException(404)  # exists but out of scope — still 404
return entity
```

Returns 404 (not 403) for out-of-scope access to avoid leaking entity existence.

### View Tracking Errors

- `POST /api/page-views` failure (DB error, entity not found) → silently dropped, returns 200, does not block page render.
- Frontend fire-and-forget: `catch` all errors, never throw.
- Dedup counter overflow → auto-clean expired entries (same pattern as `_login_attempts`).

### Rate Limit Errors

- Portal login exceeds 5min/5 attempts → 429 `{"code":429,"message":"Too many login attempts"}`.
- Frontend shows countdown prompt.

### JWT Type Validation Boundaries

- Legacy admin token (no `type` field) → `get_current_user` treats as `admin` (backward compatible).
- Legacy admin token cannot access portal routes (`get_current_factory_user` requires `type == "portal"`).
- Newly issued admin tokens include `type: "admin"`.

### Data Consistency

- Factory user deleted by operator → next request: `get_current_factory_user` returns 401, frontend redirects to login.
- Factory user deactivated (`is_active=False`) → same as above.
- Factory user's role changed to operator role (`scope_type=None`) → next portal request: `get_current_factory_user` returns 403, frontend prompts "Account permissions changed, please log in again".

### Strict Scope Isolation (Reinforced)

1. **All portal API responses strictly scope-filtered.** Not just `/{id}` detail routes — list routes auto-filter (cables list returns only `manufacturer_id == scope_id`, never other scopes' data).
2. **Nested relation data also scope-filtered.** Cable detail's associated brand, specs, variants must all belong to the same scope (no cross-scope leakage via nested relations).
3. **Media library scope isolation.** Files uploaded by factory users auto-bind to their scope; list returns only scope files; cross-scope file access via guessed URL returns 404 from portal API (static `/media/*` URLs are unguessable UUIDs — public access unchanged for MVP).
4. **Inquiry reply permission.** Factory users can only reply to inquiries where `recipient_type == their scope_type AND recipient_id == their scope_id`.
5. **No cross-scope query capability.** Portal API exposes no "list all manufacturers" or "search site-wide" endpoint. Factory users cannot enumerate other factories.

## Testing Strategy

### Backend Portal Tests (`backend/tests/api/test_portal_*.py`)

| File | Coverage |
|------|----------|
| `test_portal_auth.py` | Login issues portal_token; operator login at portal returns 403; factory user login at admin returns 403; portal_token cannot access admin routes; admin_token cannot access portal routes; logout clears cookie; rate limit 5min/5 |
| `test_portal_dashboard.py` | Correct stats (cables_count/views_total/inquiries_total/inquiries_unread); inquiry_trend 30-day zero-filled; views_trend 30-day zero-filled; recent_inquiries max 5 by created_at DESC; equipment_manufacturer scope returns equipment_count instead of cables_count; stats exclude other scope's data |
| `test_portal_cables.py` | List returns only scope cables; detail + ownership; edit success; edit other scope returns 404; list excludes other scope; detail other scope returns 404 |
| `test_portal_brands.py` | Same pattern as cables |
| `test_portal_equipment.py` | Same pattern (equipment_manufacturer scope) |
| `test_portal_inquiries.py` | List only scope inquiries; detail + ownership; reply success + email notify; unread count correct; list excludes other scope; reply to other scope returns 404 |
| `test_portal_media.py` | Folder list only scope; upload auto-binds scope; uploads list excludes other scope; delete other scope returns 404 |
| `test_portal_me.py` | View profile; change password (old password verified); old token still valid after password change (MVP — no token invalidation) |
| `test_page_views.py` | Record view; same IP+entity 1-min dedup; count_by_scope correct; daily_trend zero-filled |

### Admin Hardening Tests (extend `test_admin_*.py`)

| Test | Coverage |
|------|----------|
| `test_admin_rejects_factory_user` | Factory user's admin_token (if mis-issued) accessing `/api/admin/cables` returns 403 |
| `test_admin_rejects_portal_token` | portal_token accessing `/api/admin/*` returns 401 |

### Test Fixtures (`conftest.py` new)

```python
@pytest.fixture
async def factory_user_headers(client, db_session):
    """Create cable_manager role user + login for portal_token."""

@pytest.fixture
async def equipment_factory_user_headers(client, db_session):
    """Create equipment_manager role user + login for portal_token."""

@pytest.fixture
async def factory_cable(db_session, factory_user_headers):
    """Create a cable belonging to factory_user's scope."""
```

### Scope Isolation Reinforcement Tests

| File | New Tests |
|------|-----------|
| `test_portal_cables.py` | `test_list_excludes_other_scope`; `test_detail_other_scope_returns_404`; `test_edit_other_scope_returns_404` |
| `test_portal_brands.py` | Same 3 patterns |
| `test_portal_equipment.py` | Same 3 patterns |
| `test_portal_inquiries.py` | `test_list_excludes_other_scope`; `test_reply_other_scope_returns_404` |
| `test_portal_media.py` | `test_uploads_list_excludes_other_scope`; `test_upload_auto_binds_scope`; `test_delete_other_scope_upload_returns_404` |
| `test_portal_dashboard.py` | `test_stats_excludes_other_scope` |

### Frontend Tests

None (project convention: MVP does not require frontend automated tests).

### End-to-End Manual Verification (post-push)

1. Factory user visits `/portal/login`, logs in, redirects to `/portal`.
2. Factory user visits `/admin/login`, enters same credentials → 403 "Use /portal/login".
3. Operator visits `/portal/login`, enters operator credentials → 403 "Use /admin/login".
4. Factory user sees dashboard (stats + 2 trend charts + recent inquiries).
5. Factory user edits own cable successfully; attempts to access other scope's cable → 404.
6. Factory user replies to inquiry successfully.
7. Factory user with `cable_manager` scope sees Cables + Brands menu; `equipment_manufacturer` scope does not see them (menu auto-hidden).
8. Operator in `/admin/*` works normally, unaffected by portal.
9. Public cable detail page visit increments portal dashboard's Views count.

## Deployment & Migration

### Alembic Migration (new `m2n3o4p5q6r7_add_page_views_table.py`)

```python
"""add page_views table for portal dashboard

Revision ID: m2n3o4p5q6r7
Revises: l2b3c4d5e6f7
"""
def upgrade():
    op.create_table(
        "page_views",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("scope_type", sa.String(50), nullable=False),
        sa.Column("scope_id", sa.String(100), nullable=False),
        sa.Column("viewed_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_page_views_scope_date", "page_views",
                    ["scope_type", "scope_id", "viewed_at"])
    op.create_index("ix_page_views_entity", "page_views",
                    ["entity_type", "entity_id"])

def downgrade():
    op.drop_index("ix_page_views_entity", table_name="page_views")
    op.drop_index("ix_page_views_scope_date", table_name="page_views")
    op.drop_table("page_views")
```

### JWT Backward Compatibility

- `create_access_token` gains `token_type` parameter, default `"admin"`.
- Legacy admin tokens (no `type` field) remain valid; `get_current_user` reads `payload.get("type", "admin")`.
- No forced re-login for operators — new tokens naturally include `type` after old ones expire.

### Deployment Steps (existing `deploy/deploy.sh` unchanged)

```bash
./deploy/deploy.sh master
# Script already runs: git pull → docker build → alembic upgrade head → seed → up -d
```

`alembic upgrade head` applies `m2n3o4p5q6r7`, creating `page_views` table.

### Nginx Config Update (`deploy/nginx/nginx.conf`)

Add `location /api/portal/` block (see Frontend Structure section). Existing `location /api/` covers `/api/page-views`. Existing `location /` covers `/portal` page routes.

### Frontend Dependency Update (`frontend/package.json`)

```json
{
  "dependencies": {
    "recharts": "^2.12.0"
  }
}
```

### Docker Build Impact

- Frontend image: new `recharts` dependency, slightly longer build.
- Backend image: no new dependencies.
- No new services, no new ports, no new volumes.

### Rollback Strategy

- `alembic downgrade -1` reverts `page_views` table.
- Frontend rollback to previous commit (portal route group disappears, `/portal/*` returns 404).
- Legacy admin tokens remain valid; operator admin unaffected.

### Post-Deploy Verification Checklist

1. `alembic upgrade head` succeeds; `page_views` table exists.
2. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/portal/login` → 200.
3. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/portal` → 307 (redirect to login).
4. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/admin/login` → 200 (existing functionality unaffected).
5. Factory user logs into portal, dashboard data correct.
6. Operator logs into admin, everything normal.

## Acceptance Criteria

1. `POST /api/portal/auth/login` issues `portal_token` cookie with `type: "portal"` JWT payload, 4h max_age.
2. `POST /api/auth/login` rejects factory users (`scope_type != null`) with 403 "Use /portal/login".
3. `POST /api/portal/auth/login` rejects operators (`scope_type == null`) with 403 "Use /admin/login".
4. `portal_token` cannot access any `/api/admin/*` route (returns 401).
5. `admin_token` cannot access any `/api/portal/*` route (returns 401).
6. Legacy admin tokens (no `type` field) remain valid for `/api/admin/*` routes.
7. All `/api/admin/*` routes reject factory users via `require_operator` (returns 403).
8. `GET /api/portal/dashboard` returns stats, inquiry_trend (30-day zero-filled), views_trend (30-day zero-filled), recent_inquiries (max 5, DESC by created_at).
9. `GET /api/portal/cables` returns only cables where `brand.manufacturer_id == user.scope_id`.
10. `GET /api/portal/cables/{id}` returns 404 for cables outside the user's scope.
11. `GET /api/portal/inquiries` returns only inquiries where `recipient_type == user.scope_type AND recipient_id == user.scope_id`.
12. `POST /api/portal/inquiries/{id}/reply` returns 404 for inquiries outside the user's scope.
13. `POST /api/page-views` records a view; same IP+entity within 1 minute is deduplicated.
14. `/portal/login` page renders and accepts factory user credentials.
15. `/portal` dashboard renders with stats cards, 2 trend charts (recharts), and recent inquiries list.
16. PortalSidebar shows Cables/Brands for `manufacturer` scope; shows Equipment for `equipment_manufacturer` scope.
17. `middleware.ts` redirects unauthenticated `/portal/*` requests to `/portal/login?from=<path>`.
18. All existing admin tests pass (no regressions from `require_operator` hardening).
19. All existing public/member routes pass (no regressions).
20. `page_views` table created via alembic migration `m2n3o4p5q6r7`.

## Out of Scope

- Browser view tracking (only SSR page views are tracked; client-side SPA navigation is not).
- Media file access authentication (public `/media/*` URLs remain unguessable UUIDs; portal API list is scope-filtered, but direct URL access is not authenticated).
- Structured product association in inquiries (`inquiries` table has no `cable_id` / `equipment_id` FK; `recent_inquiries` uses `subject` as product label for MVP).
- Token invalidation on password change (old portal_token remains valid until natural expiry; MVP simplification).
- 2FA / IP whitelisting for portal (architecture supports future addition; not implemented in this spec).
- Refactoring existing admin pages to use the new `require_operator` pattern beyond the dependency swap (no UI changes to admin).
- Decomposing into separate Next.js apps or separate FastAPI services (single app, single service per project constraint).
