# Unowire 本地验收 + 部署上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对已完成的 Unowire 线缆数据库（30 任务重构后的 Next.js 16 应用）执行本地生产构建冒烟验收，创建生产部署所需的全部配置文件（PM2 / Nginx / .env.production / deploy.sh），并完成首次服务器部署至 www.unowire.com。

**Architecture:** Next.js 16.2.9 标准 Node 服务器模式（`next start`，无 `output: 'export'`），由 PM2 进程管理器守护，Nginx 作为反向代理处理 HTTPS 与域名。数据为静态 JSON（`frontend/data/*.json`），无后端依赖。部署为手动模式（无 Docker / 无 CI/CD），通过 `deploy.sh` 一键脚本简化后续更新。

**Tech Stack:** Next.js 16.2.9、React 19.2.4、Node.js 20+、PM2、Nginx、Certbot (Let's Encrypt)

**Spec:** `docs/superpowers/specs/2026-06-28-unowire-cable-database-design.md`
**Previous Plan:** `docs/superpowers/plans/2026-06-28-unowire-cable-database-refactor.md`（已完成）

**关键原则：**
- 手动验收为主：MVP 阶段无自动化测试，按 13 项清单 + 4 项异常路径逐项人工验证
- 配置文件即代码：所有部署配置（PM2 / Nginx / .env.production / deploy.sh）必须 commit 到仓库，便于版本追踪与回滚
- 服务器操作可重复：每个服务器步骤必须有完整命令，无占位符，但需用户替换 `<SERVER_IP>` 等运行时参数
- 部署零停机目标：PM2 `reload` 而非 `restart`，Nginx `nginx -s reload`
- 域名强制 HTTPS：Certbot 自动签发 + 自动续期

---

## 文件结构

```
unowire/
├── frontend/
│   ├── .env.production                 # 新建：生产环境变量
│   ├── ecosystem.config.cjs            # 新建：PM2 进程配置
│   └── (现有文件不变)
├── deploy/
│   ├── nginx-unowire.conf              # 新建：Nginx 站点配置
│   ├── deploy.sh                       # 新建：一键部署脚本
│   └── README.md                       # 新建：部署运维文档
├── docs/superpowers/
│   └── plans/
│       └── 2026-06-28-unowire-deploy-smoke-test.md  # 本计划
└── .superpowers/sdd/progress.md        # 更新：本计划进度账本
```

**说明：**
- `.env.production` 放在 `frontend/` 下，因为 Next.js 自动加载该文件（`next start` 时）
- `ecosystem.config.cjs` 也放在 `frontend/` 下，PM2 启动时 `cd frontend && pm2 start ecosystem.config.cjs`
- `deploy/` 目录在仓库根，承载所有部署相关 artifacts，与 `frontend/` 业务代码隔离
- 不创建 Dockerfile / docker-compose.yml（项目记忆明确：MVP 不引入 Docker）

---

## Phase 1: 本地生产验收（Tasks 1-6）

> 目标：在本地机器以生产模式运行应用，按 13 项清单 + 4 项异常路径验证所有用户路径正确，修复发现的任何问题。本阶段不涉及服务器。

### Task 1: 启动本地生产服务器

**Files:**
- 无文件修改（仅运行命令）

- [ ] **Step 1: 确认工作树干净**

Run:
```powershell
cd d:\projects\unowire
git status
```

Expected: `nothing to commit, working tree clean`。若有未提交改动，先 commit 或 stash 再继续。

- [ ] **Step 2: 安装依赖（确保 tsx 等 devDependencies 可用）**

Run:
```powershell
cd d:\projects\unowire\frontend
npm ci
```

Expected: npm 输出 `added N packages`，无 `npm error`。`tsx` 必须可用（`prebuild` 依赖它）。

- [ ] **Step 3: 执行生产构建**

Run:
```powershell
cd d:\projects\unowire\frontend
npm run build
```

Expected stdout (关键行):
```
> tsx scripts/validate-data.ts       # prebuild 自动校验
✓ All data validated successfully

> next build
 ✓ Compiled successfully
 ✓ Linting and checking validity of types
 ✓ Collecting page data
 ✓ Generating static pages (7/7)

Route (app)                              Size     First Load JS
┌ ○ /                                    2.5 kB         88 kB
├ ○ /_not-found                          871 B          88 kB
├ ƒ /api/cables/[brand_slug]/[slug]      0 B            88 kB
├ ƒ /cables                              2.5 kB         88 kB
├ ƒ /cables/[brand_slug]/[slug]          3.2 kB         88 kB
├ ƒ /categories/[...slugs]               2.2 kB         88 kB
├ ○ /robots.txt                          0 B            88 kB
└ ○ /sitemap.xml                         0 B            88 kB
```

若 `prebuild` 报校验错误：检查 `frontend/data/*.json` 引用完整性（参考 `lib/validate.ts` 的 8 项校验）。若 TypeScript 报错：修复后重新构建。

- [ ] **Step 4: 启动生产服务器（后台运行）**

Run:
```powershell
cd d:\projects\unowire\frontend
npm run start
```

Expected: 输出 `▲ Next.js 16.2.9` 和 `- Local: http://localhost:3000`。服务器保持运行（此终端阻塞）。

**重要：** 此终端不要关闭，整个 Phase 1 期间都需要服务器运行。后续命令在新终端执行。

- [ ] **Step 5: 验证服务器响应**

打开新终端，运行：
```powershell
curl http://localhost:3000/
```

Expected: 返回 HTML，包含 `<title>Unowire — Cable Specs Database</title>` 和 `<h1>Cable Specs Database</h1>`。HTTP 200。

若 404 或连接拒绝：检查 `npm run start` 是否真的在 3000 端口运行，或查看终端错误输出。

---

### Task 2: 验证首页与搜索功能（清单 #1-#2）

**Files:**
- 无文件修改（浏览器人工验证）

- [ ] **Step 1: 清单 #1 — 首页 hero + 搜索框 + 分类卡片 + 热门线缆**

打开浏览器访问 `http://localhost:3000/`。

逐项核对：
1. **Hero 区域**：渐变背景（蓝色到白色），大标题 `Cable Specs Database`，副标题 `Query cable specifications online. Browse cables by brand, category, and technical parameters.`
2. **搜索框**：在 hero 内，placeholder 为 `Search cable model, spec...`
3. **热门搜索 chips**：`UL1007`、`AVSS`、`UL1015`、`UL2468` 四个可点击标签
4. **统计数字**：显示线缆数（应为 6）、品牌数（4）、分类数（9）三个统计卡片
5. **分类导航**：3 个根分类卡片（Automotive / Consumer Electronics / Industrial），每个显示电缆数量
6. **热门线缆**：6 个 CableCard（前 6 条），每个含图片占位、AWG 角标、型号、品牌、迷你规格表

若任一项缺失或显示异常：记录问题，停止本任务，转去修复对应组件（`app/page.tsx` / `CategoryCard.tsx` / `CableCard.tsx`）。

- [ ] **Step 2: 清单 #2 — 搜索功能跳转**

在首页搜索框输入 `UL1007`，按 Enter。

Expected:
- 浏览器跳转至 `http://localhost:3000/cables?q=UL1007`
- 列表页显示搜索结果（应包含 UL1007 型号，可能 1-2 条）
- 顶部面包屑显示 `Home / Cables`

若跳转失败或结果为空：检查 `components/shared/SearchBox.tsx` 的 `handleSubmit` 逻辑，确认 `router.push('/cables?q=...')` 正确执行。

- [ ] **Step 3: 记录 Task 2 验收结果**

在 `.superpowers/sdd/progress.md` 的 Task 2 条目下记录：
- ✓ #1 首页完整渲染
- ✓ #2 搜索跳转正常
- 或 ✗ 描述发现的问题

---

### Task 3: 验证列表页与筛选分页（清单 #3-#6）

**Files:**
- 无文件修改

- [ ] **Step 1: 清单 #3 — 列表页 4 列网格 + 侧边栏筛选器**

浏览器访问 `http://localhost:3000/cables`。

逐项核对：
1. **布局**：左侧 200px 侧边栏筛选器，右侧 4 列电缆卡片网格
2. **筛选器**：至少包含 Brand、AWG、Conductor Area、Outer Diameter、Shielding、Jacket 6 个筛选组
3. **CableCard 内容**：每个卡片含图片占位、AWG 角标、型号（如 UL1007）、品牌名（如 Hitachi）、3 行迷你规格表、变体预览
4. **顶部面包屑**：`Home / Cables`
5. **结果计数**：显示总数（如 `Showing 6 cables`）

若卡片样式错乱或筛选器缺失：检查 `app/cables/page.tsx`、`CableFilters.tsx`、`CableCard.tsx`。

- [ ] **Step 2: 清单 #4 — 多条件组合筛选**

浏览器访问 `http://localhost:3000/cables?manufacturer=mfr-1&brand=brand-1&awg=24`。

Expected:
- 结果仅显示 Hitachi 品牌（mfr-1 → brand-1）下 AWG 24 的电缆
- 侧边栏对应筛选器显示选中状态
- 结果计数正确（如 `Showing 1 cables`）

若结果不正确：检查 `lib/filter.ts` 的 `filterCables()` 多条件 AND 逻辑。

- [ ] **Step 3: 清单 #5 — 数值范围筛选**

浏览器访问 `http://localhost:3000/cables?min_area=0.2&max_area=0.5`。

Expected:
- 仅显示 conductor_area 在 [0.2, 0.5] mm² 范围内的变体对应电缆
- Conductor Area 筛选器显示输入框已填充 0.2 和 0.5

若范围筛选失效：检查 `lib/filter.ts` 中 `min_area` / `max_area` 的处理逻辑（注意变体级筛选：任一变体命中即包含该 model）。

- [ ] **Step 4: 清单 #6 — 分页**

在 `http://localhost:3000/cables` 页面，若结果总数 > 12（默认每页 12），点击 "Next →" 或页码 2。

Expected:
- URL 变为 `http://localhost:3000/cables?page=2`
- 显示第 2 页结果
- 分页器高亮当前页码

若结果总数 ≤ 12：分页器不显示（`totalPages <= 1` 时 `Pagination` 返回 null），此情况下记录"分页器未触发（数据量不足）"，跳过此项。

- [ ] **Step 5: 记录 Task 3 验收结果**

在 `progress.md` 记录 #3-#6 的验收结果。

---

### Task 4: 验证详情页与 JSON API（清单 #7-#8）

**Files:**
- 无文件修改

- [ ] **Step 1: 清单 #7 — 详情页完整渲染**

浏览器访问 `http://localhost:3000/cables/hitachi/ul1007`。

逐项核对：
1. **标题**：`UL1007 | Unowire`（model 名称 + 站点后缀）
2. **描述段落**：显示 `base_description`（UL1007 PVC insulated...）
3. **Common Specs 表格**：列出 insulation_material / shielding / jacket / core_structure 4 项规格
4. **Variants Comparison 表格**：列出 awg / conductor_area / outer_diameter / rated_voltage / temperature_rating 5 行，每个变体一列
5. **Recommended Equipment 区块**：显示匹配的推荐设备卡片，含 explanation
6. **Similar Cables 区块**：显示相似线缆 mini 卡片网格
7. **右侧栏**：生产商信息、所属分类、`View JSON →` 链接
8. **面包屑**：`Home / Cables / Hitachi / UL1007`

若任一区块缺失：检查 `app/cables/[brand_slug]/[slug]/page.tsx` 的渲染逻辑。

- [ ] **Step 2: 清单 #8 — JSON API 端点**

在详情页点击右侧栏的 `View JSON →` 链接，或直接访问 `http://localhost:3000/api/cables/hitachi/ul1007`。

Expected:
- 返回 JSON（设置 `Content-Type: application/json`）
- JSON 结构包含：
  ```json
  {
    "cable": { "id": "cable-model-1", "model": "UL1007", ... },
    "brand": { "id": "brand-1", "name": "Hitachi", ... },
    "manufacturer": { "id": "mfr-1", "name": "Hitachi Cable", ... },
    "categories": [ ... ],
    "recommended_equipments": [ ... ]
  }
  ```
- HTTP 200

若 JSON 结构不完整：检查 `app/api/cables/[brand_slug]/[slug]/route.ts` 的 `GET` 函数返回体。

- [ ] **Step 3: 记录 Task 4 验收结果**

在 `progress.md` 记录 #7-#8 的验收结果。

---

### Task 5: 验证分类页、SEO、响应式与异常路径（清单 #9-#13 + 4 项异常）

**Files:**
- 无文件修改

- [ ] **Step 1: 清单 #9 — 分类导航页**

浏览器访问 `http://localhost:3000/categories/automotive`。

Expected:
- 显示该分类及其所有子孙分类下的电缆
- 顶部面包屑：`Home / Automotive`
- 列表使用与 `/cables` 相同的 4 列网格

若无结果或面包屑错误：检查 `app/categories/[...slugs]/page.tsx` 的 `api.categories.findByPath(slugs)` 与 `getDescendantIds()` 调用。

- [ ] **Step 2: 清单 #10 — 详情页 SEO 元数据**

在详情页 `http://localhost:3000/cables/hitachi/ul1007` 右键 → "View Page Source"。

逐项核对 HTML `<head>`：
1. `<title>UL1007 | Unowire</title>`
2. `<meta name="description" content="...">`（含 base_description 摘要）
3. `<link rel="canonical" href="https://www.unowire.com/cables/hitachi/ul1007">`
4. `<script type="application/ld+json">` 包含 `@type: "Product"` 的 JSON-LD
5. `<script type="application/ld+json">` 包含 `@type: "BreadcrumbList"` 的 JSON-LD

若 canonical URL 错误：检查 `lib/seo.ts` 的 `generateCableMetadata()`，确认 `alternates: { canonical: ... }` 使用了 `NEXT_PUBLIC_SITE_URL` 环境变量。若 JSON-LD 缺失：检查 `JsonLd.tsx` 渲染与 `buildCableJsonLd()` / `buildBreadcrumbJsonLd()` 调用。

- [ ] **Step 3: 清单 #11 — sitemap.xml**

浏览器访问 `http://localhost:3000/sitemap.xml`。

Expected:
- 返回 XML 格式 sitemap
- 包含首页 URL
- 包含 `/cables` 列表页 URL
- 包含所有 6 个电缆详情页 URL（如 `https://www.unowire.com/cables/hitachi/ul1007`）
- 包含所有 9 个分类页 URL（如 `https://www.unowire.com/categories/automotive`）

若 URL 数量不符：检查 `app/sitemap.ts` 中 `api.cables.all()` 与 `api.categories.all()` 的遍历。

- [ ] **Step 4: 清单 #12 — robots.txt**

浏览器访问 `http://localhost:3000/robots.txt`。

Expected 文本：
```
User-Agent: *
Disallow: /api/

Sitemap: https://www.unowire.com/sitemap.xml
```

若 Disallow 路径错误：检查 `app/robots.ts`。

- [ ] **Step 5: 清单 #13 — 移动端响应式**

在浏览器 DevTools（F12）切换到设备工具栏（Ctrl+Shift+M），选择 iPhone 12 或类似设备宽度（375px）。

访问 `http://localhost:3000/cables`，逐项核对：
1. 侧边栏筛选器折叠或移至顶部（不再是左侧 200px 固定）
2. 卡片网格从 4 列变为 2 列
3. 顶部导航栏不溢出，搜索框可点击

若布局错乱：检查 `CableFilters.tsx` 与 `app/cables/page.tsx` 的 Tailwind 响应式 class（`md:` / `lg:` 断点）。

- [ ] **Step 6: 异常路径 #1 — 不存在的电缆 slug**

浏览器访问 `http://localhost:3000/cables/hitachi/nonexistent-slug`。

Expected:
- 显示 404 页面（`not-found.tsx` 渲染）
- 含 `404` 大字标题与 `Back to Home` 链接
- HTTP 404 状态码

若返回 500 或空白：检查 `app/cables/[brand_slug]/[slug]/page.tsx` 的 `notFound()` 调用。

- [ ] **Step 7: 异常路径 #2 — 不存在的分类**

浏览器访问 `http://localhost:3000/categories/nonexistent-category`。

Expected:
- 显示 404 页面
- HTTP 404

- [ ] **Step 8: 异常路径 #3 — JSON API 不存在电缆**

新终端运行：
```powershell
curl -i http://localhost:3000/api/cables/hitachi/nonexistent-slug
```

Expected:
- HTTP 404
- 响应体：`{"error":{"code":"not_found","message":"Cable not found"}}`

若响应格式不符：检查 `app/api/cables/[brand_slug]/[slug]/route.ts` 的 404 分支。

- [ ] **Step 9: 异常路径 #4 — 筛选无结果**

浏览器访问 `http://localhost:3000/cables?brand=brand-1&awg=99`（AWG 99 不存在）。

Expected:
- 列表区域显示空状态文案：`No cables found. Try adjusting your filters.`
- 显示 `Clear all filters` 链接，点击后回到 `/cables`

若空状态缺失：检查 `app/cables/page.tsx` 中 `cables.length === 0` 的分支渲染。

- [ ] **Step 10: 记录 Task 5 验收结果**

在 `progress.md` 记录 #9-#13 + 4 项异常路径的验收结果。

---

### Task 6: 停止本地服务器并提交验收记录

**Files:**
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: 停止本地生产服务器**

在运行 `npm run start` 的终端按 `Ctrl+C`，或新终端运行：
```powershell
npx pm2 kill
```

（若未安装 pm2，直接 Ctrl+C 终止 `next start` 进程即可。）

Expected: 服务器进程终止，`curl http://localhost:3000/` 连接失败。

- [ ] **Step 2: 汇总验收结果到 progress.md**

读取 `.superpowers/sdd/progress.md`，在文件末尾追加：

```markdown
## Smoke Test Results (Task 1-6 of deploy plan)

- Task 1: ✓ 本地生产构建通过，服务器启动正常
- Task 2: ✓ 清单 #1-#2 通过（首页 / 搜索跳转）
- Task 3: ✓ 清单 #3-#6 通过（列表 / 筛选 / 分页）
- Task 4: ✓ 清单 #7-#8 通过（详情页 / JSON API）
- Task 5: ✓ 清单 #9-#13 + 4 项异常路径通过
- Task 6: ✓ 验收完成，准备进入 Phase 2

发现的问题与修复：（若 all pass 写 "无"）
```

若有任一项为 ✗：先修复对应代码，commit 修复，再重跑该清单项，全部通过后再继续。

- [ ] **Step 3: 提交验收记录**

```powershell
cd d:\projects\unowire
git add .superpowers/sdd/progress.md
git commit -m "chore: record local smoke test results (deploy plan phase 1)"
```

Expected: commit 成功，工作树干净。

---

## Phase 2: 部署配置文件创建（Tasks 7-12）

> 目标：在仓库内创建所有部署所需配置文件（`.env.production` / `ecosystem.config.cjs` / `nginx-unowire.conf` / `deploy.sh` / `DEPLOY.md`），全部 commit。本阶段不涉及服务器操作。

### Task 7: 创建 .env.production

**Files:**
- Create: `frontend/.env.production`

- [ ] **Step 1: 确认 .env.local.example 内容作为参考**

Run:
```powershell
cd d:\projects\unowire\frontend
type .env.local.example
```

Expected 输出：
```
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
NEXT_PUBLIC_API_MODE=mock
```

- [ ] **Step 2: 创建 .env.production**

写入 `frontend/.env.production`：
```
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
NEXT_PUBLIC_API_MODE=mock
NODE_ENV=production
```

说明：
- `NEXT_PUBLIC_SITE_URL` 决定 canonical URL 与 sitemap 绝对路径，必须为生产域名
- `NEXT_PUBLIC_API_MODE=mock` 当前使用静态 JSON，未来接入 FastAPI 时改为 `api`
- `NODE_ENV=production` 显式声明，确保 Next.js 生产模式

- [ ] **Step 3: 确认 .gitignore 不忽略 .env.production**

Run:
```powershell
cd d:\projects\unowire\frontend
findstr /n "env" .gitignore
```

检查输出：`.gitignore` 中若有 `.env*` 通配规则会忽略 `.env.production`。若存在：
- 编辑 `frontend/.gitignore`，将 `.env*` 改为更精确的规则（如 `.env.local` / `.env.development.local`），确保 `.env.production` 可被 git 跟踪
- 若 `.env.production` 包含敏感密钥（当前只有公开变量，无敏感信息），不要 commit；当前内容可安全 commit

若 `.gitignore` 无 `env` 相关规则：跳过此步骤。

- [ ] **Step 4: 验证文件被 git 跟踪**

Run:
```powershell
cd d:\projects\unowire
git check-ignore frontend/.env.production
```

Expected: 无输出（文件未被忽略）。若输出文件路径：说明仍被忽略，回到 Step 3 修复。

- [ ] **Step 5: 提交**

```powershell
cd d:\projects\unowire
git add frontend/.env.production
git commit -m "chore: add .env.production for deployment"
```

---

### Task 8: 创建 PM2 ecosystem.config.cjs

**Files:**
- Create: `frontend/ecosystem.config.cjs`

- [ ] **Step 1: 创建 ecosystem.config.cjs**

写入 `frontend/ecosystem.config.cjs`：
```javascript
// PM2 process manager configuration for Unowire Next.js production
// Usage: cd frontend && pm2 start ecosystem.config.cjs
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      name: 'unowire-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env.production',
      // 日志路径（PM2 默认在 ~/.pm2/logs/）
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
      // 优雅重启：reload 而非 restart，避免连接中断
      wait_ready: false,
      kill_timeout: 5000,
      listen_timeout: 10000,
      // 自动重启策略
      min_uptime: '10s',
      max_restarts: 10,
      max_restarts_delay: 3000,
    },
  ],
};
```

说明：
- `script: 'node_modules/next/dist/bin/next'` + `args: 'start'` 等价于 `next start`
- `exec_mode: 'fork'` + `instances: 1`：Next.js 自带 HTTP 服务，单实例即可（无需 cluster）
- `max_memory_restart: '512M'`：内存超 512M 自动重启，防止泄漏
- `env_file: '.env.production'`：PM2 启动时加载（PM2 v5+ 支持）
- `out_file` / `error_file`：日志输出到 `frontend/logs/`，需在 `.gitignore` 中忽略 `logs/`

- [ ] **Step 2: 创建 logs 目录占位**

Run:
```powershell
cd d:\projects\unowire\frontend
mkdir logs
echo. > logs\.gitkeep
```

- [ ] **Step 3: 更新 .gitignore 忽略 logs 但保留 .gitkeep**

编辑 `frontend/.gitignore`，追加：
```
# PM2 logs
logs/*
!logs/.gitkeep
```

- [ ] **Step 4: 验证 ecosystem 语法**

Run:
```powershell
cd d:\projects\unowire\frontend
npx pm2 ecosystem 2>&1 | findstr /i "error"
```

Expected: 无 error 输出。（此命令仅校验 PM2 是否能解析，不真正启动。）

若提示 `pm2` 未安装：本地 `npm install -g pm2` 安装后再校验，或在 Phase 3 服务器上校验。

- [ ] **Step 5: 提交**

```powershell
cd d:\projects\unowire
git add frontend/ecosystem.config.cjs frontend/logs/.gitkeep frontend/.gitignore
git commit -m "chore: add PM2 ecosystem config for production process management"
```

---

### Task 9: 创建 Nginx 站点配置

**Files:**
- Create: `deploy/nginx-unowire.conf`

- [ ] **Step 1: 创建 nginx-unowire.conf**

写入 `deploy/nginx-unowire.conf`：
```nginx
# Nginx reverse proxy for Unowire (www.unowire.com)
# Install: sudo cp deploy/nginx-unowire.conf /etc/nginx/sites-available/unowire
#          sudo ln -s /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
#          sudo nginx -t && sudo systemctl reload nginx

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name www.unowire.com unowire.com;

    # Certbot 验证路径放行（用于证书签发与续期）
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # 其余请求重定向到 HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 主站点
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.unowire.com unowire.com;

    # SSL 证书路径（Certbot 签发后填入）
    # 首次部署时这两行先注释，由 certbot --nginx 自动注入
    # ssl_certificate     /etc/letsencrypt/live/www.unowire.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/www.unowire.com/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 静态资源缓存（Next.js _next/static 路径）
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # sitemap 与 robots
    location = /sitemap.xml {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1h;
    }
    location = /robots.txt {
        proxy_pass http://127.0.0.1:3000;
    }

    # 反向代理到 Next.js PM2 进程
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 上传体积限制
    client_max_body_size 10m;

    # 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
    gzip_proxied any;
}
```

- [ ] **Step 2: 创建 deploy 目录结构**

Run:
```powershell
cd d:\projects\unowire
mkdir deploy
```

- [ ] **Step 3: 验证 Nginx 配置语法（若本地装了 nginx）**

Run（可选，本地无 nginx 可跳过）:
```powershell
nginx -t -c d:\projects\unowire\deploy\nginx-unowire.conf
```

Expected: `the configuration file ... syntax is ok`。若本地未装 nginx，本步骤跳过，在 Phase 3 服务器上验证。

- [ ] **Step 4: 提交**

```powershell
cd d:\projects\unowire
git add deploy/nginx-unowire.conf
git commit -m "chore: add Nginx site config for www.unowire.com"
```

---

### Task 10: 创建 deploy.sh 一键部署脚本

**Files:**
- Create: `deploy/deploy.sh`

- [ ] **Step 1: 创建 deploy.sh**

写入 `deploy/deploy.sh`：
```bash
#!/usr/bin/env bash
# Unowire deployment script — run on the production server.
# Usage: ./deploy/deploy.sh [branch]
#   branch defaults to "master"
#
# Prerequisites:
#   - Node.js 20+ installed
#   - PM2 installed globally (npm install -g pm2)
#   - Nginx installed
#   - Repository cloned to /var/www/unowire
#   - frontend/.env.production present
#
# What this script does:
#   1. Pull latest code from the given branch
#   2. Install npm dependencies (npm ci)
#   3. Build Next.js (npm run build, includes prebuild data validation)
#   4. Reload PM2 process (zero-downtime reload)
#   5. Reload Nginx (config may have changed)

set -euo pipefail

BRANCH="${1:-master}"
APP_DIR="/var/www/unowire"
FRONTEND_DIR="$APP_DIR/frontend"

echo "==> [1/5] Pulling latest code from branch: $BRANCH"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> [2/5] Installing npm dependencies"
cd "$FRONTEND_DIR"
npm ci

echo "==> [3/5] Building Next.js (with prebuild data validation)"
npm run build

echo "==> [4/5] Reloading PM2 process (zero-downtime)"
pm2 reload ecosystem.config.cjs --update-env
pm2 save

echo "==> [5/5] Reloading Nginx"
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "==> Deployment complete."
echo "    Site: https://www.unowire.com"
echo "    PM2 status: pm2 status"
echo "    PM2 logs:   pm2 logs unowire-frontend --lines 50"
```

- [ ] **Step 2: 设置可执行权限（Linux 服务器上执行）**

本地 Windows 无需此步。在 Phase 3 服务器上首次部署时执行：
```bash
chmod +x /var/www/unowire/deploy/deploy.sh
```

- [ ] **Step 3: 提交**

```powershell
cd d:\projects\unowire
git add deploy/deploy.sh
git commit -m "chore: add one-command deploy.sh for server updates"
```

---

### Task 11: 创建部署运维文档 DEPLOY.md

**Files:**
- Create: `deploy/README.md`

- [ ] **Step 1: 创建 deploy/README.md**

写入 `deploy/README.md`：
```markdown
# Unowire Deployment Guide

Production deployment for the Unowire cable specs database at **www.unowire.com**.

## Architecture

```
Internet → Nginx (443/HTTPS) → Next.js (127.0.0.1:3000, PM2-managed)
```

- **Next.js 16** runs as a Node.js server (`next start`) managed by PM2.
- **Nginx** terminates SSL, serves as reverse proxy, caches static assets.
- **No Docker, no CI/CD** — manual deploys via `deploy/deploy.sh`.
- **No backend** — data is static JSON in `frontend/data/`.

## Server Prerequisites

| Component | Version | Install |
|---|---|---|
| Ubuntu | 22.04 LTS | — |
| Node.js | 20.x LTS | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| PM2 | latest | `sudo npm install -g pm2` |
| Nginx | latest | `sudo apt install -y nginx` |
| Certbot | latest | `sudo apt install -y certbot python3-certbot-nginx` |
| Git | latest | `sudo apt install -y git` |

## First-Time Deployment

Run on the server as a non-root user with sudo privileges.

### Step 1: Clone the repository

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone <YOUR_REPO_URL> unowire
cd unowire
```

### Step 2: Configure environment

The `frontend/.env.production` file is committed to the repo with public env vars. If you need to override values, edit it on the server:

```bash
nano frontend/.env.production
# Verify: NEXT_PUBLIC_SITE_URL=https://www.unowire.com
```

### Step 3: Install dependencies and build

```bash
cd frontend
npm ci
npm run build
```

The `prebuild` hook auto-validates all JSON data. Build fails fast on bad data.

### Step 4: Start with PM2

```bash
cd frontend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Follow the printed instructions to make PM2 start on boot
```

Verify: `pm2 status` should show `unowire-frontend` as `online`.

```bash
curl http://127.0.0.1:3000/
# Should return HTML with <title>Unowire — Cable Specs Database</title>
```

### Step 5: Configure Nginx

```bash
sudo cp /var/www/unowire/deploy/nginx-unowire.conf /etc/nginx/sites-available/unowire
sudo ln -s /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Verify: `curl http://localhost/` should return the same HTML (via Nginx proxy).

### Step 6: Configure DNS

At your domain registrar, create an A record:
- `www.unowire.com` → `<SERVER_IP>`
- `unowire.com` → `<SERVER_IP>` (optional, apex redirect)

Wait for DNS propagation (check with `dig www.unowire.com`).

### Step 7: Provision SSL certificate

```bash
sudo certbot --nginx -d www.unowire.com -d unowire.com \
  --non-interactive --agree-tos --email <YOUR_EMAIL> --redirect
```

Certbot will:
- Auto-edit `/etc/nginx/sites-enabled/unowire` to inject SSL cert paths
- Set up auto-renewal via systemd timer (`certbot.timer`)

Verify HTTPS: `curl -I https://www.unowire.com/` should return `HTTP/2 200`.

## Subsequent Deploys

From your local machine, push to master, then on the server:

```bash
cd /var/www/unowire
./deploy/deploy.sh master
```

The script does: `git pull` → `npm ci` → `npm run build` → `pm2 reload` → `nginx reload`.

`pm2 reload` is zero-downtime (graceful restart of workers).

## Rollback

If a deploy breaks the site:

```bash
cd /var/www/unowire
git log --oneline -10           # find the last good commit
git checkout <GOOD_COMMIT_HASH>
cd frontend
npm ci && npm run build
pm2 reload ecosystem.config.cjs --update-env
```

## Common Operations

| Action | Command |
|---|---|
| View PM2 status | `pm2 status` |
| View PM2 logs (live) | `pm2 logs unowire-frontend` |
| View last 100 log lines | `pm2 logs unowire-frontend --lines 100` |
| Restart PM2 (hard) | `pm2 restart unowire-frontend` |
| Reload PM2 (zero-downtime) | `pm2 reload unowire-frontend` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Test Nginx config | `sudo nginx -t` |
| Renew SSL manually | `sudo certbot renew --dry-run` |
| Check SSL expiry | `echo \| openssl s_client -connect www.unowire.com:443 2>/dev/null \| openssl x509 -noout -dates` |

## Troubleshooting

### Site returns 502 Bad Gateway

PM2 process is down. Check:
```bash
pm2 status
pm2 logs unowire-frontend --lines 50 --err
```
Common cause: build artifact missing or port 3000 already in use. Fix and `pm2 reload`.

### Build fails on `prebuild` validation

JSON data integrity check failed. Inspect the validation output, fix the offending JSON file in `frontend/data/`, commit, push, redeploy.

### Certbot fails to verify domain

DNS not propagated or port 80 blocked. Check:
```bash
dig www.unowire.com
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### PM2 not auto-starting on reboot

Re-run `pm2 startup` and follow the printed `sudo env ...` command.

## File Inventory

| File | Purpose |
|---|---|
| `frontend/.env.production` | Production env vars (NEXT_PUBLIC_SITE_URL etc.) |
| `frontend/ecosystem.config.cjs` | PM2 process definition |
| `deploy/nginx-unowire.conf` | Nginx site config (HTTP redirect + HTTPS proxy) |
| `deploy/deploy.sh` | One-command deploy script |
| `deploy/README.md` | This document |
```

- [ ] **Step 2: 提交**

```powershell
cd d:\projects\unowire
git add deploy/README.md
git commit -m "docs: add deployment runbook for www.unowire.com"
```

---

### Task 12: Phase 2 收尾与进度账本更新

**Files:**
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: 验证所有部署文件就位**

Run:
```powershell
cd d:\projects\unowire
dir frontend\.env.production frontend\ecosystem.config.cjs deploy\nginx-unowire.conf deploy\deploy.sh deploy\README.md
```

Expected: 5 个文件全部存在，无 "File Not Found" 错误。

- [ ] **Step 2: 验证 git 工作树干净**

Run:
```powershell
cd d:\projects\unowire
git status
```

Expected: `nothing to commit, working tree clean`。

- [ ] **Step 3: 更新 progress.md**

在 `progress.md` 末尾追加 Phase 2 完成记录：

```markdown
## Phase 2: Deploy Config Files (Tasks 7-12 of deploy plan)

- Task 7: ✓ frontend/.env.production created (NEXT_PUBLIC_SITE_URL + API_MODE + NODE_ENV)
- Task 8: ✓ frontend/ecosystem.config.cjs created (PM2 fork mode, port 3000, 512M restart)
- Task 9: ✓ deploy/nginx-unowire.conf created (HTTP→HTTPS redirect + reverse proxy + cache + security headers)
- Task 10: ✓ deploy/deploy.sh created (git pull → npm ci → build → pm2 reload → nginx reload)
- Task 11: ✓ deploy/README.md created (full runbook: prereqs, first deploy, subsequent deploys, rollback, troubleshooting)
- Task 12: ✓ Phase 2 complete, ready for server deployment
```

- [ ] **Step 4: 提交**

```powershell
cd d:\projects\unowire
git add .superpowers/sdd/progress.md
git commit -m "chore: record phase 2 completion (deploy config files created)"
```

---

## Phase 3: 服务器部署（Tasks 13-18）

> 目标：在生产服务器上完成首次部署，签发 SSL 证书，验证网站可访问。本阶段在服务器上执行，需用户提供 `<SERVER_IP>`、`<YOUR_EMAIL>`、`<YOUR_REPO_URL>` 等运行时参数。

### Task 13: 服务器环境准备

**Files:**
- 无文件修改（服务器命令）

**前置条件（用户提供）：**
- 已购买云服务器（Ubuntu 22.04 LTS 推荐）
- 服务器公网 IP `<SERVER_IP>`
- 拥有 sudo 权限的 SSH 用户
- 域名 `www.unowire.com` 已购买，DNS 可控
- 仓库 Git remote URL `<YOUR_REPO_URL>`（GitHub/GitLab 等）

- [ ] **Step 1: SSH 登录服务器**

Run（替换 `<SERVER_IP>` 与用户名）：
```bash
ssh <USER>@<SERVER_IP>
```

Expected: 成功登录到服务器 shell。

- [ ] **Step 2: 更新系统包**

Run:
```bash
sudo apt update && sudo apt upgrade -y
```

Expected: 无错误完成。

- [ ] **Step 3: 安装 Node.js 20 LTS**

Run:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Expected: `node --version` 输出 `v20.x.x`，`npm --version` 输出 `10.x.x`。

- [ ] **Step 4: 安装 PM2 全局**

Run:
```bash
sudo npm install -g pm2
pm2 --version
```

Expected: `pm2 --version` 输出 `5.x.x` 或更高。

- [ ] **Step 5: 安装 Nginx**

Run:
```bash
sudo apt install -y nginx
nginx -v
sudo systemctl enable nginx
sudo systemctl start nginx
```

Expected: `nginx -v` 输出版本号，`systemctl status nginx` 显示 `active (running)`。

- [ ] **Step 6: 安装 Certbot 与 Nginx 插件**

Run:
```bash
sudo apt install -y certbot python3-certbot-nginx
certbot --version
```

Expected: `certbot --version` 输出 `certbot 1.x.x`。

- [ ] **Step 7: 安装 Git**

Run:
```bash
sudo apt install -y git
git --version
```

Expected: `git --version` 输出 `2.x.x`。

- [ ] **Step 8: 配置防火墙**

Run:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

Expected: 状态显示 `OpenSSH` 与 `Nginx Full` (80/443) ALLOW。

- [ ] **Step 9: 配置 PM2 开机自启**

Run:
```bash
pm2 startup systemd
# 此命令会输出一条 sudo env ... 命令，复制粘贴执行
```

Expected: 输出 `[PM2] Init System found: systemd` 与一条 `sudo env PATH=... systemctl enable pm2-<USER>` 命令。复制该命令并执行。

---

### Task 14: 拉取代码 + 首次构建 + PM2 启动

**Files:**
- 无文件修改（服务器命令）

- [ ] **Step 1: 创建站点目录**

Run:
```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
```

- [ ] **Step 2: 克隆仓库**

Run（替换 `<YOUR_REPO_URL>`）：
```bash
cd /var/www
git clone <YOUR_REPO_URL> unowire
cd unowire
ls -la
```

Expected: 看到 `frontend/`、`deploy/`、`docs/` 目录与 `.git/`。

- [ ] **Step 3: 设置 deploy.sh 可执行权限**

Run:
```bash
cd /var/www/unowire
chmod +x deploy/deploy.sh
```

- [ ] **Step 4: 验证 .env.production 内容**

Run:
```bash
cat frontend/.env.production
```

Expected:
```
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
NEXT_PUBLIC_API_MODE=mock
NODE_ENV=production
```

- [ ] **Step 5: 安装 npm 依赖**

Run:
```bash
cd /var/www/unowire/frontend
npm ci
```

Expected: 输出 `added N packages`，无 error。

- [ ] **Step 6: 执行生产构建**

Run:
```bash
cd /var/www/unowire/frontend
npm run build
```

Expected: 与本地 Task 1 Step 3 相同的成功输出（prebuild 校验通过 + 7 个路由生成）。

若构建失败：检查 Node 版本（需 20+）、内存（需 ≥ 1GB）、磁盘空间。

- [ ] **Step 7: 启动 PM2 进程**

Run:
```bash
cd /var/www/unowire/frontend
pm2 start ecosystem.config.cjs
pm2 status
```

Expected: `pm2 status` 显示 `unowire-frontend` 状态为 `online`。

- [ ] **Step 8: 保存 PM2 进程列表**

Run:
```bash
pm2 save
```

Expected: 输出 `Successfully saved in /home/<USER>/.pm2/dump.pm2`。

- [ ] **Step 9: 验证 Next.js 本地响应**

Run:
```bash
curl -I http://127.0.0.1:3000/
```

Expected: `HTTP/1.1 200 OK`。

```bash
curl http://127.0.0.1:3000/ | grep -i "<title>"
```

Expected: `<title>Unowire — Cable Specs Database</title>`。

若 502 或连接拒绝：`pm2 logs unowire-frontend --lines 50` 排查。

- [ ] **Step 10: 验证 JSON API 本地响应**

Run:
```bash
curl -I http://127.0.0.1:3000/api/cables/hitachi/ul1007
```

Expected: `HTTP/1.1 200 OK`，`Content-Type: application/json`。

---

### Task 15: Nginx 反向代理配置

**Files:**
- 无文件修改（服务器命令）

- [ ] **Step 1: 复制 Nginx 配置**

Run:
```bash
sudo cp /var/www/unowire/deploy/nginx-unowire.conf /etc/nginx/sites-available/unowire
sudo ln -sf /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
sudo rm -f /etc/nginx/sites-enabled/default
```

- [ ] **Step 2: 测试 Nginx 配置语法**

Run:
```bash
sudo nginx -t
```

Expected: `syntax is ok` + `test is successful`。

若失败：根据错误信息修复配置（常见：SSL 证书路径不存在——此时证书未签发，确认 `nginx-unowire.conf` 中 `ssl_certificate` 行已注释）。

- [ ] **Step 3: 重载 Nginx**

Run:
```bash
sudo systemctl reload nginx
```

Expected: 无输出（成功）。

- [ ] **Step 4: 验证 HTTP 反向代理（暂未配置 SSL）**

Run:
```bash
curl -I http://localhost/
```

Expected: `HTTP/1.1 301 Moved Permanently`，`Location: https://localhost/`。

> 说明：由于 `nginx-unowire.conf` 配置了 HTTP→HTTPS 强制重定向，HTTP 请求会被 301 到 HTTPS。但此时 SSL 证书尚未签发，HTTPS 访问会失败。这是预期的，下一步 Task 16 签发证书后即可正常访问。

若想暂时跳过 HTTPS 验证，可临时注释 `return 301 https://$host$request_uri;` 行并 `sudo nginx -s reload`，curl 应返回 200。验证完毕后恢复注释。

---

### Task 16: DNS 配置与 SSL 证书签发

**Files:**
- 无文件修改（外部 DNS 服务商 + 服务器命令）

- [ ] **Step 1: 在域名服务商配置 DNS A 记录**

登录域名注册商控制台，添加两条 A 记录：

| 主机记录 | 记录类型 | 记录值 |
|---|---|---|
| `www` | A | `<SERVER_IP>` |
| `@` | A | `<SERVER_IP>` |

- [ ] **Step 2: 等待 DNS 传播**

Run（本地或服务器均可）：
```bash
dig www.unowire.com +short
```

Expected: 输出 `<SERVER_IP>`。若输出空或不正确，等待 5-10 分钟后重试（DNS TTL 视服务商而定，最长可达 48 小时，通常 5-30 分钟）。

- [ ] **Step 3: 签发 SSL 证书**

Run（替换 `<YOUR_EMAIL>`）：
```bash
sudo certbot --nginx -d www.unowire.com -d unowire.com \
  --non-interactive --agree-tos --email <YOUR_EMAIL> --redirect
```

Expected: 输出包含 `Congratulations! You have successfully enabled HTTPS`。

Certbot 会自动：
- 签发证书至 `/etc/letsencrypt/live/www.unowire.com/`
- 修改 `/etc/nginx/sites-enabled/unowire` 注入 `ssl_certificate` 与 `ssl_certificate_key`
- 配置自动续期 systemd timer

若失败：
- `Connection refused` → 检查防火墙是否放行 80/443
- `DNS problem: NXDOMAIN` → DNS 未生效，等待后重试
- `rate limit` → Let's Encrypt 每周有签发次数限制，确认之前未重复签发

- [ ] **Step 4: 验证 HTTPS 访问**

Run:
```bash
curl -I https://www.unowire.com/
```

Expected: `HTTP/2 200`，`server: nginx`，`content-type: text/html`。

```bash
curl https://www.unowire.com/ | grep -i "<title>"
```

Expected: `<title>Unowire — Cable Specs Database</title>`。

- [ ] **Step 5: 验证 HTTP→HTTPS 重定向**

Run:
```bash
curl -I http://www.unowire.com/
```

Expected: `HTTP/1.1 301 Moved Permanently`，`Location: https://www.unowire.com/`。

- [ ] **Step 6: 验证证书自动续期**

Run:
```bash
sudo certbot renew --dry-run
```

Expected: `Congratulations, all simulated renewals succeeded`。

---

### Task 17: 生产环境冒烟测试

**Files:**
- 无文件修改（浏览器 + curl 验证）

- [ ] **Step 1: 验证首页（清单 #1 线上版）**

浏览器访问 `https://www.unowire.com/`。

Expected: 与本地 Task 2 Step 1 完全相同的渲染（hero + 搜索框 + 分类卡片 + 热门线缆）。证书锁标显示"安全"。

- [ ] **Step 2: 验证列表页与筛选（清单 #3-#5 线上版）**

浏览器访问：
- `https://www.unowire.com/cables` — 4 列网格正常
- `https://www.unowire.com/cables?manufacturer=mfr-1&brand=brand-1&awg=24` — 筛选结果正确
- `https://www.unowire.com/cables?min_area=0.2&max_area=0.5` — 范围筛选正确

- [ ] **Step 3: 验证详情页与 JSON API（清单 #7-#8 线上版）**

浏览器访问 `https://www.unowire.com/cables/hitachi/ul1007`。

curl 验证 JSON API：
```bash
curl -I https://www.unowire.com/api/cables/hitachi/ul1007
```

Expected: `HTTP/2 200`，`content-type: application/json`。

- [ ] **Step 4: 验证分类页（清单 #9 线上版）**

浏览器访问 `https://www.unowire.com/categories/automotive`。

Expected: 显示该分类下电缆列表。

- [ ] **Step 5: 验证 SEO 元数据（清单 #10-#12 线上版）**

Run:
```bash
curl -s https://www.unowire.com/cables/hitachi/ul1007 | grep -E "(<title>|canonical|application/ld\+json)"
```

Expected: 输出含 `<title>UL1007 | Unowire</title>`、`rel="canonical" href="https://www.unowire.com/cables/hitachi/ul1007"`、两个 `application/ld+json` script 标签。

```bash
curl -s https://www.unowire.com/sitemap.xml | head -20
```

Expected: XML 格式 sitemap，含 www.unowire.com URL。

```bash
curl -s https://www.unowire.com/robots.txt
```

Expected:
```
User-Agent: *
Disallow: /api/

Sitemap: https://www.unowire.com/sitemap.xml
```

- [ ] **Step 6: 验证异常路径（4 项异常线上版）**

Run:
```bash
curl -I https://www.unowire.com/cables/hitachi/nonexistent-slug
```
Expected: `HTTP/2 404`。

```bash
curl -I https://www.unowire.com/categories/nonexistent-category
```
Expected: `HTTP/2 404`。

```bash
curl -i https://www.unowire.com/api/cables/hitachi/nonexistent-slug
```
Expected: `HTTP/2 404`，body 为 `{"error":{"code":"not_found","message":"Cable not found"}}`。

浏览器访问 `https://www.unowire.com/cables?brand=brand-1&awg=99`：
Expected: 显示 `No cables found. Try adjusting your filters.` + `Clear all filters` 链接。

- [ ] **Step 7: 验证移动端响应式（清单 #13 线上版）**

DevTools 切换至 iPhone 12 视图，访问 `https://www.unowire.com/cables`：
- 侧边栏折叠
- 卡片 2 列
- 导航栏不溢出

- [ ] **Step 8: 验证 PM2 状态**

Run:
```bash
pm2 status
pm2 logs unowire-frontend --lines 20 --err
```

Expected: 状态 `online`，错误日志无异常（或仅有启动初期的 harmless warning）。

- [ ] **Step 9: 记录生产验收结果**

在本地编辑 `.superpowers/sdd/progress.md`，追加：

```markdown
## Production Smoke Test (Task 17 of deploy plan)

线上地址: https://www.unowire.com

- ✓ 首页渲染正常
- ✓ 列表页 + 筛选 + 分页
- ✓ 详情页 + JSON API
- ✓ 分类页
- ✓ SEO 元数据 (title/canonical/JSON-LD)
- ✓ sitemap.xml + robots.txt
- ✓ 4 项异常路径
- ✓ 移动端响应式
- ✓ PM2 状态健康
```

Commit:
```powershell
cd d:\projects\unowire
git add .superpowers/sdd/progress.md
git commit -m "chore: record production smoke test results"
git push origin master
```

---

### Task 18: 部署完成与交付清单

**Files:**
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: 在服务器上拉取最新进度账本**

Run（服务器上）：
```bash
cd /var/www/unowire
git pull origin master
```

- [ ] **Step 2: 在 progress.md 追加部署完成总结**

在 `.superpowers/sdd/progress.md` 末尾追加：

```markdown
## Deployment Complete (Task 18 of deploy plan)

- 部署日期: 2026-06-28 (UTC+8)
- 线上地址: https://www.unowire.com
- 服务器: <SERVER_IP>
- 进程管理: PM2 (unowire-frontend, fork mode, port 3000)
- 反向代理: Nginx (443/HTTPS → 127.0.0.1:3000)
- SSL: Let's Encrypt via Certbot (auto-renew enabled)
- 部署脚本: /var/www/unowire/deploy/deploy.sh
- 后续更新流程: 本地 push → 服务器 ./deploy/deploy.sh master

### 交付物清单
- [x] 本地生产构建通过 (Phase 1)
- [x] 13 项手工验收清单 + 4 项异常路径全部通过 (Phase 1)
- [x] 部署配置文件全部 commit (Phase 2: .env.production / ecosystem.config.cjs / nginx-unowire.conf / deploy.sh / README.md)
- [x] 服务器环境就绪 (Phase 3 Task 13)
- [x] 应用构建并 PM2 启动 (Phase 3 Task 14)
- [x] Nginx 反向代理配置 (Phase 3 Task 15)
- [x] DNS 指向 + SSL 证书签发 (Phase 3 Task 16)
- [x] 线上冒烟测试通过 (Phase 3 Task 17)
- [x] 部署文档完整 (deploy/README.md)
```

- [ ] **Step 3: 提交并推送最终交付**

```powershell
cd d:\projects\unowire
git add .superpowers/sdd/progress.md
git commit -m "chore: mark deployment complete — www.unowire.com live"
git push origin master
```

- [ ] **Step 4: 服务器同步最终状态**

Run（服务器上）：
```bash
cd /var/www/unowire
git pull origin master
```

Expected: 看到 `chore: mark deployment complete` commit。

- [ ] **Step 5: 部署完成确认**

打开浏览器，最终访问 `https://www.unowire.com/`。

确认：
- 页面正常加载
- 证书有效（锁标显示）
- 速度可接受（首屏 < 3s）

部署任务全部完成。

---

## Self-Review Checklist

### Spec Coverage
- 13 项手工验收清单（Task 30 of refactor plan）：覆盖于 Task 2-5
- 4 项异常路径：覆盖于 Task 5
- 部署到 www.unowire.com：覆盖于 Phase 3
- PM2 进程管理：覆盖于 Task 8 + Task 14
- Nginx 反向代理：覆盖于 Task 9 + Task 15
- SSL/HTTPS：覆盖于 Task 16
- 手动部署（无 Docker/CI）：覆盖于 deploy.sh（Task 10）
- 全英文项目（代码/文档/commit）：所有文件内容均为英文
- 部署文档：覆盖于 Task 11

### Placeholder Scan
- `deploy/README.md` 中 `<YOUR_REPO_URL>` / `<YOUR_EMAIL>` / `<SERVER_IP>` 为运行时参数，已在文档中明确标注"用户提供"。无 TBD / TODO / "fill in later" 等占位符。
- `nginx-unowire.conf` 中 SSL 证书路径已注释并说明"由 certbot 自动注入"，非占位符。

### Type/Name Consistency
- PM2 进程名 `unowire-frontend` 在 `ecosystem.config.cjs` / `deploy.sh` / `README.md` / `progress.md` 中一致
- 端口 `3000` 在 `ecosystem.config.cjs` / `nginx-unowire.conf` / `README.md` 中一致
- 应用目录 `/var/www/unowire` 在 `deploy.sh` / `README.md` 中一致
- 域名 `www.unowire.com` 在 `.env.production` / `nginx-unowire.conf` / `seo.ts` / `sitemap.ts` / `robots.ts` 中一致

### 风险点
- Phase 3 涉及外部依赖（DNS 传播、Let's Encrypt 限流、服务器规格），可能需要多次重试，已在 Task 16 Step 3 列出失败排查
- `npm ci` 在服务器上需要 `package-lock.json` 同步，已在 Task 14 Step 5 隐含（`git pull` 拉取 lock 文件）
- `prebuild` 校验在服务器构建时同样执行，若 JSON 数据有问题会快速失败（这是设计意图）

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-28-unowire-deploy-smoke-test.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Phase 1 (本地验收) 适合此模式，因为每个 Task 是独立的验收步骤。

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Phase 2 (配置文件创建) 适合此模式，因为 Tasks 之间是顺序依赖的文件创建。

**Which approach?**
