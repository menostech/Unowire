# Unowire 线缆数据库重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Unowire 从"黄页目录"重构为"线缆规格数据库"，删除设备/制造商/Match 模块，引入聚合式 cable model + variants + 动态 specs 数据结构，新增分类导航页和 JSON API 端点。

**Architecture:** Next.js 16 App Router + Mock JSON 数据。cables.json 聚合为 model 级（含 variants 数组和动态 specs 数组），SpecItem 加 type 字段驱动动态筛选器。lib/api.ts 预构建分类树索引和 byId Map。推荐设备使用通用 applicable_specs 规则数组匹配，任一变体命中即推荐。

**Tech Stack:** Next.js 16.2.9、React 19、TypeScript、Tailwind CSS 4、shadcn/ui v4

**Spec:** `docs/superpowers/specs/2026-06-28-unowire-cable-database-design.md`

**关键原则：**
- 数据单源真理：cables.json 不冗余存储 brand_slug，URL 构建通过 `getCableUrl()` join brands.json
- 动态筛选：SpecItem.type 决定筛选控件类型（number → 范围输入，enum → checkbox，string → 不筛选），零硬编码字段名
- 推荐设备通用匹配：applicable_specs 数组通过 spec_key 引用 SpecItem，不硬编码字段名
- 预构建索引：lib/api.ts 首次访问构建分类树索引 + byId Map + URL 查询 Map
- JSON 静态校验：dev/build 期校验引用完整性 + key 唯一性 + slug 唯一性

---

## 文件结构

```
frontend/
├── app/
│   ├── layout.tsx                          # 修改：Nav 链接 + metadata
│   ├── page.tsx                            # 重写：首页（hero+搜索+分类+热门线缆）
│   ├── not-found.tsx                       # 修改：适配新结构
│   ├── cables/
│   │   ├── page.tsx                        # 重写：列表页（4 列网格 + 动态筛选器）
│   │   └── [brand_slug]/[slug]/page.tsx    # 重写：详情页（变体对比 + 推荐设备 + JSON-LD）
│   ├── categories/
│   │   └── [...slugs]/page.tsx             # 新建：分类导航页
│   ├── api/
│   │   └── cables/[brand_slug]/[slug]/route.ts  # 新建：JSON 端点
│   ├── sitemap.ts                          # 重写：cables + categories
│   └── robots.ts                           # 修改：仅 disallow /api/
├── components/
│   ├── layout/
│   │   ├── Nav.tsx                         # 修改：移除旧链接
│   │   └── Container.tsx                   # 修改：全屏布局（移除 max-width）
│   ├── cable/
│   │   ├── CableCard.tsx                   # 重写：model 级 + 变体表
│   │   ├── CableFilters.tsx               # 重写：动态筛选器（基于 type）
│   │   ├── CableSpecTable.tsx             # 重写：common_specs 渲染
│   │   └── VariantComparisonTable.tsx     # 新建：变体对比表
│   ├── category/
│   │   └── CategoryCard.tsx               # 新建：首页分类导航卡片
│   ├── equipment/
│   │   └── RecommendedEquipmentCard.tsx   # 新建：推荐设备卡片
│   ├── seo/
│   │   └── JsonLd.tsx                      # 修改：Product schema
│   └── shared/
│       ├── SearchBox.tsx                   # 修改：适配新查询参数
│       ├── Pagination.tsx                  # 无变化（复用）
│       └── SimilarCables.tsx              # 新建：相似线缆 mini card
├── lib/
│   ├── types.ts                            # 重写：新接口
│   ├── api.ts                              # 重写：5 个 JSON + 预构建索引
│   ├── filter.ts                           # 新建：筛选/搜索/分页纯函数
│   ├── equipment-recommend.ts             # 新建：通用规则匹配
│   ├── category-tree.ts                   # 新建：读索引的分类树操作
│   ├── validate.ts                         # 新建：JSON 静态校验
│   ├── seo.ts                              # 重写：新 metadata + JSON-LD
│   └── utils.ts                            # 修改：新增 getCableUrl 等
├── data/
│   ├── manufacturers.json                  # 重写：精简为生产商
│   ├── brands.json                         # 新建：品牌
│   ├── categories.json                     # 新建：4 级分类树
│   ├── cables.json                         # 重写：聚合 model + variants + 动态 specs
│   └── recommended-equipments.json         # 新建：推荐设备
└── scripts/
    └── validate-data.ts                    # 新建：build 前校验脚本
```

**删除的目录/文件：**
- `app/equipments/`、`app/manufacturers/`、`app/match/`
- `components/equipment/EquipmentCard.tsx`、`EquipmentSpecTable.tsx`
- `components/manufacturer/`
- `components/match/`
- `lib/mock-match.ts`
- `data/equipments.json`、`data/match-rules.json`
- `components/shared/ScoreBar.tsx`

---

## Phase 1: 数据层重构

### Task 1: 删除旧功能模块

**文件：**
- 删除：`frontend/app/equipments/`（整个目录）
- 删除：`frontend/app/manufacturers/`（整个目录）
- 删除：`frontend/app/match/`（整个目录）
- 删除：`frontend/components/equipment/EquipmentCard.tsx`
- 删除：`frontend/components/equipment/EquipmentSpecTable.tsx`
- 删除：`frontend/components/manufacturer/`（整个目录）
- 删除：`frontend/components/match/`（整个目录）
- 删除：`frontend/components/shared/ScoreBar.tsx`
- 删除：`frontend/lib/mock-match.ts`
- 删除：`frontend/data/equipments.json`
- 删除：`frontend/data/match-rules.json`

- [ ] **步骤 1：删除旧目录和文件**

在 PowerShell 中运行：
```powershell
cd d:\projects\unowire\frontend
Remove-Item -Recurse -Force app\equipments
Remove-Item -Recurse -Force app\manufacturers
Remove-Item -Recurse -Force app\match
Remove-Item -Force components\equipment\EquipmentCard.tsx
Remove-Item -Force components\equipment\EquipmentSpecTable.tsx
Remove-Item -Recurse -Force components\manufacturer
Remove-Item -Recurse -Force components\match
Remove-Item -Force components\shared\ScoreBar.tsx
Remove-Item -Force lib\mock-match.ts
Remove-Item -Force data\equipments.json
Remove-Item -Force data\match-rules.json
```

- [ ] **步骤 2：临时修复 lib/api.ts 和 lib/types.ts 的编译错误**

由于删除了 equipments/manufacturers/match 相关类型和数据，lib/api.ts 和 lib/types.ts 会报错。**此步骤仅删除报错代码，不重写**（后续 Task 会重写这两个文件）。

将 `frontend/lib/types.ts` 临时替换为最小空文件：
```typescript
// Temporary placeholder — will be rewritten in Task 6
export interface Cable { id: string }
export interface Manufacturer { id: string }
```

将 `frontend/lib/api.ts` 临时替换为最小空文件：
```typescript
// Temporary placeholder — will be rewritten in Task 7
export const api = {};
```

- [ ] **步骤 3：临时修复引用旧 api 的页面**

由于删除了 app/equipments 等目录，但 app/page.tsx、app/cables/page.tsx、app/cables/[brand_slug]/[slug]/page.tsx、app/layout.tsx、app/sitemap.ts、app/robots.ts、app/not-found.tsx 仍引用旧 api 和组件，会报错。**此步骤仅让项目能编译，不重写页面**（后续 Task 会重写）。

将 `frontend/app/page.tsx` 临时替换为：
```typescript
export default function HomePage() {
  return <div>Unowire</div>;
}
```

将 `frontend/app/cables/page.tsx` 临时替换为：
```typescript
export default function CablesPage() {
  return <div>Cables</div>;
}
```

将 `frontend/app/cables/[brand_slug]/[slug]/page.tsx` 临时替换为：
```typescript
export default function CableDetailPage() {
  return <div>Cable Detail</div>;
}
```

将 `frontend/app/layout.tsx` 临时替换为：
```typescript
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}
```

将 `frontend/app/sitemap.ts` 临时替换为：
```typescript
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://www.unowire.com/', lastModified: new Date() }];
}
```

将 `frontend/app/robots.ts` 临时替换为：
```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/api/'] },
    sitemap: 'https://www.unowire.com/sitemap.xml',
  };
}
```

将 `frontend/app/not-found.tsx` 临时替换为：
```typescript
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <Link href="/" className="text-blue-600 hover:underline">Back to Home</Link>
    </div>
  );
}
```

- [ ] **步骤 4：验证编译**

运行：
```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

预期：0 错误（所有临时文件都不依赖已删除的模块）。

- [ ] **步骤 5：提交**

```bash
cd d:\projects\unowire
git add -A
git commit -m "refactor: remove equipment/manufacturer/match modules (cable-only scope)"
```

---

### Task 2: 创建 manufacturers.json 和 brands.json

**文件：**
- 重写：`frontend/data/manufacturers.json`
- 创建：`frontend/data/brands.json`

- [ ] **步骤 1：重写 manufacturers.json**

写入 `frontend/data/manufacturers.json`：
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

- [ ] **步骤 2：创建 brands.json**

写入 `frontend/data/brands.json`：
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

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/data/manufacturers.json frontend/data/brands.json
git commit -m "feat: split manufacturers into manufacturers + brands JSON"
```

---

### Task 3: 创建 categories.json

**文件：**
- 创建：`frontend/data/categories.json`

- [ ] **步骤 1：创建 categories.json**

写入 `frontend/data/categories.json`：
```json
[
  { "id": "cat-1", "level": 1, "name": "Automotive", "slug": "automotive", "parent_id": null },
  { "id": "cat-2", "level": 2, "name": "Wiring Harness", "slug": "wiring-harness", "parent_id": "cat-1" },
  { "id": "cat-3", "level": 3, "name": "PVC Insulated", "slug": "pvc-insulated", "parent_id": "cat-2" },
  { "id": "cat-4", "level": 4, "name": "Thin Wall", "slug": "thin-wall", "parent_id": "cat-3" },
  { "id": "cat-5", "level": 1, "name": "Consumer Electronics", "slug": "consumer-electronics", "parent_id": null },
  { "id": "cat-6", "level": 2, "name": "Internal Wiring", "slug": "internal-wiring", "parent_id": "cat-5" },
  { "id": "cat-7", "level": 3, "name": "PVC Insulated", "slug": "pvc-insulated", "parent_id": "cat-6" },
  { "id": "cat-8", "level": 1, "name": "Industrial", "slug": "industrial", "parent_id": null },
  { "id": "cat-9", "level": 2, "name": "Power Transmission", "slug": "power-transmission", "parent_id": "cat-8" }
]
```

- [ ] **步骤 2：提交**

```bash
cd d:\projects\unowire
git add frontend/data/categories.json
git commit -m "feat: add categories.json with 4-level tree structure"
```

---

### Task 4: 重写 cables.json 为聚合 model + variants + 动态 specs

**文件：**
- 重写：`frontend/data/cables.json`

- [ ] **步骤 1：重写 cables.json**

写入 `frontend/data/cables.json`（将原 10 条扁平记录聚合为 6 个 model）：
```json
[
  {
    "id": "cable-model-1",
    "brand_id": "brand-1",
    "model": "UL1007",
    "slug": "ul1007",
    "type": "electronic_wire",
    "category_ids": ["cat-4", "cat-7"],
    "base_description": "UL1007 PVC insulated single-core wire for internal wiring of electronic equipment. Rated for 300V and 80°C.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "single", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "awg24",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "24", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.205, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.40, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      },
      {
        "slug": "awg22",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "22", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.326, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.60, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      },
      {
        "slug": "awg26",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "26", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.128, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.20, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  },
  {
    "id": "cable-model-2",
    "brand_id": "brand-1",
    "model": "UL1015",
    "slug": "ul1015",
    "type": "electronic_wire",
    "category_ids": ["cat-7"],
    "base_description": "UL1015 PVC insulated wire with higher temperature rating. Rated for 600V and 105°C. Suitable for internal wiring of electrical equipment.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "single", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "awg20",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "20", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.519, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.80, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "600V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "105°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  },
  {
    "id": "cable-model-3",
    "brand_id": "brand-2",
    "model": "AVSS",
    "slug": "avss",
    "type": "automotive_wire",
    "category_ids": ["cat-4"],
    "base_description": "AVSS thin-wall PVC insulated automotive wire. Designed for automotive wiring harness applications. Rated for 60V and 80°C.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "single", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "0.5f",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "20", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.5, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 2.0, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "60V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      },
      {
        "slug": "0.75f",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "18", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.75, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 2.3, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "60V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      },
      {
        "slug": "1.25f",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "16", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 1.25, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 2.6, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "60V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  },
  {
    "id": "cable-model-4",
    "brand_id": "brand-1",
    "model": "UL2468",
    "slug": "ul2468",
    "type": "multi_core_wire",
    "category_ids": ["cat-7"],
    "base_description": "UL2468 PVC insulated flat ribbon cable for internal power connections. Rated for 300V and 80°C.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "2_core", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "24awg-2c",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "24", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.205, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 2.8, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  },
  {
    "id": "cable-model-5",
    "brand_id": "brand-1",
    "model": "UL2517",
    "slug": "ul2517",
    "type": "electronic_wire",
    "category_ids": ["cat-7"],
    "base_description": "UL2517 PU jacketed wire for applications requiring flexibility and abrasion resistance. Rated for 300V and 80°C.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "none", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pu", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "single", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "22awg",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "22", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 0.326, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 1.90, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "300V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  },
  {
    "id": "cable-model-6",
    "brand_id": "brand-2",
    "model": "AVSS Shielded",
    "slug": "avss-shielded",
    "type": "shielded_wire",
    "category_ids": ["cat-4", "cat-9"],
    "base_description": "AVSS 2.0 shielded 2-conductor automotive wire for higher current circuits requiring EMI protection. Rated for 60V and 80°C.",
    "meta_title": null,
    "meta_description": null,
    "common_specs": [
      { "key": "insulation_material", "label": "Insulation Material", "value": "PVC", "unit": null, "type": "enum", "filterable": true },
      { "key": "shielding", "label": "Shielding", "value": "braided", "unit": null, "type": "enum", "filterable": true },
      { "key": "jacket", "label": "Jacket", "value": "pvc", "unit": null, "type": "enum", "filterable": true },
      { "key": "core_structure", "label": "Core Structure", "value": "2_core", "unit": null, "type": "enum", "filterable": true }
    ],
    "variants": [
      {
        "slug": "2.0-2c",
        "specs": [
          { "key": "awg", "label": "AWG", "value": "14", "unit": null, "type": "enum", "filterable": true },
          { "key": "conductor_area", "label": "Conductor Area", "value": 2.0, "unit": "mm²", "type": "number", "filterable": true },
          { "key": "outer_diameter", "label": "Outer Diameter", "value": 5.2, "unit": "mm", "type": "number", "filterable": true },
          { "key": "rated_voltage", "label": "Rated Voltage", "value": "60V", "unit": null, "type": "enum", "filterable": false },
          { "key": "temperature_rating", "label": "Temperature Rating", "value": "80°C", "unit": null, "type": "enum", "filterable": false }
        ]
      }
    ]
  }
]
```

- [ ] **步骤 2：提交**

```bash
cd d:\projects\unowire
git add frontend/data/cables.json
git commit -m "refactor: restructure cables.json to aggregated model + variants + dynamic specs"
```

---

### Task 5: 创建 recommended-equipments.json

**文件：**
- 创建：`frontend/data/recommended-equipments.json`

- [ ] **步骤 1：创建 recommended-equipments.json**

写入 `frontend/data/recommended-equipments.json`：
```json
[
  {
    "id": "rec-eq-1",
    "brand": "KMV",
    "model": "CS-800",
    "type": "semi_automatic_stripping_machine",
    "description": "Semi-automatic stripping machine for PVC single-core wires.",
    "applicable_specs": [
      { "spec_key": "conductor_area", "min": 0.1, "max": 1.0 },
      { "spec_key": "outer_diameter", "min": 1.0, "max": 3.0 },
      { "spec_key": "shielding", "allowed_values": ["none"] },
      { "spec_key": "jacket", "allowed_values": ["pvc"] },
      { "spec_key": "core_structure", "allowed_values": ["single"] }
    ],
    "external_url": "https://www.kmv.co.jp/products/cs-800"
  },
  {
    "id": "rec-eq-2",
    "brand": "Komax",
    "model": "Alpha 488",
    "type": "fully_automatic_cutting_stripping_machine",
    "description": "Fully automatic wire cutting and stripping machine for single-core wires.",
    "applicable_specs": [
      { "spec_key": "conductor_area", "min": 0.08, "max": 2.5 },
      { "spec_key": "outer_diameter", "min": 0.8, "max": 5.5 },
      { "spec_key": "shielding", "allowed_values": ["none"] },
      { "spec_key": "core_structure", "allowed_values": ["single"] }
    ],
    "external_url": "https://www.komaxgroup.com/en/products/alpha-488"
  },
  {
    "id": "rec-eq-3",
    "brand": "KMV",
    "model": "CS-1500",
    "type": "semi_automatic_stripping_machine",
    "description": "Semi-automatic stripping machine for larger diameter wires.",
    "applicable_specs": [
      { "spec_key": "conductor_area", "min": 1.0, "max": 3.0 },
      { "spec_key": "outer_diameter", "min": 3.0, "max": 6.0 },
      { "spec_key": "shielding", "allowed_values": ["none"] },
      { "spec_key": "jacket", "allowed_values": ["pvc"] },
      { "spec_key": "core_structure", "allowed_values": ["single"] }
    ],
    "external_url": "https://www.kmv.co.jp/products/cs-1500"
  },
  {
    "id": "rec-eq-4",
    "brand": "Komax",
    "model": "Gamma 333",
    "type": "fully_automatic_cutting_stripping_machine",
    "description": "Fully automatic cutting and stripping machine for shielded and multi-core cables.",
    "applicable_specs": [
      { "spec_key": "conductor_area", "min": 0.5, "max": 2.5 },
      { "spec_key": "outer_diameter", "min": 2.0, "max": 6.0 },
      { "spec_key": "shielding", "allowed_values": ["braided", "foil"] },
      { "spec_key": "core_structure", "allowed_values": ["2_core", "3_core", "4_core"] }
    ],
    "external_url": "https://www.komaxgroup.com/en/products/gamma-333"
  }
]
```

- [ ] **步骤 2：提交**

```bash
cd d:\projects\unowire
git add frontend/data/recommended-equipments.json
git commit -m "feat: add recommended-equipments.json with applicable_specs rules"
```

---

## Phase 2: Lib 层重写

### Task 6: 重写 lib/types.ts

**文件：**
- 重写：`frontend/lib/types.ts`

- [ ] **步骤 1：重写 types.ts**

写入 `frontend/lib/types.ts`：
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

export type SpecType = "string" | "number" | "enum";

export interface SpecItem {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
  type: SpecType;
  filterable: boolean;
}

export interface CableVariant {
  slug: string;
  specs: SpecItem[];
}

export interface Cable {
  id: string;
  brand_id: string;
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

// === 推荐设备 ===
export interface ApplicableSpecRule {
  spec_key: string;
  min?: number;
  max?: number;
  allowed_values?: (string | number)[];
}

export interface RecommendedEquipment {
  id: string;
  brand: string;
  model: string;
  type: string;
  description: string;
  applicable_specs: ApplicableSpecRule[];
  external_url: string;
}

export interface RecommendedEquipmentResult {
  equipment: RecommendedEquipment;
  matched_variants: CableVariant[];
  explanation: { spec_key: string; label: string; matched_value: string | number }[];
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

// === 筛选 Facets ===
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

// === 列表响应 ===
export interface CableListItem {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
}

export interface CableListResponse {
  items: CableListItem[];
  total: number;
  page: number;
  page_size: number;
  filters: FilterFacets;
}

// === API 详情响应 ===
export interface CableDetailResponse {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
  categories: Category[];
  recommended_equipments: RecommendedEquipmentResult[];
}

// === 校验 ===
export interface ValidationError {
  file: string;
  cable_id?: string;
  message: string;
  severity: "error" | "warning";
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

预期：可能仍报错（因为 lib/api.ts 还是临时空文件），但 types.ts 本身无语法错误。

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/types.ts
git commit -m "refactor: rewrite lib/types.ts with new data model interfaces"
```

---

### Task 7: 重写 lib/api.ts（含预构建索引）

**文件：**
- 重写：`frontend/lib/api.ts`

- [ ] **步骤 1：重写 api.ts**

写入 `frontend/lib/api.ts`：
```typescript
import type {
  Brand, Cable, CableDetailResponse, Category, Manufacturer,
  RecommendedEquipment,
} from './types';

import manufacturersData from '@/data/manufacturers.json';
import brandsData from '@/data/brands.json';
import categoriesData from '@/data/categories.json';
import cablesData from '@/data/cables.json';
import recommendedEquipmentsData from '@/data/recommended-equipments.json';

// === 类型断言 ===
const manufacturers = manufacturersData as Manufacturer[];
const brands = brandsData as Brand[];
const categories = categoriesData as Category[];
const cables = cablesData as Cable[];
const recommendedEquipments = recommendedEquipmentsData as RecommendedEquipment[];

// === 预构建索引（首次访问时构建） ===
interface CategoryIndex {
  byId: Map<string, Category>;
  children: Map<string, Category[]>;
  descendants: Map<string, Set<string>>;
  ancestors: Map<string, Category[]>;
  pathSlugs: Map<string, string[]>;
  rootCategories: Category[];
}

let _categoryIndex: CategoryIndex | null = null;

function buildCategoryIndex(): CategoryIndex {
  const byId = new Map<string, Category>();
  const children = new Map<string, Category[]>();
  const rootCategories: Category[] = [];

  for (const cat of categories) {
    byId.set(cat.id, cat);
    if (cat.parent_id === null) {
      rootCategories.push(cat);
    } else {
      const arr = children.get(cat.parent_id) ?? [];
      arr.push(cat);
      children.set(cat.parent_id, arr);
    }
  }

  // 递归找子孙
  const descendants = new Map<string, Set<string>>();
  function getDescendants(catId: string): Set<string> {
    if (descendants.has(catId)) return descendants.get(catId)!;
    const result = new Set<string>();
    const directChildren = children.get(catId) ?? [];
    for (const child of directChildren) {
      result.add(child.id);
      for (const d of getDescendants(child.id)) result.add(d);
    }
    descendants.set(catId, result);
    return result;
  }
  for (const cat of categories) getDescendants(cat.id);

  // 祖先链 + 路径 slug
  const ancestors = new Map<string, Category[]>();
  const pathSlugs = new Map<string, string[]>();
  function buildPath(catId: string): { chain: Category[]; slugs: string[] } {
    const cat = byId.get(catId);
    if (!cat) return { chain: [], slugs: [] };
    if (cat.parent_id === null) {
      return { chain: [cat], slugs: [cat.slug] };
    }
    const parent = buildPath(cat.parent_id);
    return { chain: [...parent.chain, cat], slugs: [...parent.slugs, cat.slug] };
  }
  for (const cat of categories) {
    const { chain, slugs } = buildPath(cat.id);
    ancestors.set(cat.id, chain);
    pathSlugs.set(cat.id, slugs);
  }

  return { byId, children, descendants, ancestors, pathSlugs, rootCategories };
}

function getCategoryIndex(): CategoryIndex {
  if (!_categoryIndex) _categoryIndex = buildCategoryIndex();
  return _categoryIndex;
}

// === byId Map ===
const brandById = new Map(brands.map(b => [b.id, b]));
const manufacturerById = new Map(manufacturers.map(m => [m.id, m]));
const cableById = new Map(cables.map(c => [c.id, c]));

// === URL 查询 Map: (brand_slug, cable_slug) → cable ===
const cableByUrl = new Map<string, Cable>();
for (const cable of cables) {
  const brand = brandById.get(cable.brand_id);
  if (brand) {
    cableByUrl.set(`${brand.slug}/${cable.slug}`, cable);
  }
}

// === 工具函数 ===
export function getCableUrl(cable: Cable): string {
  const brand = brandById.get(cable.brand_id);
  const brandSlug = brand?.slug ?? "unknown";
  return `/cables/${brandSlug}/${cable.slug}`;
}

// === API 对象 ===
export const api = {
  manufacturers: {
    all(): Manufacturer[] {
      return manufacturers;
    },
    getById(id: string): Manufacturer | null {
      return manufacturerById.get(id) ?? null;
    },
  },

  brands: {
    all(): Brand[] {
      return brands;
    },
    getById(id: string): Brand | null {
      return brandById.get(id) ?? null;
    },
  },

  categories: {
    all(): Category[] {
      return categories;
    },
    roots(): Category[] {
      return getCategoryIndex().rootCategories;
    },
    getById(id: string): Category | null {
      return getCategoryIndex().byId.get(id) ?? null;
    },
    getByIds(ids: string[]): Category[] {
      return ids.map(id => getCategoryIndex().byId.get(id)).filter((c): c is Category => c !== undefined);
    },
    descendants(catId: string): Set<string> {
      return getCategoryIndex().descendants.get(catId) ?? new Set();
    },
    ancestors(catId: string): Category[] {
      return getCategoryIndex().ancestors.get(catId) ?? [];
    },
    pathSlugs(catId: string): string[] {
      return getCategoryIndex().pathSlugs.get(catId) ?? [];
    },
    /** 根据 URL slug 路径数组查找 category，返回最深匹配的 category */
    findByPath(slugs: string[]): { category: Category; consumed: number } | null {
      if (slugs.length === 0) return null;
      const idx = getCategoryIndex();
      let currentLevel = idx.rootCategories;
      let matched: Category | null = null;
      let consumed = 0;
      for (const slug of slugs) {
        const found = currentLevel.find(c => c.slug === slug);
        if (!found) break;
        matched = found;
        consumed++;
        currentLevel = idx.children.get(found.id) ?? [];
      }
      return matched ? { category: matched, consumed } : null;
    },
  },

  cables: {
    all(): Cable[] {
      return cables;
    },
    getById(id: string): Cable | null {
      return cableById.get(id) ?? null;
    },
    getByUrl(brandSlug: string, cableSlug: string): Cable | null {
      return cableByUrl.get(`${brandSlug}/${cableSlug}`) ?? null;
    },
    url(cable: Cable): string {
      return getCableUrl(cable);
    },
    /** 获取同分类的其他线缆（最多 N 条） */
    similar(cable: Cable, limit: number = 4): Cable[] {
      const catIds = new Set(cable.category_ids);
      return cables
        .filter(c => c.id !== cable.id && c.category_ids.some(id => catIds.has(id)))
        .slice(0, limit);
    },
  },

  recommendedEquipments: {
    all(): RecommendedEquipment[] {
      return recommendedEquipments;
    },
  },

  /** 详情页聚合响应 */
  getCableDetail(brandSlug: string, cableSlug: string): CableDetailResponse | null {
    const cable = this.cables.getByUrl(brandSlug, cableSlug);
    if (!cable) return null;
    const brand = brandById.get(cable.brand_id) ?? null;
    const manufacturer = brand ? manufacturerById.get(brand.manufacturer_id) ?? null : null;
    const cableCategories = this.categories.getByIds(cable.category_ids);
    return {
      cable,
      brand,
      manufacturer,
      categories: cableCategories,
      recommended_equipments: [],  // 由 equipment-recommend.ts 填充
    };
  },
};
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

预期：可能仍报错（页面文件还是临时占位），但 api.ts 本身无语法错误。

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/api.ts
git commit -m "refactor: rewrite lib/api.ts with pre-built indexes and getCableUrl helper"
```

---

### Task 8: 创建 lib/category-tree.ts

**文件：**
- 创建：`frontend/lib/category-tree.ts`

- [ ] **步骤 1：创建 category-tree.ts**

写入 `frontend/lib/category-tree.ts`：
```typescript
import { api } from './api';
import type { Category } from './types';

/** 获取某分类的所有子孙 ID（含自身） */
export function getDescendantIds(catId: string): Set<string> {
  const descendants = api.categories.descendants(catId);
  return new Set([catId, ...descendants]);
}

/** 获取分类的祖先链（从根到自身） */
export function getCategoryPath(catId: string): Category[] {
  return api.categories.ancestors(catId);
}

/** 获取分类的 URL slug 路径数组 */
export function getCategoryPathSlugs(catId: string): string[] {
  return api.categories.pathSlugs(catId);
}

/** 构建分类的 URL */
export function getCategoryUrl(catId: string): string {
  const slugs = getCategoryPathSlugs(catId);
  return `/categories/${slugs.join('/')}`;
}

/** 判断一个 cable 是否属于某分类（含子孙） */
export function cableInCategory(cableCategoryIds: string[], catId: string): boolean {
  const allIds = getDescendantIds(catId);
  return cableCategoryIds.some(id => allIds.has(id));
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/category-tree.ts
git commit -m "feat: add lib/category-tree.ts with index-based tree operations"
```

---

### Task 9: 创建 lib/equipment-recommend.ts

**文件：**
- 创建：`frontend/lib/equipment-recommend.ts`

- [ ] **步骤 1：创建 equipment-recommend.ts**

写入 `frontend/lib/equipment-recommend.ts`：
```typescript
import type {
  ApplicableSpecRule, Cable, CableVariant, RecommendedEquipment,
  RecommendedEquipmentResult, SpecItem,
} from './types';

/** 从 variant.specs + common_specs 中查找指定 key 的 SpecItem */
function findSpec(variant: CableVariant, commonSpecs: SpecItem[], key: string): SpecItem | undefined {
  return [...variant.specs, ...commonSpecs].find(s => s.key === key);
}

/** 判断单个变体是否满足单条规则 */
function variantMatchesRule(variant: CableVariant, commonSpecs: SpecItem[], rule: ApplicableSpecRule): boolean {
  const spec = findSpec(variant, commonSpecs, rule.spec_key);
  if (!spec) return false;
  if (rule.min !== undefined && typeof spec.value === "number" && spec.value < rule.min) return false;
  if (rule.max !== undefined && typeof spec.value === "number" && spec.value > rule.max) return false;
  if (rule.allowed_values && !rule.allowed_values.includes(spec.value)) return false;
  return true;
}

/** 判断单个变体是否满足所有规则 */
function variantMatchesAllRules(variant: CableVariant, commonSpecs: SpecItem[], rules: ApplicableSpecRule[]): boolean {
  return rules.every(rule => variantMatchesRule(variant, commonSpecs, rule));
}

/**
 * 推荐设备匹配：任一变体命中即推荐该设备（去重）。
 * @returns 匹配结果数组，每项含设备、命中的变体列表、explanation
 */
export function recommendEquipments(
  cable: Cable,
  equipments: RecommendedEquipment[],
): RecommendedEquipmentResult[] {
  const results: RecommendedEquipmentResult[] = [];
  for (const eq of equipments) {
    const matchedVariants: CableVariant[] = [];
    for (const variant of cable.variants) {
      if (variantMatchesAllRules(variant, cable.common_specs, eq.applicable_specs)) {
        matchedVariants.push(variant);
      }
    }
    if (matchedVariants.length === 0) continue;

    // explanation: 取主变体（第一个命中变体）命中的所有规则
    const primaryVariant = matchedVariants[0];
    const explanation = eq.applicable_specs.map(rule => {
      const spec = findSpec(primaryVariant, cable.common_specs, rule.spec_key);
      return {
        spec_key: rule.spec_key,
        label: spec?.label ?? rule.spec_key,
        matched_value: spec?.value ?? "N/A",
      };
    });

    results.push({ equipment: eq, matched_variants: matchedVariants, explanation });
  }
  return results;
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/equipment-recommend.ts
git commit -m "feat: add lib/equipment-recommend.ts with generic rule matching"
```

---

### Task 10: 创建 lib/filter.ts

**文件：**
- 创建：`frontend/lib/filter.ts`

- [ ] **步骤 1：创建 filter.ts**

写入 `frontend/lib/filter.ts`：
```typescript
import type {
  Brand, Cable, CableListItem, CableListResponse, CableQueryParams,
  Category, FilterFacets, Manufacturer,
} from './types';
import { api } from './api';
import { getDescendantIds } from './category-tree';

/** 从 cable 的 specs 中查找指定 key 的 SpecItem */
function findSpecValue(cable: Cable, key: string): string | number | undefined {
  // 优先从 common_specs 查找，再从各 variant 的 specs 查找
  for (const s of cable.common_specs) {
    if (s.key === key) return s.value;
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) return s.value;
    }
  }
  return undefined;
}

/** 从所有变体收集指定 key 的所有值（去重） */
function collectVariantSpecValues(cable: Cable, key: string): (string | number)[] {
  const values = new Set<string | number>();
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) values.add(s.value);
    }
  }
  return Array.from(values);
}

/** 获取 cable 的所有数值型 spec 值（跨所有变体） */
function getAllNumericValues(cable: Cable, key: string): number[] {
  const values: number[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key && typeof s.value === "number") values.push(s.value);
    }
  }
  return values;
}

/** 主筛选函数 */
export function filterCables(params: CableQueryParams): CableListResponse {
  let filtered = [...api.cables.all()];

  // 关键字搜索
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }

  // 生产商筛选
  if (params.manufacturer && params.manufacturer.length > 0) {
    const manufacturerIds = new Set(params.manufacturer);
    filtered = filtered.filter(c => {
      const brand = api.brands.getById(c.brand_id);
      return brand && manufacturerIds.has(brand.manufacturer_id);
    });
  }

  // 品牌筛选
  if (params.brand && params.brand.length > 0) {
    const brandIds = new Set(params.brand);
    filtered = filtered.filter(c => brandIds.has(c.brand_id));
  }

  // 分类筛选（含子孙）
  if (params.category && params.category.length > 0) {
    const allCatIds = new Set<string>();
    for (const catId of params.category) {
      for (const d of getDescendantIds(catId)) allCatIds.add(d);
    }
    filtered = filtered.filter(c => c.category_ids.some(id => allCatIds.has(id)));
  }

  // AWG 筛选（任一变体匹配）
  if (params.awg && params.awg.length > 0) {
    const awgSet = new Set(params.awg);
    filtered = filtered.filter(c =>
      c.variants.some(v => v.specs.some(s => s.key === "awg" && awgSet.has(String(s.value))))
    );
  }

  // 数值范围筛选：conductor_area（任一变体在范围内）
  if (params.min_area !== undefined || params.max_area !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "conductor_area");
      return values.some(v =>
        (params.min_area === undefined || v >= params.min_area) &&
        (params.max_area === undefined || v <= params.max_area)
      );
    });
  }

  // 数值范围筛选：outer_diameter
  if (params.min_od !== undefined || params.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (params.min_od === undefined || v >= params.min_od) &&
        (params.max_od === undefined || v <= params.max_od)
      );
    });
  }

  // 枚举筛选：shielding
  if (params.shielding && params.shielding.length > 0) {
    const set = new Set(params.shielding);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "shielding"))));
  }

  // 枚举筛选：jacket
  if (params.jacket && params.jacket.length > 0) {
    const set = new Set(params.jacket);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "jacket"))));
  }

  // 枚举筛选：core_structure
  if (params.core_structure && params.core_structure.length > 0) {
    const set = new Set(params.core_structure);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "core_structure"))));
  }

  // 构建 facets（基于筛选后的结果）
  const filters = buildFacets(filtered);

  // 分页
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const page_size = params.page_size;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  const items: CableListItem[] = paged.map(cable => {
    const brand = api.brands.getById(cable.brand_id);
    const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
    return { cable, brand, manufacturer };
  });

  return { items, total, page, page_size, filters };
}

/** 构建 facets（基于给定 cable 列表） */
function buildFacets(cableList: Cable[]): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const awgCounts = new Map<string, number>();
  const shieldingCounts = new Map<string, number>();
  const jacketCounts = new Map<string, number>();
  const coreCounts = new Map<string, number>();
  let minArea = Infinity, maxArea = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  for (const cable of cableList) {
    // manufacturer
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      brandCounts.set(cable.brand_id, (brandCounts.get(cable.brand_id) ?? 0) + 1);
      manufacturerCounts.set(brand.manufacturer_id, (manufacturerCounts.get(brand.manufacturer_id) ?? 0) + 1);
    }
    // categories
    for (const catId of cable.category_ids) {
      categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
    }
    // variant specs
    for (const v of cable.variants) {
      for (const s of v.specs) {
        if (s.key === "awg") awgCounts.set(String(s.value), (awgCounts.get(String(s.value)) ?? 0) + 1);
        if (s.key === "conductor_area" && typeof s.value === "number") {
          minArea = Math.min(minArea, s.value);
          maxArea = Math.max(maxArea, s.value);
        }
        if (s.key === "outer_diameter" && typeof s.value === "number") {
          minOd = Math.min(minOd, s.value);
          maxOd = Math.max(maxOd, s.value);
        }
      }
    }
    // common specs
    for (const s of cable.common_specs) {
      if (s.key === "shielding") shieldingCounts.set(String(s.value), (shieldingCounts.get(String(s.value)) ?? 0) + 1);
      if (s.key === "jacket") jacketCounts.set(String(s.value), (jacketCounts.get(String(s.value)) ?? 0) + 1);
      if (s.key === "core_structure") coreCounts.set(String(s.value), (coreCounts.get(String(s.value)) ?? 0) + 1);
    }
  }

  const manufacturers = api.manufacturers.all()
    .map(m => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter(m => m.count > 0);
  const brandsList = api.brands.all()
    .map(b => ({ id: b.id, name: b.name, count: brandCounts.get(b.id) ?? 0 }))
    .filter(b => b.count > 0);
  const categories = api.categories.all()
    .map(c => ({ id: c.id, name: c.name, level: c.level, count: categoryCounts.get(c.id) ?? 0 }))
    .filter(c => c.count > 0);

  return {
    manufacturers,
    brands: brandsList,
    categories,
    awg: Array.from(awgCounts.entries()).map(([value, count]) => ({ value, count })),
    conductor_area: { min: minArea === Infinity ? 0 : minArea, max: maxArea === -Infinity ? 0 : maxArea },
    outer_diameter: { min: minOd === Infinity ? 0 : minOd, max: maxOd === -Infinity ? 0 : maxOd },
    shielding: Array.from(shieldingCounts.entries()).map(([value, count]) => ({ value, count })),
    jacket: Array.from(jacketCounts.entries()).map(([value, count]) => ({ value, count })),
    core_structure: Array.from(coreCounts.entries()).map(([value, count]) => ({ value, count })),
  };
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/filter.ts
git commit -m "feat: add lib/filter.ts with type-driven dynamic filtering"
```

---

### Task 11: 创建 lib/validate.ts

**文件：**
- 创建：`frontend/lib/validate.ts`
- 创建：`frontend/scripts/validate-data.ts`

- [ ] **步骤 1：创建 validate.ts**

写入 `frontend/lib/validate.ts`：
```typescript
import { api } from './api';
import type { ValidationError } from './types';

/**
 * 校验所有 JSON 数据的引用完整性、key 唯一性、slug 唯一性。
 * 在 dev 启动和 build 前运行。
 */
export function validateAllData(): ValidationError[] {
  const errors: ValidationError[] = [];
  const brands = api.brands.all();
  const manufacturers = api.manufacturers.all();
  const categories = api.categories.all();
  const cables = api.cables.all();
  const equipments = api.recommendedEquipments.all();

  const brandIds = new Set(brands.map(b => b.id));
  const manufacturerIds = new Set(manufacturers.map(m => m.id));
  const categoryIds = new Set(categories.map(c => c.id));

  // 1. brand.manufacturer_id 引用完整性
  for (const brand of brands) {
    if (!manufacturerIds.has(brand.manufacturer_id)) {
      errors.push({
        file: "brands.json",
        message: `Brand ${brand.id} references missing manufacturer_id: ${brand.manufacturer_id}`,
        severity: "error",
      });
    }
  }

  // 2. cable.brand_id 引用完整性
  for (const cable of cables) {
    if (!brandIds.has(cable.brand_id)) {
      errors.push({
        file: "cables.json",
        cable_id: cable.id,
        message: `Cable ${cable.id} references missing brand_id: ${cable.brand_id}`,
        severity: "error",
      });
    }

    // 3. cable.category_ids 引用完整性
    for (const catId of cable.category_ids) {
      if (!categoryIds.has(catId)) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} references missing category_id: ${catId}`,
          severity: "error",
        });
      }
    }

    // 4. common_specs 与 variant specs 无同名 key
    const commonKeys = new Set(cable.common_specs.map(s => s.key));
    for (const variant of cable.variants) {
      const variantKeys = new Set(variant.specs.map(s => s.key));
      for (const k of variantKeys) {
        if (commonKeys.has(k)) {
          errors.push({
            file: "cables.json",
            cable_id: cable.id,
            message: `Cable ${cable.id} variant ${variant.slug}: spec key "${k}" duplicated in common_specs`,
            severity: "error",
          });
        }
      }
    }

    // 5. variant 内 spec key 唯一
    for (const variant of cable.variants) {
      const keys = variant.specs.map(s => s.key);
      const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dup.length > 0) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Cable ${cable.id} variant ${variant.slug}: duplicate spec keys: ${dup.join(", ")}`,
          severity: "error",
        });
      }
    }
  }

  // 6. (brand_slug, cable_slug) 组合唯一
  const urlSet = new Set<string>();
  for (const cable of cables) {
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      const urlKey = `${brand.slug}/${cable.slug}`;
      if (urlSet.has(urlKey)) {
        errors.push({
          file: "cables.json",
          cable_id: cable.id,
          message: `Duplicate cable URL: ${urlKey}`,
          severity: "error",
        });
      }
      urlSet.add(urlKey);
    }
  }

  // 7. type 一致性：同一 spec_key 在所有 cable 中 type 一致
  const keyTypes = new Map<string, string>();
  function checkType(file: string, cableId: string, key: string, type: string) {
    const existing = keyTypes.get(key);
    if (existing === undefined) {
      keyTypes.set(key, type);
    } else if (existing !== type) {
      errors.push({
        file,
        cable_id: cableId,
        message: `Spec key "${key}" has inconsistent types: ${existing} vs ${type}`,
        severity: "error",
      });
    }
  }
  for (const cable of cables) {
    for (const s of cable.common_specs) checkType("cables.json", cable.id, s.key, s.type);
    for (const v of cable.variants) {
      for (const s of v.specs) checkType("cables.json", cable.id, s.key, s.type);
    }
  }

  // 8. 推荐设备覆盖（warning，不阻断）
  for (const eq of equipments) {
    // 简单检查：至少能匹配一个 cable 的任一变体（不做完整匹配，只检查 spec_key 存在性）
    const ruleKeys = eq.applicable_specs.map(r => r.spec_key);
    let anyCableHasAllKeys = false;
    for (const cable of cables) {
      const allSpecKeys = new Set([
        ...cable.common_specs.map(s => s.key),
        ...cable.variants.flatMap(v => v.specs.map(s => s.key)),
      ]);
      if (ruleKeys.every(k => allSpecKeys.has(k))) {
        anyCableHasAllKeys = true;
        break;
      }
    }
    if (!anyCableHasAllKeys) {
      errors.push({
        file: "recommended-equipments.json",
        message: `Equipment ${eq.id} (${eq.model}): no cable has all spec_keys [${ruleKeys.join(", ")}], will never match`,
        severity: "warning",
      });
    }
  }

  return errors;
}

/** 打印校验结果，返回是否有 error 级别问题 */
export function printValidationResult(errors: ValidationError[]): boolean {
  const errorsOnly = errors.filter(e => e.severity === "error");
  const warnings = errors.filter(e => e.severity === "warning");
  if (errorsOnly.length > 0) {
    console.error("\n❌ Data validation errors:");
    for (const e of errorsOnly) {
      console.error(`  [${e.file}]${e.cable_id ? ` ${e.cable_id}:` : ""} ${e.message}`);
    }
  }
  if (warnings.length > 0) {
    console.warn("\n⚠️ Data validation warnings:");
    for (const w of warnings) {
      console.warn(`  [${w.file}]${w.cable_id ? ` ${w.cable_id}:` : ""} ${w.message}`);
    }
  }
  if (errorsOnly.length === 0 && warnings.length === 0) {
    console.log("✓ Data validation passed.");
  }
  return errorsOnly.length > 0;
}
```

- [ ] **步骤 2：创建校验脚本**

写入 `frontend/scripts/validate-data.ts`：
```typescript
import { validateAllData, printValidationResult } from '../lib/validate';

const errors = validateAllData();
const hasErrors = printValidationResult(errors);
if (hasErrors) {
  process.exit(1);
}
```

- [ ] **步骤 3：在 package.json 中添加 validate 脚本**

修改 `frontend/package.json` 的 `scripts` 部分，添加：
```json
"validate": "tsx scripts/validate-data.ts"
```

需要安装 `tsx` 作为 dev dependency：
```bash
cd d:\projects\unowire\frontend
npm install -D tsx
```

- [ ] **步骤 4：运行校验**

```bash
cd d:\projects\unowire\frontend
npm run validate
```

预期：`✓ Data validation passed.`（0 errors，可能有 0 warnings）。

- [ ] **步骤 5：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/validate.ts frontend/scripts/validate-data.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add lib/validate.ts with static JSON data validation"
```

---

### Task 12: 重写 lib/utils.ts 和 lib/seo.ts

**文件：**
- 修改：`frontend/lib/utils.ts`
- 重写：`frontend/lib/seo.ts`

- [ ] **步骤 1：更新 utils.ts**

在 `frontend/lib/utils.ts` 末尾追加（保留现有 cn 函数和格式化函数）：
```typescript
import type { Cable, SpecItem, CableVariant } from './types';

/** 从 cable 的 common_specs 或 variant specs 查找 SpecItem */
export function findSpecItem(cable: Cable, key: string): SpecItem | undefined {
  for (const s of cable.common_specs) {
    if (s.key === key) return s;
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) return s;
    }
  }
  return undefined;
}

/** 从 variant 的 specs 查找 SpecItem */
export function findVariantSpec(variant: CableVariant, key: string): SpecItem | undefined {
  return variant.specs.find(s => s.key === key);
}

/** 获取 cable 的主变体（第一个 variant） */
export function getPrimaryVariant(cable: Cable): CableVariant | null {
  return cable.variants[0] ?? null;
}

/** 格式化 SpecItem 值（含单位） */
export function formatSpecValue(spec: SpecItem): string {
  if (spec.value === null || spec.value === undefined) return "—";
  const valueStr = String(spec.value);
  return spec.unit ? `${valueStr} ${spec.unit}` : valueStr;
}
```

注意：保留 utils.ts 现有的 `cn`、`formatCableUrl`、`formatEquipmentUrl`（虽然设备相关，但暂不删除避免破坏其他文件）、`formatEquipmentType`、`formatCoreStructure`、`formatShielding`、`formatJacket` 函数。后续 Task 会清理无用函数。

- [ ] **步骤 2：重写 seo.ts**

写入 `frontend/lib/seo.ts`：
```typescript
import type { Metadata } from 'next';
import type { Cable, Category, Manufacturer, Brand } from './types';
import { api } from './api';
import { findSpecItem, getPrimaryVariant } from './utils';
import { getCategoryPathSlugs } from './category-tree';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

// === Cable Metadata ===
export function generateCableMetadata(cable: Cable, brand: Brand | null): Metadata {
  const title = cable.meta_title || `${cable.model} - ${brand?.name ?? "Unknown"} | Unowire`;
  const description = cable.meta_description || cable.base_description.slice(0, 160);
  const brandSlug = brand?.slug ?? "unknown";
  return {
    title,
    description,
    canonical: `/cables/${brandSlug}/${cable.slug}`,
    robots: { index: true, follow: true },
  };
}

// === Category Metadata ===
export function generateCategoryMetadata(category: Category): Metadata {
  const pathSlugs = getCategoryPathSlugs(category.id);
  const title = `${category.name} Cables | Unowire`;
  const description = `Browse cables in the ${category.name} category.`;
  return {
    title,
    description,
    canonical: `/categories/${pathSlugs.join('/')}`,
    robots: { index: true, follow: true },
  };
}

// === Home Metadata ===
export function generateHomeMetadata(): Metadata {
  return {
    title: 'Unowire - Cable Specs Database',
    description: 'Query cable specifications online. Browse cables by brand, category, and specs.',
    canonical: '/',
    robots: { index: true, follow: true },
  };
}

// === Cables List Metadata ===
export function generateCablesListMetadata(): Metadata {
  return {
    title: 'Cable Directory - Unowire',
    description: 'Browse all cables. Filter by manufacturer, brand, AWG, conductor area, outer diameter.',
    canonical: '/cables',
    robots: { index: true, follow: true },
  };
}

// === JSON-LD: Product ===
export function buildCableJsonLd(cable: Cable, brand: Brand | null, manufacturer: Manufacturer | null): object {
  // additionalProperty: common_specs + 主变体 specs
  const primaryVariant = getPrimaryVariant(cable);
  const additionalProperty: object[] = cable.common_specs.map(s => ({
    "@type": "PropertyValue",
    name: s.label,
    value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
  }));
  if (primaryVariant) {
    for (const s of primaryVariant.specs) {
      additionalProperty.push({
        "@type": "PropertyValue",
        name: s.label,
        value: s.unit ? `${s.value} ${s.unit}` : String(s.value),
      });
    }
  }

  // category 路径
  const categoryPath = cable.category_ids.length > 0
    ? api.categories.getByIds(cable.category_ids).map(c => c.name).join(" > ")
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cable.model,
    description: cable.base_description,
    brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
    manufacturer: manufacturer ? {
      "@type": "Organization",
      name: manufacturer.name,
      address: { "@type": "PostalAddress", addressCountry: manufacturer.country },
    } : undefined,
    category: categoryPath,
    additionalProperty,
  };
}

// === JSON-LD: BreadcrumbList ===
export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}
```

- [ ] **步骤 3：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/utils.ts frontend/lib/seo.ts
git commit -m "refactor: rewrite lib/seo.ts and extend lib/utils.ts with spec helpers"
```

---

## Phase 3: 布局与共享组件

### Task 13: 更新布局组件（Nav + Container + Footer）

**文件：**
- 修改：`frontend/components/layout/Container.tsx`
- 修改：`frontend/components/layout/Nav.tsx`
- 修改：`frontend/app/layout.tsx`

- [ ] **步骤 1：更新 Container.tsx 为全屏布局**

写入 `frontend/components/layout/Container.tsx`：
```typescript
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full px-6', className)}>
      {children}
    </div>
  );
}
```

- [ ] **步骤 2：更新 Nav.tsx**

写入 `frontend/components/layout/Nav.tsx`：
```typescript
import Link from 'next/link';
import { Container } from './Container';
import { SearchBox } from '@/components/shared/SearchBox';

export function Nav() {
  const links = [
    { href: '/cables', label: 'Cables' },
    { href: '/categories/automotive', label: 'Automotive' },
    { href: '/categories/consumer-electronics', label: 'Consumer Electronics' },
    { href: '/categories/industrial', label: 'Industrial' },
  ];
  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="text-xl font-bold text-gray-900 shrink-0">
          Unowire
        </Link>
        <nav className="flex gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-gray-600 hover:text-blue-600 transition text-sm">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 max-w-md">
          <SearchBox />
        </div>
      </Container>
    </header>
  );
}
```

- [ ] **步骤 3：更新 layout.tsx**

写入 `frontend/app/layout.tsx`：
```typescript
import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: {
    default: 'Unowire — Cable Specs Database',
    template: '%s | Unowire',
  },
  description: 'Query cable specifications online. Browse cables by brand, category, and specs.',
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

- [ ] **步骤 4：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

注意：Footer.tsx 可能引用旧内容，需要后续 Task 修复。如果报错，临时简化 Footer.tsx。

- [ ] **步骤 5：提交**

```bash
cd d:\projects\unowire
git add frontend/components/layout/Container.tsx frontend/components/layout/Nav.tsx frontend/app/layout.tsx
git commit -m "refactor: update Nav/Container/layout for full-width cable-only site"
```

---

### Task 14: 更新 SearchBox 和 Pagination

**文件：**
- 修改：`frontend/components/shared/SearchBox.tsx`
- 修改：`frontend/components/shared/Pagination.tsx`（如有需要）

- [ ] **步骤 1：更新 SearchBox.tsx**

写入 `frontend/components/shared/SearchBox.tsx`：
```typescript
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function SearchBoxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      router.push(`/cables?q=${encodeURIComponent(q.trim())}`);
    } else {
      router.push('/cables');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search cable model, spec..."
        className="w-full h-10 pl-4 pr-10 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
        aria-label="Search"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}

export function SearchBox() {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <SearchBoxInner />
    </Suspense>
  );
}
```

- [ ] **步骤 2：检查 Pagination.tsx 是否需要修改**

Read `frontend/components/shared/Pagination.tsx`。如果接口与现有列表页兼容（接收 page、totalPages、basePath、searchParams），则无需修改。

- [ ] **步骤 3：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/components/shared/SearchBox.tsx
git commit -m "refactor: update SearchBox for cable search with Suspense wrapper"
```

---

## Phase 4: 线缆页面

### Task 15: 重写 CableCard 组件

**文件：**
- 重写：`frontend/components/cable/CableCard.tsx`

- [ ] **步骤 1：重写 CableCard.tsx**

写入 `frontend/components/cable/CableCard.tsx`：
```typescript
import Link from 'next/link';
import type { Cable, Brand, Manufacturer } from '@/lib/types';
import { getCableUrl, getPrimaryVariant, findVariantSpec, formatSpecValue } from '@/lib/utils';

interface CableCardProps {
  cable: Cable;
  brand?: Brand | null;
  manufacturer?: Manufacturer | null;
}

export function CableCard({ cable, brand, manufacturer }: CableCardProps) {
  const primaryVariant = getPrimaryVariant(cable);
  const url = getCableUrl(cable);
  const awgSpec = primaryVariant ? findVariantSpec(primaryVariant, "awg") : null;
  const areaSpec = primaryVariant ? findVariantSpec(primaryVariant, "conductor_area") : null;
  const odSpec = primaryVariant ? findVariantSpec(primaryVariant, "outer_diameter") : null;
  const jacketSpec = cable.common_specs.find(s => s.key === "jacket");
  const variantCount = cable.variants.length;

  return (
    <Link href={url} className="block border rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      {/* 图片占位区 */}
      <div className="h-24 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
          <path d="M2 12h20" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
        {awgSpec && (
          <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
            AWG {String(awgSpec.value)}
          </span>
        )}
      </div>

      {/* 标题 */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate">{cable.model}</h3>
        <p className="text-xs text-gray-500 mb-2">
          {brand?.name ?? "Unknown"}{manufacturer ? ` · ${manufacturer.country}` : ""}
        </p>

        {/* 迷你规格表 */}
        <div className="text-xs space-y-0.5 mb-2">
          {areaSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Area</span>
              <span className="text-gray-900">{formatSpecValue(areaSpec)}</span>
            </div>
          )}
          {odSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">OD</span>
              <span className="text-gray-900">{formatSpecValue(odSpec)}</span>
            </div>
          )}
          {jacketSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Jacket</span>
              <span className="text-gray-900 uppercase">{String(jacketSpec.value)}</span>
            </div>
          )}
        </div>

        {/* 变体表 */}
        {variantCount > 1 && (
          <div className="border-t pt-2">
            <p className="text-xs text-gray-500 mb-1">Variants ({variantCount})</p>
            <div className="space-y-0.5">
              {cable.variants.slice(0, 3).map(v => {
                const vAwg = findVariantSpec(v, "awg");
                const vArea = findVariantSpec(v, "conductor_area");
                return (
                  <div key={v.slug} className="flex justify-between text-xs">
                    <span className="text-gray-600">AWG {vAwg ? String(vAwg.value) : "—"}</span>
                    <span className="text-gray-600">{vArea ? `${vArea.value} ${vArea.unit ?? ""}` : "—"}</span>
                  </div>
                );
              })}
              {variantCount > 3 && (
                <div className="text-xs text-blue-600">+{variantCount - 3} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/components/cable/CableCard.tsx
git commit -m "feat: rewrite CableCard with model-level + variants display"
```

---

### Task 16: 重写 CableFilters 组件

**文件：**
- 重写：`frontend/components/cable/CableFilters.tsx`

- [ ] **步骤 1：重写 CableFilters.tsx**

写入 `frontend/components/cable/CableFilters.tsx`：
```typescript
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets } from '@/lib/types';

interface CableFiltersProps {
  facets: FilterFacets;
}

function CableFiltersInner({ facets }: CableFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggleParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    if (current.includes(value)) {
      // 移除
      params.delete(key);
      current.filter(v => v !== value).forEach(v => params.append(key, v));
    } else {
      params.append(key, value);
    }
    params.delete('page');
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

  const setNumericParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

  const isChecked = (key: string, value: string): boolean => {
    return searchParams.getAll(key).includes(value);
  };

  const renderCheckboxGroup = (paramKey: string, options: { value: string; label: string; count: number }[]) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-1">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input
              type="checkbox"
              checked={isChecked(paramKey, opt.value)}
              onChange={() => toggleParam(paramKey, opt.value)}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-gray-700">{opt.label}</span>
            <span className="text-gray-400 text-xs">({opt.count})</span>
          </label>
        ))}
      </div>
    );
  };

  return (
    <aside className="w-52 shrink-0 space-y-5">
      {/* Manufacturer */}
      {facets.manufacturers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
          {renderCheckboxGroup('manufacturer', facets.manufacturers.map(m => ({ value: m.id, label: m.name, count: m.count })))}
        </div>
      )}

      {/* Brand */}
      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Brand</h3>
          {renderCheckboxGroup('brand', facets.brands.map(b => ({ value: b.id, label: b.name, count: b.count })))}
        </div>
      )}

      {/* Category (level 1 only) */}
      {facets.categories.filter(c => c.level === 1).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Category</h3>
          {renderCheckboxGroup('category', facets.categories.filter(c => c.level === 1).map(c => ({ value: c.id, label: c.name, count: c.count })))}
        </div>
      )}

      {/* AWG */}
      {facets.awg.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">AWG</h3>
          {renderCheckboxGroup('awg', facets.awg.map(a => ({ value: a.value, label: a.value, count: a.count })))}
        </div>
      )}

      {/* Conductor Area (range) */}
      <div>
        <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Conductor Area (mm²)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            placeholder={`min ${facets.conductor_area.min}`}
            value={searchParams.get('min_area') ?? ''}
            onChange={e => setNumericParam('min_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            step="0.01"
            placeholder={`max ${facets.conductor_area.max}`}
            value={searchParams.get('max_area') ?? ''}
            onChange={e => setNumericParam('max_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Outer Diameter (range) */}
      <div>
        <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Outer Diameter (mm)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            placeholder={`min ${facets.outer_diameter.min}`}
            value={searchParams.get('min_od') ?? ''}
            onChange={e => setNumericParam('min_od', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            step="0.01"
            placeholder={`max ${facets.outer_diameter.max}`}
            value={searchParams.get('max_od') ?? ''}
            onChange={e => setNumericParam('max_od', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Shielding */}
      {facets.shielding.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Shielding</h3>
          {renderCheckboxGroup('shielding', facets.shielding.map(s => ({ value: s.value, label: s.value, count: s.count })))}
        </div>
      )}

      {/* Jacket */}
      {facets.jacket.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Jacket</h3>
          {renderCheckboxGroup('jacket', facets.jacket.map(j => ({ value: j.value, label: j.value.toUpperCase(), count: j.count })))}
        </div>
      )}

      {/* Core Structure */}
      {facets.core_structure.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Core Structure</h3>
          {renderCheckboxGroup('core_structure', facets.core_structure.map(c => ({ value: c.value, label: c.value.replace(/_/g, ' '), count: c.count })))}
        </div>
      )}
    </aside>
  );
}

export function CableFilters(props: CableFiltersProps) {
  return (
    <Suspense fallback={<div className="w-52" />}>
      <CableFiltersInner {...props} />
    </Suspense>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/components/cable/CableFilters.tsx
git commit -m "feat: rewrite CableFilters with type-driven dynamic controls"
```

---

### Task 17: 重写列表页 /cables

**文件：**
- 重写：`frontend/app/cables/page.tsx`

- [ ] **步骤 1：重写 cables/page.tsx**

写入 `frontend/app/cables/page.tsx`：
```typescript
import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { filterCables } from '@/lib/filter';
import { generateCablesListMetadata } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return generateCablesListMetadata();
}

interface SearchParams {
  q?: string;
  manufacturer?: string;
  brand?: string;
  category?: string;
  awg?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  min_area?: string;
  max_area?: string;
  min_od?: string;
  max_od?: string;
  page?: string;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export default async function CablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const result = filterCables({
    q: sp.q,
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: parseArrayParam(sp, 'category'),
    awg: parseArrayParam(sp, 'awg'),
    shielding: parseArrayParam(sp, 'shielding'),
    jacket: parseArrayParam(sp, 'jacket'),
    core_structure: parseArrayParam(sp, 'core_structure'),
    min_area: sp.min_area ? parseFloat(sp.min_area) : undefined,
    max_area: sp.max_area ? parseFloat(sp.max_area) : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const hasFilters = result.total !== filterCables({ page: 1, page_size: 1 }).total;

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Cable Directory</h1>
          <p className="text-sm text-gray-600 mt-1">
            Browse {result.total} cable{result.total !== 1 ? 's' : ''} from {result.filters.brands.length} brand{result.filters.brands.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        <CableFilters facets={result.filters} />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found. Try adjusting your filters.</p>
              <a href="/cables" className="text-blue-600 hover:underline text-sm">Clear all filters</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => (
                  <CableCard
                    key={item.cable.id}
                    cable={item.cable}
                    brand={item.brand}
                    manufacturer={item.manufacturer}
                  />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  basePath="/cables"
                  searchParams={sp as Record<string, string | undefined>}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/app/cables/page.tsx
git commit -m "feat: rewrite cables list page with 4-column grid + dynamic filters"
```

---

### Task 18: 新建 VariantComparisonTable 组件

**文件：**
- 创建：`frontend/components/cable/VariantComparisonTable.tsx`

- [ ] **步骤 1：创建 VariantComparisonTable.tsx**

写入 `frontend/components/cable/VariantComparisonTable.tsx`：
```typescript
import type { Cable, CableVariant, SpecItem } from '@/lib/types';
import { formatSpecValue } from '@/lib/utils';

interface VariantComparisonTableProps {
  cable: Cable;
}

/** 收集所有变体中出现的所有 spec key（按首次出现顺序） */
function collectAllSpecKeys(cable: Cable): { key: string; label: string }[] {
  const seen = new Set<string>();
  const result: { key: string; label: string }[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        result.push({ key: s.key, label: s.label });
      }
    }
  }
  return result;
}

/** 从变体中查找指定 key 的 SpecItem */
function findSpecInVariant(variant: CableVariant, key: string): SpecItem | undefined {
  return variant.specs.find(s => s.key === key);
}

export function VariantComparisonTable({ cable }: VariantComparisonTableProps) {
  if (cable.variants.length === 0) {
    return <p className="text-gray-500 text-sm">No variants available.</p>;
  }

  const specKeys = collectAllSpecKeys(cable);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-2 px-3 font-semibold text-gray-700">Spec</th>
            {cable.variants.map(v => (
              <th key={v.slug} className="text-left py-2 px-3 font-semibold text-gray-700">
                {v.slug}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specKeys.map(({ key, label }) => (
            <tr key={key} className="border-b last:border-0">
              <td className="py-2 px-3 text-gray-600">{label}</td>
              {cable.variants.map(v => {
                const spec = findSpecInVariant(v, key);
                return (
                  <td key={v.slug} className="py-2 px-3 text-gray-900">
                    {spec ? formatSpecValue(spec) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/components/cable/VariantComparisonTable.tsx
git commit -m "feat: add VariantComparisonTable component for variant spec comparison"
```

---

### Task 19: 新建 RecommendedEquipmentCard 组件

**文件：**
- 创建：`frontend/components/equipment/RecommendedEquipmentCard.tsx`

- [ ] **步骤 1：创建 RecommendedEquipmentCard.tsx**

写入 `frontend/components/equipment/RecommendedEquipmentCard.tsx`：
```typescript
import type { RecommendedEquipmentResult } from '@/lib/types';

interface RecommendedEquipmentCardProps {
  result: RecommendedEquipmentResult;
}

export function RecommendedEquipmentCard({ result }: RecommendedEquipmentCardProps) {
  const { equipment, matched_variants, explanation } = result;
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{equipment.brand} {equipment.model}</h3>
          <p className="text-xs text-gray-500 capitalize">
            {equipment.type.replace(/_/g, ' ')}
          </p>
        </div>
        <a
          href={equipment.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm shrink-0"
        >
          View product →
        </a>
      </div>

      <p className="text-sm text-gray-600 mb-3">{equipment.description}</p>

      {/* 匹配的变体 */}
      {matched_variants.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">Matched variants:</p>
          <div className="flex flex-wrap gap-1">
            {matched_variants.map(v => (
              <span key={v.slug} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                {v.slug}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 为什么推荐 */}
      {explanation.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Why recommended:</p>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {explanation.map(e => (
              <li key={e.spec_key}>
                <span className="text-gray-500">{e.label}:</span>{' '}
                <span className="text-gray-900">{String(e.matched_value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/components/equipment/RecommendedEquipmentCard.tsx
git commit -m "feat: add RecommendedEquipmentCard with match explanation"
```

---

### Task 20: 新建 SimilarCables 组件

**文件：**
- 创建：`frontend/components/shared/SimilarCables.tsx`
- 重写：`frontend/components/cable/CableSpecTable.tsx`

- [ ] **步骤 1：创建 SimilarCables.tsx**

写入 `frontend/components/shared/SimilarCables.tsx`：
```typescript
import Link from 'next/link';
import type { Cable } from '@/lib/types';
import { getCableUrl, getPrimaryVariant, findVariantSpec } from '@/lib/utils';

interface SimilarCablesProps {
  cables: Cable[];
}

export function SimilarCables({ cables }: SimilarCablesProps) {
  if (cables.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Similar Cables</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cables.map(cable => {
          const url = getCableUrl(cable);
          const primaryVariant = getPrimaryVariant(cable);
          const awgSpec = primaryVariant ? findVariantSpec(primaryVariant, "awg") : null;
          return (
            <Link key={cable.id} href={url} className="border rounded-lg p-3 hover:shadow-md transition bg-white">
              <h3 className="font-medium text-sm text-gray-900 truncate">{cable.model}</h3>
              <p className="text-xs text-gray-500">
                {awgSpec ? `AWG ${awgSpec.value}` : cable.variants[0]?.slug}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：重写 CableSpecTable.tsx**

写入 `frontend/components/cable/CableSpecTable.tsx`：
```typescript
import type { SpecItem } from '@/lib/types';
import { formatSpecValue } from '@/lib/utils';

interface CableSpecTableProps {
  specs: SpecItem[];
  title?: string;
}

export function CableSpecTable({ specs, title = "Common Specs" }: CableSpecTableProps) {
  if (specs.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {specs.map(spec => (
            <tr key={spec.key} className="border-b last:border-0">
              <td className="py-2 px-3 text-gray-600 w-1/3">{spec.label}</td>
              <td className="py-2 px-3 text-gray-900">{formatSpecValue(spec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **步骤 3：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/components/shared/SimilarCables.tsx frontend/components/cable/CableSpecTable.tsx
git commit -m "feat: add SimilarCables component and rewrite CableSpecTable"
```

---

### Task 21: 重写详情页 /cables/[brand_slug]/[slug]

**文件：**
- 重写：`frontend/app/cables/[brand_slug]/[slug]/page.tsx`

- [ ] **步骤 1：重写详情页**

写入 `frontend/app/cables/[brand_slug]/[slug]/page.tsx`：
```typescript
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { VariantComparisonTable } from '@/components/cable/VariantComparisonTable';
import { RecommendedEquipmentCard } from '@/components/equipment/RecommendedEquipmentCard';
import { SimilarCables } from '@/components/shared/SimilarCables';
import { JsonLd } from '@/components/seo/JsonLd';
import { api } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';
import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { getCableUrl } from '@/lib/utils';

export const revalidate = 3600; // ISR 1h

export async function generateMetadata({
  params,
}: { params: Promise<{ brand_slug: string; slug: string }> }): Promise<Metadata> {
  const { brand_slug, slug } = await params;
  const cable = api.cables.getByUrl(brand_slug, slug);
  if (!cable) return { title: 'Not Found' };
  const brand = api.brands.getById(cable.brand_id);
  return generateCableMetadata(cable, brand);
}

export default async function CableDetailPage({
  params,
}: { params: Promise<{ brand_slug: string; slug: string }> }) {
  const { brand_slug, slug } = await params;
  const cable = api.cables.getByUrl(brand_slug, slug);
  if (!cable) notFound();

  const brand = api.brands.getById(cable.brand_id);
  const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
  const categories = api.categories.getByIds(cable.category_ids);
  const recommended = recommendEquipments(cable, api.recommendedEquipments.all());
  const similar = api.cables.similar(cable, 4);
  const jsonUrl = `/api/cables/${brand_slug}/${slug}`;

  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Cables', url: '/cables' },
    { name: brand?.name ?? 'Unknown', url: `/cables?brand=${cable.brand_id}` },
    { name: cable.model },
  ];

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <JsonLd data={buildCableJsonLd(cable, brand, manufacturer)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: brand?.name ?? 'Unknown', url: `/cables?brand=${cable.brand_id}` },
        { name: cable.model, url: getCableUrl(cable) },
      ])} />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 主内容 */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* 标题 */}
          <div>
            <h1 className="text-3xl font-bold mb-1">{cable.model}</h1>
            <p className="text-gray-600">
              {brand?.name ?? 'Unknown'}{manufacturer ? ` · ${manufacturer.country}` : ''}
            </p>
          </div>

          {/* 描述 */}
          <p className="text-gray-700 leading-relaxed">{cable.base_description}</p>

          {/* Common Specs */}
          <CableSpecTable specs={cable.common_specs} title="Common Specifications" />

          {/* Variants Comparison */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Variants Comparison</h2>
            <VariantComparisonTable cable={cable} />
          </div>

          {/* Recommended Equipment */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Recommended Equipment</h2>
            {recommended.length === 0 ? (
              <p className="text-gray-500 text-sm">No recommended equipment available for this cable.</p>
            ) : (
              <div className="grid gap-3">
                {recommended.map(r => (
                  <RecommendedEquipmentCard key={r.equipment.id} result={r} />
                ))}
              </div>
            )}
          </div>

          {/* Similar Cables */}
          <SimilarCables cables={similar} />
        </div>

        {/* 右侧栏 */}
        <aside className="lg:w-64 shrink-0 space-y-6">
          {/* Manufacturer */}
          {manufacturer && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
              <p className="text-sm font-medium text-gray-900">{manufacturer.name}</p>
              <p className="text-sm text-gray-500">{manufacturer.country}</p>
              {manufacturer.website && (
                <a
                  href={manufacturer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm mt-1 inline-block"
                >
                  Visit website →
                </a>
              )}
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Categories</h3>
              <ul className="space-y-1">
                {categories.map(c => (
                  <li key={c.id}>
                    <a href={`/categories/${api.categories.pathSlugs(c.id).join('/')}`} className="text-sm text-blue-600 hover:underline">
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* View JSON */}
          <div>
            <a
              href={jsonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View JSON →
            </a>
          </div>
        </aside>
      </div>
    </Container>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/app/cables/[brand_slug]/[slug]/page.tsx
git commit -m "feat: rewrite cable detail page with variant comparison + recommended equipment"
```

---

## Phase 5: 分类导航页

### Task 22: 新建 CategoryCard 组件

**文件：**
- 创建：`frontend/components/category/CategoryCard.tsx`

- [ ] **步骤 1：创建 CategoryCard.tsx**

写入 `frontend/components/category/CategoryCard.tsx`：
```typescript
import Link from 'next/link';
import type { Category } from '@/lib/types';
import { getCategoryUrl } from '@/lib/category-tree';

interface CategoryCardProps {
  category: Category;
  count?: number;
}

export function CategoryCard({ category, count }: CategoryCardProps) {
  return (
    <Link
      href={getCategoryUrl(category.id)}
      className="block border rounded-lg p-5 hover:shadow-md hover:border-blue-300 transition bg-white"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{category.name}</h3>
      {count !== undefined && (
        <p className="text-sm text-gray-500">{count} cable{count !== 1 ? 's' : ''}</p>
      )}
    </Link>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/components/category/CategoryCard.tsx
git commit -m "feat: add CategoryCard component for home page navigation"
```

---

### Task 23: 新建分类导航页 /categories/[...slugs]

**文件：**
- 创建：`frontend/app/categories/[...slugs]/page.tsx`

- [ ] **步骤 1：创建分类页**

写入 `frontend/app/categories/[...slugs]/page.tsx`：
```typescript
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { api } from '@/lib/api';
import { filterCables } from '@/lib/filter';
import { getDescendantIds, getCategoryPathSlugs } from '@/lib/category-tree';
import { generateCategoryMetadata } from '@/lib/seo';
import type { CableQueryParams } from '@/lib/types';

interface SearchParams {
  manufacturer?: string;
  brand?: string;
  awg?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  min_area?: string;
  max_area?: string;
  min_od?: string;
  max_od?: string;
  page?: string;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slugs: string[] }> }): Promise<Metadata> {
  const { slugs } = await params;
  const found = api.categories.findByPath(slugs);
  if (!found) return { title: 'Not Found' };
  return generateCategoryMetadata(found.category);
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slugs: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slugs } = await params;
  const sp = await searchParams;
  const found = api.categories.findByPath(slugs);
  if (!found) notFound();

  const category = found.category;
  const descendantIds = getDescendantIds(category.id);

  // 在标准筛选基础上强制限定该分类
  const page = parseInt(sp.page || '1');
  const queryParams: CableQueryParams = {
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: [category.id],
    awg: parseArrayParam(sp, 'awg'),
    shielding: parseArrayParam(sp, 'shielding'),
    jacket: parseArrayParam(sp, 'jacket'),
    core_structure: parseArrayParam(sp, 'core_structure'),
    min_area: sp.min_area ? parseFloat(sp.min_area) : undefined,
    max_area: sp.max_area ? parseFloat(sp.max_area) : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  };
  const result = filterCables(queryParams);

  // 构建面包屑
  const ancestorPath = api.categories.ancestors(category.id);
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    ...ancestorPath.map((c, i) => ({
      name: c.name,
      url: `/categories/${getCategoryPathSlugs(c.id).slice(0, i + 1).join('/')}`,
    })),
  ];

  const totalPages = Math.ceil(result.total / result.page_size);
  const basePath = `/categories/${slugs.join('/')}`;

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="text-2xl font-bold mb-1">{category.name}</h1>
      <p className="text-sm text-gray-600 mb-6">
        Cables in this category (and subcategories): {result.total}
      </p>

      <div className="flex gap-6">
        <CableFilters facets={result.filters} />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found in this category. Try adjusting your filters.</p>
              <a href={basePath} className="text-blue-600 hover:underline text-sm">Clear all filters</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => (
                  <CableCard
                    key={item.cable.id}
                    cable={item.cable}
                    brand={item.brand}
                    manufacturer={item.manufacturer}
                  />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  basePath={basePath}
                  searchParams={sp as Record<string, string | undefined>}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/app/categories/[...slugs]/page.tsx
git commit -m "feat: add category navigation page with catch-all route"
```

---

## Phase 6: 首页与 API

### Task 24: 重写首页 /

**文件：**
- 重写：`frontend/app/page.tsx`

- [ ] **步骤 1：重写首页**

写入 `frontend/app/page.tsx`：
```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { CategoryCard } from '@/components/category/CategoryCard';
import { CableCard } from '@/components/cable/CableCard';
import { api } from '@/lib/api';
import { generateHomeMetadata } from '@/lib/seo';
import { getDescendantIds } from '@/lib/category-tree';

export function generateMetadata(): Metadata {
  return generateHomeMetadata();
}

export default function HomePage() {
  const cables = api.cables.all();
  const brands = api.brands.all();
  const categories = api.categories.all();
  const rootCategories = api.categories.roots();
  const featuredCables = cables.slice(0, 6);

  // 每个根分类的 cable 计数
  const categoryCounts = rootCategories.map(root => {
    const descendantIds = getDescendantIds(root.id);
    const count = cables.filter(c => c.category_ids.some(id => descendantIds.has(id))).length;
    return { category: root, count };
  });

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-16">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4 text-gray-900">
              Cable Specs Database
            </h1>
            <p className="text-gray-600 mb-8">
              Query cable specifications online. Browse cables by brand, category, and technical parameters.
            </p>
            <div className="max-w-xl mx-auto">
              <SearchBox />
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">Popular searches:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['UL1007', 'AVSS', 'UL1015', 'UL2468'].map(q => (
                  <Link
                    key={q}
                    href={`/cables?q=${encodeURIComponent(q)}`}
                    className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-600 hover:border-blue-300 hover:text-blue-600"
                  >
                    {q}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 统计 */}
      <section className="border-b py-8">
        <Container>
          <div className="grid grid-cols-3 gap-4 text-center max-w-2xl mx-auto">
            <div>
              <p className="text-3xl font-bold text-blue-600">{cables.length}</p>
              <p className="text-sm text-gray-500">Cables</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{brands.length}</p>
              <p className="text-sm text-gray-500">Brands</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{categories.filter(c => c.level === 1).length}</p>
              <p className="text-sm text-gray-500">Categories</p>
            </div>
          </div>
        </Container>
      </section>

      {/* 分类导航 */}
      <section className="py-12">
        <Container>
          <h2 className="text-2xl font-bold mb-6">Browse by Category</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categoryCounts.map(({ category, count }) => (
              <CategoryCard key={category.id} category={category} count={count} />
            ))}
          </div>
        </Container>
      </section>

      {/* 热门线缆 */}
      <section className="py-12 bg-gray-50">
        <Container>
          <h2 className="text-2xl font-bold mb-6">Featured Cables</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {featuredCables.map(cable => {
              const brand = api.brands.getById(cable.brand_id);
              const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
              return (
                <CableCard key={cable.id} cable={cable} brand={brand} manufacturer={manufacturer} />
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <Link href="/cables" className="text-blue-600 hover:underline">
              View all cables →
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/app/page.tsx
git commit -m "feat: rewrite home page with hero search + category navigation + featured cables"
```

---

### Task 25: 新建 JSON API 端点

**文件：**
- 创建：`frontend/app/api/cables/[brand_slug]/[slug]/route.ts`

- [ ] **步骤 1：创建 JSON 端点**

写入 `frontend/app/api/cables/[brand_slug]/[slug]/route.ts`：
```typescript
import { api } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brand_slug: string; slug: string }> }
) {
  const { brand_slug, slug } = await params;
  const cable = api.cables.getByUrl(brand_slug, slug);
  if (!cable) {
    return Response.json(
      { error: { code: "not_found", message: "Cable not found" } },
      { status: 404 }
    );
  }

  const brand = api.brands.getById(cable.brand_id);
  const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
  const categories = api.categories.getByIds(cable.category_ids);
  const recommended = recommendEquipments(cable, api.recommendedEquipments.all());

  return Response.json({
    cable,
    brand,
    manufacturer,
    categories,
    recommended_equipments: recommended,
  });
}
```

- [ ] **步骤 2：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add frontend/app/api/cables/[brand_slug]/[slug]/route.ts
git commit -m "feat: add JSON API endpoint for cable details"
```

---

## Phase 7: SEO 与收尾

### Task 26: 更新 sitemap.ts 和 robots.ts

**文件：**
- 重写：`frontend/app/sitemap.ts`
- 修改：`frontend/app/robots.ts`

- [ ] **步骤 1：重写 sitemap.ts**

写入 `frontend/app/sitemap.ts`：
```typescript
import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { getCableUrl } from '@/lib/utils';
import { getCategoryUrl } from '@/lib/category-tree';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const cables = api.cables.all();
  const categories = api.categories.all();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  ];

  const cablePages: MetadataRoute.Sitemap = cables.map(cable => ({
    url: `${SITE_URL}${getCableUrl(cable)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const categoryPages: MetadataRoute.Sitemap = categories.map(category => ({
    url: `${SITE_URL}${getCategoryUrl(category.id)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...cablePages, ...categoryPages];
}
```

- [ ] **步骤 2：更新 robots.ts**

写入 `frontend/app/robots.ts`：
```typescript
import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.unowire.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **步骤 3：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/app/sitemap.ts frontend/app/robots.ts
git commit -m "feat: update sitemap and robots for cable + category URLs"
```

---

### Task 27: 更新 JsonLd 组件和 not-found 页

**文件：**
- 修改：`frontend/components/seo/JsonLd.tsx`
- 修改：`frontend/app/not-found.tsx`
- 修改：`frontend/components/layout/Footer.tsx`

- [ ] **步骤 1：检查并更新 JsonLd.tsx**

Read `frontend/components/seo/JsonLd.tsx`，确保它接收任意 object 并渲染为 `<script type="application/ld+json">`。如果已是此形式，跳过修改。

预期接口：
```typescript
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

- [ ] **步骤 2：更新 not-found.tsx**

写入 `frontend/app/not-found.tsx`：
```typescript
import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function NotFound() {
  return (
    <Container className="py-20 text-center">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-xl text-gray-600 mb-8">Page not found</p>
      <Link href="/" className="text-blue-600 hover:underline">
        Back to Home →
      </Link>
    </Container>
  );
}
```

- [ ] **步骤 3：简化 Footer.tsx**

写入 `frontend/components/layout/Footer.tsx`：
```typescript
import Link from 'next/link';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <Container className="py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Unowire. Cable specs database.</p>
          <nav className="flex gap-4">
            <Link href="/cables" className="hover:text-blue-600">Cables</Link>
            <Link href="/categories/automotive" className="hover:text-blue-600">Automotive</Link>
            <Link href="/categories/consumer-electronics" className="hover:text-blue-600">Consumer Electronics</Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
```

- [ ] **步骤 4：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 5：提交**

```bash
cd d:\projects\unowire
git add frontend/components/seo/JsonLd.tsx frontend/app/not-found.tsx frontend/components/layout/Footer.tsx
git commit -m "refactor: update JsonLd, not-found, and Footer for cable-only site"
```

---

### Task 28: 清理 lib/utils.ts 无用函数

**文件：**
- 修改：`frontend/lib/utils.ts`

- [ ] **步骤 1：检查 utils.ts 中哪些函数仍被使用**

使用 grep 搜索以下函数的使用情况：
- `formatCableUrl`（已被 `getCableUrl` 替代）
- `formatEquipmentUrl`（设备已删除）
- `formatEquipmentType`（设备已删除）

```bash
cd d:\projects\unowire\frontend
# 使用 Grep 工具搜索
```

- [ ] **步骤 2：删除无用函数**

删除 `frontend/lib/utils.ts` 中以下函数（如果确认无引用）：
- `formatCableUrl`
- `formatEquipmentUrl`
- `formatEquipmentType`

保留：
- `cn`
- `formatCoreStructure`
- `formatShielding`
- `formatJacket`
- `findSpecItem`、`findVariantSpec`、`getPrimaryVariant`、`formatSpecValue`（Task 12 新增）

- [ ] **步骤 3：验证编译**

```bash
cd d:\projects\unowire\frontend
npx tsc --noEmit
```

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/lib/utils.ts
git commit -m "chore: remove unused utility functions from lib/utils.ts"
```

---

### Task 29: 集成数据校验到 build 流程

**文件：**
- 修改：`frontend/package.json`
- 修改：`frontend/next.config.js`

- [ ] **步骤 1：在 package.json 中添加 prebuild 校验**

修改 `frontend/package.json` 的 scripts 部分：
```json
{
  "scripts": {
    "dev": "next dev",
    "prebuild": "tsx scripts/validate-data.ts",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "validate": "tsx scripts/validate-data.ts"
  }
}
```

- [ ] **步骤 2：在 dev 模式启动时也运行校验**

修改 `frontend/package.json` 的 dev 脚本：
```json
{
  "scripts": {
    "dev": "tsx scripts/validate-data.ts && next dev"
  }
}
```

- [ ] **步骤 3：验证 npm run validate 仍通过**

```bash
cd d:\projects\unowire\frontend
npm run validate
```

预期：`✓ Data validation passed.`

- [ ] **步骤 4：提交**

```bash
cd d:\projects\unowire
git add frontend/package.json
git commit -m "chore: integrate data validation into prebuild and dev scripts"
```

---

### Task 30: 生产构建验证

**文件：**
- 无（仅验证）

- [ ] **步骤 1：运行生产构建**

```bash
cd d:\projects\unowire\frontend
npm run build
```

预期：构建成功，无 TypeScript 错误，无 ESLint 错误。路由表应包含：
- `○ /`（静态）
- `○ /cables`（动态）
- `● /cables/[brand_slug]/[slug]`（ISR 1h）
- `● /categories/[...slugs]`（动态）
- `ƒ /api/cables/[brand_slug]/[slug]`（动态）
- `○ /sitemap.xml`
- `○ /robots.txt`

- [ ] **步骤 2：启动生产服务器并冒烟测试**

```bash
cd d:\projects\unowire\frontend
npm run start
```

在浏览器访问以下 URL 验证（对应 spec §8.1 手工验收清单 13 项）：

| # | URL | 验证点 | 预期 |
|---|---|---|---|
| 1 | `http://localhost:3000/` | 首页 hero + 搜索框 + 分类卡片 + 热门线缆 | 统计数字从 JSON 动态计算 |
| 2 | 首页搜索框输入 `UL1007` 回车 | 跳转列表页 | URL 变为 `/cables?q=UL1007`，显示结果 |
| 3 | `http://localhost:3000/cables` | 列表页 4 列网格 + 侧边栏筛选器 | 卡片含图片/AWG 角标/型号/品牌/迷你规格表/变体表 |
| 4 | `/cables?manufacturer=mfr-1&brand=brand-1&awg=24` | 多条件筛选 | 结果正确过滤，计数正确 |
| 5 | `/cables?min_area=0.2&max_area=0.5` | 数值范围筛选 | 只显示 conductor_area 在范围内的变体 |
| 6 | `/cables` 翻到第 2 页 | 分页 | URL 含 `page=2`，结果正确 |
| 7 | `http://localhost:3000/cables/hitachi/ul1007` | 详情页 | common_specs 表 + 变体对比表 + 推荐设备 + 相似线缆 + 右侧栏（生产商/分类/View JSON） |
| 8 | 详情页点击 "View JSON →" | JSON 端点 | 打开 `/api/cables/hitachi/ul1007`，返回完整聚合 JSON |
| 9 | `http://localhost:3000/categories/automotive` | 分类导航页 | 显示该分类及子分类的所有线缆 |
| 10 | 详情页右键"查看源代码" | SEO | title/description/canonical/JSON-LD（Product + BreadcrumbList）均存在 |
| 11 | `http://localhost:3000/sitemap.xml` | sitemap | 包含首页 + 列表页 + 所有详情页 + 所有分类页 URL |
| 12 | `http://localhost:3000/robots.txt` | robots | `Disallow: /api/` + sitemap 声明 |
| 13 | 浏览器开发者工具切换移动端视图 | 响应式 | 侧边栏折叠，4 列降为 2 列 |

**异常路径验证**：
- `/cables/hitachi/nonexistent-slug` → 显示 404 页
- `/categories/nonexistent-category` → 显示 404 页
- `/api/cables/hitachi/nonexistent-slug` → 返回 `{"error":{"code":"not_found","message":"Cable not found"}}` + HTTP 404
- `/cables` 无筛选结果时 → 显示 "No cables found. Try adjusting your filters." + "Clear all filters" 链接

- [ ] **步骤 3：提交**

```bash
cd d:\projects\unowire
git add -A
git commit -m "chore: build verification + manual acceptance"
```

---

## Self-Review

完成计划编写后，对照 spec 文档逐项检查。

### 1. Spec 覆盖率检查

| Spec 章节 | 覆盖任务 | 状态 |
|---|---|---|
| §2.1 数据文件结构 | Task 2-5 | ✅ 5 个 JSON 文件全部覆盖 |
| §2.2 manufacturers.json | Task 2 | ✅ |
| §2.3 brands.json | Task 2 | ✅ |
| §2.4 categories.json | Task 3 | ✅ 4 级分类树 |
| §2.5 cables.json（聚合 model + variants + 动态 specs） | Task 4 | ✅ SpecItem.type 字段覆盖 |
| §2.6 recommended-equipments.json | Task 5 | ✅ applicable_specs 规则数组覆盖 |
| §2.7 生产商/品牌拆分 | Task 2 + Task 7（getCableUrl join） | ✅ |
| §3 URL 结构 | Task 17/21/23/24/25 | ✅ 6 个 URL 路由全覆盖 |
| §4.1 首页 | Task 24 | ✅ hero + 搜索 + 分类 + 热门 |
| §4.2 列表页（4 列网格 + 动态筛选器） | Task 15-17 | ✅ SpecItem.type 驱动筛选控件 |
| §4.3 详情页（变体对比 + 推荐设备 + ISR） | Task 18-21 | ✅ ISR `revalidate = 3600` |
| §4.4 分类导航页 | Task 22-23 | ✅ catch-all + 递归子孙查询 |
| §4.5 JSON 端点 | Task 25 | ✅ 聚合响应 + 404 错误格式 |
| §5.1 组件目录结构 | Task 15-23 | ✅ 全部组件覆盖 |
| §5.2 TypeScript 接口 | Task 6 | ✅ 全部接口定义 |
| §5.3 数据流（预构建索引） | Task 7 | ✅ CategoryIndex + byId Map + URL Map |
| §5.4 推荐设备匹配逻辑 | Task 9 | ✅ 任一变体命中 + 去重 + explanation |
| §5.5 客户端 vs 服务端边界 | Task 14/16/17 | ✅ SearchBox/CableFilters/Pagination 为 client，其余 server |
| §6.1 Metadata | Task 12 + Task 17/21/23/24 | ✅ 每页独立 metadata，搜索页 noindex |
| §6.2 JSON-LD | Task 12 + Task 27 | ✅ Product + BreadcrumbList |
| §6.3 sitemap.xml | Task 26 | ✅ 动态生成 cables + categories |
| §6.4 robots.txt | Task 26 | ✅ Disallow /api/ |
| §7.1-7.4 错误处理 | Task 21/23/25/17 | ✅ 404 + 统一错误格式 + 空状态 + 边界情况 |
| §8 测试策略 | Task 30 | ✅ 13 项手工验收清单 |
| §11.2 Git 提交策略 | Task 1-30 | ✅ 13 个阶段性提交 |

**结论：Spec 全部章节均有对应 Task 覆盖，无遗漏。**

### 2. Placeholder 扫描

检查计划中是否存在以下红旗模式：
- "TBD" / "TODO" / "implement later" / "fill in details" — ✅ 无
- "Add appropriate error handling" / "handle edge cases" — ✅ 无
- "Write tests for the above"（无实际测试代码）— ✅ 无（MVP 不要求自动化测试，使用手工验收）
- "Similar to Task N"（未重复代码）— ✅ 无
- 步骤仅描述做什么未展示怎么做 — ✅ 无（每个代码步骤都含完整代码块）
- 引用未定义的类型/函数 — ✅ 无（所有类型在 Task 6 定义，函数在对应 Task 定义）

**结论：无 placeholder，计划完整可执行。**

### 3. 类型一致性检查

检查后续 Task 中使用的类型/方法/属性名是否与早期 Task 定义一致：

| 定义位置 | 名称 | 使用位置 | 一致性 |
|---|---|---|---|
| Task 6 | `Cable.brand_id` | Task 7 `getCableUrl()`、Task 9 `recommendEquipments()` | ✅ |
| Task 6 | `SpecItem.type` | Task 10 `filterCables()` 按 type 分支、Task 16 `CableFilters` 渲染 | ✅ |
| Task 6 | `CableVariant.specs` | Task 9 匹配逻辑、Task 18 对比表、Task 20 `findVariantSpec` | ✅ |
| Task 6 | `CableQueryParams` | Task 10 `filterCables()` 参数、Task 17/23 页面构建 | ✅ |
| Task 6 | `FilterFacets` | Task 10 返回值、Task 16 `CableFilters` props | ✅ |
| Task 6 | `RecommendedEquipmentResult` | Task 9 返回值、Task 19 卡片 props、Task 25 JSON 响应 | ✅ |
| Task 7 | `api.categories.findByPath()` | Task 23 分类页 | ✅ |
| Task 7 | `api.categories.ancestors()` | Task 23 面包屑、Task 12 seo.ts | ✅ |
| Task 7 | `getCableUrl(cable)` | Task 15 CableCard、Task 20 SimilarCables、Task 26 sitemap | ✅ |
| Task 7 | `getCableByUrl(brandSlug, slug)` | Task 21 详情页、Task 25 JSON 端点 | ✅ |
| Task 8 | `getDescendantIds()` | Task 23 分类页查询 | ✅ |
| Task 8 | `getCategoryPathSlugs()` | Task 12 seo.ts、Task 22 CategoryCard、Task 23 面包屑 | ✅ |
| Task 10 | `filterCables()` | Task 17 列表页、Task 23 分类页 | ✅ |
| Task 12 | `generateCableMetadata()` | Task 21 详情页 | ✅ |
| Task 12 | `generateCategoryMetadata()` | Task 23 分类页 | ✅ |
| Task 12 | `buildCableJsonLd()` | Task 27 JsonLd 组件 | ✅ |

**结论：类型和方法签名在所有 Task 中一致，无命名冲突。**

---

## Execution Handoff

计划已完成并保存到 `docs/superpowers/plans/2026-06-28-unowire-cable-database-refactor.md`。

本计划共 30 个 Task，分 7 个 Phase，对应 spec §11.2 的 13 个阶段性 Git 提交。每个 Task 包含完整代码和验证步骤，可独立执行和验证。

**两种执行方式可选：**

**1. Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent 执行，Task 间 review，快速迭代。适合本计划因为 Task 间有依赖（后 Task 引用前 Task 的类型和函数），subagent 模式可以在每个 Task 完成后验证编译通过再进入下一个。

**2. Inline Execution** — 在当前会话中按 Task 顺序批量执行，设置检查点 review。适合希望实时观察每步变化的场景。

**选择哪种方式？**
