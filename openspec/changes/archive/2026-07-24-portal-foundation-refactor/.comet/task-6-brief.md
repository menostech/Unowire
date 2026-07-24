# Task 6: Forms — Migrate to `portalApiClient` + Inline Validation

**Files:**
- Modify: `frontend/components/portal/form/CableEditForm.tsx`
- Modify: `frontend/components/portal/form/EquipmentEditForm.tsx`
- Modify: `frontend/components/portal/form/ReplyForm.tsx`
- Modify: `frontend/components/portal/form/ChangePasswordForm.tsx`

**Interfaces:**
- Consumes: `portalApiClient`, `PortalApiError` from `frontend/lib/portalApiClient.ts`; `PortalCable`, `PortalEquipment` from `frontend/lib/types/portal`.
- Produces: four forms that validate inline before submit and map `PortalApiError.fieldErrors` to per-field messages.

**Shared pattern (apply to every form):** add `const [errors, setErrors] = useState<Record<string, string>>({});`. Add a `validate()` returning boolean. On submit, call `validate()`; if false, return without calling the API. In the `catch`, if `err instanceof PortalApiError && err.fieldErrors`, `setErrors(err.fieldErrors)`; else if `err instanceof PortalApiError`, set the form-level message to `err.message`; else set form-level message to `'Network error'`. Render `{errors.<field> && <p className="mt-1 text-sm text-red-600">{errors.<field>}</p>}` below each validated field.

## Step 1: Refactor `CableEditForm.tsx`

Change the prop type from `{ cable }: { cable: any }` to `{ cable }: { cable: PortalCable }` (import `PortalCable` from `@/lib/types/portal`). Replace the `handleSave` body:

```typescript
import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalCable } from '@/lib/types/portal';

export function CableEditForm({ cable }: { cable: PortalCable }) {
  const [model, setModel] = useState(cable.model ?? '');
  const [baseDescription, setBaseDescription] = useState(cable.base_description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!model.trim()) e.model = 'Model is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, { model, base_description: baseDescription });
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }
  // ... existing JSX, but add below the Model input:
  // {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
}
```

Add the inline error `<p>` below the Model input. Leave the Base Description field without validation (optional).

## Step 2: Refactor `EquipmentEditForm.tsx`

Same pattern. Prop type `{ equipment }: { equipment: PortalEquipment }`. Validation rule: `model` required.

```typescript
function validate(): boolean {
  const e: Record<string, string> = {};
  if (!model.trim()) e.model = 'Model is required';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSave() {
  if (!validate()) return;
  setSaving(true);
  setMessage('');
  setErrors({});
  try {
    await portalApiClient.equipment.update(equipment.id, { model, description });
    setMessage('Saved');
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else if (err instanceof PortalApiError) setMessage(err.message);
    else setMessage('Network error');
  } finally {
    setSaving(false);
  }
}
```

Add inline error below the Model input.

## Step 3: Refactor `ReplyForm.tsx`

Validation rule: `reply_body` required (non-empty after trim). Replace the raw `fetch` with `portalApiClient.inquiries.reply(inquiryId, replyBody)`. The payload is `{ reply_body: replyBody }` (matches backend `InquiryReply` schema — `reply_body: str`). Keep `router.refresh()` on success.

```typescript
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

const [errors, setErrors] = useState<Record<string, string>>({});

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!replyBody.trim()) e.reply_body = 'Reply cannot be empty';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!validate()) return;
  setSaving(true);
  setErrors({});
  setError('');
  try {
    await portalApiClient.inquiries.reply(inquiryId, replyBody);
    router.refresh();
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else if (err instanceof PortalApiError) setError(err.message);
    else setError('Network error');
  } finally {
    setSaving(false);
  }
}
```

Render `{errors.reply_body && <p className="mt-1 text-sm text-red-600">{errors.reply_body}</p>}` below the textarea. (Keep the existing `error` form-level message for non-field errors.)

## Step 4: Refactor `ChangePasswordForm.tsx`

Validation rules: `old_password` required; `new_password` >= 8 chars; `new_password !== old_password`. Replace the raw `fetch('/api/portal/auth/me', PUT)` with `portalApiClient.auth.changePassword(oldPassword, newPassword)` (which calls `/api/portal/auth/me` PUT — added in Task 5).

```typescript
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';

const [errors, setErrors] = useState<Record<string, string>>({});

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!oldPassword) e.old_password = 'Current password is required';
  if (newPassword.length < 8) e.new_password = 'Password must be at least 8 characters';
  if (newPassword && newPassword === oldPassword) e.new_password = 'New password must differ from current password';
  setErrors(e);
  return Object.keys(e).length === 0;
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!validate()) return;
  setSaving(true);
  setMessage('');
  setErrors({});
  try {
    await portalApiClient.auth.changePassword(oldPassword, newPassword);
    setMessage('Password changed successfully');
    setOldPassword('');
    setNewPassword('');
  } catch (err) {
    if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
    else if (err instanceof PortalApiError) setMessage(err.message);
    else setMessage('Network error');
  } finally {
    setSaving(false);
  }
}
```

Render `{errors.old_password && <p className="mt-1 text-sm text-red-600">{errors.old_password}</p>}` below the Current Password input, and `{errors.new_password && <p className="mt-1 text-sm text-red-600">{errors.new_password}</p>}` below the New Password input (in addition to the existing "Minimum 8 characters." hint).

## Step 5: Verify frontend compiles

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

## Step 6: Commit

```bash
git add frontend/components/portal/form/CableEditForm.tsx frontend/components/portal/form/EquipmentEditForm.tsx frontend/components/portal/form/ReplyForm.tsx frontend/components/portal/form/ChangePasswordForm.tsx
git commit -m "feat(portal): migrate forms to portalApiClient with inline validation"
```

**Acceptance criteria:** `portal-api-layer/spec.md` Requirement "Portal forms SHALL display inline validation errors"; scenarios "Cable edit form required field validation", "Password change form min length validation", "Reply form empty body validation". All four forms use `portalApiClient` (no raw `fetch`).

## Global Constraints
- Frontend MVP does NOT require automated tests — do NOT write new frontend test files. Frontend verification is `tsc --noEmit` + manual smoke.
- All code, comments, and docs in English.
- No new npm packages (zod, react-hook-form, etc.).
