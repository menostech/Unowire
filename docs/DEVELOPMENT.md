# Unowire 二次开发文档

> 本文档面向二次开发者，涵盖项目架构、技术栈、目录结构、数据库设计、API 规范、认证体系、以及新增产品模块的完整流程。

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [仓库结构](#3-仓库结构)
4. [环境搭建](#4-环境搭建)
5. [后端架构 (FastAPI)](#5-后端架构-fastapi)
6. [前端架构 (Next.js)](#6-前端架构-nextjs)
7. [数据库设计](#7-数据库设计)
8. [认证与权限体系](#8-认证与权限体系)
9. [媒体文件夹系统](#9-媒体文件夹系统)
10. [部署架构](#10-部署架构)
11. [新增产品模块完整流程](#11-新增产品模块完整流程)
12. [种子数据与测试用户](#12-种子数据与测试用户)
13. [常见陷阱与约定](#13-常见陷阱与约定)

---

## 1. 项目概述

Unowire 是一个线缆与连接器行业 B2B 平台，采用前后端分离架构：

- **公开站点** (`/`)：线缆目录、设备推荐、端子接头目录、制造商主页、CMS 页面、会员询盘
- **管理后台** (`/admin`)：全量 CRUD、RBAC 角色权限、菜单配置、媒体管理、CMS、邮件配置
- **工厂 Portal** (`/portal`)：制造商自助管理自家产品、回复询盘、管理媒体、查看仪表盘

三类产品模块：
| 模块 | 复杂度 | 特点 |
|------|--------|------|
| Cable (线缆) | 高 | 多变体 + 类型化规格 + 3 级分类体系 (Industry → Category → ProductType) |
| Equipment (设备) | 中 | `applicable_specs` JSONB + 2 级自引用分类 |
| Terminal (端子接头) | 中 | 与 Equipment 结构完全一致，镜像复制 |

---

## 2. 技术栈

### 后端
| 依赖 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.12 | 运行时 |
| FastAPI | 0.115.* | Web 框架 |
| SQLAlchemy | 2.0.* (asyncio) | ORM |
| Alembic | 1.14.* | 数据库迁移 |
| asyncpg | 0.30.* | PostgreSQL 异步驱动 |
| Pydantic | 2.* | 数据校验 |
| pyjwt + passlib[bcrypt] | — | JWT + 密码哈希 |
| PostgreSQL | 16 | 数据库 |

### 前端
| 依赖 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.2.9 | React 全栈框架 (App Router) |
| React | 19.2.4 | UI 库 |
| TypeScript | 5.* | 类型系统 |
| Tailwind CSS | 4.* | 样式 |
| shadcn | 4.12.* | UI 组件库 |
| recharts | 3.10.* | 图表 |

### 基础设施
| 组件 | 用途 |
|------|------|
| Docker Compose | 容器编排 (nginx + frontend + backend + db) |
| Nginx | 反向代理 + 静态资源 |
| Gunicorn + Uvicorn worker | 生产 ASGI 服务器 |

---

## 3. 仓库结构

```
unowire/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口 + 路由注册 + 错误处理
│   │   ├── api/
│   │   │   ├── deps.py         # 认证依赖 (admin/portal/member)
│   │   │   └── routes/         # ~45 个路由模块
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic Settings
│   │   │   ├── database.py     # 异步引擎 + Base + get_db
│   │   │   ├── security.py     # JWT (3 种 token 类型) + bcrypt
│   │   │   ├── modules.py      # ADMIN_MODULES 注册表 + VALID_SCOPE_TYPES
│   │   │   └── scope_resolvers.py  # scope_id 校验器
│   │   ├── crud/
│   │   │   ├── base.py         # CRUDBase 泛型基类
│   │   │   └── *.py            # 各领域 CRUD
│   │   ├── models/             # SQLAlchemy 2.0 Mapped 模型
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   └── services/           # 导入服务 (cable/equipment/terminal)
│   ├── alembic/versions/       # 30 个迁移文件
│   ├── scripts/                # seed.py, seed_portal_users.py
│   └── requirements.txt
├── frontend/                   # Next.js 前端 + BFF
│   ├── app/
│   │   ├── (site)/             # 公开站点路由
│   │   ├── admin/              # 管理后台路由
│   │   ├── portal/             # 工厂 Portal 路由
│   │   └── api/                # BFF 路由处理器
│   ├── components/
│   │   ├── admin/              # 管理后台组件
│   │   ├── portal/             # Portal 组件
│   │   ├── cable/              # 线缆组件
│   │   ├── equipment/          # 设备组件
│   │   ├── terminals/          # 端子组件
│   │   ├── shared/             # 共享组件 (SearchBox, Pagination...)
│   │   └── ui/                 # shadcn 基础组件
│   ├── lib/
│   │   ├── api.ts              # 公开 API 客户端 (SSR 缓存)
│   │   ├── adminApi.ts         # 管理 API 客户端 (cookie 转发)
│   │   ├── portalApi.ts        # Portal SSR API 客户端
│   │   ├── portalApiClient.ts  # Portal 客户端 API 调用器
│   │   ├── adminModules.ts     # 前端模块注册表 (镜像后端)
│   │   ├── adminMenuRegistry.ts # 管理页面注册表
│   │   └── types.ts            # 前端类型定义
│   ├── data/                   # 种子数据 JSON
│   └── package.json
├── deploy/nginx/               # Nginx 配置
├── docker-compose.yml          # 生产编排
├── docker-compose.dev.yml      # 开发覆盖
├── .env.docker.example         # 环境变量模板（可提交）
└── .env.docker                 # 顶层环境变量（gitignored，本地填充）
```

---

## 4. 环境搭建

### 4.1 Docker 一键启动 (推荐)

```bash
# 开发环境
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.docker up -d

# 生产环境
docker compose --env-file .env.docker up -d
```

服务端口：
| 服务 | 开发端口 | 内部端口 |
|------|----------|----------|
| Nginx | 8080 | 80 |
| Frontend | 3000 | 3000 |
| Backend | — | 8000 |
| PostgreSQL | 5432 | 5432 |

### 4.2 本地开发 (不用 Docker)

**后端：**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# 配置 .env: DATABASE_URL=postgresql+asyncpg://unowire:unowire_dev@127.0.0.1:5432/unowire
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
# 配置 .env.local: INTERNAL_API_BASE=http://localhost:8000
npm run dev
```

### 4.3 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | 数据库连接串 (必须用 asyncpg 驱动) |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT 签名密钥 |
| `JWT_EXPIRY_HOURS` | `8` | Token 过期时间 |
| `ADMIN_EMAIL` | `admin@unowire.com` | 种子管理员邮箱 |
| `ADMIN_PASSWORD` | — | 种子管理员密码 |
| `DEBUG` | `False` | 开启 CORS + SQL echo |
| `INTERNAL_API_BASE` | `http://backend:8000` | 前端 SSR 请求后端的地址 |
| `MEDIA_DIR` | `/app/media` | 媒体文件存储路径 |

---

## 5. 后端架构 (FastAPI)

### 5.1 应用入口 (`backend/app/main.py`)

- 创建 FastAPI 实例，`docs_url=f"{settings.api_prefix}/docs"`
- 注册 ~45 个路由器
- 挂载 `/media` 静态文件
- 自定义错误处理器：所有响应统一为 `{"code": <int>, "message": <str>}` 格式

**错误处理约定：**
| 异常 | HTTP 状态码 | 说明 |
|------|-------------|------|
| `HTTPException` | 透传 | 保留 dict detail |
| `RequestValidationError` | 422 | 返回 `details[]` |
| `IntegrityError` | 409 | "Resource already exists or violates a constraint" |
| 其他 `Exception` | 500 | 统一错误消息 |

### 5.2 数据库会话 (`backend/app/core/database.py`)

```python
engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
```

> **关键：** `expire_on_commit=False` 是必须的 — 防止 commit 后访问属性时触发 async `MissingGreenlet` 错误。

### 5.3 CRUD 基类 (`backend/app/crud/base.py`)

```python
class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    async def get(self, db, id) -> ModelType | None
    async def get_multi(self, db, *, page=1, page_size=20, **filters) -> tuple[list, int]
    async def create(self, db, *, obj_in) -> ModelType
    async def update(self, db, *, db_obj, obj_in) -> ModelType  # exclude_unset=True
    async def remove(self, db, *, id) -> ModelType | None
```

具体 CRUD 类扩展基类，例如 `CRUDTerminal` 添加 `get_with_relations` (使用 `selectinload`)、`list_by_manufacturer` (Portal scope 过滤)、`get_matching_cable` (线缆匹配)。

### 5.4 已注册路由器

| 路由模块 | 前缀 | Tag | 说明 |
|----------|------|-----|------|
| `auth.router` | 内部 | auth | 管理员登录 |
| `manufacturers.router` | `/api/manufacturers` | manufacturers | 线缆制造商 |
| `cables.router` | `/api/cables` | cables | 线缆产品 |
| `equipment.router` | `/api/recommended-equipments` | recommended-equipments | 设备 |
| `equipment_manufacturers.router` | `/api/equipment-manufacturers` | equipment-manufacturers | 设备制造商 |
| `equipment_categories.router` | `/api/equipment-categories` | equipment-categories | 设备分类 |
| `terminals.router` | `/api/terminals` | terminals | 端子产品 |
| `terminal_manufacturers.router` | `/api/terminal-manufacturers` | terminal-manufacturers | 端子制造商 |
| `terminal_categories.router` | `/api/terminal-categories` | terminal-categories | 端子分类 |
| `portal_cables.router` | `/api/portal/cables` | portal-cables | Portal 线缆 |
| `portal_equipment.router` | `/api/portal/equipment` | portal-equipment | Portal 设备 |
| `portal_terminals.router` | `/api/portal/terminals` | portal-terminals | Portal 端子 |
| `admin_menu.router` | `/api/admin/menu` | admin-menu | 管理菜单 |
| `admin_roles.router` | `/api/admin/roles` | admin-roles | 角色 |
| `admin_users.router` | `/api/admin/users` | admin-users | 用户 |
| `folders.router` | `/api/admin/folders` | folders | 媒体文件夹 |
| `pages.router` | `/api/admin/pages` | admin-pages | CMS 页面 |
| ... | ... | ... | 共 ~45 个路由器 |

完整列表见 `backend/app/main.py` 第 85–132 行。

### 5.5 管理模块注册表 (`backend/app/core/modules.py`)

这是权限系统的**单一事实来源**。文件头部文档说明了新增模块的流程：

```python
"""When adding a new module:
1. Add an entry here (backend)
2. Mirror it in frontend/lib/adminModules.ts
3. Add the module to the seed role_permissions for the 'admin' role
4. (If scoped) Add a scope_type + resolver in scope_resolvers.py
"""
```

当前注册的模块：

| 模块 ID | 标签 | scope_aware | scope_type |
|---------|------|-------------|------------|
| `dashboard` | Dashboard | No | — |
| `cables` | Cables | Yes | manufacturer |
| `manufacturers` | Manufacturers | Yes | manufacturer |
| `equipment_mfrs` | Equipment Mfrs | Yes | equipment_manufacturer |
| `equipment_cats` | Equipment Cats | No | — |
| `equipment_list` | Equipment List | Yes | equipment_manufacturer |
| `terminal_mfrs` | Terminal Mfrs | Yes | terminal_manufacturer |
| `terminal_cats` | Terminal Cats | No | — |
| `terminal_list` | Terminal List | Yes | terminal_manufacturer |
| `media` | Media | Yes | — |
| `users` | Users | No | — |
| `roles` | Roles | No | — |
| `inquiries` | Inquiries | Yes | — |
| `pages` | Pages | No | — |
| ... | ... | ... | ... |

有效 scope 类型：
```python
VALID_SCOPE_TYPES = {None, "manufacturer", "equipment_manufacturer", "terminal_manufacturer"}
```

### 5.6 Scope 校验器 (`backend/app/core/scope_resolvers.py`)

每个 scope_type 对应一个异步校验函数，检查 scope_id 是否指向真实存在的制造商：

```python
SCOPE_RESOLVERS = {
    "manufacturer": validate_manufacturer_exists,
    "equipment_manufacturer": validate_equipment_manufacturer_exists,
    "terminal_manufacturer": validate_terminal_manufacturer_exists,
}
```

---

## 6. 前端架构 (Next.js)

### 6.1 路由组

| 路由组 | 路径前缀 | 说明 |
|--------|----------|------|
| `(site)/` | `/` | 公开站点 (SSR + 缓存) |
| `admin/` | `/admin` | 管理后台 (SSR, 读 `admin_token` cookie) |
| `portal/` | `/portal` | 工厂 Portal (SSR, 读 `portal_token` cookie) |
| `api/` | `/api` | BFF 路由处理器 (cookie → Bearer 转发) |

### 6.2 API 客户端分层

前端有 **4 层 API 客户端**，各有不同用途：

| 文件 | 运行环境 | 用途 | 缓存策略 |
|------|----------|------|----------|
| `lib/api.ts` | 服务端 (SSR) | 公开站点数据获取 | 60s 内存缓存 + `revalidate: 60` |
| `lib/adminApi.ts` | 服务端 (SSR) | 管理后台数据获取 | `revalidate: 0` (始终最新) |
| `lib/portalApi.ts` | 服务端 (SSR) | Portal 页面数据获取 | `revalidate: 0` |
| `lib/portalApiClient.ts` | 客户端 | Portal 表单提交 (BFF 调用) | 无缓存 |

**BFF 模式：** `api/` 下的路由处理器读取 http-only cookie，转为 `Authorization: Bearer` 头后转发到后端。这样 token 永远不暴露给浏览器 JS。

### 6.3 管理后台菜单系统

管理后台使用 **3 层映射**：

1. **`backend/app/core/modules.py`** `ADMIN_MODULES` — 模块定义 (权限控制单元)
2. **`frontend/lib/adminModules.ts`** — 前端模块镜像 (需与后端同步)
3. **`frontend/lib/adminMenuRegistry.ts`** `ADMIN_PAGES` — 页面注册 (pageId → href/label/icon)
4. **`frontend/components/admin/layout/AdminSidebar.tsx`** `PAGE_ID_TO_MODULE_ID` — 页面→模块映射

数据库 `admin_menu_items` 表存储菜单树结构，运行时通过 `/api/admin/menu/tree` 加载，然后按 `allowed_modules` 过滤。

### 6.4 Portal 侧边栏

基于 `scope_type` 选择不同的导航数组：

```tsx
const baseNav =
    scopeType === 'equipment_manufacturer'
      ? EQUIPMENT_MANUFACTURER_NAV
      : scopeType === 'terminal_manufacturer'
        ? TERMINAL_MANUFACTURER_NAV
        : MANUFACTURER_NAV;
const nav = baseNav.filter((item) => allowedModules.includes(item.module));
```

---

## 7. 数据库设计

### 7.1 三种产品模块模式

#### Pattern A: Cable (复杂模式)

```
cables (线缆主表)
├── id (String PK)
├── manufacturer_id (FK→manufacturers, RESTRICT)
├── product_type_id (FK→product_types)
├── industry_id / category_id (反范式化 FK)
├── size_system (CHECK: awg/mm2/kcmil/none)
├── category_ids (JSONB, 多分类)
├── UniqueConstraint(manufacturer_id, slug)
│
├── cable_variants (变体)
│   ├── id (BigInteger PK)
│   ├── cable_id (FK→cables, CASCADE)
│   └── UniqueConstraint(cable_id, slug)
│
└── spec_items (类型化规格)
    ├── id (BigInteger PK)
    ├── cable_id (FK→cables, CASCADE)
    ├── variant_id (FK→cable_variants, CASCADE, nullable)
    ├── spec_key / label
    ├── value_number (Numeric) 或 value_string (String)  ← CHECK 约束
    ├── spec_type (CHECK: string/number/enum)
    └── filterable (bool, 带部分索引用于分面过滤)
```

分类体系 (3 级)：`industries` → `categories` → `product_types` (各有 `size_system` + `filters` JSONB)

#### Pattern B: Equipment / Terminal (简单模式，两者结构完全一致)

```
equipment_manufacturers / terminal_manufacturers
├── id (String PK)
├── name / slug (unique)
├── country / website / image_url / description
├── founded_year / address / phone / email
└── sort_order

equipment_categories / terminal_categories (2 级自引用)
├── id (String PK)
├── parent_id (self-FK, CASCADE)  ← 2 级深度在 API 层强制
├── label / slug
├── UniqueConstraint(parent_id, slug)
└── parent / children (self-referential relationship)

recommended_equipments / terminals (产品表)
├── id (String PK)
├── manufacturer_id (FK, RESTRICT)
├── category_id (FK, RESTRICT)
├── model / slug (globally unique)
├── applicable_specs (JSONB NOT NULL)  ← 规则列表
├── description / image_url / external_url
└── sort_order
```

`applicable_specs` JSONB 结构：
```json
[
  { "spec_key": "conductor_area", "min": 0.5, "max": 6.0 },
  { "spec_key": "jacket", "allowed_values": ["pvc", "xlpe"] }
]
```

### 7.2 用户/角色/权限系统

```
roles (角色)
├── id (String PK, 如 "admin", "cable_manager_test")
├── name
├── scope_type (nullable: None=全局操作员, "manufacturer"=线缆工厂, 等)
├── is_system (bool, 系统角色不可删)
│
└── role_permissions (多对多)
    ├── role_id (FK→roles)
    └── module (String, 引用 ADMIN_MODULES.id)
    └── 复合 PK (role_id, module)

users (管理/Portal 用户)
├── id (BigInteger PK)
├── email (unique)
├── password_hash
├── role_id (FK→roles, RESTRICT)
├── scope_id (nullable String, 制造商 ID)
└── is_active

members (公开站点会员, 独立于 users)
├── id (BigInteger PK)
├── email / password_hash / name / company / phone
└── email 验证字段
```

### 7.3 询盘系统

```
inquiries
├── sender_id (FK→members, CASCADE)
├── recipient_type (String: "manufacturer" / "equipment_manufacturer" / "terminal_manufacturer")
├── recipient_id (String: 制造商 ID)
├── subject / body / reply_body
├── replied_by (FK→users, SET NULL)
├── is_read / is_member_read (双向已读标记)
```

---

## 8. 认证与权限体系

### 8.1 三条独立认证链

系统使用三种 JWT token 类型，通过 `type` claim 隔离：

| Token 类型 | 依赖函数 | 使用场景 | Cookie |
|-----------|----------|----------|--------|
| `admin` | `get_current_user` / `require_operator(m)` / `get_current_admin_user` | `/api/admin/*`, `/api/auth/*` | `admin_token` |
| `portal` | `get_current_factory_user` / `require_factory_module(m)` | `/api/portal/*` | `portal_token` |
| `member` | `get_current_member` | `/api/member/*` (公开站点会员) | `member_token` |

### 8.2 管理员权限 (`require_operator`)

```python
def require_operator(module: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        # 拒绝 scoped 工厂用户 (即使权限配置错误)
        if user.role and user.role.scope_type is not None:
            raise HTTPException(403, {"code": 403, "message": "Operator access only"})
        allowed = getattr(user, "role_permissions", None) or set()
        if module not in allowed:
            raise HTTPException(403, {"code": 403, "message": f"No access to module: {module}"})
        return user
    return checker
```

关键点：scoped 工厂用户 (`scope_type is not None`) 永远无法通过 `require_operator`，即使 role_permissions 包含该模块。

### 8.3 Portal 权限 (`require_factory_module`)

```python
_FACTORY_ALLOWED_BY_SCOPE = {
    "manufacturer": {"dashboard", "cables", "inquiries", "media", "me", "messages"},
    "equipment_manufacturer": {"dashboard", "equipment", "inquiries", "media", "me", "messages"},
    "terminal_manufacturer": {"dashboard", "terminals", "inquiries", "media", "me", "messages"},
}

def require_factory_module(module: str):
    async def checker(user: User = Depends(get_current_factory_user)) -> User:
        scope_type = user.role.scope_type if user.role else None
        allowed = _FACTORY_ALLOWED_BY_SCOPE.get(scope_type, set())
        if module not in allowed:
            raise HTTPException(403, ...)
        return user
    return checker
```

关键点：Portal 权限**不查 `role_permissions`**，完全由 `scope_type` → 固定模块集合决定。

### 8.4 Scope 隔离 (Portal)

Portal 路由强制 `manufacturer_id = user.scope_id`：

```python
# 创建时强制 manufacturer_id (忽略客户端传入值)
terminal_data["manufacturer_id"] = user.scope_id  # server-forced

# 访问时检查所有权
def _check_terminal_ownership(user, terminal):
    if terminal is None or terminal.manufacturer_id != user.scope_id:
        raise HTTPException(404, {"code": 404, "message": "Terminal not found"})
```

产品 ID 服务端生成：`{manufacturer_slug}-{product_slug}`，如冲突则追加 UUID 后缀。

---

## 9. 媒体文件夹系统

### 9.1 容器文件夹

每个 scope_type 对应一个顶级容器文件夹：

```python
# backend/app/crud/folder.py
CONTAINER_NAMES = {
    "manufacturer": "Cable Manufacturers",
    "equipment_manufacturer": "Equipment Manufacturers",
    "terminal_manufacturer": "Terminal Manufacturers",
}
```

### 9.2 自动配置

创建制造商时自动创建文件夹树：
```
Terminal Manufacturers/      ← 容器
  └── panduit/               ← 制造商根文件夹 (以 name 命名)
      ├── logos/             ← 受保护子文件夹
      ├── products/
      └── docs/
```

- **创建制造商** → `crud_folder.provision_for_manufacturer(scope_type, scope_id, name)`
- **重命名制造商** → `crud_folder.rename_manufacturer_root(...)`
- **删除制造商** → `crud_folder.cleanup_for_manufacturer(...)` (先清理文件夹和上传文件，再删除制造商)

---

## 10. 部署架构

### 10.1 Docker Compose 服务

| 服务 | 镜像/构建 | 端口 | 依赖 |
|------|----------|------|------|
| `nginx` | `./deploy/nginx` | 8080:80 | frontend, backend |
| `frontend` | `./frontend` (standalone) | 3000:3000 | backend |
| `backend` | `./backend` (gunicorn 4 workers) | — | db |
| `db` | `postgres:16-alpine` | — | — |

### 10.2 Nginx 路由

| Location | 上游 | 说明 |
|----------|------|------|
| `/_next/static/` | frontend:3000 | 1 年不可变缓存 |
| `/api/admin/` | frontend:3000 | BFF (cookie 转发) |
| `/api/portal/` | frontend:3000 | BFF (cookie 转发) |
| `/api/` | backend:8000/api/ | 直接后端, 30s 超时 |
| `/media/` | backend:8000/media/ | 1 天缓存 |
| `/` | frontend:3000 | WebSocket 升级 (HMR) |

### 10.3 多阶段 Dockerfile

**后端：** `builder` → `development` (uvicorn --reload) / `production` (gunicorn)
**前端：** `builder` (next build) → `development` (npm run dev) / `production` (node server.js, standalone)

---

## 11. 新增产品模块完整流程

以新增 "端子接头 (Terminal)" 模块为例 (已完成，可作为模板)。将 `terminal` 替换为你的模块名即可。

### Phase 1: 后端模型、Schema、CRUD

**1. 创建模型文件** `backend/app/models/terminal.py`
- 定义三个类：`TerminalManufacturer`, `TerminalCategory` (2 级自引用 FK CASCADE), `Terminal` (`applicable_specs` JSONB, FK RESTRICT)
- 使用 SQLAlchemy 2.0 `Mapped[...]` / `mapped_column` 风格

**2. 注册模型** `backend/app/models/__init__.py`
- 添加 `from app.models.terminal import Terminal, TerminalCategory, TerminalManufacturer`
- 扩展 `__all__` (Alembic autogenerate 依赖此文件)

**3. 创建 Schema** `backend/app/schemas/terminal.py`
- Pydantic v2 类：`*Base/Read/Create/Update`
- `TerminalCategoryTreeNode` (2 级树, children 用 flat schema 避免 `MissingGreenlet`)
- `PortalTerminalCreate` (省略 `id` 和 `manufacturer_id` — 服务端生成/强制)

**4. 创建 CRUD** `backend/app/crud/terminal.py`
- 三个类继承 `CRUDBase`
- `CRUDTerminal` 添加 `get_with_relations` (`selectinload`), `list_by_manufacturer`, `get_matching_cable`
- 实例化单例：`crud_terminal_manufacturer`, `crud_terminal_category`, `crud_terminal`

### Phase 2: 后端路由

**5. 公开/管理路由** `backend/app/api/routes/terminals.py`
- `GET ""` (列表, 支持 `cable_id` 匹配), `GET "/{id}"`, `POST/PUT/DELETE`
- 操作端点用 `require_operator("terminal_list")`
- Scope 检查：scoped 用户只能操作自己的 manufacturer_id

**6. 制造商路由** `backend/app/api/routes/terminal_manufacturers.py`
- CRUD + 媒体文件夹自动配置 (创建/重命名/删除)

**7. 分类路由** `backend/app/api/routes/terminal_categories.py`
- `GET ""` 返回树, 2 级深度强制, 有子分类时拒绝删除 (409)

**8. 导入路由** (可选) `terminal_import.py` + `terminal_import_templates.py` + `services/terminal_import.py`

**9. Portal 路由** `backend/app/api/routes/portal_terminals.py`
- `require_factory_module("terminals")`
- `_check_terminal_ownership` 辅助函数
- POST 强制 `manufacturer_id = user.scope_id`
- ID 生成：`{manufacturer_slug}-{product_slug}` + UUID 后缀

**10. 注册路由** `backend/app/main.py` — 添加 `include_router` 调用

### Phase 3: 后端模块/Scope 注册

**11. `backend/app/core/modules.py`** — 添加 3 个模块 + scope_type 到 `VALID_SCOPE_TYPES`

**12. `backend/app/core/scope_resolvers.py`** — 添加 `validate_terminal_manufacturer_exists` + 注册

**13. `backend/app/api/deps.py`** — 添加到 `_FACTORY_ALLOWED_BY_SCOPE`

**14. `backend/app/crud/folder.py`** — 添加到 `CONTAINER_NAMES`

### Phase 4: 数据库迁移

**15. 创建 Alembic 迁移** — 建表 + 种子管理菜单 + 种子容器文件夹

### Phase 5: 前端 Lib

**16. `frontend/lib/adminModules.ts`** — 镜像模块定义 + `SCOPE_TYPE_LABELS`

**17. `frontend/lib/adminMenuRegistry.ts`** — 添加 `ADMIN_PAGES` 条目

**18. `frontend/components/admin/layout/AdminSidebar.tsx`** — 添加 `PAGE_ID_TO_MODULE_ID` 映射

**19. `frontend/lib/adminApi.ts`** — 添加 `adminApi.terminals` / `terminalManufacturers` / `terminalCategories` 命名空间

**20. `frontend/lib/api.ts`** — 添加公开 API 命名空间 + adapter 函数

**21. `frontend/lib/portalApi.ts` + `portalApiClient.ts`** — 添加 Portal API 命名空间

**22. `frontend/components/portal/layout/PortalSidebar.tsx`** — 添加 `TERMINAL_MANUFACTURER_NAV`

**23. `frontend/components/shared/SearchBox.tsx`** — 添加搜索选项

### Phase 6: 前端 BFF 路由

**24.** 创建 `frontend/app/api/admin/terminals/` 和 `frontend/app/api/portal/terminals/` 下的路由处理器

### Phase 7: 前端页面

**25.** 管理后台页面 `frontend/app/admin/(dashboard)/terminals/` (10 个页面)

**26.** Portal 页面 `frontend/app/portal/terminals/` (5 个页面)

**27.** 公开站点页面 `frontend/app/(site)/terminals/` (3 个页面)

### Phase 8: 前端组件

**28.** 管理表单组件 `frontend/components/admin/form/Terminal*.tsx`

**29.** Portal 表单组件 `frontend/components/portal/form/Terminal*.tsx`

**30.** 公开站点组件 `frontend/components/terminals/`

### Phase 9: 种子数据

**31.** `frontend/data/recommended-terminals.json` (参照 `recommended-equipments.json`)

**32.** `backend/scripts/seed.py` — 添加 `seed_terminals()` 函数

**33.** `backend/scripts/seed_portal_users.py` — 添加测试用户

---

## 12. 种子数据与测试用户

### 12.1 主种子脚本

```bash
cd backend
python -m scripts.seed           # 执行种子
python -m scripts.seed --dry-run # 干跑 (不写入)
```

执行顺序：
1. 截断表 (cables, equipment, terminals, manufacturers, audit_log)
2. `seed_manufacturers` — 从 `frontend/data/manufacturers.json`
3. `seed_taxonomy` — 从 `frontend/data/taxonomy.json` (upsert, 不截断)
4. `seed_cables` — 从 `frontend/data/cables.json`
5. `seed_equipment` — 从 `frontend/data/recommended-equipments.json`
6. `seed_terminals` — 从 `frontend/data/recommended-terminals.json`
7. `seed_admin` — 从 `settings.admin_email` / `settings.admin_password`

### 12.2 Portal 测试用户

```bash
docker exec unowire-backend-1 python scripts/seed_portal_users.py
```

创建三个测试用户 (密码均为 `test123456`)：

| 邮箱 | scope_type | scope_id | Portal 模块 |
|------|-----------|----------|------------|
| `cable_manager@test.com` | manufacturer | mfr-1 | cables, media |
| `equip_manager@test.com` | equipment_manufacturer | em-1 | equipment, media |
| `terminal_manager@test.com` | terminal_manufacturer | panduit | terminals, media |

---

## 13. 常见陷阱与约定

### 13.1 异步 SQLAlchemy 陷阱

**`MissingGreenlet` 错误：** commit 后访问关联属性会触发此错误。

```python
# ❌ 错误：commit 后直接返回 mutated 对象
db.add(terminal)
await db.commit()
return terminal  # 访问 terminal.manufacturer 会报错

# ✅ 正确：commit 后重新查询 (带 selectinload)
await db.commit()
return await crud_terminal.get_with_relations(db, terminal_id)
```

**`expire_on_commit=False`** 已在 `database.py` 中设置，但上述重新查询模式仍是最佳实践。

### 13.2 镜像复制原则

新增产品模块时，**镜像现有模块而非抽象**。Equipment 和 Terminal 结构完全一致但使用独立表，原因：
- 避免重构现有模块的风险
- 保持每个模块独立可演进
- 简化 scope 校验逻辑

### 13.3 前后端模块同步

后端 `modules.py` 与前端 `adminModules.ts` 必须手动保持同步。后端文件头部有明确提示。

### 13.4 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 后端表名 | `snake_case` 复数 | `terminal_manufacturers`, `terminals` |
| 后端模型类 | `PascalCase` | `TerminalManufacturer`, `Terminal` |
| 后端 CRUD 单例 | `crud_snake_case` | `crud_terminal_manufacturer` |
| 后端 scope_type | `snake_case` | `terminal_manufacturer` |
| 后端模块 ID | `snake_case` | `terminal_mfrs`, `terminal_list` |
| 前端 pageId | `kebab-case` | `terminal-mfrs`, `terminals` |
| 前端 API 路径 | `kebab-case` | `/api/terminal-manufacturers` |
| URL 路径 | `kebab-case` | `/admin/terminals/manufacturers` |

### 13.5 错误响应格式

所有 API 错误统一格式：
```json
{
  "code": 403,
  "message": "Cannot create terminal outside your scope"
}
```

校验错误 (422) 额外包含 `details[]` 数组。

### 13.6 无自动化测试

项目采用 MVP 约定，不写自动化测试。验证方式：
- 后端：Swagger UI (`/docs`)
- 前端：浏览器手动测试
- 迁移：`alembic upgrade head` && `alembic downgrade -1` && `alembic upgrade head`

### 13.7 代码语言

所有代码、注释、文档、数据库字段**必须使用英文** (项目面向全球用户)。
