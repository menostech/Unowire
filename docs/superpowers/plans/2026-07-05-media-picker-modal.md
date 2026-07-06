# Media Picker Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual URL copy-paste across all 6 admin forms with a modal-based media picker that lets users browse existing images and upload new ones directly from within any form.

**Architecture:** A new `MediaPickerModal` component wraps the existing `FolderTree`, `MediaGrid`, and `MediaUploader` inside a `fixed inset-0` overlay. A reusable `ImageFieldWithPicker` component embeds the modal trigger button + text input + preview, replacing the duplicated image-URL boilerplate in every form. `MediaGrid` gains an optional `onSelect` callback for "select mode"; `MediaUploader`'s `onUploaded` callback gains a `urlPath` parameter. Cable model/schema gets a new nullable `image_url` column via Alembic migration. BrandForm and ProductTypeForm body bugs are fixed as part of the integration.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic 2

---

## File Structure

| File | Responsibility |
|------|---------------|
| `frontend/components/admin/form/MediaPickerModal.tsx` | **New.** Modal overlay that wraps FolderTree + MediaGrid + MediaUploader for image selection |
| `frontend/components/admin/form/ImageFieldWithPicker.tsx` | **New.** Reusable form field: text input + "Media" button + preview + modal trigger |
| `frontend/components/admin/media/MediaGrid.tsx` | **Modify.** Add optional `onSelect` prop for select mode |
| `frontend/components/admin/form/MediaUploader.tsx` | **Modify.** `onUploaded` callback gains `urlPath` parameter |
| `frontend/app/admin/(dashboard)/media/page.tsx` | **Modify.** Adapt to new `onUploaded` signature |
| `frontend/components/admin/form/CableForm.tsx` | **Modify.** Add `image_url` state + ImageFieldWithPicker + body field |
| `frontend/components/admin/form/BrandForm.tsx` | **Modify.** Replace boilerplate with ImageFieldWithPicker + fix body bug |
| `frontend/components/admin/form/ManufacturerForm.tsx` | **Modify.** Replace boilerplate with ImageFieldWithPicker |
| `frontend/components/admin/form/IndustryForm.tsx` | **Modify.** Replace boilerplate with ImageFieldWithPicker |
| `frontend/components/admin/form/CategoryForm.tsx` | **Modify.** Replace boilerplate with ImageFieldWithPicker |
| `frontend/components/admin/form/ProductTypeForm.tsx` | **Modify.** Replace boilerplate with ImageFieldWithPicker + fix body bug + fix initial type |
| `frontend/lib/types.ts` | **Modify.** Add `image_url` to Cable interface |
| `backend/app/models/cable.py` | **Modify.** Add `image_url` column to Cable model |
| `backend/app/schemas/cable.py` | **Modify.** Add `image_url` to CableRead/CableCreate/CableUpdate |
| `backend/alembic/versions/b2c3d4e5f6a7_add_cable_image_url.py` | **New.** Migration to add `image_url` column to cables table |

---

## Phase 1: Backend — Cable image_url

### Task 1: Add image_url to Cable model

**Files:**
- Modify: `backend/app/models/cable.py:46-49`

- [ ] **Step 1: Add Text import and image_url column**

In `backend/app/models/cable.py`, add `Text` to the sqlalchemy import on line 3, then add the `image_url` column after `meta_description` (line 48):

```python
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
```

Add after line 48 (`meta_description`):
```python
    image_url: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/cable.py
git commit -m "feat(backend): add image_url column to Cable model"
```

---

### Task 2: Add image_url to Cable schemas

**Files:**
- Modify: `backend/app/schemas/cable.py:32-50` (CableRead), `127-142` (CableCreate), `150-163` (CableUpdate)

- [ ] **Step 1: Add image_url to CableRead**

In `backend/app/schemas/cable.py`, add after `meta_description` in `CableRead` (line 43):

```python
    image_url: str | None = None
```

- [ ] **Step 2: Add image_url to CableCreate**

Add after `meta_description` in `CableCreate` (line 138):

```python
    image_url: str | None = None
```

- [ ] **Step 3: Add image_url to CableUpdate**

Add after `meta_description` in `CableUpdate` (line 160):

```python
    image_url: str | None = None
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/cable.py
git commit -m "feat(backend): add image_url to Cable schemas"
```

---

### Task 3: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/b2c3d4e5f6a7_add_cable_image_url.py`

- [ ] **Step 1: Write migration file**

Create `backend/alembic/versions/b2c3d4e5f6a7_add_cable_image_url.py`:

```python
"""add cable image_url

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cables', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('cables', 'image_url')
```

- [ ] **Step 2: Run migration**

```bash
docker compose exec backend alembic upgrade head
```

Expected: `Running upgrade a1b2c3d4e5f6 -> b2c3d4e5f6a7, add cable image_url`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/b2c3d4e5f6a7_add_cable_image_url.py
git commit -m "feat(backend): add alembic migration for cable image_url"
```

---

### Task 4: Add image_url to frontend Cable type

**Files:**
- Modify: `frontend/lib/types.ts:100-116` (Cable interface)

- [ ] **Step 1: Add image_url to Cable interface**

In `frontend/lib/types.ts`, add after `meta_description` in the `Cable` interface (line 113):

```typescript
  image_url: string | null;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(frontend): add image_url to Cable type"
```

---

## Phase 2: Core Components — MediaUploader + MediaGrid + MediaPickerModal

### Task 5: Update MediaUploader onUploaded callback

**Files:**
- Modify: `frontend/components/admin/form/MediaUploader.tsx:15-18` (props), `46` (callback call)

- [ ] **Step 1: Change onUploaded signature**

In `frontend/components/admin/form/MediaUploader.tsx`, change the props interface (line 17):

```typescript
interface MediaUploaderProps {
  folderId?: number;
  onUploaded?: (urlPath: string) => void;
}
```

- [ ] **Step 2: Pass url_path in callback**

Change line 46 from:

```typescript
      if (onUploaded) onUploaded();
```

to:

```typescript
      if (onUploaded) onUploaded(result.url_path);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/MediaUploader.tsx
git commit -m "feat(frontend): pass urlPath to MediaUploader onUploaded callback"
```

---

### Task 6: Adapt media library page to new onUploaded signature

**Files:**
- Modify: `frontend/app/admin/(dashboard)/media/page.tsx:26-29` (handleUploaded), `65` (JSX)

- [ ] **Step 1: Update handleUploaded to accept and ignore urlPath**

In `frontend/app/admin/(dashboard)/media/page.tsx`, change the `handleUploaded` callback (line 26-29) to accept a parameter it ignores:

```typescript
  const handleUploaded = useCallback((_urlPath: string) => {
    refreshFolders();
    setGridRefreshKey(k => k + 1);
  }, [refreshFolders]);
```

- [ ] **Step 2: Verify JSX already passes handleUploaded directly**

Line 65 reads `<MediaUploader folderId={currentFolderId} onUploaded={handleUploaded} />`. Since `handleUploaded` now accepts `(_urlPath: string)`, this is already compatible — no JSX change needed.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/admin/(dashboard)/media/page.tsx
git commit -m "fix(frontend): adapt media page to new onUploaded signature"
```

---

### Task 7: Add onSelect prop to MediaGrid

**Files:**
- Modify: `frontend/components/admin/media/MediaGrid.tsx:15-21` (props), `23` (destructure), `119-131` (thumbnail)

- [ ] **Step 1: Add onSelect to props interface**

In `frontend/components/admin/media/MediaGrid.tsx`, add `onSelect` to the props interface (after line 20):

```typescript
interface MediaGridProps {
  folderId: FolderFilter;
  folders: Folder[];
  onToast: (message: string) => void;
  onFoldersChanged: () => void;
  refreshKey?: number;
  onSelect?: (urlPath: string) => void;
}
```

- [ ] **Step 2: Destructure onSelect in component**

Change line 23 from:

```typescript
export function MediaGrid({ folderId, folders, onToast, onFoldersChanged, refreshKey }: MediaGridProps) {
```

to:

```typescript
export function MediaGrid({ folderId, folders, onToast, onFoldersChanged, refreshKey, onSelect }: MediaGridProps) {
```

- [ ] **Step 3: Add click handler and cursor style to thumbnail container**

Change the thumbnail container `<div>` (lines 119-126) from:

```tsx
            <div
              key={upload.id}
              className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(upload.id);
              }}
            >
```

to:

```tsx
            <div
              key={upload.id}
              className={`relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
              onClick={onSelect ? (e) => {
                // Don't trigger select if clicking an action button
                if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
                onSelect(upload.url_path);
              } : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(upload.id);
              }}
            >
```

- [ ] **Step 4: Add "Select" hover hint when in select mode**

Add after the existing hover overlay div (after line 180, before the filename div), a conditional select hint:

```tsx
              {onSelect && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="px-3 py-1 bg-white/90 rounded text-sm font-medium text-blue-700">Select</span>
                </div>
              )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/media/MediaGrid.tsx
git commit -m "feat(frontend): add onSelect prop to MediaGrid for select mode"
```

---

### Task 8: Create MediaPickerModal component

**Files:**
- Create: `frontend/components/admin/form/MediaPickerModal.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/components/admin/form/MediaPickerModal.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Upload } from 'lucide-react';
import { FolderTree, type FolderSelection } from '@/components/admin/media/FolderTree';
import { MediaGrid } from '@/components/admin/media/MediaGrid';
import { MediaUploader } from '@/components/admin/form/MediaUploader';
import { listFolders, type Folder } from '@/lib/clientFolders';

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (urlPath: string) => void;
}

export function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);

  const refreshFolders = useCallback(async () => {
    try {
      const data = await listFolders();
      setFolders(data);
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshFolders();
    }
  }, [open, refreshFolders]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  function handleUploaded(_urlPath: string) {
    refreshFolders();
    setGridRefreshKey(k => k + 1);
  }

  function handleSelect(urlPath: string) {
    onSelect(urlPath);
    onClose();
  }

  const currentFolderId: number | undefined =
    typeof selectedFolder === 'number' ? selectedFolder : undefined;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Select Media</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUploaderOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {uploaderOpen ? 'Close Uploader' : 'Upload'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
            {toast}
          </div>
        )}

        {/* Optional upload area */}
        {uploaderOpen && (
          <div className="border-b p-4">
            <MediaUploader folderId={currentFolderId} onUploaded={handleUploaded} />
          </div>
        )}

        {/* Main body: folder tree + media grid */}
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 border-r overflow-y-auto p-2">
            <FolderTree
              folders={folders}
              selectedId={selectedFolder}
              onSelect={setSelectedFolder}
              onRefresh={refreshFolders}
              onToast={showToast}
            />
          </aside>
          <div className="flex-1 overflow-y-auto p-4">
            <MediaGrid
              folderId={selectedFolder}
              folders={folders}
              onToast={showToast}
              onFoldersChanged={refreshFolders}
              refreshKey={gridRefreshKey}
              onSelect={handleSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/MediaPickerModal.tsx
git commit -m "feat(frontend): create MediaPickerModal component"
```

---

### Task 9: Create ImageFieldWithPicker component

**Files:**
- Create: `frontend/components/admin/form/ImageFieldWithPicker.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/components/admin/form/ImageFieldWithPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { MediaPickerModal } from './MediaPickerModal';

interface ImageFieldWithPickerProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function ImageFieldWithPicker({
  label = 'Image URL',
  value,
  onChange,
}: ImageFieldWithPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} flex-1`}
          placeholder="/media/uploads/xxx.webp"
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          Media
        </button>
      </div>
      {value && (
        <div className="mt-2">
          <img src={value} alt="Preview" className="h-24 w-24 object-cover rounded" />
        </div>
      )}
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(urlPath) => onChange(urlPath)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/admin/form/ImageFieldWithPicker.tsx
git commit -m "feat(frontend): create ImageFieldWithPicker component"
```

---

## Phase 3: Form Integration

### Task 10: Integrate ImageFieldWithPicker into BrandForm + fix body bug

**Files:**
- Modify: `frontend/components/admin/form/BrandForm.tsx`

- [ ] **Step 1: Add import**

In `frontend/components/admin/form/BrandForm.tsx`, add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Add image_url to submit body (fix bug)**

In the `handleSubmit` function, change the body object (lines 26-31) from:

```typescript
    const body = {
      id: initial?.id || slug,
      name,
      slug,
      manufacturer_id: manufacturerId,
    };
```

to:

```typescript
    const body = {
      id: initial?.id || slug,
      name,
      slug,
      manufacturer_id: manufacturerId,
      image_url: imageUrl || null,
    };
```

- [ ] **Step 3: Replace image URL boilerplate with ImageFieldWithPicker**

Replace the entire image URL div block (lines 125-152) from:

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>
```

to:

```tsx
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/admin/form/BrandForm.tsx
git commit -m "feat(frontend): integrate ImageFieldWithPicker into BrandForm + fix body bug"
```

---

### Task 11: Integrate ImageFieldWithPicker into ManufacturerForm

**Files:**
- Modify: `frontend/components/admin/form/ManufacturerForm.tsx`

- [ ] **Step 1: Add import**

Add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Replace image URL boilerplate**

Replace the entire image URL div block (lines 130-157) from:

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>
```

to:

```tsx
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/ManufacturerForm.tsx
git commit -m "feat(frontend): integrate ImageFieldWithPicker into ManufacturerForm"
```

---

### Task 12: Integrate ImageFieldWithPicker into IndustryForm

**Files:**
- Modify: `frontend/components/admin/form/IndustryForm.tsx`

- [ ] **Step 1: Add import**

Add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Replace image URL boilerplate**

Replace the entire image URL div block (lines 140-167) from:

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>
```

to:

```tsx
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/IndustryForm.tsx
git commit -m "feat(frontend): integrate ImageFieldWithPicker into IndustryForm"
```

---

### Task 13: Integrate ImageFieldWithPicker into CategoryForm

**Files:**
- Modify: `frontend/components/admin/form/CategoryForm.tsx`

- [ ] **Step 1: Add import**

Add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Replace image URL boilerplate**

Replace the entire image URL div block (lines 174-201) from:

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>
```

to:

```tsx
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/admin/form/CategoryForm.tsx
git commit -m "feat(frontend): integrate ImageFieldWithPicker into CategoryForm"
```

---

### Task 14: Integrate ImageFieldWithPicker into ProductTypeForm + fix body bug + fix initial type

**Files:**
- Modify: `frontend/components/admin/form/ProductTypeForm.tsx`

- [ ] **Step 1: Add import**

Add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Add image_url to initial type (fix type bug)**

In the `ProductTypeFormProps` interface, add `image_url` to the `initial` type (after line 21, before the closing `}`):

```typescript
interface ProductTypeFormProps {
  initial?: {
    id: string;
    category_id: string;
    label: string;
    slug: string;
    size_system: string;
    filters: { spec_key: string; label: string; control: string; unit: string | null }[];
    sort_order: number;
    image_url: string | null;
  };
  industries: IndustryOption[];
  preselectCategoryId?: string;
}
```

- [ ] **Step 3: Add image_url to submit body (fix bug)**

In the `body` object inside `handleSubmit` (lines 86-95), add `image_url` after `sort_order`:

```typescript
    const body = {
      id: compositeId,
      industry_id: industryId,
      category_id: categoryId,
      label,
      slug,
      size_system: sizeSystem,
      filters: parsedFilters,
      sort_order: Number(sortOrder),
      image_url: imageUrl || null,
    };
```

- [ ] **Step 4: Replace image URL boilerplate with ImageFieldWithPicker**

Replace the entire image URL div block (lines 273-300) from:

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>
```

to:

```tsx
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/form/ProductTypeForm.tsx
git commit -m "feat(frontend): integrate ImageFieldWithPicker into ProductTypeForm + fix body bug + fix initial type"
```

---

### Task 15: Integrate ImageFieldWithPicker into CableForm

**Files:**
- Modify: `frontend/components/admin/form/CableForm.tsx`

- [ ] **Step 1: Add import**

Add after line 5 (`import Link from 'next/link';`):

```typescript
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
```

- [ ] **Step 2: Add imageUrl state**

After line 39 (`const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? '');`), add:

```typescript
  const [imageUrl, setImageUrl] = useState<string>(initial?.image_url ?? '');
```

- [ ] **Step 3: Add image_url to submit payload**

In the `payload` object inside `handleSubmit` (lines 107-121), add `image_url` after `meta_description`:

```typescript
    const payload = {
      id: initial?.id || slug,
      brand_id: brandId,
      product_type_id: `${industry}/${category}/${productType}`,
      industry_id: industry,
      category_id: `${industry}/${category}`,
      model,
      slug,
      size_system: sizeSystem,
      base_description: baseDescription || null,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      image_url: imageUrl || null,
      common_specs: JSON.parse(commonSpecsText),
      variants: JSON.parse(variantsText),
    };
```

- [ ] **Step 4: Add ImageFieldWithPicker to the form**

After the Meta Description field div (after line 333, before the closing `</div>` of the Basic Info section on line 335), add:

```tsx
        </div>
        <div className="mt-4">
          <ImageFieldWithPicker
            value={imageUrl}
            onChange={setImageUrl}
          />
        </div>
```

The full context: insert it right after the metaDescription div closes (line 333 `</div>`) and before the grid's closing `</div>` (line 334) and the section's closing `</div>` (line 335). The result should look like:

```tsx
          <div className="flex flex-col gap-1.5">
            <label htmlFor="metaDescription" className="text-sm font-medium text-gray-700">
              Meta Description
            </label>
            <input
              id="metaDescription"
              type="text"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4">
          <ImageFieldWithPicker
            value={imageUrl}
            onChange={setImageUrl}
          />
        </div>
      </div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/admin/form/CableForm.tsx
git commit -m "feat(frontend): add image_url field with media picker to CableForm"
```

---

## Phase 4: Verification

### Task 16: Restart containers and verify

- [ ] **Step 1: Restart backend and frontend containers**

```bash
docker compose restart backend frontend
```

- [ ] **Step 2: Wait for containers to be ready**

```bash
Start-Sleep -Seconds 15
```

- [ ] **Step 3: Run TypeScript check**

```bash
docker compose exec frontend npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit (if any auto-fixes needed)**

If tsc found and you fixed any issues:

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from media picker integration"
```

---

### Task 17: Manual smoke test

- [ ] **Step 1: Verify media library page still works**

Open `http://localhost:3000/admin/media` in browser. Confirm:
- Folder tree displays
- Media grid displays images
- Upload button works
- No console errors

- [ ] **Step 2: Test BrandForm media picker**

Open `http://localhost:3000/admin/brands/new` (or edit existing brand).
- Click "Media" button → modal opens
- Folder tree + image grid visible
- Click an image → modal closes, URL fills text input, preview shows
- Click "Media" again → click Upload → upload a new image → grid refreshes
- Press Escape → modal closes without changing value
- Save the brand → verify no error

- [ ] **Step 3: Test BrandForm body bug fix**

Save a brand with an image_url set. Navigate back to edit page. Confirm the image_url is still there (previously it was silently dropped).

- [ ] **Step 4: Test ProductTypeForm body bug fix**

Open `http://localhost:3000/admin/industries/product-types`. Edit an existing product type.
- Set an image_url via the media picker
- Save → verify no error
- Navigate back to edit → confirm image_url persisted

- [ ] **Step 5: Test CableForm new image field**

Open `http://localhost:3000/admin/cables/new` (or edit existing).
- Confirm Image URL field appears in Basic Info section
- Click Media → select an image → URL fills in
- Save → verify no error
- Edit again → confirm image_url persisted

- [ ] **Step 6: Test remaining forms (Manufacturer, Industry, Category)**

For each: open edit/new page → click Media → select image → save → reopen to verify persistence.

- [ ] **Step 7: Verify media library page still works after all changes**

Open `http://localhost:3000/admin/media` again. Confirm upload still works (onUploaded signature change didn't break it).

- [ ] **Step 8: Commit smoke test note**

```bash
git commit --allow-empty -m "test: media picker modal smoke tests passed"
```
