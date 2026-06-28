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
