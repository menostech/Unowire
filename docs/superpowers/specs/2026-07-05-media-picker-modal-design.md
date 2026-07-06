# Media Picker Modal — Design Spec

**Date**: 2026-07-05
**Topic**: 为所有管理后台表单添加媒体选择器弹窗，替代手动复制粘贴 URL 的方式

## 1. 背景与问题

当前项目有 6 个管理后台表单（Cable / Brand / Manufacturer / Industry / Category / ProductType），其中 5 个有 `image_url` 字段但采用极简的交互方式：纯文本输入框 + 一个在新标签页打开 `/admin/media` 的链接，用户必须手动跨标签页复制 URL 再粘贴回表单。

存在的问题：
- **无媒体选择器组件** — 用户无法在表单内直接选图
- **CableForm 完全没有图片字段**
- **BrandForm 和 ProductTypeForm 有 bug** — UI 上有图片字段且可编辑，但提交 body 中未包含 `image_url`，保存时被静默丢弃
- **ProductTypeForm 的 initial 类型未声明 `image_url`** — 类型不安全
- **MediaUploader 的 `onUploaded` 回调不带参数** — 无法得知新上传文件的 URL
- **MediaGrid 无选择模式** — 纯管理视图，无 `onSelect` 回调
- **无模态框基础设施** — 但 MediaGrid 的 Move 对话框已有 `fixed inset-0 bg-black/50` 先例

## 2. 方案选择

### 方案A：自定义 Modal 组件（已选定）

用项目已有的 `fixed inset-0 bg-black/50` 模式构建 `MediaPickerModal`。给 `MediaGrid` 新增可选的 `onSelect` 回调进入"选择模式"，点击缩略图即选中并关闭弹窗。`MediaUploader` 的 `onUploaded` 回调增加 URL 参数。

- **优点**：无新依赖，与现有代码风格一致，改动集中在少数文件
- **缺点**：手动实现模态框（无 focus trap、无动画），但项目已有先例

### 未选方案

- **方案B：Radix UI Dialog** — 专业级无障碍支持，但引入新依赖，与现有手写模态框风格不一致
- **方案C：右侧抽屉面板** — 不遮挡表单，但 600px 宽度内文件夹树 + 图片网格过于拥挤

## 3. 组件架构

### 新建组件

```
MediaPickerModal (弹窗容器)
├── 顶部栏: 标题 + Upload 切换按钮 + 关闭按钮
├── MediaUploader (条件渲染, 上传新图片)
├── 左侧: FolderTree (文件夹导航)
└── 右侧: MediaGrid (选择模式, 点击缩略图即选中)

ImageFieldWithPicker (表单内可复用字段)
├── 文本输入框 (显示 url_path, 可手动编辑)
├── "Media" 按钮 → 打开 MediaPickerModal
└── 小预览图
```

### 组件接口

**MediaPickerModal**:
```ts
interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (urlPath: string) => void;
}
```

**ImageFieldWithPicker**:
```ts
interface ImageFieldWithPickerProps {
  label?: string;           // 默认 "Image URL"
  value: string;            // 当前 url_path
  onChange: (url: string) => void;
}
```

### 交互流程

1. 用户点击表单中的 "Media" 按钮 → 弹窗打开
2. 弹窗显示完整的媒体库（文件夹树 + 图片网格）
3. 用户点击某张图片 → 调用 `onSelect(url_path)` → 弹窗自动关闭
4. 或者用户点 "Upload" 上传新图片 → 上传完后图片出现在网格中 → 再点击选中
5. 点击遮罩层或关闭按钮或按 Escape → 关闭弹窗

## 4. MediaPickerModal 详细设计

**文件**: `frontend/components/admin/form/MediaPickerModal.tsx`

模态框结构复用 MediaGrid Move 对话框的 `fixed inset-0` 模式：

```tsx
{open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col mx-4">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-bold">Select Media</h2>
        <div className="flex items-center gap-3">
          <button onClick={toggleUpload}>Upload</button>
          <button onClick={onClose}>✕</button>
        </div>
      </div>

      {/* 可选上传区 */}
      {uploaderOpen && (
        <div className="border-b p-4">
          <MediaUploader onUploaded={handleUploaded} />
        </div>
      )}

      {/* 主体: 文件夹树 + 图片网格 */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r overflow-y-auto p-2">
          <FolderTree ... />
        </aside>
        <div className="flex-1 overflow-y-auto p-4">
          <MediaGrid onSelect={handleSelect} ... />
        </div>
      </div>
    </div>
  </div>
)}
```

### 关键行为

- `handleSelect(urlPath)`: 调用 `onSelect(urlPath)` 后立即 `onClose()`
- `handleUploaded(urlPath)`: 上传完成后刷新 MediaGrid（自增 `gridRefreshKey`），但不自动选中 — 用户可能需要上传多张，最后再选一张
- 状态管理: `folders`、`selectedFolder`、`toast`、`uploaderOpen`、`gridRefreshKey`，与媒体库页面类似但内嵌在弹窗内
- Escape 键监听: `useEffect` 中添加 `keydown` 事件监听，按 Escape 调用 `onClose()`

## 5. 现有组件改动

### MediaGrid 改动

新增可选 prop:
```ts
onSelect?: (urlPath: string) => void;
```

选择模式行为:
- 当 `onSelect` prop 存在时，每个缩略图添加 `onClick={() => onSelect(upload.url_path)}`
- 缩略图鼠标指针变为 `cursor-pointer`
- hover 时额外显示 "Select" 提示遮罩
- 点击缩略图任意位置触发选中，操作栏按钮 `stopPropagation` 阻止冒泡
- 无 `onSelect` 时保持现有行为不变（向后兼容）

### MediaUploader 改动

`onUploaded` 签名变更:
```ts
// 之前
onUploaded?: () => void;
// 之后
onUploaded?: (urlPath: string) => void;
```

在 `processUpload` 成功后，调用 `onUploaded(result.url_path)` 而非无参数调用。

现有媒体库页面的调用方适配: 忽略传入的参数即可 (`onUploaded={() => handleUploaded()}`)。

## 6. 表单集成设计

### ImageFieldWithPicker 组件

**文件**: `frontend/components/admin/form/ImageFieldWithPicker.tsx`

渲染结构:
- 文本输入框（显示 url_path，可手动编辑）
- "Media" 按钮 → 打开 MediaPickerModal
- 小预览图（当 value 非空时显示）
- 内部维护 `pickerOpen` 状态
- MediaPickerModal 的 `onSelect` → `onChange(urlPath)` → 关闭弹窗

### 各表单改动

| 表单 | 改动内容 |
|------|---------|
| **CableForm** | 新增 `image_url` 状态 + ImageFieldWithPicker + 提交 body 加 `image_url` |
| **BrandForm** | 替换现有图片字段为 ImageFieldWithPicker + 修复 bug: body 加 `image_url` |
| **ProductTypeForm** | 替换现有图片字段为 ImageFieldWithPicker + 修复 bug: body 加 `image_url` + initial 类型加 `image_url` |
| **ManufacturerForm** | 替换现有图片字段为 ImageFieldWithPicker（已有 body，无 bug） |
| **IndustryForm** | 替换现有图片字段为 ImageFieldWithPicker（已有 body，无 bug） |
| **CategoryForm** | 替换现有图片字段为 ImageFieldWithPicker（已有 body，无 bug） |

### 媒体库页面适配

`app/admin/(dashboard)/media/page.tsx` 中调用 MediaUploader 的地方适配新回调签名:
```tsx
// 之前
<MediaUploader onUploaded={handleUploaded} />
// 之后
<MediaUploader onUploaded={() => handleUploaded()} />
```

## 7. 后端扩展（Cable image_url）

Cable 模型当前没有 `image_url` 字段，需要扩展:

- **模型** (`backend/app/models/cable.py`): Cable 类添加 `image_url: Mapped[str | None] = mapped_column(Text)`
- **Schema** (`backend/app/schemas/cable.py`): CableRead / CableCreate / CableUpdate 添加 `image_url: str | None = None`
- **Alembic 迁移**: `ALTER TABLE cables ADD COLUMN image_url TEXT` (nullable)
- **前端类型** (`frontend/lib/types.ts`): Cable 接口添加 `image_url: string | null`

## 8. 完整改动文件清单

| 层 | 文件 | 改动类型 |
|----|------|---------|
| 新组件 | `frontend/components/admin/form/MediaPickerModal.tsx` | 新建 |
| 新组件 | `frontend/components/admin/form/ImageFieldWithPicker.tsx` | 新建 |
| 改动 | `frontend/components/admin/media/MediaGrid.tsx` | 加 `onSelect` prop |
| 改动 | `frontend/components/admin/form/MediaUploader.tsx` | `onUploaded` 加 URL 参数 |
| 改动 | `frontend/components/admin/form/CableForm.tsx` | 加 image_url 字段 + ImageFieldWithPicker |
| 改动 | `frontend/components/admin/form/BrandForm.tsx` | 替换为 ImageFieldWithPicker + 修复 body bug |
| 改动 | `frontend/components/admin/form/ManufacturerForm.tsx` | 替换为 ImageFieldWithPicker |
| 改动 | `frontend/components/admin/form/IndustryForm.tsx` | 替换为 ImageFieldWithPicker |
| 改动 | `frontend/components/admin/form/CategoryForm.tsx` | 替换为 ImageFieldWithPicker |
| 改动 | `frontend/components/admin/form/ProductTypeForm.tsx` | 替换为 ImageFieldWithPicker + 修复 body bug + 修复类型 |
| 改动 | `frontend/app/admin/(dashboard)/media/page.tsx` | 适配 MediaUploader 新回调签名 |
| 后端 | `backend/app/models/cable.py` | 加 image_url 字段 |
| 后端 | `backend/app/schemas/cable.py` | 加 image_url 字段 |
| 后端 | Alembic 迁移文件 | cables 表加 image_url 列 |
| 前端 | `frontend/lib/types.ts` | Cable 接口加 image_url |

## 9. 错误处理与验证

- 文件夹列表加载失败 → 显示 toast 错误提示（复用现有 `onToast` 模式）
- 图片网格加载失败 → MediaGrid 已有空状态显示
- 上传失败 → MediaUploader 已有 per-item 错误显示
- 弹窗打开时键盘 Escape → 关闭弹窗
- 文本输入框不做 URL 格式校验（保持与现有行为一致）
- 空值允许（image_url 非必填）

## 10. 烟雾测试场景（8）

1. 点击 BrandForm 的 Media 按钮 → 弹窗打开，显示文件夹树和图片网格
2. 点击弹窗内某张图片 → 弹窗关闭，文本输入框填入 url_path，预览图显示
3. 弹窗内点 Upload → 显示上传区域 → 上传一张新图 → 网格刷新显示新图
4. 弹窗内切换文件夹 → 网格同步刷新
5. 按 Escape → 弹窗关闭，不改变原值
6. CableForm 保存带 image_url → 后端存储成功 → 重新打开编辑页显示该图片
7. BrandForm 保存（修复后）→ image_url 正确存入数据库
8. ProductTypeForm 保存（修复后）→ image_url 正确存入数据库
