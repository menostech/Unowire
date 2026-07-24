# Task 6 Report — Forms: Migrate to `portalApiClient` + Inline Validation

## Status
DONE

## Commits
- `dc6bbf3` — feat(portal): migrate forms to portalApiClient with inline validation

## Test summary
`tsc --noEmit`: 0 errors (exit code 0, clean output).

## Concerns
none

## Files changed
- `frontend/components/portal/form/CableEditForm.tsx`
- `frontend/components/portal/form/EquipmentEditForm.tsx`
- `frontend/components/portal/form/ReplyForm.tsx`
- `frontend/components/portal/form/ChangePasswordForm.tsx`

## Implementation notes
- All four forms now import `portalApiClient` + `PortalApiError` from `@/lib/portalApiClient`. No raw `fetch` remains in any of the four form files.
- `CableEditForm` / `EquipmentEditForm`: prop types changed from `any` to `PortalCable` / `PortalEquipment` (imported from `@/lib/types/portal`). `validate()` enforces `model` required; inline error `<p>` rendered below the Model input. Base Description / Description fields left without validation (optional, per brief).
- `ReplyForm`: kept the existing `error` form-level state alongside the new `errors` field-level state. `validate()` enforces non-empty `reply_body`; inline error `<p>` rendered below the textarea. `router.refresh()` preserved on success.
- `ChangePasswordForm`: `validate()` enforces `old_password` required, `new_password` >= 8 chars, and `new_password !== old_password`. Inline error `<p>` rendered below both password inputs. The existing "Minimum 8 characters." hint `<p>` is preserved below the New Password input (the inline error appears after the hint).
- Shared catch pattern applied verbatim from the brief: `PortalApiError` with `fieldErrors` → `setErrors(err.fieldErrors)`; `PortalApiError` without `fieldErrors` → form-level message = `err.message`; non-`PortalApiError` → form-level message = `'Network error'`.
- All existing JSX structure (labels, inputs, textareas, buttons, hints, wrappers) preserved — only added `errors` state, `validate()`, updated submit handlers, and the inline error `<p>` elements.
- Git printed CRLF warnings on commit (Windows line-ending normalization) — informational only, did not affect the commit.
