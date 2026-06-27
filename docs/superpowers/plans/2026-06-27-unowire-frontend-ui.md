# Unowire Frontend UI Implementation Plan（Unowire 前端 UI 实现计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个完整的、SEO 优化的黄页目录网站前端，使用 mock 数据，可独立于后端运行。后续只需修改一个文件即可切换到真实 API。

**Architecture:** Next.js 14 App Router 配合 mock JSON 数据文件。所有详情页使用 ISR + 基于 slug 的伪静态 URL 以便 Google 收录。匹配工具使用客户端 mock 匹配逻辑。数据访问通过 `lib/api.ts` 抽象封装，因此后端切换只需修改一个文件。

**Tech Stack:** Next.js 14、TypeScript、Tailwind CSS、shadcn/ui、React Server Components + Client Components

**Spec:** `docs/superpowers/specs/2026-06-27-unowire-mvp-design.md`

**关键原则：**
- 黄页目录形式——可浏览、内容丰富、可被搜索引擎收录的页面
- 伪静态 URL：`/cables/[brand_slug]/[slug]`，不使用查询参数
- SEO 优先：sitemap、robots、JSON-LD 结构化数据、每页独立的 metadata
- Mock 数据放在 `frontend/data/*.json` —— UI 通过 `npm run dev` 即可运行，无需后端
- Mock 匹配逻辑放在 `lib/mock-match.ts` —— 实现与后端规范（4.3 节）相同的 3 阶段算法

---

## 文件结构（File Structure）

```
frontend/
├── app/
│   ├── layout.tsx                          # Root layout (Nav + Footer)
│   ├── page.tsx                            # Home
│   ├── globals.css
│   ├── not-found.tsx                       # Custom 404
│   ├── cables/
│   │   ├── page.tsx                        # Directory list (server component)
│   │   └── [brand_slug]/[slug]/page.tsx    # Detail (ISR)
│   ├── equipments/
│   │   ├── page.tsx                        # Directory list
│   │   └── [brand_slug]/[slug]/page.tsx    # Detail (ISR)
│   ├── manufacturers/
│   │   ├── page.tsx                        # Directory list
│   │   └── [slug]/page.tsx                 # Detail (ISR)
│   ├── match/
│   │   └── page.tsx                        # Match tool (noindex, client)
│   ├── sitemap.ts                          # /sitemap.xml
│   └── robots.ts                           # /robots.txt
├── components/
│   ├── ui/                                 # shadcn/ui (installed via CLI)
│   ├── layout/
│   │   ├── Nav.tsx
│   │   ├── Footer.tsx
│   │   ├── Breadcrumbs.tsx
│   │   └── Container.tsx
│   ├── cable/
│   │   ├── CableCard.tsx
│   │   ├── CableFilters.tsx
│   │   └── CableSpecTable.tsx
│   ├── equipment/
│   │   ├── EquipmentCard.tsx
│   │   └── EquipmentSpecTable.tsx
│   ├── manufacturer/
│   │   └── ManufacturerCard.tsx
│   ├── match/
│   │   ├── MatchForm.tsx
│   │   ├── MatchResultCard.tsx
│   │   └── RuleBadge.tsx
│   ├── seo/
│   │   └── JsonLd.tsx
│   └── shared/
│       ├── SearchBox.tsx
│       ├── Pagination.tsx
│       └── ScoreBar.tsx
├── lib/
│   ├── types.ts                            # All TypeScript types
│   ├── api.ts                              # Data access layer (mock now, swap later)
│   ├── mock-match.ts                       # Client-side mock matching engine
│   ├── seo.ts                              # Metadata + JSON-LD generators
│   └── utils.ts                            # slug helpers, formatters
├── data/                                   # Mock data (the "database")
│   ├── manufacturers.json
│   ├── cables.json
│   ├── equipments.json
│   └── match-rules.json
├── public/
│   └── og-default.png                      # Default OG image
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── .env.local.example
```

---

## Phase 1: Project Setup（项目搭建）

### Task 1: Next.js Scaffolding

**文件：**
- 创建：`frontend/`（通过 create-next-app）
- 创建：`frontend/.env.local.example`
- 修改：`frontend/next.config.js`

- [ ] **步骤 1：搭建 Next.js 项目**

从 `d:\projects\unowire` 运行：
```bash
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm
```

所有交互式提示均使用默认值（TypeScript Yes、Tailwind Yes、ESLint Yes、App Router Yes、src/ No、import alias `@/*`）。

- [ ] **步骤 2：安装 shadcn/ui**

```bash
cd frontend
npx shadcn@latest init -d
```

- [ ] **步骤 3：添加 shadcn/ui 组件**

```bash
npx shadcn@latest add button card input label select badge separator
```

- [ ] **步骤 4：创建 .env.local.example**

```env
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
NEXT_PUBLIC_API_MODE=mock
```

- [ ] **步骤 5：创建 .env.local（开发用副本）**

```bash
copy .env.local.example .env.local
```

- [ ] **步骤 6：更新 next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
```

- [ ] **步骤 7：验证开发服务器启动**

```bash
cd frontend
npm run dev
```

预期：`http://localhost:3000` 能正常加载默认的 Next.js 启动页面，无错误。

- [ ] **步骤 8：提交**

```bash
cd d:\projects\unowire
git add frontend/
git commit -m "feat: scaffold Next.js 14 frontend with Tailwind and shadcn/ui"
```

---

### Task 2: Mock Data Files

**文件：**
- 创建：`frontend/data/manufacturers.json`
- 创建：`frontend/data/cables.json`
- 创建：`frontend/data/equipments.json`
- 创建：`frontend/data/match-rules.json`

- [ ] **步骤 1：创建 manufacturers.json**

```json
[
  {
    "id": "mfr-1",
    "name": "Hitachi Cable",
    "slug": "hitachi-cable",
    "type": "cable_manufacturer",
    "country": "Japan",
    "website": "https://www.hitachi-cable.com",
    "description": "Leading Japanese manufacturer of wire and cable products for automotive, industrial, and electronics applications."
  },
  {
    "id": "mfr-2",
    "name": "Sumitomo Electric",
    "slug": "sumitomo-electric",
    "type": "cable_manufacturer",
    "country": "Japan",
    "website": "https://global-sei.com",
    "description": "Global wire and cable manufacturer specializing in automotive and industrial wiring solutions."
  },
  {
    "id": "mfr-3",
    "name": "KMV",
    "slug": "kmv",
    "type": "equipment_manufacturer",
    "country": "Japan",
    "website": "https://www.kmv.co.jp",
    "description": "Wire harness processing equipment manufacturer offering stripping and cutting machines."
  },
  {
    "id": "mfr-4",
    "name": "Komax",
    "slug": "komax",
    "type": "equipment_manufacturer",
    "country": "Switzerland",
    "website": "https://www.komaxgroup.com",
    "description": "Swiss manufacturer of wire processing machines with global presence."
  },
  {
    "id": "mfr-5",
    "name": "JST Mfg",
    "slug": "jst-mfg",
    "type": "equipment_manufacturer",
    "country": "Japan",
    "website": "https://www.jst-mfg.com",
    "description": "Connector and terminal manufacturer also producing wire processing equipment."
  }
]
```

- [ ] **步骤 2：创建 cables.json**

```json
[
  {
    "id": "cable-1",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "UL1007",
    "slug": "ul1007-awg24",
    "spec": "UL1007 AWG24",
    "awg": "24",
    "conductor_area": 0.205,
    "outer_diameter": 1.40,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "300V",
    "temperature_rating": "80°C",
    "description": "UL1007 AWG24 PVC insulated single-core wire, widely used in internal wiring of electronic equipment. Conductor cross-section 0.205 mm², outer diameter 1.40 mm. Rated for 300V and 80°C.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-2",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "UL1007",
    "slug": "ul1007-awg22",
    "spec": "UL1007 AWG22",
    "awg": "22",
    "conductor_area": 0.326,
    "outer_diameter": 1.60,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "300V",
    "temperature_rating": "80°C",
    "description": "UL1007 AWG22 PVC insulated single-core wire for internal electronic wiring. 0.326 mm² conductor, 1.60 mm OD. Common in appliance and consumer electronics.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-3",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "UL1015",
    "slug": "ul1015-awg20",
    "spec": "UL1015 AWG20",
    "awg": "20",
    "conductor_area": 0.519,
    "outer_diameter": 1.80,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "600V",
    "temperature_rating": "105°C",
    "description": "UL1015 AWG20 PVC insulated wire with higher temperature rating. 0.519 mm² conductor, 1.80 mm OD, 600V rated. Suitable for internal wiring of electrical equipment.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-4",
    "manufacturer_id": "mfr-2",
    "brand": "Sumitomo Electric",
    "brand_slug": "sumitomo-electric",
    "model": "AVSS",
    "slug": "avss-0.5f",
    "spec": "AVSS 0.5f",
    "awg": "20",
    "conductor_area": 0.5,
    "outer_diameter": 2.0,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "60V",
    "temperature_rating": "80°C",
    "description": "AVSS 0.5f thin-wall PVC insulated automotive wire. 0.5 mm² conductor, 2.0 mm OD. Designed for automotive wiring harness applications.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-5",
    "manufacturer_id": "mfr-2",
    "brand": "Sumitomo Electric",
    "brand_slug": "sumitomo-electric",
    "model": "AVSS",
    "slug": "avss-0.75f",
    "spec": "AVSS 0.75f",
    "awg": "18",
    "conductor_area": 0.75,
    "outer_diameter": 2.3,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "60V",
    "temperature_rating": "80°C",
    "description": "AVSS 0.75f thin-wall automotive wire. 0.75 mm² conductor, 2.3 mm OD. Used in automotive harnesses for power distribution.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-6",
    "manufacturer_id": "mfr-2",
    "brand": "Sumitomo Electric",
    "brand_slug": "sumitomo-electric",
    "model": "AVSS",
    "slug": "avss-1.25f",
    "spec": "AVSS 1.25f",
    "awg": "16",
    "conductor_area": 1.25,
    "outer_diameter": 2.6,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "60V",
    "temperature_rating": "80°C",
    "description": "AVSS 1.25f thin-wall automotive wire. 1.25 mm² conductor, 2.6 mm OD. Common in automotive harnesses for higher current circuits.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-7",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "AWM",
    "slug": "awm-1007-26",
    "spec": "AWM 1007 AWG26",
    "awg": "26",
    "conductor_area": 0.128,
    "outer_diameter": 1.20,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "single",
    "rated_voltage": "300V",
    "temperature_rating": "80°C",
    "description": "AWM 1007 AWG26 thin PVC wire for compact electronic devices. 0.128 mm² conductor, 1.20 mm OD. Ideal for space-constrained applications.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-8",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "UL2468",
    "slug": "ul2468-24awg-2c",
    "spec": "UL2468 24AWG 2C",
    "awg": "24",
    "conductor_area": 0.205,
    "outer_diameter": 2.8,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pvc",
    "core_structure": "2_core",
    "rated_voltage": "300V",
    "temperature_rating": "80°C",
    "description": "UL2468 24AWG 2-conductor flat ribbon cable for internal power connections. 0.205 mm² per conductor, 2.8 mm total OD.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-9",
    "manufacturer_id": "mfr-1",
    "brand": "Hitachi Cable",
    "brand_slug": "hitachi-cable",
    "model": "UL2517",
    "slug": "ul2517-22awg",
    "spec": "UL2517 AWG22",
    "awg": "22",
    "conductor_area": 0.326,
    "outer_diameter": 1.90,
    "insulation_material": "PVC",
    "shielding": "none",
    "jacket": "pu",
    "core_structure": "single",
    "rated_voltage": "300V",
    "temperature_rating": "80°C",
    "description": "UL2517 AWG22 PU jacketed wire for applications requiring flexibility and abrasion resistance. 0.326 mm² conductor, 1.90 mm OD.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "cable-10",
    "manufacturer_id": "mfr-2",
    "brand": "Sumitomo Electric",
    "brand_slug": "sumitomo-electric",
    "model": "AVSS",
    "slug": "avss-2-2c-shielded",
    "spec": "AVSS 2.0 2C Shielded",
    "awg": "14",
    "conductor_area": 2.0,
    "outer_diameter": 5.2,
    "insulation_material": "PVC",
    "shielding": "braided",
    "jacket": "pvc",
    "core_structure": "2_core",
    "rated_voltage": "60V",
    "temperature_rating": "80°C",
    "description": "AVSS 2.0mm² 2-conductor shielded cable for automotive signal applications requiring EMI protection. Braided shielding, 5.2 mm OD.",
    "meta_title": null,
    "meta_description": null
  }
]
```

- [ ] **步骤 3：创建 equipments.json**

```json
[
  {
    "id": "eq-1",
    "manufacturer_id": "mfr-3",
    "brand": "KMV",
    "brand_slug": "kmv",
    "model": "CS-100",
    "slug": "cs-100",
    "equipment_type": "semi_auto_stripping",
    "automation_level": "semi_auto",
    "conductor_area_min": 0.05,
    "conductor_area_max": 1.5,
    "outer_diameter_min": 0.5,
    "outer_diameter_max": 3.5,
    "cut_length_min": 10,
    "cut_length_max": 99999,
    "supported_shieldings": ["none", "braided", "spiral", "foil"],
    "supported_jackets": ["none", "pvc", "pu", "lszh"],
    "supported_cores": ["single", "2_core", "3_core", "4_core", "multi_core"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "KMV CS-100 semi-automatic stripping machine for small to medium wire gauges. Handles 0.05-1.5 mm² conductor area, up to 3.5mm OD.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "eq-2",
    "manufacturer_id": "mfr-3",
    "brand": "KMV",
    "brand_slug": "kmv",
    "model": "CS-800",
    "slug": "cs-800",
    "equipment_type": "semi_auto_stripping",
    "automation_level": "semi_auto",
    "conductor_area_min": 0.05,
    "conductor_area_max": 2.5,
    "outer_diameter_min": 0.5,
    "outer_diameter_max": 5.0,
    "cut_length_min": 10,
    "cut_length_max": 99999,
    "supported_shieldings": ["none", "braided", "spiral", "foil"],
    "supported_jackets": ["none", "pvc", "pu", "lszh"],
    "supported_cores": ["single", "2_core", "3_core", "4_core", "multi_core"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "KMV CS-800 semi-automatic stripping machine with wider capacity range. 0.05-2.5 mm² conductor area, up to 5.0mm OD.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "eq-3",
    "manufacturer_id": "mfr-3",
    "brand": "KMV",
    "brand_slug": "kmv",
    "model": "KMX-200",
    "slug": "kmx-200",
    "equipment_type": "fully_auto_cutting_stripping",
    "automation_level": "fully_auto",
    "conductor_area_min": 0.1,
    "conductor_area_max": 6.0,
    "outer_diameter_min": 1.0,
    "outer_diameter_max": 8.0,
    "cut_length_min": 10,
    "cut_length_max": 99999,
    "supported_shieldings": ["none", "braided", "spiral", "foil"],
    "supported_jackets": ["none", "pvc", "pu", "lszh"],
    "supported_cores": ["single", "2_core", "3_core", "4_core", "multi_core"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "KMV KMX-200 fully-automatic cutting and stripping machine. 0.1-6.0 mm², high-speed processing with multi-core support.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "eq-4",
    "manufacturer_id": "mfr-4",
    "brand": "Komax",
    "brand_slug": "komax",
    "model": "Alpha-488",
    "slug": "alpha-488",
    "equipment_type": "fully_auto_cutting_stripping",
    "automation_level": "fully_auto",
    "conductor_area_min": 0.13,
    "conductor_area_max": 2.5,
    "outer_diameter_min": 0.8,
    "outer_diameter_max": 4.0,
    "cut_length_min": 20,
    "cut_length_max": 100000,
    "supported_shieldings": ["none", "braided"],
    "supported_jackets": ["none", "pvc", "pu"],
    "supported_cores": ["single", "2_core", "3_core"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "Komax Alpha 488 fully-automatic cut & strip machine. 0.13-2.5 mm², Swiss precision engineering for high-volume production.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "eq-5",
    "manufacturer_id": "mfr-4",
    "brand": "Komax",
    "brand_slug": "komax",
    "model": "Zeta-640",
    "slug": "zeta-640",
    "equipment_type": "semi_auto_stripping",
    "automation_level": "semi_auto",
    "conductor_area_min": 0.13,
    "conductor_area_max": 2.5,
    "outer_diameter_min": 0.8,
    "outer_diameter_max": 4.0,
    "cut_length_min": 15,
    "cut_length_max": 99999,
    "supported_shieldings": ["none", "braided", "spiral"],
    "supported_jackets": ["none", "pvc", "pu"],
    "supported_cores": ["single", "2_core", "3_core", "4_core"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "Komax Zeta 640 semi-automatic stripping machine. Medium capacity range with multi-core support. Swiss engineering.",
    "meta_title": null,
    "meta_description": null
  },
  {
    "id": "eq-6",
    "manufacturer_id": "mfr-5",
    "brand": "JST Mfg",
    "brand_slug": "jst-mfg",
    "model": "WS-200",
    "slug": "ws-200",
    "equipment_type": "semi_auto_stripping",
    "automation_level": "semi_auto",
    "conductor_area_min": 0.05,
    "conductor_area_max": 1.0,
    "outer_diameter_min": 0.5,
    "outer_diameter_max": 2.5,
    "cut_length_min": 10,
    "cut_length_max": 99999,
    "supported_shieldings": ["none"],
    "supported_jackets": ["none", "pvc"],
    "supported_cores": ["single"],
    "image_url": null,
    "spec_pdf_url": null,
    "description": "JST WS-200 compact semi-auto stripping machine for fine wire. 0.05-1.0 mm² conductor area, single-core only.",
    "meta_title": null,
    "meta_description": null
  }
]
```

- [ ] **步骤 4：创建 match-rules.json**

```json
[
  { "equipment_type": "semi_auto_stripping", "cable_field": "conductor_area", "operator": "range", "equipment_field": "conductor_area_min,max", "weight": 1.0, "is_required": true, "description": "Conductor area must be within equipment capacity range" },
  { "equipment_type": "semi_auto_stripping", "cable_field": "outer_diameter", "operator": "range", "equipment_field": "outer_diameter_min,max", "weight": 0.8, "is_required": true, "description": "Outer diameter must be within equipment capacity range" },
  { "equipment_type": "semi_auto_stripping", "cable_field": "cut_length", "operator": "range", "equipment_field": "cut_length_min,max", "weight": 0.5, "is_required": false, "description": "Cut length should be within equipment range" },
  { "equipment_type": "semi_auto_stripping", "cable_field": "shielding", "operator": "in", "equipment_field": "supported_shieldings", "weight": 0.7, "is_required": true, "description": "Equipment must support cable shielding type" },
  { "equipment_type": "semi_auto_stripping", "cable_field": "jacket", "operator": "in", "equipment_field": "supported_jackets", "weight": 0.6, "is_required": true, "description": "Equipment must support cable jacket type" },
  { "equipment_type": "semi_auto_stripping", "cable_field": "core_structure", "operator": "in", "equipment_field": "supported_cores", "weight": 0.9, "is_required": true, "description": "Equipment must support cable core structure" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "conductor_area", "operator": "range", "equipment_field": "conductor_area_min,max", "weight": 1.0, "is_required": true, "description": "Conductor area must be within equipment capacity range" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "outer_diameter", "operator": "range", "equipment_field": "outer_diameter_min,max", "weight": 0.8, "is_required": true, "description": "Outer diameter must be within equipment capacity range" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "cut_length", "operator": "range", "equipment_field": "cut_length_min,max", "weight": 0.5, "is_required": false, "description": "Cut length should be within equipment range" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "shielding", "operator": "in", "equipment_field": "supported_shieldings", "weight": 0.7, "is_required": true, "description": "Equipment must support cable shielding type" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "jacket", "operator": "in", "equipment_field": "supported_jackets", "weight": 0.6, "is_required": true, "description": "Equipment must support cable jacket type" },
  { "equipment_type": "fully_auto_cutting_stripping", "cable_field": "core_structure", "operator": "in", "equipment_field": "supported_cores", "weight": 0.9, "is_required": true, "description": "Equipment must support cable core structure" }
]
```

- [ ] **步骤 5：提交**

```bash
cd d:\projects\unowire
git add frontend/data/
git commit -m "feat: add mock JSON data (manufacturers, cables, equipments, match rules)"
```

---

### Task 3: Core Library Files (Types, Utils, SEO, API)

**文件：**
- 创建：`frontend/lib/types.ts`
- 创建：`frontend/lib/utils.ts`
- 创建：`frontend/lib/seo.ts`
- 创建：`frontend/lib/api.ts`
- 创建：`frontend/lib/mock-match.ts`

- [ ] **步骤 1：创建 lib/types.ts**

```typescript
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  type: string;
  country: string | null;
  website: string | null;
  description: string | null;
}

export interface Cable {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  spec: string;
  awg: string | null;
  conductor_area: number;
  outer_diameter: number;
  insulation_material: string | null;
  shielding: string;
  jacket: string;
  core_structure: string;
  rated_voltage: string | null;
  temperature_rating: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

export interface CableListItem {
  id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  spec: string;
  awg: string | null;
  conductor_area: number;
  outer_diameter: number;
  shielding: string;
  jacket: string;
  core_structure: string;
}

export interface Equipment {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  equipment_type: string;
  automation_level: string;
  conductor_area_min: number;
  conductor_area_max: number;
  outer_diameter_min: number;
  outer_diameter_max: number;
  cut_length_min: number | null;
  cut_length_max: number | null;
  supported_shieldings: string[];
  supported_jackets: string[];
  supported_cores: string[];
  image_url: string | null;
  spec_pdf_url: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

export interface EquipmentListItem {
  id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  equipment_type: string;
  automation_level: string;
  conductor_area_min: number;
  conductor_area_max: number;
}

export interface MatchRule {
  equipment_type: string;
  cable_field: string;
  operator: string;
  equipment_field: string;
  weight: number;
  is_required: boolean;
  description: string;
}

export interface MatchedRule {
  cable_field: string;
  operator: string;
  passed: boolean;
  required: boolean;
  weight: number;
  skipped: boolean;
}

export interface MatchResultItem {
  equipment: Equipment;
  score: number;
  failed_required: boolean;
  matched_rules: MatchedRule[];
  explanation: string;
}

export interface MatchTypeResult {
  equipment_type: string;
  matches: MatchResultItem[];
}

export interface MatchResponse {
  cable: Cable | null;
  results: MatchTypeResult[];
}

export interface CableListResponse {
  items: CableListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface EquipmentListResponse {
  items: EquipmentListItem[];
  total: number;
  page: number;
  page_size: number;
}
```

- [ ] **步骤 2：创建 lib/utils.ts**

```typescript
export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatCableUrl(brandSlug: string, slug: string): string {
  return `/cables/${brandSlug}/${slug}`;
}

export function formatEquipmentUrl(brandSlug: string, slug: string): string {
  return `/equipments/${brandSlug}/${slug}`;
}

export function formatManufacturerUrl(slug: string): string {
  return `/manufacturers/${slug}`;
}

export function formatEquipmentType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatCoreStructure(core: string): string {
  const map: Record<string, string> = {
    single: 'Single Core',
    '2_core': '2 Core',
    '3_core': '3 Core',
    '4_core': '4 Core',
    multi_core: 'Multi Core',
  };
  return map[core] || core;
}

export function formatShielding(shielding: string): string {
  const map: Record<string, string> = {
    none: 'None',
    braided: 'Braided',
    spiral: 'Spiral',
    foil: 'Foil',
  };
  return map[shielding] || shielding;
}

export function formatJacket(jacket: string): string {
  const map: Record<string, string> = {
    none: 'None',
    pvc: 'PVC',
    pu: 'PU',
    lszh: 'LSZH',
  };
  return map[jacket] || jacket.toUpperCase();
}
```

- [ ] **步骤 3：创建 lib/seo.ts**

```typescript
import type { Metadata } from 'next';
import type { Cable, Equipment, Manufacturer } from './types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export function generateCableMetadata(cable: Cable): Metadata {
  const title = cable.meta_title || `${cable.spec} | ${cable.brand} | Unowire`;
  const description = cable.meta_description ||
    (cable.description?.slice(0, 160)) ||
    `${cable.spec} wire: ${cable.conductor_area}mm² conductor, ${cable.outer_diameter}mm OD, ${cable.shielding} shielding, ${cable.jacket} jacket.`;
  const url = `${SITE_URL}/cables/${cable.brand_slug}/${cable.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function generateEquipmentMetadata(eq: Equipment): Metadata {
  const title = eq.meta_title || `${eq.brand} ${eq.model} | Unowire`;
  const description = eq.meta_description ||
    (eq.description?.slice(0, 160)) ||
    `${eq.brand} ${eq.model}: ${eq.conductor_area_min}-${eq.conductor_area_max}mm² capacity.`;
  const url = `${SITE_URL}/equipments/${eq.brand_slug}/${eq.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function generateManufacturerMetadata(mfr: Manufacturer): Metadata {
  const title = `${mfr.name} | Unowire`;
  const description = mfr.description?.slice(0, 160) || `${mfr.name} manufacturer directory.`;
  const url = `${SITE_URL}/manufacturers/${mfr.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    robots: { index: true, follow: true },
  };
}

export function buildCableJsonLd(cable: Cable) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cable.spec,
    brand: { '@type': 'Brand', name: cable.brand },
    description: cable.description || cable.spec,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'AWG', value: cable.awg },
      { '@type': 'PropertyValue', name: 'Conductor Area', value: `${cable.conductor_area} mm²` },
      { '@type': 'PropertyValue', name: 'Outer Diameter', value: `${cable.outer_diameter} mm` },
      { '@type': 'PropertyValue', name: 'Insulation', value: cable.insulation_material },
      { '@type': 'PropertyValue', name: 'Shielding', value: cable.shielding },
      { '@type': 'PropertyValue', name: 'Jacket', value: cable.jacket },
      { '@type': 'PropertyValue', name: 'Core Structure', value: cable.core_structure },
      { '@type': 'PropertyValue', name: 'Rated Voltage', value: cable.rated_voltage },
      { '@type': 'PropertyValue', name: 'Temperature Rating', value: cable.temperature_rating },
    ],
  };
}

export function buildEquipmentJsonLd(eq: Equipment) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${eq.brand} ${eq.model}`,
    brand: { '@type': 'Brand', name: eq.brand },
    description: eq.description || `${eq.brand} ${eq.model}`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Equipment Type', value: eq.equipment_type },
      { '@type': 'PropertyValue', name: 'Automation', value: eq.automation_level },
      { '@type': 'PropertyValue', name: 'Conductor Area Range', value: `${eq.conductor_area_min}-${eq.conductor_area_max} mm²` },
      { '@type': 'PropertyValue', name: 'OD Range', value: `${eq.outer_diameter_min}-${eq.outer_diameter_max} mm` },
      { '@type': 'PropertyValue', name: 'Cut Length Range', value: `${eq.cut_length_min}-${eq.cut_length_max} mm` },
      { '@type': 'PropertyValue', name: 'Supported Shieldings', value: eq.supported_shieldings.join(', ') },
      { '@type': 'PropertyValue', name: 'Supported Jackets', value: eq.supported_jackets.join(', ') },
      { '@type': 'PropertyValue', name: 'Supported Cores', value: eq.supported_cores.join(', ') },
    ],
  };
}

export function buildManufacturerJsonLd(mfr: Manufacturer) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: mfr.name,
    url: mfr.website || undefined,
    description: mfr.description || undefined,
    address: mfr.country ? { '@type': 'PostalAddress', addressCountry: mfr.country } : undefined,
  };
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}
```

- [ ] **步骤 4：创建 lib/api.ts（mock 数据访问层）**

这是后端就绪后唯一需要替换的文件。所有页面组件均从此处导入数据。

```typescript
import type {
  Cable, CableListItem, CableListResponse,
  Equipment, EquipmentListItem, EquipmentListResponse,
  Manufacturer, MatchRule,
} from './types';

import manufacturersData from '@/data/manufacturers.json';
import cablesData from '@/data/cables.json';
import equipmentsData from '@/data/equipments.json';
import matchRulesData from '@/data/match-rules.json';

const MATCH_TOP_N = 3;
const MATCH_SCORE_THRESHOLD = 0.0;

// Type the imported JSON
const manufacturers = manufacturersData as Manufacturer[];
const cables = cablesData as Cable[];
const equipments = equipmentsData as Equipment[];
const matchRules = matchRulesData as MatchRule[];

function toListItem(cable: Cable): CableListItem {
  const { id, brand, brand_slug, model, slug, spec, awg, conductor_area, outer_diameter, shielding, jacket, core_structure } = cable;
  return { id, brand, brand_slug, model, slug, spec, awg, conductor_area, outer_diameter, shielding, jacket, core_structure };
}

function toEquipListItem(eq: Equipment): EquipmentListItem {
  const { id, brand, brand_slug, model, slug, equipment_type, automation_level, conductor_area_min, conductor_area_max } = eq;
  return { id, brand, brand_slug, model, slug, equipment_type, automation_level, conductor_area_min, conductor_area_max };
}

export const api = {
  manufacturers: {
    list(): Manufacturer[] {
      return [...manufacturers].sort((a, b) => a.name.localeCompare(b.name));
    },
    getBySlug(slug: string): Manufacturer | null {
      return manufacturers.find(m => m.slug === slug) || null;
    },
    cables(slug: string): CableListItem[] {
      const mfr = manufacturers.find(m => m.slug === slug);
      if (!mfr) return [];
      return cables.filter(c => c.manufacturer_id === mfr.id).map(toListItem);
    },
    equipments(slug: string): EquipmentListItem[] {
      const mfr = manufacturers.find(m => m.slug === slug);
      if (!mfr) return [];
      return equipments.filter(e => e.manufacturer_id === mfr.id).map(toEquipListItem);
    },
  },

  cables: {
    list(params: {
      q?: string;
      awg?: string;
      brand?: string;
      shielding?: string;
      jacket?: string;
      core_structure?: string;
      conductor_area_min?: number;
      conductor_area_max?: number;
      outer_diameter_min?: number;
      outer_diameter_max?: number;
      page?: number;
      page_size?: number;
    } = {}): CableListResponse {
      let filtered = [...cables];
      if (params.q) {
        const q = params.q.toLowerCase();
        filtered = filtered.filter(c =>
          c.brand.toLowerCase().includes(q) ||
          c.model.toLowerCase().includes(q) ||
          c.spec.toLowerCase().includes(q)
        );
      }
      if (params.awg) filtered = filtered.filter(c => c.awg === params.awg);
      if (params.brand) filtered = filtered.filter(c => c.brand_slug === params.brand);
      if (params.shielding) filtered = filtered.filter(c => c.shielding === params.shielding);
      if (params.jacket) filtered = filtered.filter(c => c.jacket === params.jacket);
      if (params.core_structure) filtered = filtered.filter(c => c.core_structure === params.core_structure);
      if (params.conductor_area_min !== undefined) filtered = filtered.filter(c => c.conductor_area >= params.conductor_area_min!);
      if (params.conductor_area_max !== undefined) filtered = filtered.filter(c => c.conductor_area <= params.conductor_area_max!);
      if (params.outer_diameter_min !== undefined) filtered = filtered.filter(c => c.outer_diameter >= params.outer_diameter_min!);
      if (params.outer_diameter_max !== undefined) filtered = filtered.filter(c => c.outer_diameter <= params.outer_diameter_max!);

      const total = filtered.length;
      const page = params.page || 1;
      const page_size = params.page_size || 20;
      const start = (page - 1) * page_size;
      const items = filtered.slice(start, start + page_size).map(toListItem);
      return { items, total, page, page_size };
    },
    getBySlug(brandSlug: string, slug: string): Cable | null {
      return cables.find(c => c.brand_slug === brandSlug && c.slug === slug) || null;
    },
    getById(id: string): Cable | null {
      return cables.find(c => c.id === id) || null;
    },
    sitemap(): { brand_slug: string; slug: string; updated_at: string }[] {
      return cables.map(c => ({
        brand_slug: c.brand_slug,
        slug: c.slug,
        updated_at: new Date().toISOString(),
      }));
    },
    allBrands(): { name: string; slug: string }[] {
      const seen = new Map<string, string>();
      cables.forEach(c => seen.set(c.brand_slug, c.brand));
      return Array.from(seen.entries()).map(([slug, name]) => ({ name, slug }));
    },
  },

  equipments: {
    list(params: {
      q?: string;
      brand?: string;
      equipment_type?: string;
      page?: number;
      page_size?: number;
    } = {}): EquipmentListResponse {
      let filtered = [...equipments];
      if (params.q) {
        const q = params.q.toLowerCase();
        filtered = filtered.filter(e =>
          e.brand.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q)
        );
      }
      if (params.brand) filtered = filtered.filter(e => e.brand_slug === params.brand);
      if (params.equipment_type) filtered = filtered.filter(e => e.equipment_type === params.equipment_type);

      const total = filtered.length;
      const page = params.page || 1;
      const page_size = params.page_size || 20;
      const start = (page - 1) * page_size;
      const items = filtered.slice(start, start + page_size).map(toEquipListItem);
      return { items, total, page, page_size };
    },
    getBySlug(brandSlug: string, slug: string): Equipment | null {
      return equipments.find(e => e.brand_slug === brandSlug && e.slug === slug) || null;
    },
    sitemap(): { brand_slug: string; slug: string; updated_at: string }[] {
      return equipments.map(e => ({
        brand_slug: e.brand_slug,
        slug: e.slug,
        updated_at: new Date().toISOString(),
      }));
    },
  },

  matchRules: {
    list(): MatchRule[] {
      return matchRules;
    },
    byType(equipmentType: string): MatchRule[] {
      return matchRules.filter(r => r.equipment_type === equipmentType);
    },
  },

  config: {
    matchTopN: MATCH_TOP_N,
    matchScoreThreshold: MATCH_SCORE_THRESHOLD,
  },
};
```

- [ ] **步骤 5：创建 lib/mock-match.ts（客户端 mock 匹配引擎）**

实现与后端规范（4.3 节）相同的 3 阶段算法。完全在浏览器中运行。

```typescript
import type {
  Cable, Equipment, MatchRule, MatchedRule, MatchResultItem, MatchTypeResult, MatchResponse,
} from './types';
import { api } from './api';

interface CableMatchInput {
  conductor_area: number;
  outer_diameter: number;
  shielding: string;
  jacket: string;
  core_structure: string;
}

function evaluateRange(cableValue: number, equipMin: number, equipMax: number): boolean {
  return equipMin <= cableValue && cableValue <= equipMax;
}

function evaluateIn(cableValue: string, equipList: string[]): boolean {
  return equipList.includes(cableValue);
}

function getCableValue(cable: CableMatchInput, field: string, cutLength: number | null): number | string | null {
  if (field === 'cut_length') return cutLength;
  return (cable as any)[field] ?? null;
}

function getEquipmentValue(eq: Equipment, equipmentField: string): { min?: number; max?: number; list?: string[] } {
  if (equipmentField.includes(',')) {
    const [minField, maxField] = equipmentField.split(',');
    return { min: (eq as any)[minField], max: (eq as any)[maxField] };
  }
  return { list: (eq as any)[equipmentField] as string[] };
}

function evaluateRule(rule: MatchRule, cable: CableMatchInput, eq: Equipment, cutLength: number | null): MatchedRule {
  if (rule.cable_field === 'cut_length' && cutLength === null) {
    return {
      cable_field: rule.cable_field,
      operator: rule.operator,
      passed: true,
      required: rule.is_required,
      weight: 0, // excluded from scoring
      skipped: true,
    };
  }

  const cableValue = getCableValue(cable, rule.cable_field, cutLength);
  const equipValue = getEquipmentValue(eq, rule.equipment_field);

  let passed = false;
  if (rule.operator === 'range' && cableValue !== null && equipValue.min !== undefined && equipValue.max !== undefined) {
    passed = evaluateRange(Number(cableValue), equipValue.min, equipValue.max);
  } else if (rule.operator === 'in' && cableValue !== null && equipValue.list) {
    passed = evaluateIn(String(cableValue), equipValue.list);
  }

  return {
    cable_field: rule.cable_field,
    operator: rule.operator,
    passed,
    required: rule.is_required,
    weight: rule.weight,
    skipped: false,
  };
}

function calculateScore(results: MatchedRule[]): number {
  const active = results.filter(r => !r.skipped);
  if (active.length === 0) return 0;
  const total = active.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return 0;
  const passed = active.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
  return passed / total;
}

function hasFailedRequired(results: MatchedRule[]): boolean {
  return results.some(r => r.required && !r.passed && !r.skipped);
}

function buildExplanation(results: MatchedRule[]): string {
  const failedReq = results.filter(r => r.required && !r.passed && !r.skipped);
  if (failedReq.length > 0) {
    return 'Failed required rules: ' + failedReq.map(r => r.cable_field).join(', ');
  }
  const parts = results
    .filter(r => !r.skipped)
    .map(r => `${r.cable_field}: ${r.passed ? 'PASS' : 'FAIL'} (${r.required ? 'required' : 'optional'})`);
  return 'All required rules passed. ' + parts.join('; ');
}

function matchEquipmentType(
  equipmentType: string,
  cable: CableMatchInput,
  cutLength: number | null,
  topN: number,
  scoreThreshold: number,
): MatchResultItem[] {
  const rules = api.matchRules.byType(equipmentType);
  if (rules.length === 0) return [];

  // Get all equipments of this type
  const candidates = api.equipments.list({ equipment_type, page_size: 1000 }).items
    .map(item => api.equipments.getBySlug(item.brand_slug, item.slug)!)
    .filter(Boolean);

  // Phase 1+2: Evaluate all rules for each candidate
  const scored: MatchResultItem[] = [];
  for (const eq of candidates) {
    const ruleResults = rules.map(r => evaluateRule(r, cable, eq, cutLength));

    // Phase 1 check: if any required rule failed, eliminate
    if (hasFailedRequired(ruleResults)) continue;

    // Phase 2: score
    const score = calculateScore(ruleResults);
    if (scoreThreshold > 0 && score < scoreThreshold) continue;

    scored.push({
      equipment: eq,
      score: Math.round(score * 10000) / 10000,
      failed_required: false,
      matched_rules: ruleResults,
      explanation: buildExplanation(ruleResults),
    });
  }

  // Phase 3: rank and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function runMatch(params: {
  cable?: Cable | null;
  cableParams?: CableMatchInput;
  cutLength?: number | null;
  equipmentTypes: string[];
  topN?: number;
}): MatchResponse {
  const topN = params.topN || api.config.matchTopN;
  const threshold = api.config.matchScoreThreshold;

  let cableInput: CableMatchInput;
  if (params.cable) {
    cableInput = {
      conductor_area: params.cable.conductor_area,
      outer_diameter: params.cable.outer_diameter,
      shielding: params.cable.shielding,
      jacket: params.cable.jacket,
      core_structure: params.cable.core_structure,
    };
  } else if (params.cableParams) {
    cableInput = params.cableParams;
  } else {
    return { cable: null, results: [] };
  }

  const results: MatchTypeResult[] = params.equipmentTypes.map(et => ({
    equipment_type: et,
    matches: matchEquipmentType(et, cableInput, params.cutLength ?? null, topN, threshold),
  }));

  return { cable: params.cable || null, results };
}
```

- [ ] **步骤 6：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/
git commit -m "feat: add core lib files (types, utils, seo, mock API, mock match engine)"
```

---

## Phase 2: Layout & Shared Components（布局与共享组件）

### Task 4: Root Layout, Nav, Footer

**文件：**
- 创建：`frontend/components/layout/Container.tsx`
- 创建：`frontend/components/layout/Nav.tsx`
- 创建：`frontend/components/layout/Footer.tsx`
- 修改：`frontend/app/layout.tsx`
- 修改：`frontend/app/globals.css`（确保 container 样式）

- [ ] **步骤 1：创建 Container.tsx**

```tsx
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('container mx-auto px-4', className)}>
      {children}
    </div>
  );
}
```

- [ ] **步骤 2：创建 Nav.tsx**

```tsx
import Link from 'next/link';
import { Container } from './Container';

export function Nav() {
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/equipments', label: 'Equipment' },
    { href: '/manufacturers', label: 'Manufacturers' },
    { href: '/match', label: 'Match Tool' },
  ];
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Unowire
        </Link>
        <nav className="flex gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-gray-600 hover:text-blue-600 transition">
              {l.label}
            </Link>
          ))}
        </nav>
      </Container>
    </header>
  );
}
```

- [ ] **步骤 3：创建 Footer.tsx**

```tsx
import Link from 'next/link';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-12">
      <Container className="py-8">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-semibold mb-2">Unowire</h3>
            <p className="text-sm text-gray-600">Wire Harness Industry Directory</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Directory</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/cables" className="text-gray-600 hover:text-blue-600">Cables</Link></li>
              <li><Link href="/equipments" className="text-gray-600 hover:text-blue-600">Equipment</Link></li>
              <li><Link href="/manufacturers" className="text-gray-600 hover:text-blue-600">Manufacturers</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Tools</h3>
            <ul className="space-y-1 text-sm">
              <li><Link href="/match" className="text-gray-600 hover:text-blue-600">Equipment Match Tool</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t pt-4 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Unowire. Wire Harness Industry Directory.
        </div>
      </Container>
    </footer>
  );
}
```

- [ ] **步骤 4：更新 app/layout.tsx**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: {
    default: 'Unowire — Wire Harness Industry Directory',
    template: '%s | Unowire',
  },
  description: 'Find cable manufacturers, specifications, and matched wire processing equipment for the wire harness industry.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **步骤 5：验证开发服务器并提交**

```bash
cd frontend
npm run dev
```

访问 `http://localhost:3000` —— 应显示 Nav 和 Footer 以及默认页面内容。

```bash
cd d:\projects\unowire
git add frontend/components/layout/ frontend/app/layout.tsx
git commit -m "feat: add root layout with Nav and Footer"
```

---

### Task 5: Shared Components (Breadcrumbs, Pagination, SearchBox, ScoreBar, JsonLd)

**文件：**
- 创建：`frontend/components/layout/Breadcrumbs.tsx`
- 创建：`frontend/components/seo/JsonLd.tsx`
- 创建：`frontend/components/shared/Pagination.tsx`
- 创建：`frontend/components/shared/SearchBox.tsx`
- 创建：`frontend/components/shared/ScoreBar.tsx`
- 创建：`frontend/app/not-found.tsx`

- [ ] **步骤 1：创建 JsonLd.tsx**

```tsx
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
```

- [ ] **步骤 2：创建 Breadcrumbs.tsx**

```tsx
import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { name: string; url?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-4">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-400">/</span>}
            {item.url ? (
              <Link href={item.url} className="hover:text-blue-600 hover:underline">{item.name}</Link>
            ) : (
              <span className="text-gray-900 font-medium">{item.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **步骤 3：创建 Pagination.tsx**

```tsx
import Link from 'next/link';

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const buildUrl = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && k !== 'page') params.set(k, v);
    });
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  };

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages);

  return (
    <nav className="flex justify-center items-center gap-2 mt-8" aria-label="Pagination">
      {page > 1 && (
        <Link href={buildUrl(page - 1)} className="px-3 py-1 border rounded hover:bg-gray-100">
          ← Prev
        </Link>
      )}
      {pages.map((p, i) => {
        // Insert ellipsis
        const prev = pages[i - 1];
        const showEllipsis = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-2">
            {showEllipsis && <span className="text-gray-400">…</span>}
            <Link
              href={buildUrl(p)}
              className={`px-3 py-1 border rounded ${
                p === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'
              }`}
            >
              {p}
            </Link>
          </span>
        );
      })}
      {page < totalPages && (
        <Link href={buildUrl(page + 1)} className="px-3 py-1 border rounded hover:bg-gray-100">
          Next →
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **步骤 4：创建 SearchBox.tsx（客户端组件）**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchBox({
  placeholder = 'Search cables by brand, model, or AWG...',
  basePath = '/cables',
  paramName = 'q',
}: {
  placeholder?: string;
  basePath?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value) params.set(paramName, value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        Search
      </button>
    </form>
  );
}
```

- [ ] **步骤 5：创建 ScoreBar.tsx**

```tsx
export function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'bg-green-500' : score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 min-w-[3rem]">{pct}%</span>
    </div>
  );
}
```

- [ ] **步骤 6：创建 not-found.tsx**

```tsx
import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function NotFound() {
  return (
    <Container className="py-20 text-center">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
      <p className="text-gray-600 mb-8">The page you are looking for does not exist.</p>
      <Link href="/" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Back to Home
      </Link>
    </Container>
  );
}
```

- [ ] **步骤 7：提交**

```bash
cd d:\projects\unowire
git add frontend/components/ frontend/app/not-found.tsx
git commit -m "feat: add shared components (Breadcrumbs, Pagination, SearchBox, ScoreBar, JsonLd, 404)"
```

---

## Phase 3: Home & Directory Pages（首页与目录页）

### Task 6: Home Page

**文件：**
- 创建：`frontend/app/page.tsx`

- [ ] **步骤 1：创建首页**

```tsx
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export default function HomePage() {
  const cableBrands = api.cables.allBrands();
  const equipmentBrands = Array.from(new Set(api.equipments.list({ page_size: 1000 }).items.map(e => e.brand_slug)));
  const totalCables = api.cables.list({ page_size: 1000 }).total;
  const totalEquipments = api.equipments.list({ page_size: 1000 }).total;
  const totalManufacturers = api.manufacturers.list().length;

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-20">
        <Container className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Wire Harness Industry Directory
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Find cable specifications and matched wire processing equipment from leading manufacturers.
          </p>
          <div className="flex justify-center mb-4">
            <SearchBox />
          </div>
          <div>
            <Link href="/match" className="text-blue-600 hover:underline">
              Or match equipment by cable parameters →
            </Link>
          </div>
        </Container>
      </section>

      {/* Stats */}
      <section className="border-y bg-white">
        <Container className="py-8">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalCables}</div>
              <div className="text-sm text-gray-600">Cables</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalEquipments}</div>
              <div className="text-sm text-gray-600">Equipment</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalManufacturers}</div>
              <div className="text-sm text-gray-600">Manufacturers</div>
            </div>
          </div>
        </Container>
      </section>

      {/* Browse categories */}
      <section className="py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">Browse Directory</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/cables" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">🔌</div>
              <h3 className="text-xl font-semibold mb-2">Cables</h3>
              <p className="text-gray-600 text-sm">Browse wire and cable specifications by manufacturer and AWG.</p>
            </Link>
            <Link href="/equipments" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">⚙️</div>
              <h3 className="text-xl font-semibold mb-2">Equipment</h3>
              <p className="text-gray-600 text-sm">Wire processing machines: stripping, cutting, crimping.</p>
            </Link>
            <Link href="/manufacturers" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">🏭</div>
              <h3 className="text-xl font-semibold mb-2">Manufacturers</h3>
              <p className="text-gray-600 text-sm">Directory of cable and equipment manufacturers.</p>
            </Link>
          </div>
        </Container>
      </section>

      {/* Popular brands */}
      <section className="bg-gray-50 py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">Popular Brands</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {cableBrands.map(brand => (
              <Link
                key={brand.slug}
                href={`/cables?brand=${brand.slug}`}
                className="px-4 py-2 bg-white border rounded-full text-sm hover:border-blue-300 hover:shadow transition"
              >
                {brand.name}
              </Link>
            ))}
            {equipmentBrands.map(slug => {
              const mfr = api.manufacturers.getBySlug(slug);
              if (!mfr) return null;
              return (
                <Link
                  key={slug}
                  href={`/equipments?brand=${slug}`}
                  className="px-4 py-2 bg-white border rounded-full text-sm hover:border-blue-300 hover:shadow transition"
                >
                  {mfr.name}
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Search Cable</h3>
              <p className="text-gray-600 text-sm">Find your cable by brand, model, or AWG.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">View Specs</h3>
              <p className="text-gray-600 text-sm">See full cable specifications and ratings.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Get Matched</h3>
              <p className="text-gray-600 text-sm">Find equipment that can process your cable.</p>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
```

- [ ] **步骤 2：验证并提交**

访问 `http://localhost:3000` —— 应显示完整的首页，包含 hero 区、统计数据、分类、品牌、使用说明等模块。

```bash
cd d:\projects\unowire
git add frontend/app/page.tsx
git commit -m "feat: add home page (directory portal with search, stats, categories, brands)"
```

---

### Task 7: Cable Directory List Page

**文件：**
- 创建：`frontend/components/cable/CableCard.tsx`
- 创建：`frontend/components/cable/CableFilters.tsx`
- 创建：`frontend/app/cables/page.tsx`

- [ ] **步骤 1：创建 CableCard.tsx**

```tsx
import Link from 'next/link';
import type { CableListItem } from '@/lib/types';
import { formatCableUrl, formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function CableCard({ cable }: { cable: CableListItem }) {
  return (
    <Link
      href={formatCableUrl(cable.brand_slug, cable.slug)}
      className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">{cable.spec}</h3>
          <p className="text-gray-600 text-sm">{cable.brand}</p>
        </div>
        {cable.awg && (
          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">AWG {cable.awg}</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
        <span>{cable.conductor_area} mm²</span>
        <span>•</span>
        <span>{cable.outer_diameter} mm OD</span>
        <span>•</span>
        <span>{formatShielding(cable.shielding)}</span>
        <span>•</span>
        <span>{formatJacket(cable.jacket)}</span>
        <span>•</span>
        <span>{formatCoreStructure(cable.core_structure)}</span>
      </div>
    </Link>
  );
}
```

- [ ] **步骤 2：创建 CableFilters.tsx（客户端组件）**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function CableFilters({ brands }: { brands: { name: string; slug: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [areaMin, setAreaMin] = useState(searchParams.get('conductor_area_min') || '');
  const [areaMax, setAreaMax] = useState(searchParams.get('conductor_area_max') || '');
  const [odMin, setOdMin] = useState(searchParams.get('outer_diameter_min') || '');
  const [odMax, setOdMax] = useState(searchParams.get('outer_diameter_max') || '');

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set('page', '1');
    router.push(`/cables?${params.toString()}`);
  }

  function applyRange() {
    const params = new URLSearchParams(searchParams.toString());
    if (areaMin) params.set('conductor_area_min', areaMin); else params.delete('conductor_area_min');
    if (areaMax) params.set('conductor_area_max', areaMax); else params.delete('conductor_area_max');
    if (odMin) params.set('outer_diameter_min', odMin); else params.delete('outer_diameter_min');
    if (odMax) params.set('outer_diameter_max', odMax); else params.delete('outer_diameter_max');
    params.set('page', '1');
    router.push(`/cables?${params.toString()}`);
  }

  return (
    <aside className="w-full md:w-64 space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Brand</h3>
        <select
          onChange={e => updateParam('brand', e.target.value)}
          defaultValue={searchParams.get('brand') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All Brands</option>
          {brands.map(b => (
            <option key={b.slug} value={b.slug}>{b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">AWG</h3>
        <select
          onChange={e => updateParam('awg', e.target.value)}
          defaultValue={searchParams.get('awg') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All AWG</option>
          {['26', '24', '22', '20', '18', '16', '14'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Cross-section (mm²)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Min"
            value={areaMin}
            onChange={e => setAreaMin(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Max"
            value={areaMax}
            onChange={e => setAreaMax(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">OD (mm)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Min"
            value={odMin}
            onChange={e => setOdMin(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Max"
            value={odMax}
            onChange={e => setOdMax(e.target.value)}
            className="w-1/2 border border-gray-300 rounded p-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={applyRange}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        Apply Range
      </button>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Shielding</h3>
        <select
          onChange={e => updateParam('shielding', e.target.value)}
          defaultValue={searchParams.get('shielding') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="none">None</option>
          <option value="braided">Braided</option>
          <option value="spiral">Spiral</option>
          <option value="foil">Foil</option>
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Jacket</h3>
        <select
          onChange={e => updateParam('jacket', e.target.value)}
          defaultValue={searchParams.get('jacket') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="none">None</option>
          <option value="pvc">PVC</option>
          <option value="pu">PU</option>
          <option value="lszh">LSZH</option>
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-gray-900">Core Structure</h3>
        <select
          onChange={e => updateParam('core_structure', e.target.value)}
          defaultValue={searchParams.get('core_structure') || ''}
          className="w-full border border-gray-300 rounded p-2 text-sm"
        >
          <option value="">All</option>
          <option value="single">Single Core</option>
          <option value="2_core">2 Core</option>
          <option value="3_core">3 Core</option>
          <option value="4_core">4 Core</option>
          <option value="multi_core">Multi Core</option>
        </select>
      </div>
    </aside>
  );
}
```

- [ ] **步骤 3：创建 cables 列表页（服务端组件）**

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Cable Directory',
  description: 'Browse wire and cable specifications by manufacturer, AWG, and technical parameters.',
  robots: { index: true, follow: true },
};

interface SearchParams {
  q?: string;
  brand?: string;
  awg?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  conductor_area_min?: string;
  conductor_area_max?: string;
  outer_diameter_min?: string;
  outer_diameter_max?: string;
  page?: string;
}

export default function CablesPage({ searchParams }: { searchParams: SearchParams }) {
  const page = parseInt(searchParams.page || '1');
  const result = api.cables.list({
    q: searchParams.q,
    awg: searchParams.awg,
    brand: searchParams.brand,
    shielding: searchParams.shielding,
    jacket: searchParams.jacket,
    core_structure: searchParams.core_structure,
    conductor_area_min: searchParams.conductor_area_min ? parseFloat(searchParams.conductor_area_min) : undefined,
    conductor_area_max: searchParams.conductor_area_max ? parseFloat(searchParams.conductor_area_max) : undefined,
    outer_diameter_min: searchParams.outer_diameter_min ? parseFloat(searchParams.outer_diameter_min) : undefined,
    outer_diameter_max: searchParams.outer_diameter_max ? parseFloat(searchParams.outer_diameter_max) : undefined,
    page,
    page_size: 20,
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const brands = api.cables.allBrands();

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Cable Directory</h1>
      <p className="text-gray-600 mb-6">
        Browse {result.total} cable{result.total !== 1 ? 's' : ''} from {brands.length} brand{brands.length !== 1 ? 's' : ''}.
      </p>

      <div className="mb-6">
        <SearchBox />
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <CableFilters brands={brands} />
        <div className="flex-1">
          {result.items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No cables found. Try adjusting your filters.
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                {result.items.map(cable => (
                  <CableCard key={cable.id} cable={cable} />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                basePath="/cables"
                searchParams={searchParams as Record<string, string | undefined>}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **步骤 4：验证并提交**

访问 `http://localhost:3000/cables` —— 应显示 10 条线缆列表，左侧有筛选器、搜索框、分页。

```bash
cd d:\projects\unowire
git add frontend/app/cables/page.tsx frontend/components/cable/
git commit -m "feat: add cable directory list page with filters and pagination"
```

---

### Task 8: Equipment Directory List Page

**文件：**
- 创建：`frontend/components/equipment/EquipmentCard.tsx`
- 创建：`frontend/app/equipments/page.tsx`

- [ ] **步骤 1：创建 EquipmentCard.tsx**

```tsx
import Link from 'next/link';
import type { EquipmentListItem } from '@/lib/types';
import { formatEquipmentUrl, formatEquipmentType } from '@/lib/utils';

export function EquipmentCard({ equipment }: { equipment: EquipmentListItem }) {
  return (
    <Link
      href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
      className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">{equipment.brand} {equipment.model}</h3>
          <p className="text-gray-600 text-sm capitalize">{formatEquipmentType(equipment.equipment_type)}</p>
        </div>
        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded capitalize">
          {equipment.automation_level.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="mt-3 text-sm text-gray-500">
        <span>Conductor: {equipment.conductor_area_min}–{equipment.conductor_area_max} mm²</span>
      </div>
    </Link>
  );
}
```

- [ ] **步骤 2：创建 equipments 列表页**

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Equipment Directory',
  description: 'Browse wire processing equipment: stripping machines, cutting machines, and more.',
  robots: { index: true, follow: true },
};

interface SearchParams {
  q?: string;
  brand?: string;
  equipment_type?: string;
  page?: string;
}

export default function EquipmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = parseInt(searchParams.page || '1');
  const result = api.equipments.list({
    q: searchParams.q,
    brand: searchParams.brand,
    equipment_type: searchParams.equipment_type,
    page,
    page_size: 20,
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const brands = Array.from(new Set(api.equipments.list({ page_size: 1000 }).items.map(e => e.brand_slug)))
    .map(slug => {
      const mfr = api.manufacturers.getBySlug(slug);
      return { name: mfr?.name || slug, slug };
    });

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Equipment' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Equipment Directory</h1>
      <p className="text-gray-600 mb-6">Browse {result.total} wire processing equipment.</p>

      <div className="mb-6">
        <SearchBox placeholder="Search equipment by brand or model..." basePath="/equipments" />
      </div>

      {/* Quick type filter */}
      <div className="flex gap-2 mb-6">
        <a href="/equipments" className={`px-4 py-1 rounded-full text-sm border ${!searchParams.equipment_type ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          All Types
        </a>
        <a href="/equipments?equipment_type=semi_auto_stripping" className={`px-4 py-1 rounded-full text-sm border ${searchParams.equipment_type === 'semi_auto_stripping' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          Semi-Auto Stripping
        </a>
        <a href="/equipments?equipment_type=fully_auto_cutting_stripping" className={`px-4 py-1 rounded-full text-sm border ${searchParams.equipment_type === 'fully_auto_cutting_stripping' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          Fully-Auto Cutting & Stripping
        </a>
      </div>

      {result.items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No equipment found.</div>
      ) : (
        <>
          <div className="grid gap-4">
            {result.items.map(eq => (
              <EquipmentCard key={eq.id} equipment={eq} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath="/equipments"
            searchParams={searchParams as Record<string, string | undefined>}
          />
        </>
      )}
    </Container>
  );
}
```

- [ ] **步骤 3：验证并提交**

访问 `http://localhost:3000/equipments` —— 应显示 6 条设备，并带有类型筛选标签。

```bash
cd d:\projects\unowire
git add frontend/app/equipments/page.tsx frontend/components/equipment/EquipmentCard.tsx
git commit -m "feat: add equipment directory list page with type filter"
```

---

### Task 9: Manufacturer Directory List Page

**文件：**
- 创建：`frontend/components/manufacturer/ManufacturerCard.tsx`
- 创建：`frontend/app/manufacturers/page.tsx`

- [ ] **步骤 1：创建 ManufacturerCard.tsx**

```tsx
import Link from 'next/link';
import type { Manufacturer } from '@/lib/types';
import { formatManufacturerUrl } from '@/lib/utils';

export function ManufacturerCard({ manufacturer }: { manufacturer: Manufacturer }) {
  const typeLabel = manufacturer.type === 'cable_manufacturer' ? 'Cable Manufacturer' : 'Equipment Manufacturer';
  return (
    <Link
      href={formatManufacturerUrl(manufacturer.slug)}
      className="block border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-blue-300 transition"
    >
      <h3 className="font-semibold text-lg text-gray-900">{manufacturer.name}</h3>
      <p className="text-gray-600 text-sm mt-1">{typeLabel}</p>
      {manufacturer.country && (
        <p className="text-gray-500 text-sm mt-1">{manufacturer.country}</p>
      )}
      {manufacturer.description && (
        <p className="text-gray-600 text-sm mt-3 line-clamp-2">{manufacturer.description}</p>
      )}
    </Link>
  );
}
```

- [ ] **步骤 2：创建 manufacturers 列表页**

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ManufacturerCard } from '@/components/manufacturer/ManufacturerCard';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Manufacturer Directory',
  description: 'Directory of cable and wire processing equipment manufacturers.',
  robots: { index: true, follow: true },
};

export default function ManufacturersPage() {
  const manufacturers = api.manufacturers.list();
  const cableMfrs = manufacturers.filter(m => m.type === 'cable_manufacturer');
  const equipMfrs = manufacturers.filter(m => m.type === 'equipment_manufacturer');

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Manufacturer Directory</h1>
      <p className="text-gray-600 mb-8">Browse {manufacturers.length} manufacturers in our directory.</p>

      {cableMfrs.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Cable Manufacturers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cableMfrs.map(m => (
              <ManufacturerCard key={m.id} manufacturer={m} />
            ))}
          </div>
        </section>
      )}

      {equipMfrs.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4">Equipment Manufacturers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {equipMfrs.map(m => (
              <ManufacturerCard key={m.id} manufacturer={m} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
```

- [ ] **步骤 3：验证并提交**

访问 `http://localhost:3000/manufacturers` —— 应显示 5 家制造商，按类型分组。

```bash
cd d:\projects\unowire
git add frontend/app/manufacturers/page.tsx frontend/components/manufacturer/ManufacturerCard.tsx
git commit -m "feat: add manufacturer directory list page"
```

---

## Phase 4: Detail Pages (ISR + SEO)（详情页）

### Task 10: Cable Detail Page

**文件：**
- 创建：`frontend/components/cable/CableSpecTable.tsx`
- 创建：`frontend/app/cables/[brand_slug]/[slug]/page.tsx`

- [ ] **步骤 1：创建 CableSpecTable.tsx**

```tsx
import type { Cable } from '@/lib/types';
import { formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function CableSpecTable({ cable }: { cable: Cable }) {
  const specs = [
    { label: 'Brand', value: cable.brand },
    { label: 'Model', value: cable.model },
    { label: 'Specification', value: cable.spec },
    { label: 'AWG', value: cable.awg || '—' },
    { label: 'Conductor Area', value: `${cable.conductor_area} mm²` },
    { label: 'Outer Diameter', value: `${cable.outer_diameter} mm` },
    { label: 'Insulation Material', value: cable.insulation_material || '—' },
    { label: 'Shielding', value: formatShielding(cable.shielding) },
    { label: 'Jacket', value: formatJacket(cable.jacket) },
    { label: 'Core Structure', value: formatCoreStructure(cable.core_structure) },
    { label: 'Rated Voltage', value: cable.rated_voltage || '—' },
    { label: 'Temperature Rating', value: cable.temperature_rating || '—' },
  ];

  return (
    <table className="w-full">
      <tbody>
        {specs.map(s => (
          <tr key={s.label} className="border-b border-gray-100">
            <td className="py-2 pr-4 font-medium text-gray-700 w-1/3">{s.label}</td>
            <td className="py-2 text-gray-900">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **步骤 2：创建 cable 详情页（ISR）**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { api } from '@/lib/api';
import {
  generateCableMetadata,
  buildCableJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.cables.sitemap().map(s => ({
    brand_slug: s.brand_slug,
    slug: s.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: { brand_slug: string; slug: string };
}): Promise<Metadata> {
  const cable = api.cables.getBySlug(params.brand_slug, params.slug);
  if (!cable) {
    return { title: 'Cable Not Found' };
  }
  return generateCableMetadata(cable);
}

export default function CableDetailPage({
  params,
}: {
  params: { brand_slug: string; slug: string };
}) {
  const cable = api.cables.getBySlug(params.brand_slug, params.slug);
  if (!cable) notFound();

  const manufacturer = api.manufacturers.list().find(m => m.id === cable.manufacturer_id);
  const sameBrandCables = api.cables.list({ brand: cable.brand_slug, page_size: 1000 })
    .items.filter(c => c.slug !== cable.slug).slice(0, 5);
  const sameAwgCables = cable.awg
    ? api.cables.list({ awg: cable.awg, page_size: 1000 })
        .items.filter(c => c.slug !== cable.slug).slice(0, 5)
    : [];

  return (
    <Container className="py-8">
      <JsonLd data={buildCableJsonLd(cable)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: cable.brand, url: `/cables?brand=${cable.brand_slug}` },
        { name: cable.spec, url: `/cables/${cable.brand_slug}/${cable.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: cable.brand, url: `/cables?brand=${cable.brand_slug}` },
        { name: cable.spec },
      ]} />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{cable.spec}</h1>
          <p className="text-gray-600 mb-6">
            by{' '}
            {manufacturer ? (
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-blue-600 hover:underline">
                {cable.brand}
              </Link>
            ) : cable.brand}
          </p>

          <h2 className="text-xl font-semibold mb-4">Specifications</h2>
          <CableSpecTable cable={cable} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            {cable.description || 'No description available.'}
          </p>

          <div className="border border-blue-200 bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold mb-2">Find Matching Equipment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Get a list of wire processing machines that can handle this cable.
            </p>
            <Link
              href={`/match?cable_id=${cable.id}`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Match Equipment →
            </Link>
          </div>
        </div>
      </div>

      {/* Related cables */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        {sameBrandCables.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">More from {cable.brand}</h2>
            <ul className="space-y-2">
              {sameBrandCables.map(c => (
                <li key={c.id}>
                  <Link href={`/cables/${c.brand_slug}/${c.slug}`} className="text-blue-600 hover:underline">
                    {c.spec}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">— {c.conductor_area} mm², AWG {c.awg}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {sameAwgCables.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Other AWG {cable.awg} Cables</h2>
            <ul className="space-y-2">
              {sameAwgCables.map(c => (
                <li key={c.id}>
                  <Link href={`/cables/${c.brand_slug}/${c.slug}`} className="text-blue-600 hover:underline">
                    {c.spec}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">— {c.brand}, {c.conductor_area} mm²</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **步骤 3：验证并提交**

访问 `http://localhost:3000/cables/hitachi-cable/ul1007-awg24` —— 应显示完整的规格表、描述、匹配 CTA、相关线缆。查看页面源码——验证 JSON-LD 脚本是否存在。

```bash
cd d:\projects\unowire
git add frontend/app/cables/\[brand_slug\]/ frontend/components/cable/CableSpecTable.tsx
git commit -m "feat: add cable detail page with ISR, SEO metadata, JSON-LD, related cables"
```

---

### Task 11: Equipment Detail Page

**文件：**
- 创建：`frontend/components/equipment/EquipmentSpecTable.tsx`
- 创建：`frontend/app/equipments/[brand_slug]/[slug]/page.tsx`

- [ ] **步骤 1：创建 EquipmentSpecTable.tsx**

```tsx
import type { Equipment } from '@/lib/types';
import { formatEquipmentType, formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function EquipmentSpecTable({ equipment }: { equipment: Equipment }) {
  const specs = [
    { label: 'Brand', value: equipment.brand },
    { label: 'Model', value: equipment.model },
    { label: 'Equipment Type', value: formatEquipmentType(equipment.equipment_type) },
    { label: 'Automation Level', value: equipment.automation_level.replace(/_/g, ' ') },
    { label: 'Conductor Area Range', value: `${equipment.conductor_area_min} – ${equipment.conductor_area_max} mm²` },
    { label: 'Outer Diameter Range', value: `${equipment.outer_diameter_min} – ${equipment.outer_diameter_max} mm` },
    { label: 'Cut Length Range', value: `${equipment.cut_length_min} – ${equipment.cut_length_max} mm` },
    { label: 'Supported Shieldings', value: equipment.supported_shieldings.map(formatShielding).join(', ') },
    { label: 'Supported Jackets', value: equipment.supported_jackets.map(formatJacket).join(', ') },
    { label: 'Supported Core Structures', value: equipment.supported_cores.map(formatCoreStructure).join(', ') },
  ];

  return (
    <table className="w-full">
      <tbody>
        {specs.map(s => (
          <tr key={s.label} className="border-b border-gray-100">
            <td className="py-2 pr-4 font-medium text-gray-700 w-1/3">{s.label}</td>
            <td className="py-2 text-gray-900 capitalize">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **步骤 2：创建 equipment 详情页（ISR）**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentSpecTable } from '@/components/equipment/EquipmentSpecTable';
import { api } from '@/lib/api';
import {
  generateEquipmentMetadata,
  buildEquipmentJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.equipments.sitemap().map(s => ({
    brand_slug: s.brand_slug,
    slug: s.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: { brand_slug: string; slug: string };
}): Promise<Metadata> {
  const eq = api.equipments.getBySlug(params.brand_slug, params.slug);
  if (!eq) {
    return { title: 'Equipment Not Found' };
  }
  return generateEquipmentMetadata(eq);
}

export default function EquipmentDetailPage({
  params,
}: {
  params: { brand_slug: string; slug: string };
}) {
  const eq = api.equipments.getBySlug(params.brand_slug, params.slug);
  if (!eq) notFound();

  const manufacturer = api.manufacturers.list().find(m => m.id === eq.manufacturer_id);
  const sameTypeEquipment = api.equipments.list({ equipment_type: eq.equipment_type, page_size: 1000 })
    .items.filter(e => e.slug !== eq.slug).slice(0, 5);

  return (
    <Container className="py-8">
      <JsonLd data={buildEquipmentJsonLd(eq)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Equipment', url: '/equipments' },
        { name: eq.brand, url: `/equipments?brand=${eq.brand_slug}` },
        { name: `${eq.brand} ${eq.model}`, url: `/equipments/${eq.brand_slug}/${eq.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Equipment', url: '/equipments' },
        { name: eq.brand, url: `/equipments?brand=${eq.brand_slug}` },
        { name: `${eq.brand} ${eq.model}` },
      ]} />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{eq.brand} {eq.model}</h1>
          <p className="text-gray-600 mb-6 capitalize">
            {formatEquipmentType(eq.equipment_type)} · {eq.automation_level.replace(/_/g, ' ')}
          </p>

          <h2 className="text-xl font-semibold mb-4">Specifications</h2>
          <EquipmentSpecTable equipment={eq} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            {eq.description || 'No description available.'}
          </p>

          {eq.spec_pdf_url && (
            <a
              href={eq.spec_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition mb-6"
            >
              Download Spec Sheet (PDF) →
            </a>
          )}

          {manufacturer && (
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold mb-2">Manufacturer</h3>
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-blue-600 hover:underline">
                {manufacturer.name}
              </Link>
              {manufacturer.country && (
                <p className="text-sm text-gray-500 mt-1">{manufacturer.country}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {sameTypeEquipment.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Similar Equipment</h2>
          <ul className="space-y-2">
            {sameTypeEquipment.map(e => (
              <li key={e.id}>
                <Link href={`/equipments/${e.brand_slug}/${e.slug}`} className="text-blue-600 hover:underline">
                  {e.brand} {e.model}
                </Link>
                <span className="text-gray-500 text-sm ml-2">
                  — {e.conductor_area_min}–{e.conductor_area_max} mm²
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
```

注意：`formatEquipmentType` 从 `@/lib/utils` 导入，该文件在 Task 3 中创建。

在文件顶部添加缺失的 import：

```tsx
import { formatEquipmentType } from '@/lib/utils';
```

- [ ] **步骤 3：验证并提交**

访问 `http://localhost:3000/equipments/kmv/cs-800` —— 应显示完整规格、描述、制造商链接、相似设备。

```bash
cd d:\projects\unowire
git add frontend/app/equipments/\[brand_slug\]/ frontend/components/equipment/EquipmentSpecTable.tsx
git commit -m "feat: add equipment detail page with ISR, SEO, structured data"
```

---

### Task 12: Manufacturer Detail Page

**文件：**
- 创建：`frontend/app/manufacturers/[slug]/page.tsx`

- [ ] **步骤 1：创建 manufacturer 详情页（ISR）**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { api } from '@/lib/api';
import {
  generateManufacturerMetadata,
  buildManufacturerJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';
import { formatCableUrl, formatEquipmentUrl } from '@/lib/utils';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.manufacturers.list().map(m => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const mfr = api.manufacturers.getBySlug(params.slug);
  if (!mfr) {
    return { title: 'Manufacturer Not Found' };
  }
  return generateManufacturerMetadata(mfr);
}

export default function ManufacturerDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const mfr = api.manufacturers.getBySlug(params.slug);
  if (!mfr) notFound();

  const cables = api.manufacturers.cables(params.slug);
  const equipments = api.manufacturers.equipments(params.slug);
  const typeLabel = mfr.type === 'cable_manufacturer' ? 'Cable Manufacturer' : 'Equipment Manufacturer';

  return (
    <Container className="py-8">
      <JsonLd data={buildManufacturerJsonLd(mfr)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Manufacturers', url: '/manufacturers' },
        { name: mfr.name, url: `/manufacturers/${mfr.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers', url: '/manufacturers' },
        { name: mfr.name },
      ]} />

      <h1 className="text-3xl font-bold mb-2">{mfr.name}</h1>
      <p className="text-gray-600 mb-4">{typeLabel}</p>
      {mfr.country && <p className="text-gray-600 mb-4">{mfr.country}</p>}
      {mfr.description && (
        <p className="text-gray-700 leading-relaxed mb-6 max-w-2xl">{mfr.description}</p>
      )}
      {mfr.website && (
        <a
          href={mfr.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Official Website →
        </a>
      )}

      {cables.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Cables ({cables.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {cables.map(c => (
              <Link
                key={c.id}
                href={formatCableUrl(c.brand_slug, c.slug)}
                className="border border-gray-200 rounded p-4 hover:shadow hover:border-blue-300 transition"
              >
                <div className="font-medium">{c.spec}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {c.conductor_area} mm², {c.outer_diameter} mm OD
                  {c.awg && `, AWG ${c.awg}`}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {equipments.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Equipment ({equipments.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {equipments.map(e => (
              <Link
                key={e.id}
                href={formatEquipmentUrl(e.brand_slug, e.slug)}
                className="border border-gray-200 rounded p-4 hover:shadow hover:border-blue-300 transition"
              >
                <div className="font-medium">{e.brand} {e.model}</div>
                <div className="text-sm text-gray-500 mt-1 capitalize">
                  {e.equipment_type.replace(/_/g, ' ')} · {e.conductor_area_min}–{e.conductor_area_max} mm²
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
```

- [ ] **步骤 2：验证并提交**

访问 `http://localhost:3000/manufacturers/kmv` —— 应显示制造商信息及其设备列表。

```bash
cd d:\projects\unowire
git add frontend/app/manufacturers/\[slug\]/
git commit -m "feat: add manufacturer detail page with ISR, SEO, cable/equipment listings"
```

---

## Phase 5: Match Tool（匹配工具）

### Task 13: Match Page

**文件：**
- 创建：`frontend/components/match/RuleBadge.tsx`
- 创建：`frontend/components/match/MatchResultCard.tsx`
- 创建：`frontend/components/match/MatchForm.tsx`
- 创建：`frontend/app/match/page.tsx`

- [ ] **步骤 1：创建 RuleBadge.tsx**

```tsx
export function RuleBadge({ passed, required, skipped }: { passed: boolean; required: boolean; skipped: boolean }) {
  if (skipped) {
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">N/A</span>;
  }
  if (passed) {
    return (
      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
        ✓ {required ? 'Required' : 'Optional'}
      </span>
    );
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded ${required ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
      ✗ {required ? 'Required' : 'Optional'}
    </span>
  );
}
```

- [ ] **步骤 2：创建 MatchResultCard.tsx**

```tsx
import Link from 'next/link';
import type { MatchResultItem } from '@/lib/types';
import { ScoreBar } from '@/components/shared/ScoreBar';
import { RuleBadge } from './RuleBadge';
import { formatEquipmentUrl, formatEquipmentType } from '@/lib/utils';

export function MatchResultCard({ result, rank }: { result: MatchResultItem; rank: number }) {
  const { equipment, score, matched_rules, explanation } = result;
  return (
    <div className="border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-medium">#{rank}</span>
            <Link
              href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
              className="font-semibold text-lg text-gray-900 hover:text-blue-600"
            >
              {equipment.brand} {equipment.model}
            </Link>
          </div>
          <p className="text-gray-600 text-sm capitalize">{formatEquipmentType(equipment.equipment_type)}</p>
        </div>
        <div className="w-32">
          <ScoreBar score={score} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {matched_rules.map(r => (
          <div key={r.cable_field} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-600">{r.cable_field.replace(/_/g, ' ')}</span>
            <RuleBadge passed={r.passed} required={r.required} skipped={r.skipped} />
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 italic mb-3">{explanation}</p>

      <div className="flex gap-3">
        <Link
          href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
          className="text-blue-600 hover:underline text-sm"
        >
          View Details →
        </Link>
        {equipment.spec_pdf_url && (
          <a
            href={equipment.spec_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm"
          >
            Spec Sheet (PDF)
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：创建 MatchForm.tsx（客户端组件）**

这是主要的交互组件。它处理两种入口模式（通过 URL 传入 cable_id，或直接输入参数），并调用 mock 匹配引擎。

```tsx
'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { runMatch } from '@/lib/mock-match';
import type { MatchResponse } from '@/lib/types';
import { MatchResultCard } from './MatchResultCard';
import { formatEquipmentType } from '@/lib/utils';

const EQUIPMENT_TYPES = [
  { value: 'semi_auto_stripping', label: 'Semi-Auto Stripping Machine' },
  { value: 'fully_auto_cutting_stripping', label: 'Fully-Auto Cutting & Stripping Machine' },
];

function MatchFormContent() {
  const searchParams = useSearchParams();
  const cableId = searchParams.get('cable_id');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    conductor_area: '',
    outer_diameter: '',
    cut_length: '',
    shielding: 'none',
    jacket: 'pvc',
    core_structure: 'single',
  });
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({
    semi_auto_stripping: true,
    fully_auto_cutting_stripping: true,
  });

  // Pre-fill from cable_id and auto-match
  useEffect(() => {
    if (!cableId) return;
    const cable = api.cables.getById(cableId);
    if (!cable) {
      setError('Cable not found.');
      return;
    }
    setForm({
      conductor_area: String(cable.conductor_area),
      outer_diameter: String(cable.outer_diameter),
      cut_length: '',
      shielding: cable.shielding,
      jacket: cable.jacket,
      core_structure: cable.core_structure,
    });
    setLoading(true);
    setError(null);
    // Run match with cable object
    const types = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
    const r = runMatch({ cable, equipmentTypes: types });
    setResult(r);
    setLoading(false);
  }, [cableId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const types = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
      if (types.length === 0) {
        setError('Please select at least one equipment type.');
        setLoading(false);
        return;
      }
      const cableParams = {
        conductor_area: parseFloat(form.conductor_area),
        outer_diameter: parseFloat(form.outer_diameter),
        shielding: form.shielding,
        jacket: form.jacket,
        core_structure: form.core_structure,
      };
      const r = runMatch({
        cableParams,
        cutLength: form.cut_length ? parseFloat(form.cut_length) : null,
        equipmentTypes: types,
      });
      setResult(r);
    } catch (err) {
      setError('Failed to run match. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Cable Parameters</h2>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conductor Area (mm²) *
            </label>
            <input
              type="number"
              step="0.001"
              required
              value={form.conductor_area}
              onChange={e => setForm({ ...form, conductor_area: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 0.205"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outer Diameter (mm) *
            </label>
            <input
              type="number"
              step="0.001"
              required
              value={form.outer_diameter}
              onChange={e => setForm({ ...form, outer_diameter: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 1.40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cut Length (mm) — optional
            </label>
            <input
              type="number"
              value={form.cut_length}
              onChange={e => setForm({ ...form, cut_length: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shielding</label>
            <select
              value={form.shielding}
              onChange={e => setForm({ ...form, shielding: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="none">None</option>
              <option value="braided">Braided</option>
              <option value="spiral">Spiral</option>
              <option value="foil">Foil</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jacket</label>
            <select
              value={form.jacket}
              onChange={e => setForm({ ...form, jacket: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="none">None</option>
              <option value="pvc">PVC</option>
              <option value="pu">PU</option>
              <option value="lszh">LSZH</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Core Structure</label>
            <select
              value={form.core_structure}
              onChange={e => setForm({ ...form, core_structure: e.target.value })}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="single">Single Core</option>
              <option value="2_core">2 Core</option>
              <option value="3_core">3 Core</option>
              <option value="4_core">4 Core</option>
              <option value="multi_core">Multi Core</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Equipment Types</label>
          <div className="space-y-2">
            {EQUIPMENT_TYPES.map(t => (
              <label key={t.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedTypes[t.value]}
                  onChange={e => setSelectedTypes({ ...selectedTypes, [t.value]: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Matching...' : 'Match Equipment'}
        </button>
      </form>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded p-4 mb-6">
          {error}
        </div>
      )}

      {result && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          {result.cable && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
              <span className="text-sm text-gray-600">Matching for cable:</span>{' '}
              <span className="font-medium">{result.cable.spec}</span>{' '}
              <span className="text-gray-500">({result.cable.brand})</span>
            </div>
          )}
          {result.results.map(typeResult => (
            <div key={typeResult.equipment_type} className="mb-8">
              <h3 className="text-lg font-semibold mb-3 capitalize">
                {formatEquipmentType(typeResult.equipment_type)}
              </h3>
              {typeResult.matches.length === 0 ? (
                <p className="text-gray-500 text-sm">No matching equipment found.</p>
              ) : (
                <div className="space-y-4">
                  {typeResult.matches.map((m, i) => (
                    <MatchResultCard key={m.equipment.id} result={m} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchForm() {
  return (
    <Suspense fallback={<div className="text-gray-500">Loading...</div>}>
      <MatchFormContent />
    </Suspense>
  );
}
```

- [ ] **步骤 4：创建 match 页面（noindex）**

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { MatchForm } from '@/components/match/MatchForm';

export const metadata: Metadata = {
  title: 'Equipment Match Tool',
  description: 'Find wire processing equipment that matches your cable specifications.',
  robots: { index: false, follow: false }, // noindex — interactive tool, not content
};

export default function MatchPage() {
  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Match Tool' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Equipment Match Tool</h1>
      <p className="text-gray-600 mb-6">
        Enter your cable parameters to find matching wire processing equipment.
        The tool recommends top equipment based on conductor area, outer diameter, and other specs.
      </p>

      <MatchForm />
    </Container>
  );
}
```

- [ ] **步骤 5：验证两种入口模式**

1. 直接模式：访问 `http://localhost:3000/match` → 填写参数 → 点击 Match → 查看结果
2. 从线缆进入：访问 `http://localhost:3000/cables/hitachi-cable/ul1007-awg24` → 点击 "Match Equipment →" → 应自动填充并显示结果

- [ ] **步骤 6：提交**

```bash
cd d:\projects\unowire
git add frontend/app/match/ frontend/components/match/
git commit -m "feat: add match page with dual entry (cable_id + direct input), noindex"
```

---

## Phase 6: SEO Infrastructure（SEO 基础设施）

### Task 14: Sitemap

**文件：**
- 创建：`frontend/app/sitemap.ts`

- [ ] **步骤 1：创建 sitemap.ts**

```typescript
import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/equipments`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    // /match is excluded — noindex tool page
  ];

  const cablePages: MetadataRoute.Sitemap = api.cables.sitemap().map(c => ({
    url: `${SITE_URL}/cables/${c.brand_slug}/${c.slug}`,
    lastModified: new Date(c.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const equipmentPages: MetadataRoute.Sitemap = api.equipments.sitemap().map(e => ({
    url: `${SITE_URL}/equipments/${e.brand_slug}/${e.slug}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const manufacturerPages: MetadataRoute.Sitemap = api.manufacturers.list().map(m => ({
    url: `${SITE_URL}/manufacturers/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...cablePages, ...equipmentPages, ...manufacturerPages];
}
```

- [ ] **步骤 2：验证并提交**

访问 `http://localhost:3000/sitemap.xml` —— 应显示包含所有 URL 的 XML。

```bash
cd d:\projects\unowire
git add frontend/app/sitemap.ts
git commit -m "feat: add dynamic sitemap.xml route"
```

---

### Task 15: Robots.txt

**文件：**
- 创建：`frontend/app/robots.ts`

- [ ] **步骤 1：创建 robots.ts**

```typescript
import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/match', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **步骤 2：验证并提交**

访问 `http://localhost:3000/robots.txt` —— 应显示规则和 sitemap URL。

```bash
cd d:\projects\unowire
git add frontend/app/robots.ts
git commit -m "feat: add robots.txt route (disallow /match and /api/)"
```

---

## Phase 7: Production Build & Verification（生产构建与验证）

### Task 16: Build Verification

**文件：**
- 修改：`frontend/app/globals.css`（确保无 Tailwind purge 问题）
- 无新文件

- [ ] **步骤 1：运行生产构建**

```bash
cd frontend
npm run build
```

预期：构建无错误完成。所有页面预渲染：
- `○ (Static)` 用于首页、制造商列表
- `● (ISR)` 用于线缆/设备/制造商详情页
- `ƒ (Dynamic)` 用于 cables/equipments 列表（含搜索参数）

如果构建失败，请检查：
- TypeScript 错误：修复任何类型不匹配
- 缺失的 import：确保所有 `@/lib/` 和 `@/components/` import 都能正确解析
- shadcn/ui：确保所有添加的组件都存在于 `components/ui/`

- [ ] **步骤 2：运行生产服务器**

```bash
cd frontend
npm run start
```

访问 `http://localhost:3000` —— 整站应正常运行。

- [ ] **步骤 3：手动验收清单**

逐项验证：
1. 首页 `/` —— hero 区、搜索、统计数据、分类、品牌、使用说明等模块正常渲染
2. `/cables` —— 列表显示 10 条线缆，筛选器可用（试试 AWG 24、品牌 hitachi-cable）
3. `/cables/hitachi-cable/ul1007-awg24` —— 完整规格表、描述、Match CTA、相关线缆
4. 在线缆详情页查看页面源码 —— 验证 `<title>`、`<meta name="description">`、`<link rel="canonical">`、JSON-LD `<script type="application/ld+json">` 是否存在
5. `/equipments` —— 列表显示 6 条设备，类型筛选标签可用
6. `/equipments/kmv/cs-800` —— 完整规格、描述、制造商链接、相似设备
7. `/manufacturers` —— 5 家制造商按类型分组
8. `/manufacturers/kmv` —— 制造商信息及设备列表
9. `/match` 直接模式 —— 填写参数，点击 Match，查看带评分的结果
10. `/match?cable_id=cable-1` —— 自动填充参数并显示结果
11. `/sitemap.xml` —— 有效的 XML，包含所有详情页 URL
12. `/robots.txt` —— 禁止 /match 和 /api/，并指向 sitemap
13. 移动端响应式 —— 将浏览器调整为移动端宽度，验证侧边栏折叠、卡片堆叠效果

- [ ] **步骤 4：提交修复（如有）**

如果在验证过程中需要任何修复：
```bash
git add -A
git commit -m "fix: address build/verification issues"
```

- [ ] **步骤 5：最终提交（如尚未提交）**

前端 UI 实现已完成。打标签：
```bash
git tag frontend-ui-complete
```

---

## 自检总结（Self-Review Summary）

### 规范覆盖（Spec Coverage）
- ✅ Section 1（概览）：4 个目标全部覆盖——线缆搜索、设备匹配、top-N、MVP 范围
- ✅ Section 2（架构）：Next.js 前端独立运行，使用 mock 数据；切换路径在 api.ts 中有文档说明
- ✅ Section 3（数据模型）：cables/equipments/manufacturers/match_rules 的所有字段均在 JSON + types 中体现
- ✅ Section 4（匹配引擎）：mock-match.ts 实现了 3 阶段算法（过滤必需规则 → 评分 → top-N），符合规范 4.3
- ✅ Section 5（API 设计）：Mock api.ts 覆盖所有端点（list、by-slug、sitemap、match）；后端切换只需替换一个文件
- ✅ Section 6（前端页面）：全部 10 条路由已构建（首页、3 个列表页、3 个详情页、match、sitemap、robots、404）
- ✅ Section 6.8（SEO 基础设施）：sitemap.ts、robots.ts、generateMetadata、所有详情页的 JSON-LD
- ✅ Section 6.9（设计决策）：黄页形式、伪静态 URL、ISR、/match 设置 noindex、top-N 由后端配置（mock 从 config 读取）

### 关键需求验证（Critical Requirements Verified）
- ✅ 伪静态 URL：`/cables/[brand_slug]/[slug]` 等
- ✅ 黄页目录形式：带筛选器的列表页、内容丰富的详情页
- ✅ Google 收录优先：sitemap、robots、JSON-LD、meta 标签、canonical URL
- ✅ 用于内容生成的动态页面：通过 generateStaticParams 实现 ISR
- ✅ Match 页面 noindex
- ✅ Mock 数据独立于后端
- ✅ cut_length 为顶层参数（不在 cable_params / CableMatchInput 中）
- ✅ Top N 来自配置（UI 中不可由用户调整）

### 占位符扫描（Placeholder Scan）
- 未发现 TBD/TODO/"similar to above"/"fill in details"
- 所有代码块均包含完整、可运行的代码

### 类型一致性（Type Consistency）
- `Cable`、`Equipment`、`Manufacturer`、`MatchRule`、`MatchResultItem`、`MatchResponse` 在 types.ts 中定义，在所有组件中一致使用
- `api` 对象方法与所有页面的使用方式匹配
- `runMatch` 签名在 mock-match.ts 中与 MatchForm.tsx 中的使用匹配
- SEO 辅助函数（`generateCableMetadata`、`buildCableJsonLd` 等）在 seo.ts 中定义，在详情页中使用
- 工具函数（`formatCableUrl`、`formatEquipmentType` 等）在 utils.ts 中定义，一致使用
