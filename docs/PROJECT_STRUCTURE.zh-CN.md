# UnoWire 项目结构说明

> UnoWire 是一个 B2B 线缆行业平台：包含公开的线缆/厂商目录、后台管理系统，以及会员（注册用户）询盘子系统。

## 技术栈

| 层级     | 技术                                                                         |
|----------|------------------------------------------------------------------------------|
| 前端     | Next.js 16（App Router、Turbopack）、React 19、TypeScript 5、Tailwind CSS 4  |
| 后端     | FastAPI 0.115、SQLAlchemy 2.0（异步）、Pydantic 2、Alembic 1.14             |
| 数据库   | PostgreSQL 16（asyncpg 驱动）                                                |
| 认证     | JWT（PyJWT）— 后台员工与网站会员使用独立令牌                                |
| 邮件     | aiosmtplib + Fernet 加密（cryptography）+ SafeDict 模板                     |
| 部署     | Docker Compose、Nginx（反向代理 + HTTPS）、PM2（可选）                      |
| 仓库结构 | Monorepo：`backend/` + `frontend/` + `deploy/` + `docs/`                    |

## 顶层结构

```
unowire/
├── backend/                 # FastAPI 应用
├── frontend/                # Next.js 应用
├── deploy/                  # Nginx 配置 + 部署脚本
├── docs/                    # 设计规格 + 实现计划
├── docker-compose.yml       # 生产环境组合（nginx + frontend + backend + db）
├── docker-compose.dev.yml   # 开发环境覆盖（热重载、暴露端口）
├── .env.docker              # Docker 环境变量（DB_PASSWORD、JWT_SECRET 等）
├── industries.json          # 行业参考数据（顶层种子数据）
└── .gitignore
```

---

## 后端（`backend/`）

FastAPI 应用采用分层架构：**routes → crud → models/schemas**。

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用工厂：路由注册、错误处理器、/media 静态文件挂载
│   ├── api/
│   │   ├── deps.py          # 认证依赖：get_current_user、require_module()、get_current_member
│   │   └── routes/          # 每个资源组一个文件（见下方路由模块表）
│   ├── core/
│   │   ├── config.py        # 配置项（pydantic-settings）：数据库 URL、JWT、管理员凭据、public_base_url
│   │   ├── database.py      # async_engine、async_session、get_db() 依赖
│   │   ├── security.py      # JWT 编解码：decode_access_token（员工）、decode_member_token（会员）
│   │   ├── modules.py       # ADMIN_MODULES 注册表 — RBAC 模块的唯一数据源（15 个模块）
│   │   ├── scope_resolvers.py # 为有作用域的角色解析 scope_id（manufacturer、equipment_manufacturer）
│   │   └── email.py         # aiosmtplib 客户端 + Fernet 加密凭据 + SafeDict 模板渲染
│   ├── models/              # SQLAlchemy ORM 模型（每张表一个）
│   ├── schemas/             # Pydantic v2 请求/响应 schema（每个资源一个）
│   ├── crud/                # 数据库访问层（每个资源一个 CRUD 类）
│   └── services/
│       └── cable_import.py  # CSV/JSON 批量导入校验 + 转换服务
├── alembic/
│   ├── env.py               # Alembic 环境（异步引擎）
│   └── versions/            # 14 个迁移文件（初始 schema → 会员菜单项）
├── scripts/
│   ├── seed.py              # 种子数据：角色、管理员用户、菜单项、默认权限
│   └── reset_db.py          # 开发工具：删除并重建所有表
├── tests/
│   ├── conftest.py          # 测试夹具：TestClient、admin_headers、NullPool 引擎、数据清理
│   └── api/                 # 9 个测试文件，覆盖后台接口、RBAC、会员认证、询盘
├── media/
│   └── uploads/             # 用户上传的图片（挂载为 Docker 卷 `media_data`）
├── Dockerfile               # 3 阶段：builder → development → production（uvicorn）
├── requirements.txt         # 固定版本的依赖
├── alembic.ini              # Alembic 配置
└── pyproject.toml           # Ruff/Black 配置
```

### 路由模块（`backend/app/api/routes/`）

| 文件                       | 路径前缀                  | 用途                                             |
|----------------------------|---------------------------|--------------------------------------------------|
| `auth.py`                  | `/api/auth`               | 员工登录/登出/个人信息                           |
| `admin_users.py`           | `/api/admin/users`        | 员工用户 CRUD + 作用域列表                       |
| `admin_roles.py`           | `/api/admin/roles`        | 角色 CRUD + 权限配置                             |
| `admin_menu.py`            | `/api/admin/menu`         | 后台侧边栏菜单自定义                             |
| `admin_members.py`         | `/api/admin/members`      | 会员管理（列表/编辑/激活/验证/删除）             |
| `admin_inquiries.py`       | `/api/admin/inquiries`    | 询盘列表/回复/未读数                             |
| `admin_email.py`           | `/api/admin/email`        | SMTP 配置 + 邮件模板 + 测试发送                  |
| `member.py`                | `/api/member`             | 会员注册/登录/验证/询盘                          |
| `cables.py`                | `/api/cables`             | 公开线缆目录 + 详情                              |
| `brands.py`                | `/api/brands`             | 品牌列表                                         |
| `manufacturers.py`         | `/api/manufacturers`      | 公开厂商列表 + 详情                              |
| `categories.py`            | `/api/categories`         | 分类树                                           |
| `industries.py`            | `/api/industries`         | 行业列表                                         |
| `product_types.py`         | `/api/product-types`      | 产品类型列表                                     |
| `taxonomy.py`              | `/api/taxonomy`           | 完整分类树（行业→分类→产品类型）                 |
| `equipment.py`             | `/api/equipment`          | 推荐设备列表 + 匹配接口                          |
| `equipment_manufacturers.py` | `/api/equipment-manufacturers` | 设备厂商 CRUD                            |
| `equipment_categories.py`  | `/api/equipment-categories` | 设备分类树                                       |
| `cable_import.py`          | `/api/cables/import`      | 线缆批量导入（校验 + 提交）                      |
| `cable_import_templates.py`| `/api/cables/import`      | CSV 模板 + JSON 示例下载                         |
| `uploads.py`               | `/api/uploads`            | 图片上传（后台）                                 |
| `folders.py`               | `/api/folders`            | 媒体库文件夹树                                   |
| `health.py`                | `/api/health`             | 健康检查                                         |

### RBAC 模块注册表（`core/modules.py`）

15 个后台模块。有作用域的模块（`scope_aware=True`）通过 `scope_id` 限制数据访问：

| 模块 ID           | 有作用域 | 作用域类型              |
|-------------------|----------|-------------------------|
| dashboard         | 否       | —                       |
| cables            | 是       | manufacturer            |
| brands            | 是       | manufacturer            |
| manufacturers     | 是       | manufacturer            |
| industries        | 否       | —                       |
| equipment_mfrs    | 是       | equipment_manufacturer  |
| equipment_cats    | 否       | —                       |
| equipment_list    | 是       | equipment_manufacturer  |
| media             | 否       | —                       |
| menu_config       | 否       | —                       |
| users             | 否       | —                       |
| roles             | 否       | —                       |
| inquiries         | 是       | （动态）                |
| email_config      | 否       | —                       |
| members           | 否       | —                       |

### 认证架构

- **员工 JWT**：`decode_access_token()` — 拒绝 `type=="member"` 的令牌
- **会员 JWT**：`decode_member_token()` — 独立函数，设置 `member_token` cookie
- **模块守卫**：`Depends(require_module("module_id"))` 同时检查角色权限和作用域有效性
- **错误格式**：自定义 `http_exception_handler` 将 `detail` 展平为 `{"code": N, "message": "..."}`

---

## 前端（`frontend/`）

Next.js 16 App Router，使用路由组区分公开站点、后台管理和 API 代理层。

```
frontend/
├── app/
│   ├── (site)/              # 公开页面（路由组，无 URL 前缀）
│   │   ├── page.tsx         # 首页
│   │   ├── layout.tsx       # 站点布局（导航 + 页脚）
│   │   ├── cables/          # 线缆目录概览 + 动态路由
│   │   ├── cable/           # 线缆详情页（[brand_slug]/[slug]）
│   │   ├── manufacturers/   # 厂商列表 + 详情（[slug]）
│   │   ├── categories/      # 分类捕获路由（[...slugs]）
│   │   ├── member/          # 会员中心（需认证，使用 member_token cookie）
│   │   │   ├── layout.tsx   # 会员布局
│   │   │   ├── profile/     # 会员资料（MVP 阶段只读）
│   │   │   ├── inbox/       # 询盘收件箱
│   │   │   └── inquiries/   # 询盘列表 + 详情（[id]）
│   │   ├── login/           # 会员登录
│   │   ├── register/        # 会员注册
│   │   └── verify/          # 邮箱验证
│   ├── admin/
│   │   ├── (auth)/login/    # 后台登录（独立路由组）
│   │   └── (dashboard)/     # 后台仪表盘（需认证，使用 admin_token cookie）
│   │       ├── layout.tsx   # 后台布局（侧边栏从 API 树渲染）
│   │       ├── brands/      # 品牌管理（列表/新建/[id]）
│   │       ├── cables/      # 线缆管理（列表/新建/[id]/导入）
│   │       ├── equipment/   # 设备管理（列表/新建/[id]/分类/厂商）
│   │       ├── industries/  # 行业管理（列表/新建/[id]/分类/产品类型）
│   │       ├── inquiries/   # 询盘管理（列表/[id]）
│   │       ├── manufacturers/ # 厂商管理
│   │       ├── media/       # 媒体库
│   │       ├── members/     # 会员管理（列表/[id]）
│   │       ├── menu/        # 菜单自定义（列表/新建/[id]）
│   │       ├── roles/       # 角色管理（列表/新建/[id]）
│   │       ├── settings/email/ # 邮件配置 + 模板
│   │       └── users/       # 员工用户管理
│   ├── api/                 # Next.js Route Handlers（代理层）
│   │   ├── admin/           # 后台 API 代理（读取 admin_token cookie → Bearer）
│   │   └── member/          # 会员 API 代理（读取 member_token cookie → Bearer）
│   ├── layout.tsx           # 根布局
│   ├── globals.css          # 全局样式 + Tailwind CSS 变量（字体：Arial）
│   ├── not-found.tsx        # 404 页面
│   ├── robots.ts            # robots.txt 生成
│   └── sitemap.ts           # sitemap.xml 生成
├── components/
│   ├── admin/               # 后台专用组件
│   │   ├── form/            # 实体表单（BrandForm、CableForm、MemberForm 等）
│   │   ├── layout/          # AdminSidebar
│   │   ├── list/            # 列表工具（搜索框、筛选下拉、ImageCell）
│   │   ├── media/           # 媒体库（FolderTree、MediaGrid）
│   │   ├── menu/            # MenuSortButtons
│   │   ├── cable/           # ImportPreviewTable
│   │   └── MemberActions.tsx # 激活/验证/删除操作
│   ├── cable/               # 线缆展示（CableCard、CableFilters、规格表、变体对比）
│   ├── category/            # CategoryCard
│   ├── equipment/           # RecommendedEquipmentCard
│   ├── layout/              # 站点布局（Nav、Footer、Container、Breadcrumbs）
│   ├── member/              # InquiryFormModal、UnreadBadge
│   ├── seo/                 # JsonLd 结构化数据
│   ├── shared/              # Pagination、SearchBox、SimilarCables、ProductCardImage
│   ├── taxonomy/            # IndustryCard、CategoryCard、ProductTypeCard
│   └── ui/                  # shadcn/ui 基础组件（button、card、input、badge 等）
├── lib/
│   ├── adminApi.ts          # 后台 API 客户端（命名空间：cables、brands、members 等）
│   ├── adminMenuRegistry.ts # 前端页面注册表（菜单项的有效 page_id）
│   ├── adminModules.ts      # 后端 ADMIN_MODULES 的镜像
│   ├── api.ts               # 公开 API 客户端
│   ├── types.ts             # TypeScript 接口（AdminMember、Cable、Manufacturer 等）
│   ├── filter.ts            # 线缆筛选逻辑
│   ├── seo.ts               # SEO 元数据辅助函数
│   ├── utils.ts             # cn() 类名合并工具
│   └── *.ts                 # 客户端辅助（clientUploads、clientFolders、equipment-recommend 等）
├── data/                    # 静态 JSON 数据（分类法、厂商、品牌、线缆种子）
├── public/                  # 静态资源（SVG）
├── middleware.ts            # 路由保护：/admin/*（admin_token）、/member/*（member_token）
├── next.config.js           # standalone 输出、图片远程模式、/media/* 重写到后端
├── Dockerfile               # 3 阶段：builder → development → production（standalone）
└── package.json             # Next 16.2.9、React 19.2.4、Tailwind 4、shadcn
```

### 前端代理模式

所有后台/会员 API 调用都经过 Next.js Route Handlers（`app/api/`），流程如下：
1. 读取认证 cookie（`admin_token` 或 `member_token`）
2. 将请求转发到后端 `INTERNAL_API_BASE`（`http://backend:8000`），附加 `Authorization: Bearer <token>`
3. 将后端响应返回给客户端

这样令牌只在服务端处理 — 客户端 JavaScript 中不会出现令牌。

### 中间件（`middleware.ts`）

- `/admin/*` 路由需要 `admin_token` cookie（缺失时重定向到 `/admin/login`）
- `/member/*` 路由需要 `member_token` cookie（缺失时重定向到 `/login`）
- 登录/注册/验证页面豁免

---

## 部署（`deploy/`）

```
deploy/
├── nginx/
│   ├── Dockerfile           # Nginx 镜像构建
│   └── nginx.conf           # 反向代理配置（HTTP — HTTPS 由宿主机 Nginx 终止）
├── host-nginx.conf          # 宿主机 Nginx 配置（HTTPS + certbot + HSTS）
├── deploy.sh                # 一键部署脚本（git pull → build → migrate → restart）
└── README.md                # 部署说明
```

### Nginx 路由（`nginx.conf`）

| 路径匹配          | 上游服务              | 用途                              |
|-------------------|-----------------------|-----------------------------------|
| `/_next/static/`  | `frontend:3000`       | Next.js 静态资源（缓存 1 年）     |
| `/api/admin/`     | `frontend:3000`       | 后台代理路由（cookie 认证）       |
| `/api/`           | `backend:8000`        | 公开后端 API                      |
| `/media/`         | `backend:8000`        | 上传图片（缓存 1 天）             |
| `/`               | `frontend:3000`       | 其他所有路由（SSR/ISR）           |

### 部署脚本（`deploy.sh`）

`git push` 后在服务器执行：
```bash
./deploy/deploy.sh master
```
步骤：拉取代码 → `docker compose build` → `alembic upgrade head` → `python -m scripts.seed` → `docker compose up -d`

---

## Docker 配置

### `docker-compose.yml`（生产环境）

| 服务     | 镜像               | 端口  | 说明                                       |
|----------|--------------------|-------|--------------------------------------------|
| nginx    | 自定义（deploy/）  | 8080  | 反向代理，依赖 frontend + backend          |
| frontend | 自定义（standalone）| 3000 | Next.js 生产服务器                         |
| backend  | 自定义（uvicorn）  | 8000  | FastAPI，挂载 `media_data` 卷              |
| db       | postgres:16-alpine | 5432  | PostgreSQL，`pgdata` 卷                    |

**数据卷：**
- `pgdata` — PostgreSQL 数据
- `media_data` — 上传的图片（在 backend 中挂载到 `/app/media`）

### `docker-compose.dev.yml`（开发环境）

本地开发覆盖配置：
- 前端运行 `npm run dev`（通过 Turbopack 热重载）
- 后端运行 `uvicorn --reload`
- 源码挂载为卷以支持 HMR

> **注意（Windows）：** Windows 上的 Docker Desktop + Turbopack 存在 HMR 限制 — 文件系统变更不会触发 Linux 容器中的 `inotify`。代码变更后需执行 `docker compose restart frontend`。

---

## 文档（`docs/`）

```
docs/
└── superpowers/
    ├── specs/               # 设计规格（brainstorming 产物）
    │   ├── 2026-06-28-unowire-cable-database-design.md
    │   ├── 2026-06-29-fastapi-backend-design.md
    │   ├── ...（共 17 个规格文件）
    │   └── 2026-07-09-admin-members-design.md
    └── plans/               # 实现计划（writing-plans 产物）
        ├── 2026-06-28-unowire-cable-database-refactor.md
        ├── ...（共 17 个计划文件）
        └── 2026-07-09-admin-members.md
```

每个功能遵循工作流：**brainstorming → spec → plan → SDD 执行**。

---

## 关键配置文件

| 文件                          | 用途                                              |
|-------------------------------|--------------------------------------------------|
| `backend/app/core/config.py`  | 后端配置（数据库、JWT、管理员凭据、基础 URL）    |
| `backend/.env.example`        | 环境变量模板                                      |
| `backend/alembic.ini`         | Alembic 迁移配置                                  |
| `backend/app/core/modules.py` | RBAC 模块注册表（15 个模块）                      |
| `frontend/next.config.js`     | Next.js 配置（standalone、图片、/media 重写）     |
| `frontend/middleware.ts`      | 路由保护（后台/会员认证）                         |
| `frontend/lib/adminModules.ts`| 后端 ADMIN_MODULES 的前端镜像                    |
| `frontend/lib/adminMenuRegistry.ts` | 菜单项的有效 page_id 注册表              |
| `frontend/.env.production`    | 生产环境变量（NEXT_PUBLIC_SITE_URL）              |
| `frontend/.env.local`         | 本地开发环境变量                                  |
| `docker-compose.yml`          | 生产服务组合                                      |
| `docker-compose.dev.yml`      | 开发环境覆盖                                      |
| `.env.docker`                 | Docker 密钥（DB_PASSWORD、JWT_SECRET 等）         |
| `deploy/nginx/nginx.conf`     | 容器 Nginx 配置                                   |
| `deploy/host-nginx.conf`      | 宿主机 Nginx 配置（HTTPS + certbot）              |

---

## 数据流概览

```
浏览器
  ↓
宿主机 Nginx（HTTPS、HSTS）— deploy/host-nginx.conf
  ↓
容器 Nginx（HTTP）— deploy/nginx/nginx.conf
  ↓
  ├─ /api/admin/* → Next.js Route Handler（读取 admin_token cookie）
  │                  ↓（作为 Bearer 令牌转发）
  │                FastAPI 后端（require_module 守卫）
  │                  ↓
  │                PostgreSQL
  │
  ├─ /api/*       → FastAPI 后端（直接访问）
  │
  ├─ /media/*     → FastAPI 后端（StaticFiles 挂载）
  │                  ↑
  │                media_data Docker 卷
  │
  └─ /*           → Next.js（SSR/ISR 页面）
```

## 开发工作流

1. **启动开发环境：**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

2. **后端测试：**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m pytest -v
   ```

3. **前端类型检查：**
   ```bash
   cd frontend
   npx tsc --noEmit
   ```

4. **执行迁移：**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m alembic upgrade head
   ```

5. **种子数据：**
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m scripts.seed
   ```

6. **部署到生产：**
   ```bash
   # 在服务器上执行：
   ./deploy/deploy.sh master
   ```

## 新增后台模块清单

1. 在 `backend/app/core/modules.py`（`ADMIN_MODULES` 列表）中添加模块条目
2. 在 `frontend/lib/adminModules.ts` 中镜像同步
3. 在 `frontend/lib/adminMenuRegistry.ts` 中注册页面
4. 在 `backend/app/crud/menu.py` 的 `ALLOWED_PAGE_IDS` 中添加模块
5. 创建 Alembic 迁移：插入菜单项 + 授予 admin 角色权限
6. 创建后端：model、schema、crud、route 文件，在 `main.py` 中注册
7. 创建前端：type、adminApi 命名空间、代理路由、组件、页面
8. （如有作用域）在 `backend/app/core/scope_resolvers.py` 中添加 `scope_type` + 解析器
