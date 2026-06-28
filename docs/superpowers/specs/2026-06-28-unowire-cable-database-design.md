# Unowire 线缆数据库查询网站设计文档

> **日期**: 2026-06-28
> **状态**: 待实现
> **项目范围**: 前端 MVP（纯前端 + mock JSON 数据）

---

## 1. 概述

### 1.1 项目定位

Unowire 是一个**线缆规格数据库查询网站**，提供线缆型号的在线查询、规格详情展示、多条件筛选、分类导航，以及推荐加工设备匹配。

### 1.2 核心用例

- 工程师通过关键字、型号、多条件筛选查询线缆规格
- 查看线缆详情页（含变体对比表、推荐加工设备）
- 通过分类树浏览线缆
- 获取线缆规格的结构化 JSON 数据（便于集成）

### 1.3 范围调整说明

本项目由原"线缆+设备+匹配的黄页目录"缩减为"只做线缆数据库"。删除设备目录、制造商目录、Match 工具页等相关功能。保留推荐加工设备模块作为线缆详情页的辅助信息（使用独立 JSON 数据，非完整设备目录）。

### 1.4 技术栈

- **前端**: Next.js 16.2.9 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 + shadcn/ui v4
- **数据**: Mock JSON 文件（后端接入后仅替换 `lib/api.ts`）
- **部署**: Nginx 反向代理 + PM2，域名 www.unowire.com

### 1.5 硬约束

- 全英文项目（UI 文案、JSON 字段名、URL slug 均为英文）
- MVP 不引入 i18n
- MVP 不引入自动化测试（手工验收）
- MVP 不引入 Docker/CI（手动部署）
- 数据维护通过编辑 JSON 文件（无管理后台）
- 图片使用占位 SVG（后续再接入真实图）

---

## 2. 数据模型

### 2.1 数据文件结构

```
frontend/data/
├── manufacturers.json            # 生成商（母公司）
├── brands.json                   # 品牌（子品牌，引用 manufacturer_id）
├── categories.json               # 4 级分类树（扁平 + parent_id）
├── cables.json                   # 线缆 model 聚合（引用 brand_id + category_ids，含 variants + 动态 specs）
└── recommended-equipments.json   # 推荐设备（含范围匹配条件）
```

### 2.2 manufacturers.json

生成商（法律实体），作为引用数据，无独立页面。MVP 阶段预计 3-5 家生成商。

```json
[
  {
    "id": "mfr-1",
    "name": "Hitachi Cable",
    "slug": "hitachi-cable",
    "country": "Japan",
    "website": "https://www.hitachi-cable.com"
  },
  {
    "id": "mfr-2",
    "name": "Sumitomo Electric",
    "slug": "sumitomo-electric",
    "country": "Japan",
    "website": "https://global-sei.com"
  },
  {
    "id": "mfr-3",
    "name": "Prysmian Group",
    "slug": "prysmian-group",
    "country": "Italy",
    "website": "https://www.prysmiangroup.com"
  }
]
```

**字段**: `id` / `name` / `slug` / `country` / `website`

> 注：以上为示例数据，最终数量以实现时的数据为准。

### 2.3 brands.json

品牌（市场标识），属于某个生成商。线缆引用品牌 ID。MVP 阶段预计 4-6 个品牌。

```json
[
  {
    "id": "brand-1",
    "name": "Hitachi",
    "slug": "hitachi",
    "manufacturer_id": "mfr-1",
    "country": "Japan",
    "website": "https://www.hitachi-cable.com"
  },
  {
    "id": "brand-2",
    "name": "Sumitomo",
    "slug": "sumitomo",
    "manufacturer_id": "mfr-2",
    "country": "Japan",
    "website": "https://global-sei.com"
  },
  {
    "id": "brand-3",
    "name": "Draka",
    "slug": "draka",
    "manufacturer_id": "mfr-3",
    "country": "Netherlands",
    "website": "https://www.draka.com"
  },
  {
    "id": "brand-4",
    "name": "Prysmian",
    "slug": "prysmian",
    "manufacturer_id": "mfr-3",
    "country": "Italy",
    "website": "https://www.prysmiangroup.com"
  }
]
```

**字段**: `id` / `name` / `slug` / `manufacturer_id` / `country` / `website`

> 注：以上为示例数据，最终数量以实现时的数据为准。

### 2.4 categories.json

4 级分类树，扁平数组 + `parent_id` 表达层级关系。

```json
[
  { "id": "cat-1", "level": 1, "name": "Automotive", "slug": "automotive", "parent_id": null },
  { "id": "cat-2", "level": 2, "name": "Wiring Harness", "slug": "wiring-harness", "parent_id": "cat-1" },
  { "id": "cat-3", "level": 3, "name": "PVC Insulated", "slug": "pvc-insulated", "parent_id": "cat-2" },
  { "id": "cat-4", "level": 4, "name": "Thin Wall", "slug": "thin-wall", "parent_id": "cat-3" },
  { "id": "cat-5", "level": 1, "name": "Consumer Electronics", "slug": "consumer-electronics", "parent_id": null },
  { "id": "cat-6", "level": 2, "name": "Internal Wiring", "slug": "internal-wiring", "parent_id": "cat-5" },
  { "id": "cat-7", "level": 3, "name": "PVC Insulated", "slug": "pvc-insulated", "parent_id": "cat-6" }
]
```

**字段**: `id` / `level` (1-4) / `name` / `slug` / `parent_id` (null 表示顶级)

### 2.5 cables.json

核心数据。聚合式结构：一个 model 一条记录，下挂 `variants` 数组。使用动态 `specs` 数组适应不同线缆类型的规格差异。

```json
[
  {
    "id": "cable-model-1",
    "brand_id": "brand-1",
    "brand_slug": "hitachi",
    "model": "UL1007",
    "slug": "ul1007",
    "type": "electronic_wire",
    "category_ids": ["cat-4", "cat-7"],
    "base_description": "UL1007 PVC insulated single-core wire for internal wiring of electronic equipment.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "single", "unit": null, "filterable": true }
    ],
    "variants": [
      {
        "slug": "awg24",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "24", "unit": null, "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.205, "unit": "mm²", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.40, "unit": "mm", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "filterable": false }
        ]
      },
      {
        "slug": "awg22",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "22", "unit": null, "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.326, "unit": "mm²", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.60, "unit": "mm", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "filterable": false }
        ]
      }
    ]
  }
]
```

**字段说明**:
- `id`: 线缆 model 唯一 ID（格式 `cable-model-N`）
- `brand_id`: 引用 brands.json
- `brand_slug`: 冗余字段，用于 URL 路由（不依赖 join）
- `model`: 型号名（如 UL1007）
- `slug`: URL slug（如 ul1007）
- `type`: 线缆类型标识（如 electronic_wire / multi_core / shielded / coaxial）
- `category_ids`: 多分类归属数组
- `base_description`: model 级描述
- `meta_title` / `meta_description`: SEO 覆盖字段（null 时用默认生成）
- `common_specs`: model 级通用规格数组（所有变体共享）
- `variants`: 变体数组（每个变体有独立 specs）

**SpecItem 结构**:
- `key`: 机读键（如 conductor_area）
- `label`: 人读标签（如 Conductor Area）
- `value`: 值（string 或 number）
- `unit`: 单位（如 mm²，无单位时为 null）
- `filterable`: 是否参与侧边栏筛选

**CableVariant 结构**:
- `slug`: 变体 slug（如 awg24），用于变体级 URL 预留（当前 model 级 URL 不使用）
- `specs`: 变体级差异化规格数组

**数据聚合规则**:
- 原 10 条扁平记录聚合为约 5-6 个 model
- UL1007（AWG24/22/26 → 3 变体）
- UL1015（AWG20 → 1 变体）
- AVSS（0.5f/0.75f/1.25f → 3 变体）
- AWM 1007（AWG26 → 1 变体）
- UL2468（24AWG 2C → 1 变体）
- UL2517（AWG22 → 1 变体）
- AVSS 2.0 2C Shielded（1 变体）

### 2.6 recommended-equipments.json

推荐设备数据。每个设备带 `applicable_spec` 范围条件，详情页按线缆规格匹配。

```json
[
  {
    "id": "rec-eq-1",
    "brand": "KMV",
    "model": "CS-800",
    "type": "semi_automatic_stripping_machine",
    "description": "Semi-automatic stripping machine for PVC single-core wires.",
    "applicable_spec": {
      "min_conductor_area": 0.1,
      "max_conductor_area": 1.0,
      "min_outer_diameter": 1.0,
      "max_outer_diameter": 3.0,
      "shielding": ["none"],
      "jacket": ["pvc"],
      "core_structure": ["single"]
    },
    "external_url": "https://www.kmv.co.jp/products/cs-800"
  }
]
```

**字段说明**:
- `applicable_spec`: 范围匹配条件
  - 数值字段：min/max 范围
  - 枚举字段：允许值数组
- `external_url`: 外链到设备厂商页面（不建独立设备页）
- 预计 4-6 条推荐设备覆盖常见规格范围

### 2.7 生成商/品牌拆分说明

一个生成商（母公司）旗下可能有多个品牌。例如：
- Hitachi Cable（生成商）→ Hitachi（品牌）
- Sumitomo Electric（生成商）→ Sumitomo（品牌）
- Prysmian Group（生成商）→ Draka、Prysmian（品牌）

线缆引用 `brand_id`（最细粒度），详情页通过 brand → manufacturer join 显示完整层级。

---

## 3. URL 结构

```
/                                          首页（hero + 搜索 + 分类导航 + 热门线缆）
/cables                                    线缆列表（4 列网格 + 侧边栏筛选 + 顶部搜索）
/cables?q=...                              搜索结果（noindex，canonical 指向 /cables）
/cables/[brand_slug]/[slug]                model 级详情页（ISR 1h）
/categories/[...slugs]                     分类导航页（catch-all，支持多级路径）
/api/cables/[brand_slug]/[slug]            JSON 端点（聚合响应）
/sitemap.xml                               动态 sitemap
/robots.txt                                robots
```

---

## 4. 页面设计

### 4.1 首页 `/`

**布局**: 全屏宽度

```
┌─────────────────────────────────────────────────┐
│  Nav (logo + 搜索框)                              │
├─────────────────────────────────────────────────┤
│  Hero: 线缆规格数据库                              │
│  [ 大搜索框 ........................ ]            │
│  热门搜索: UL1007 AVSS AWM UL1015               │
├─────────────────────────────────────────────────┤
│  数据统计 (N cables · N brands · N categories)    │
├─────────────────────────────────────────────────┤
│  分类导航卡片 (4 列，level 1 分类)                 │
├─────────────────────────────────────────────────┤
│  热门线缆 (4 列网格，6 条)                         │
├─────────────────────────────────────────────────┤
│  Footer                                          │
└─────────────────────────────────────────────────┘
```

**功能**:
- 大搜索框：输入关键字 → 跳转 `/cables?q=关键字`
- 热门搜索标签：快捷跳转
- 分类导航卡片：level 1 分类，链接到 `/categories/[slug]`
- 热门线缆：手动标记或取前 N 条，复用 CableCard 组件（MVP 阶段展示 6 条）
- 统计数字：从 JSON 数据动态计算

### 4.2 列表页 `/cables`

**布局**: 全屏宽度，B 方案 4 列网格 + 样式 3 卡片

```
┌─────────────────────────────────────────────────┐
│  Nav (logo + 搜索框)                              │
├─────────────────────────────────────────────────┤
│  Breadcrumbs: Home / Cables                      │
│  Cable Directory         Sort: [Spec A-Z ▼]      │
├──────────┬──────────────────────────────────────┤
│ Filters  │  [Card] [Card] [Card] [Card]          │
│          │  [Card] [Card] [Card] [Card]          │
│ Manufac- │                                       │
│ turer    │  ← Prev  [1] [2]  Next →              │
│ Brand    │  Showing 1-N of N cables              │
│ Category │                                       │
│ AWG      │                                       │
│ Area     │                                       │
│ OD       │                                       │
│ Shield   │                                       │
│ Jacket   │                                       │
│ Core     │                                       │
├──────────┴──────────────────────────────────────┤
│  Footer                                          │
└─────────────────────────────────────────────────┘
```

**侧边栏筛选器（动态构建）**:
- **Manufacturer**: 从 manufacturers.json 拉取，checkbox + 计数
- **Brand**: 从 brands.json 拉取，checkbox + 计数
- **Category**: 从 categories.json 拉 level 1 分类，checkbox（选中后递归包含子分类线缆）
- **AWG / Conductor Area / Outer Diameter**: 从所有 variants[].specs 中 key=awg/conductor_area/outer_diameter 的 filterable 字段聚合
- **Shielding / Jacket / Core Structure**: 从 common_specs 中对应 key 的 filterable 字段聚合

**卡片内容（model 级 + 展开变体表）**:
```
┌─────────────────────┐
│   [图片 100px]       │
│              AWG 24 │
├─────────────────────┤
│ UL1007              │
│ Hitachi · Japan     │
├─────────────────────┤
│ Area    0.205 mm²   │
│ OD      1.40 mm     │
│ Jacket  PVC         │
├─────────────────────┤
│ Variants (3)        │
│ AWG24  0.205mm²     │
│ AWG22  0.326mm²     │
│ AWG20  0.519mm²     │
└─────────────────────┘
```

- 图片区: 100px 高，占位 SVG
- AWG 角标: 取主变体（第一个 variant）的 awg 值
- 标题: model 名
- 副标题: brand name · country
- 迷你规格表: 取主变体 conductor_area/outer_diameter + common_specs 的 jacket
- 变体表: 列出所有变体的 awg + conductor_area（最多 3 个，超出显示 "+N more"）

**顶部搜索框**:
- 输入关键字（model 或 spec 字符串）→ 实时过滤
- 若输入精确匹配某 model slug → 显示"跳转到详情页"快捷入口
- 提交后跳转 `/cables?q=关键字`

**URL 查询参数**:
```
/cables?manufacturer=mfr-1&brand=brand-4&category=cat-1&awg=24&min_area=0.2&max_area=1.0&page=2&q=UL1007
```

### 4.3 详情页 `/cables/[brand_slug]/[slug]`

**布局**: 两栏（左主内容 + 右侧栏）

```
┌─────────────────────────────────────────────────┐
│  Nav                                             │
├─────────────────────────────────────────────────┤
│  Breadcrumbs: Home / Cables / Hitachi / UL1007  │
├──────────────────────────────┬──────────────────┤
│  H1: UL1007                  │  Manufacturer    │
│  Hitachi · Japan             │  Hitachi Cable   │
│  [描述段落]                   │  Japan           │
│                              │  Visit website → │
│  Common Specs Table          │                  │
│  ┌─────────────────────┐     │  Categories      │
│  │ Insulation │ PVC    │     │  • Automotive    │
│  │ Shielding  │ None   │     │  • Consumer Elec │
│  │ Jacket     │ PVC    │     │                  │
│  │ Core       │ Single │     │  View JSON →     │
│  └─────────────────────┘     │                  │
│                              │                  │
│  Variants Comparison Table   │                  │
│  ┌─────┬──────┬─────┬──────┐│                  │
│  │ AWG │ Area │ OD  │ Volt ││                  │
│  ├─────┼──────┼─────┼──────┤│                  │
│  │ 24  │0.205 │1.40 │ 300V ││                  │
│  │ 22  │0.326 │1.60 │ 300V ││                  │
│  └─────┴──────┴─────┴──────┘│                  │
│                              │                  │
│  Recommended Equipment       │                  │
│  [Equipment Card]            │                  │
│                              │                  │
│  Similar Cables (同分类)      │                  │
│  [Mini Card] [Mini Card]     │                  │
├──────────────────────────────┴──────────────────┤
│  Footer                                          │
└─────────────────────────────────────────────────┘
```

**内容区块**:
1. **H1 + 品牌信息**: model 名 + brand name · country
2. **描述段落**: base_description
3. **Common Specs Table**: 渲染 common_specs 数组
4. **Variants Comparison Table**: 横向对比所有变体的 specs（动态列，按 spec.key 聚合列头）
5. **Recommended Equipment**: 调用 `recommendEquipments()` 返回的设备卡片，外链到 external_url
6. **Similar Cables**: 取同 category_ids 的其他线缆（最多 4 条），mini card 形式
7. **右侧栏**:
   - Manufacturer 信息 + 官网链接
   - Categories 列表（链接到分类页）
   - "View JSON" 链接到 `/api/cables/[brand_slug]/[slug]`

**ISR**: `export const revalidate = 3600`（1 小时重新生成）

### 4.4 分类导航页 `/categories/[...slugs]`

**布局**: 与列表页相同的 4 列网格，顶部显示分类路径

```
┌─────────────────────────────────────────────────┐
│  Nav                                             │
├─────────────────────────────────────────────────┤
│  Breadcrumbs: Home / Categories / Automotive    │
│  H1: Automotive                                  │
│  Cables in this category (and subcategories)    │
├──────────┬──────────────────────────────────────┤
│ Filters  │  [Card] [Card] [Card] [Card]         │
│ (同列表页)│  ...                                  │
├──────────┴──────────────────────────────────────┤
│  Footer                                          │
└─────────────────────────────────────────────────┘
```

- catch-all 路由: `/categories/automotive`、`/categories/automotive/wiring-harness`
- 查询逻辑: 给定路径，找到对应 category_id，递归找所有子孙 category_id，匹配 cables 中 category_ids 数组包含任一匹配的 cable
- 复用列表页的 CableCard 组件和筛选器

### 4.5 JSON 端点 `/api/cables/[brand_slug]/[slug]`

```typescript
// app/api/cables/[brand_slug]/[slug]/route.ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brand_slug: string; slug: string }> }
) {
  const { brand_slug, slug } = await params;
  const cable = api.cables.find(c => c.brand_slug === brand_slug && c.slug === slug);
  if (!cable) return Response.json({ error: { code: "not_found", message: "Cable not found" } }, { status: 404 });

  const brand = api.brands.find(b => b.id === cable.brand_id);
  const manufacturer = api.manufacturers.find(m => m.id === brand?.manufacturer_id);
  const categories = api.categories.filter(c => cable.category_ids.includes(c.id));
  const recommended = recommendEquipments(cable, api.recommendedEquipments);

  return Response.json({
    cable,
    brand,
    manufacturer,
    categories,
    recommended_equipments: recommended,
  });
}
```

**响应格式**:
```json
{
  "cable": { ...完整 cable 对象... },
  "brand": { "id": "brand-1", "name": "Hitachi", ... },
  "manufacturer": { "id": "mfr-1", "name": "Hitachi Cable", ... },
  "categories": [ ...cable 所属的分类对象数组... ],
  "recommended_equipments": [ ...匹配的推荐设备数组... ]
}
```

**错误处理**: 404 返回 `{ "error": { "code": "not_found", "message": "..." } }`

---

## 5. 组件结构

### 5.1 目录结构

```
frontend/
├── app/
│   ├── layout.tsx                          # 根布局（Nav + Footer）
│   ├── page.tsx                            # 首页
│   ├── globals.css
│   ├── not-found.tsx
│   ├── cables/
│   │   ├── page.tsx                        # 列表页（async searchParams）
│   │   └── [brand_slug]/[slug]/page.tsx    # 详情页（ISR 1h，async params）
│   ├── categories/
│   │   └── [...slugs]/page.tsx             # 分类导航页（catch-all，async params）
│   ├── api/
│   │   └── cables/[brand_slug]/[slug]/route.ts  # JSON 端点
│   ├── sitemap.ts
│   └── robots.ts
├── components/
│   ├── ui/                                 # shadcn/ui（保留）
│   ├── layout/
│   │   ├── Nav.tsx
│   │   ├── Footer.tsx
│   │   ├── Breadcrumbs.tsx
│   │   └── Container.tsx                   # 全屏布局容器（移除 max-width）
│   ├── cable/
│   │   ├── CableCard.tsx                   # model 级卡片（含变体表）
│   │   ├── CableFilters.tsx               # 侧边栏筛选器（动态构建）
│   │   ├── CableSpecTable.tsx             # common_specs 渲染表
│   │   └── VariantComparisonTable.tsx     # 变体对比表（动态列）
│   ├── category/
│   │   └── CategoryCard.tsx               # 首页分类导航卡片
│   ├── equipment/
│   │   └── RecommendedEquipmentCard.tsx   # 推荐设备卡片（外链）
│   ├── seo/
│   │   └── JsonLd.tsx
│   └── shared/
│       ├── SearchBox.tsx                   # 搜索框（client，首页+列表页复用）
│       ├── Pagination.tsx
│       └── SimilarCables.tsx              # 相似线缆 mini card 列表
├── lib/
│   ├── types.ts                            # 全部 TypeScript 接口
│   ├── api.ts                              # 数据访问层（加载 5 个 JSON）
│   ├── filter.ts                           # 筛选/搜索/分页逻辑（纯函数）
│   ├── equipment-recommend.ts             # 推荐设备范围匹配
│   ├── category-tree.ts                   # 分类树操作（找子孙/路径）
│   ├── seo.ts                              # metadata + JSON-LD 生成器
│   └── utils.ts                            # cn + 格式化函数
├── data/
│   ├── manufacturers.json
│   ├── brands.json
│   ├── categories.json
│   ├── cables.json
│   └── recommended-equipments.json
└── ...（配置文件不变）
```

**删除的目录/文件**:
- `app/equipments/`、`app/manufacturers/`、`app/match/`
- `components/equipment/EquipmentCard.tsx`、`EquipmentSpecTable.tsx`
- `components/manufacturer/`、`components/match/`
- `lib/mock-match.ts`
- `data/equipments.json`、`data/match-rules.json`
- `components/shared/ScoreBar.tsx`（Match 工具专用）

### 5.2 TypeScript 接口（lib/types.ts）

```typescript
// === 数据模型 ===
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  country: string;
  website: string;
}

export interface Category {
  id: string;
  level: 1 | 2 | 3 | 4;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface SpecItem {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
  filterable: boolean;
}

export interface CableVariant {
  slug: string;
  specs: SpecItem[];
}

export interface Cable {
  id: string;
  brand_id: string;
  brand_slug: string;
  model: string;
  slug: string;
  type: string;
  category_ids: string[];
  base_description: string;
  meta_title: string | null;
  meta_description: string | null;
  common_specs: SpecItem[];
  variants: CableVariant[];
}

export interface ApplicableSpec {
  min_conductor_area: number;
  max_conductor_area: number;
  min_outer_diameter: number;
  max_outer_diameter: number;
  shielding: string[];
  jacket: string[];
  core_structure: string[];
}

export interface RecommendedEquipment {
  id: string;
  brand: string;
  model: string;
  type: string;
  description: string;
  applicable_spec: ApplicableSpec;
  external_url: string;
}

// === API 响应 ===
export interface CableDetailResponse {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
  categories: Category[];
  recommended_equipments: RecommendedEquipment[];
}

// === 筛选/查询参数 ===
export interface CableQueryParams {
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  category?: string[];
  awg?: string[];
  min_area?: number;
  max_area?: number;
  min_od?: number;
  max_od?: number;
  shielding?: string[];
  jacket?: string[];
  core_structure?: string[];
  page: number;
  page_size: number;
}

export interface CableListResponse {
  items: CableListItem[];
  total: number;
  page: number;
  page_size: number;
  filters: FilterFacets;
}

export interface CableListItem {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
  matched_variant_count: number;
}

export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; level: number; count: number }[];
  awg: { value: string; count: number }[];
  conductor_area: { min: number; max: number };
  outer_diameter: { min: number; max: number };
  shielding: { value: string; count: number }[];
  jacket: { value: string; count: number }[];
  core_structure: { value: string; count: number }[];
}
```

### 5.3 数据流

```
JSON 数据文件 → lib/api.ts (单一数据访问层)
                    ↓
    ┌───────────────┼───────────────┬──────────────┐
    ▼               ▼               ▼              ▼
  首页          列表页           详情页         JSON 端点
                    │               │              │
                    ▼               ▼              ▼
            lib/filter.ts    关联数据 join    关联数据 join
            (纯函数)              │              │
                                ▼              ▼
                    lib/category-tree.ts (分类树操作)
                    lib/equipment-recommend.ts (范围匹配)
```

**关键原则**:
- `lib/api.ts` 是唯一数据源（后端接入后只改此文件）
- `lib/filter.ts` 是纯函数模块（输入 cables + params，输出过滤结果 + facets）
- `lib/category-tree.ts` 处理分类树操作（递归找子孙、构建路径）
- `lib/equipment-recommend.ts` 独立匹配逻辑
- 页面组件只做渲染，不直接操作 JSON

### 5.4 客户端 vs 服务端边界

**服务端组件（默认）**:
- 所有页面（首页/列表/详情/分类）—— RSC，直接调 lib 层
- JSON 端点 Route Handler

**客户端组件（'use client'）**:
- `SearchBox.tsx` —— 受控输入 + URL 跳转
- `CableFilters.tsx` —— checkbox 状态管理 + URL 同步
- `Pagination.tsx` —— 页码点击跳转

**原则**: 尽量用服务端组件 + URL 参数同步状态，客户端组件仅用于交互。筛选/搜索提交后通过 URL 查询参数传递，服务端重新渲染。

---

## 6. SEO 策略

### 6.1 Metadata（每页独立）

| 页面 | title | description | canonical | robots |
|---|---|---|---|---|
| `/` | `Unowire - Cable Specs Database` | `Query cable specifications online. Browse cables by brand, category, and specs.` | `/` | `index, follow` |
| `/cables` | `Cable Directory - Unowire` | `Browse all cables. Filter by manufacturer, brand, AWG, conductor area, outer diameter.` | `/cables` | `index, follow` |
| `/cables?q=...` | `Search: {q} - Unowire` | `Search results for {q}` | `/cables` | `noindex, follow` |
| `/cables/[brand]/[slug]` | `{model} - {brand} \| Unowire` | `base_description` 前 160 字 | `/cables/{brand}/{slug}` | `index, follow` |
| `/categories/[...slugs]` | `{Category Name} Cables - Unowire` | `Browse cables in {category name} category.` | `/categories/{slugs}` | `index, follow` |
| `/api/...` | — | — | — | `noindex, nofollow` |

- 搜索结果页 noindex（避免重复内容）
- 详情页 ISR 1h
- JSON 端点 robots.txt disallow

### 6.2 JSON-LD 结构化数据

**详情页 Product schema**:
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "UL1007",
  "description": "UL1007 PVC insulated single-core wire...",
  "brand": { "@type": "Brand", "name": "Hitachi" },
  "manufacturer": {
    "@type": "Organization",
    "name": "Hitachi Cable",
    "address": { "@type": "PostalAddress", "addressCountry": "Japan" }
  },
  "category": "Automotive > Wiring Harness > PVC Insulated > Thin Wall",
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Insulation Material", "value": "PVC" },
    { "@type": "PropertyValue", "name": "AWG", "value": "24" },
    { "@type": "PropertyValue", "name": "Conductor Area", "value": "0.205 mm²" }
  ]
}
```

`additionalProperty` 从 common_specs + 主变体 specs 动态生成。

**BreadcrumbList**（详情页 + 分类页）:
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.unowire.com/" },
    { "@type": "ListItem", "position": 2, "name": "Cables", "item": "https://www.unowire.com/cables" },
    { "@type": "ListItem", "position": 3, "name": "Hitachi", "item": "https://www.unowire.com/cables?brand=brand-1" },
    { "@type": "ListItem", "position": 4, "name": "UL1007", "item": "https://www.unowire.com/cables/hitachi/ul1007" }
  ]
}
```

### 6.3 sitemap.xml

动态生成，包含:
- `/`（首页）
- `/cables`（列表页）
- 所有 `/cables/{brand_slug}/{slug}`（详情页，from cables.json）
- 所有 `/categories/{slug_path}`（分类页，从 categories.json level 1-4 递归构建路径）

### 6.4 robots.txt

```
User-agent: *
Disallow: /api/

Sitemap: https://www.unowire.com/sitemap.xml
```

搜索变体 `/cables?q=` 通过 noindex meta 标签处理（不通过 robots.txt，避免误伤列表页）。

---

## 7. 错误处理

### 7.1 404 处理

- 详情页: `notFound()` 触发自定义 404 页
- 分类页: catch-all 路由，无效路径 `notFound()`
- JSON 端点: 返回 `{ "error": { "code": "not_found", "message": "..." } }` + HTTP 404

### 7.2 统一错误响应格式（JSON 端点）

```json
{
  "error": {
    "code": "not_found",
    "message": "Cable not found"
  }
}
```

错误码枚举: `not_found` / `invalid_query` / `internal_error`

### 7.3 空状态处理

- 列表页无结果: "No cables found. Try adjusting your filters." + 清除筛选按钮
- 详情页无推荐设备: "No recommended equipment available for this cable."
- 详情页无相似线缆: 不显示该区块

### 7.4 边界情况

- 筛选冲突（min > max）: 后端忽略，前端 min/max 输入框验证
- 分页越界: clamp 到最后一页
- 分类路径不完整: 允许，只按到达的最深层级查询

---

## 8. 测试策略

前端 MVP 不要求自动化测试（project_memory 硬约束）。关键纯函数模块通过手工验收验证。

### 8.1 手工验收清单（13 项）

1. 首页大搜索框输入 "UL1007" → 跳转列表页显示结果
2. 列表页侧边栏勾选 Manufacturer + Brand + Category + AWG → 结果正确过滤
3. 列表页 min_area=0.2 max_area=0.5 → 只显示范围内的变体
4. 列表页分页正常
5. 详情页 common_specs 表 + variants 对比表正确渲染
6. 详情页推荐设备按规格范围匹配（手动核对）
7. 详情页 "View JSON" 链接打开 `/api/...` 返回完整 JSON
8. 分类页 `/categories/automotive` 显示该分类及子分类的所有线缆
9. 查看详情页源码: title/description/canonical/JSON-LD 均存在
10. `/sitemap.xml` 包含所有详情页 + 分类页 URL
11. `/robots.txt` disallow `/api/`
12. 移动端响应式: 侧边栏折叠，4 列降 2 列
13. `npm run build` 通过，无 TypeScript 错误

---

## 9. 国际化

MVP 英文优先（project_memory 硬约束）。所有 UI 文案、JSON 字段名、URL slug 均为英文。i18n 推迟到后续阶段。

---

## 10. 实现范围（MVP 边界）

### 10.1 包含

- 5 个 JSON 数据文件
- 4 个页面路由（首页/列表/详情/分类）
- 1 个 JSON 端点
- 完整 SEO 基础设施
- 动态 specs 数组渲染
- 动态筛选器
- 推荐设备范围匹配
- 删除旧功能代码

### 10.2 不包含（YAGNI）

- 后端 API（FastAPI + PostgreSQL）
- i18n
- 自动化测试
- 管理后台
- 图片真实化
- 用户系统/权限
- 评论/评分
- 数据导出

---

## 11. 迁移策略

### 11.1 数据迁移

**原 cables.json → 新 cables.json 字段映射**:

| 原字段 | 新结构位置 |
|---|---|
| `id` | `id`（改为 cable-model-N） |
| `manufacturer_id` | `brand_id`（引用 brands.json） |
| `brand_slug` | `brand_slug`（保留） |
| `model` | `model` |
| `slug` | `slug`（去掉 AWG 后缀） |
| `spec` | 移除（由 model + 变体 awg 组合显示） |
| `awg` | `variants[].specs[]` 中 key=awg |
| `conductor_area` | `variants[].specs[]` 中 key=conductor_area |
| `outer_diameter` | `variants[].specs[]` 中 key=outer_diameter |
| `insulation_material` | `common_specs[]` 中 key=insulation_material |
| `shielding` | `common_specs[]` 中 key=shielding |
| `jacket` | `common_specs[]` 中 key=jacket |
| `core_structure` | `common_specs[]` 中 key=core_structure |
| `rated_voltage` | `variants[].specs[]` 中 key=rated_voltage |
| `temperature_rating` | `variants[].specs[]` 中 key=temperature_rating |
| `description` | `base_description` |

原 10 条扁平记录聚合为约 5-6 个 model。

### 11.2 Git 提交策略

按阶段分步提交，每步独立可验证:

1. `refactor: remove equipment/manufacturer/match modules (cable-only scope)`
2. `refactor: split manufacturers into manufacturers + brands JSON`
3. `feat: add categories.json with 4-level tree structure`
4. `refactor: restructure cables.json to aggregated model + variants + dynamic specs`
5. `feat: add recommended-equipments.json with applicable_spec ranges`
6. `refactor: rewrite lib layer (types/api/filter/category-tree/equipment-recommend)`
7. `feat: rewrite home page with hero search + category navigation`
8. `feat: rewrite cables list page with 4-column grid + dynamic filters`
9. `feat: rewrite cable detail page with variant comparison + recommended equipment`
10. `feat: add category navigation page with catch-all route`
11. `feat: add JSON API endpoint for cable details`
12. `feat: update SEO infrastructure (sitemap/robots/metadata/JSON-LD)`
13. `chore: build verification + manual acceptance`
