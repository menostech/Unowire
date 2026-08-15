# UnoWire Project Structure

> UnoWire is a B2B cable industry platform: a public-facing cable/manufacturer catalog with an admin management backend and a member (registered site user) subsystem for inquiries.

## Tech Stack

| Layer       | Technology                                                                 |
|-------------|----------------------------------------------------------------------------|
| Frontend    | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4 |
| Backend     | FastAPI 0.115, SQLAlchemy 2.0 (async), Pydantic 2, Alembic 1.14           |
| Database    | PostgreSQL 16 (asyncpg driver)                                             |
| Auth        | JWT (PyJWT) — separate tokens for admin staff vs. site members             |
| Email       | aiosmtplib + Fernet encryption (cryptography) + SafeDict templates         |
| Deployment  | Docker Compose, Nginx (reverse proxy + HTTPS), PM2 (optional)              |
| Repo layout | Monorepo: `backend/` + `frontend/` + `deploy/` + `docs/`                   |

## Top-Level Layout

```
unowire/
├── backend/                 # FastAPI application
├── frontend/                # Next.js application
├── deploy/                  # Nginx config + deployment scripts
├── docs/                    # Design specs + implementation plans
├── docker-compose.yml       # Production composition (nginx + frontend + backend + db)
├── docker-compose.dev.yml   # Development overrides (hot reload, exposed ports)
├── .env.docker              # Docker env vars (DB_PASSWORD, JWT_SECRET, etc.)
├── industries.json          # Industry reference data (top-level seed)
└── .gitignore
```

---

## Backend (`backend/`)

FastAPI application following a layered architecture: **routes → crud → models/schemas**.

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory: router registration, error handlers, /media static mount
│   ├── api/
│   │   ├── deps.py          # Auth dependencies: get_current_user, require_module(), get_current_member
│   │   └── routes/          # One file per resource group (see Route Modules below)
│   ├── core/
│   │   ├── config.py        # Settings (pydantic-settings): DB URL, JWT, admin creds, public_base_url
│   │   ├── database.py      # async_engine, async_session, get_db() dependency
│   │   ├── security.py      # JWT encode/decode: decode_access_token (staff), decode_member_token (members)
│   │   ├── modules.py       # ADMIN_MODULES registry — single source of truth for RBAC modules (15 modules)
│   │   ├── scope_resolvers.py # Resolves scope_id for scoped roles (manufacturer, equipment_manufacturer)
│   │   └── email.py         # aiosmtplib client + Fernet-encrypted credentials + SafeDict template rendering
│   ├── models/              # SQLAlchemy ORM models (one per table)
│   ├── schemas/             # Pydantic v2 request/response schemas (one per resource)
│   ├── crud/                # Database access layer (CRUD classes per resource)
│   └── services/
│       └── cable_import.py  # CSV/JSON bulk import validation + transformation service
├── alembic/
│   ├── env.py               # Alembic environment (async engine)
│   └── versions/            # 14 migration files (initial schema → members menu item)
├── scripts/
│   ├── seed.py              # Seeds roles, admin user, menu items, default permissions
│   └── reset_db.py          # Development utility: drops and recreates all tables
├── tests/
│   ├── conftest.py          # Fixtures: TestClient, admin_headers, NullPool engine, cleanup
│   └── api/                 # 9 test files covering admin endpoints, RBAC, member auth, inquiries
├── media/
│   └── uploads/             # User-uploaded images (mounted as Docker volume `media_data`)
├── Dockerfile               # 3-stage: builder → development → production (uvicorn)
├── requirements.txt         # Pinned dependencies
├── alembic.ini              # Alembic config
└── pyproject.toml           # Ruff/Black config
```

### Route Modules (`backend/app/api/routes/`)

| File                       | Path Prefix              | Purpose                                           |
|----------------------------|--------------------------|---------------------------------------------------|
| `auth.py`                  | `/api/auth`              | Staff login/logout/me                             |
| `admin_users.py`           | `/api/admin/users`       | Staff user CRUD + scope listing                   |
| `admin_roles.py`           | `/api/admin/roles`       | Role CRUD + permission configuration              |
| `admin_menu.py`            | `/api/admin/menu`        | Admin sidebar menu customization                  |
| `admin_members.py`         | `/api/admin/members`     | Member management (list/edit/activate/verify/delete) |
| `admin_inquiries.py`       | `/api/admin/inquiries`   | Inquiry list/reply/unread-count                   |
| `admin_email.py`           | `/api/admin/email`       | SMTP config + email templates + test send         |
| `member.py`                | `/api/member`            | Member registration/login/verify/inquiries        |
| `cables.py`                | `/api/cables`            | Public cable catalog + detail                     |
| `brands.py`                | `/api/brands`            | Brand list                                        |
| `manufacturers.py`         | `/api/manufacturers`     | Public manufacturer list + detail                 |
| `categories.py`            | `/api/categories`        | Category tree                                     |
| `industries.py`            | `/api/industries`        | Industry list                                     |
| `product_types.py`         | `/api/product-types`     | Product type list                                 |
| `taxonomy.py`              | `/api/taxonomy`          | Full taxonomy tree (industry→category→product type) |
| `equipment.py`             | `/api/equipment`         | Recommended equipment list + match endpoint       |
| `equipment_manufacturers.py` | `/api/equipment-manufacturers` | Equipment manufacturer CRUD                |
| `equipment_categories.py`  | `/api/equipment-categories` | Equipment category tree                        |
| `cable_import.py`          | `/api/cables/import`     | Bulk cable import (validate + commit)             |
| `cable_import_templates.py`| `/api/cables/import`     | CSV template + JSON example download              |
| `uploads.py`               | `/api/uploads`           | Image upload (admin)                             |
| `folders.py`               | `/api/folders`           | Media library folder tree                         |
| `health.py`                | `/api/health`            | Health check                                      |

### RBAC Module Registry (`core/modules.py`)

15 admin modules. Scoped modules (`scope_aware=True`) restrict data access via `scope_id`:

| Module ID         | Scope Aware | Scope Type              |
|-------------------|-------------|-------------------------|
| dashboard         | No          | —                       |
| cables            | Yes         | manufacturer            |
| brands            | Yes         | manufacturer            |
| manufacturers     | Yes         | manufacturer            |
| industries        | No          | —                       |
| equipment_mfrs    | Yes         | equipment_manufacturer  |
| equipment_cats    | No          | —                       |
| equipment_list    | Yes         | equipment_manufacturer  |
| media             | No          | —                       |
| menu_config       | No          | —                       |
| users             | No          | —                       |
| roles             | No          | —                       |
| inquiries         | Yes         | (dynamic)               |
| email_config      | No          | —                       |
| members           | No          | —                       |

### Auth Architecture

- **Staff JWT**: `decode_access_token()` — rejects tokens with `type=="member"`
- **Member JWT**: `decode_member_token()` — separate function, sets `member_token` cookie
- **Module guard**: `Depends(require_module("module_id"))` checks both role permission and scope validity
- **Error format**: Custom `http_exception_handler` flattens `detail` into `{"code": N, "message": "..."}`

---

## Frontend (`frontend/`)

Next.js 16 App Router with route groups for site, admin, and API proxy layers.

```
frontend/
├── app/
│   ├── (site)/              # Public-facing pages (route group, no URL prefix)
│   │   ├── page.tsx         # Homepage
│   │   ├── layout.tsx       # Site layout (Nav + Footer)
│   │   ├── cables/          # Cable catalog overview + dynamic routes
│   │   ├── cable/           # Cable detail page ([brand_slug]/[slug])
│   │   ├── manufacturers/   # Manufacturer list + detail ([slug])
│   │   ├── categories/      # Category catch-all route ([...slugs])
│   │   ├── member/          # Member center (auth-gated, uses member_token cookie)
│   │   │   ├── layout.tsx   # Member layout
│   │   │   ├── profile/     # Member profile (read-only in MVP)
│   │   │   ├── inbox/       # Inquiry inbox
│   │   │   └── inquiries/   # Inquiry list + detail ([id])
│   │   ├── login/           # Member login
│   │   ├── register/        # Member registration
│   │   └── verify/          # Email verification
│   ├── admin/
│   │   ├── (auth)/login/    # Admin login (separate route group)
│   │   └── (dashboard)/     # Admin dashboard (auth-gated, uses admin_token cookie)
│   │       ├── layout.tsx   # Admin layout (sidebar from API tree)
│   │       ├── brands/      # Brand management (list/new/[id])
│   │       ├── cables/      # Cable management (list/new/[id]/import)
│   │       ├── equipment/   # Equipment management (list/new/[id]/categories/manufacturers)
│   │       ├── industries/  # Industry management (list/new/[id]/categories/product-types)
│   │       ├── inquiries/   # Inquiry management (list/[id])
│   │       ├── manufacturers/ # Manufacturer management
│   │       ├── media/       # Media library
│   │       ├── members/     # Member management (list/[id])
│   │       ├── menu/        # Menu customization (list/new/[id])
│   │       ├── roles/       # Role management (list/new/[id])
│   │       ├── settings/email/ # Email config + templates
│   │       └── users/       # Staff user management
│   ├── api/                 # Next.js Route Handlers (proxy layer)
│   │   ├── admin/           # Admin API proxies (reads admin_token cookie → Bearer)
│   │   └── member/          # Member API proxies (reads member_token cookie → Bearer)
│   ├── layout.tsx           # Root layout
│   ├── globals.css          # Global styles + Tailwind CSS variables (font: Arial)
│   ├── not-found.tsx        # 404 page
│   ├── robots.ts            # robots.txt generation
│   └── sitemap.ts           # sitemap.xml generation
├── components/
│   ├── admin/               # Admin-only components
│   │   ├── form/            # Entity forms (BrandForm, CableForm, MemberForm, etc.)
│   │   ├── layout/          # AdminSidebar
│   │   ├── list/            # List utilities (search boxes, filter selects, ImageCell)
│   │   ├── media/           # Media library (FolderTree, MediaGrid)
│   │   ├── menu/            # MenuSortButtons
│   │   ├── cable/           # ImportPreviewTable
│   │   └── MemberActions.tsx # Activate/verify/delete actions
│   ├── cable/               # Cable display (CableCard, CableFilters, spec table, variant comparison)
│   ├── category/            # CategoryCard
│   ├── equipment/           # RecommendedEquipmentCard
│   ├── layout/              # Site layout (Nav, Footer, Container, Breadcrumbs)
│   ├── member/              # InquiryFormModal, UnreadBadge
│   ├── seo/                 # JsonLd structured data
│   ├── shared/              # Pagination, SearchBox, SimilarCables, ProductCardImage
│   ├── taxonomy/            # IndustryCard, CategoryCard, ProductTypeCard
│   └── ui/                  # shadcn/ui primitives (button, card, input, badge, etc.)
├── lib/
│   ├── adminApi.ts          # Admin API client (namespaced: cables, brands, members, etc.)
│   ├── adminMenuRegistry.ts # Frontend page registry (valid page_ids for menu items)
│   ├── adminModules.ts      # Mirrors backend ADMIN_MODULES
│   ├── api.ts               # Public API client
│   ├── types.ts             # TypeScript interfaces (AdminMember, Cable, Manufacturer, etc.)
│   ├── filter.ts            # Cable filter logic
│   ├── seo.ts               # SEO metadata helpers
│   ├── utils.ts             # cn() class merge utility
│   └── *.ts                 # Client helpers (clientUploads, clientFolders, equipment-recommend, etc.)
├── data/                    # Static JSON data (taxonomy, manufacturers, brands, cables seed)
├── public/                  # Static assets (SVGs)
├── middleware.ts            # Route protection: /admin/* (admin_token), /member/* (member_token)
├── next.config.js           # Standalone output, image remotePatterns, /media/* rewrite to backend
├── Dockerfile               # 3-stage: builder → development → production (standalone)
└── package.json             # Next 16.2.9, React 19.2.4, Tailwind 4, shadcn
```

### Frontend Proxy Pattern

All admin/member API calls go through Next.js Route Handlers (`app/api/`), which:
1. Read the auth cookie (`admin_token` or `member_token`)
2. Forward the request to the backend at `INTERNAL_API_BASE` (`http://backend:8000`) with `Authorization: Bearer <token>`
3. Return the backend response to the client

This keeps tokens server-side only — no tokens in client-side JavaScript.

### Middleware (`middleware.ts`)

- `/admin/*` routes require `admin_token` cookie (redirects to `/admin/login` if missing)
- `/member/*` routes require `member_token` cookie (redirects to `/login` if missing)
- Login/register/verify pages are exempt

---

## Deployment (`deploy/`)

```
deploy/
├── nginx/
│   ├── Dockerfile           # Nginx image build
│   └── nginx.conf           # Reverse proxy config (HTTP — HTTPS terminated by host Nginx)
├── host-nginx.conf          # Host-level Nginx config (HTTPS + certbot + HSTS)
├── deploy.sh                # One-click deployment script (git pull → build → migrate → restart)
└── README.md                # Deployment instructions
```

### Nginx Routing (`nginx.conf`)

| Location         | Upstream              | Purpose                          |
|------------------|-----------------------|----------------------------------|
| `/_next/static/` | `frontend:3000`       | Next.js static assets (1yr cache)|
| `/api/admin/`    | `frontend:3000`       | Admin proxy routes (cookie auth) |
| `/api/`          | `backend:8000`        | Public backend API               |
| `/media/`        | `backend:8000`        | Uploaded images (1 day cache)    |
| `/`              | `frontend:3000`       | All other routes (SSR/ISR)       |

### Deployment Script (`deploy.sh`)

Run on server after `git push`:
```bash
./deploy/deploy.sh master
```
Steps: pull → `docker compose build` → `alembic upgrade head` → `python -m scripts.seed` → `docker compose up -d`

---

## Docker Setup

### `docker-compose.yml` (Production)

| Service  | Image              | Port  | Notes                                    |
|----------|--------------------|-------|------------------------------------------|
| nginx    | Custom (deploy/)   | 8080  | Reverse proxy, depends on frontend+backend |
| frontend | Custom (standalone)| 3000  | Next.js production server                |
| backend  | Custom (uvicorn)   | 8000  | FastAPI, mounts `media_data` volume      |
| db       | postgres:16-alpine | 5432  | PostgreSQL, `pgdata` volume              |

**Volumes:**
- `pgdata` — PostgreSQL data
- `media_data` — Uploaded images (mounted at `/app/media` in backend)

### `docker-compose.dev.yml` (Development)

Overrides for local development:
- Frontend runs `npm run dev` (hot reload via Turbopack)
- Backend runs `uvicorn --reload`
- Source code mounted as volumes for HMR

> **Note (Windows):** Docker Desktop on Windows + Turbopack has an HMR limitation — file system changes don't trigger `inotify` in Linux containers. Run `docker compose restart frontend` after code changes.

---

## Documentation (`docs/`)

```
docs/
└── superpowers/
    ├── specs/               # Design specifications (brainstorming output)
    │   ├── 2026-06-28-unowire-cable-database-design.md
    │   ├── 2026-06-29-fastapi-backend-design.md
    │   ├── ... (17 spec files total)
    │   └── 2026-07-09-admin-members-design.md
    └── plans/               # Implementation plans (writing-plans output)
        ├── 2026-06-28-unowire-cable-database-refactor.md
        ├── ... (17 plan files total)
        └── 2026-07-09-admin-members.md
```

Each feature follows the workflow: **brainstorming → spec → plan → SDD execution**.

---

## Key Configuration Files

| File                          | Purpose                                              |
|-------------------------------|------------------------------------------------------|
| `backend/app/core/config.py`  | Backend settings (DB, JWT, admin creds, base URL)   |
| `backend/.env.example`        | Environment variable template                        |
| `backend/alembic.ini`         | Alembic migration config                             |
| `backend/app/core/modules.py` | RBAC module registry (15 modules)                    |
| `frontend/next.config.js`     | Next.js config (standalone, images, /media rewrite)  |
| `frontend/middleware.ts`      | Route protection (admin/member auth)                 |
| `frontend/lib/adminModules.ts`| Frontend mirror of ADMIN_MODULES                     |
| `frontend/lib/adminMenuRegistry.ts` | Valid page_id registry for menu items         |
| `frontend/.env.production`    | Production env (NEXT_PUBLIC_SITE_URL)                |
| `frontend/.env.local`         | Local dev env                                        |
| `docker-compose.yml`          | Production service composition                       |
| `docker-compose.dev.yml`      | Development overrides                                |
| `.env.docker.example`         | Docker env template (commit-safe; copy to `.env.docker`) |
| `.env.docker`                 | Docker secrets (gitignored, server-only)             |
| `deploy/nginx/nginx.conf`     | Container Nginx config                               |
| `deploy/host-nginx.conf`      | Host Nginx config (HTTPS + certbot)                  |

---

## Data Flow Summary

```
Browser
  ↓
Host Nginx (HTTPS, HSTS) — deploy/host-nginx.conf
  ↓
Container Nginx (HTTP) — deploy/nginx/nginx.conf
  ↓
  ├─ /api/admin/* → Next.js Route Handler (reads admin_token cookie)
  │                  ↓ (forwards as Bearer token)
  │                FastAPI backend (require_module guard)
  │                  ↓
  │                PostgreSQL
  │
  ├─ /api/*       → FastAPI backend (direct)
  │
  ├─ /media/*     → FastAPI backend (StaticFiles mount)
  │                  ↑
  │                media_data Docker volume
  │
  └─ /*           → Next.js (SSR/ISR pages)
```

## Development Workflow

1. **Start dev environment:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

2. **Backend tests:**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m pytest -v
   ```

3. **Frontend type check:**
   ```bash
   cd frontend
   npx tsc --noEmit
   ```

4. **Run migration:**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m alembic upgrade head
   ```

5. **Seed data:**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m scripts.seed
   ```

6. **Deploy to production:**
   ```bash
   # On server:
   ./deploy/deploy.sh master
   ```

## Adding a New Admin Module

1. Add module entry to `backend/app/core/modules.py` (`ADMIN_MODULES` list)
2. Mirror it in `frontend/lib/adminModules.ts`
3. Register the page in `frontend/lib/adminMenuRegistry.ts`
4. Add the module to `ALLOWED_PAGE_IDS` in `backend/app/crud/menu.py`
5. Create an Alembic migration to insert the menu item + grant admin role permission
6. Create backend: model, schema, crud, route file, register in `main.py`
7. Create frontend: type, adminApi namespace, proxy routes, components, pages
8. (If scoped) Add a `scope_type` + resolver in `backend/app/core/scope_resolvers.py`
