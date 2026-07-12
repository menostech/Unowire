# Cable Detail Page Inquiry Entry — Design Spec

> **Date:** 2026-07-10
> **Branch:** `feat/media-picker-modal`
> **Status:** Approved (all 3 sections)

## Goal

Add an inquiry entry point on the cable detail page (`/cable/{brand_slug}/{slug}`) so that logged-in members can contact the cable's manufacturer directly from the cable page. The inquiry subject is pre-filled with the cable model name but remains user-editable.

## Architecture & Scope

**Approach:** Minimal change — reuse the existing `InquiryFormModal` component and manufacturer-scoped inquiry flow. No backend changes.

**Files to modify (2):**

| File | Change |
|---|---|
| `frontend/components/member/InquiryFormModal.tsx` | Add optional `defaultSubject?: string` prop; use it as the initial value for the `subject` state (in both `useState` initializer and `openModal` reset). |
| `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` | Import `cookies` from `next/headers` and `InquiryFormModal`; read `member_token` cookie; render inquiry button or "Login to Contact" link in the sidebar manufacturer block. |

**No changes to:**
- Backend: `InquiryCreate` schema, `Inquiry` model, `/api/member/inquiries` route — unchanged.
- Frontend proxy route: `/api/member/inquiries/route.ts` — already exists.
- Manufacturer detail page: existing inquiry button keeps current behavior (does not pass `defaultSubject`).

## Data Flow

```
Cable detail page (server component)
  → reads member_token cookie (presence check only)
  → has cookie: renders <InquiryFormModal
       recipientType="manufacturer"
       recipientId={manufacturer.id}
       manufacturerName={manufacturer.name}
       defaultSubject={`Inquiry about ${cable.model}`}
     />
  → no cookie: renders <Link href="/login?from=/cable/{brand_slug}/{slug}">Login to Contact</Link>

InquiryFormModal (client component)
  → user clicks button → modal opens → subject pre-filled with "Inquiry about {cable.model}"
  → user fills message → submits → POST /api/member/inquiries
  → backend validates manufacturer exists → creates inquiry → notifies manufacturer staff
```

## Component Changes

### InquiryFormModal — new `defaultSubject` prop

```tsx
interface Props {
  recipientType: string;
  recipientId: string;
  manufacturerName: string;
  defaultSubject?: string;  // NEW — optional, defaults to undefined
}

export function InquiryFormModal({ recipientType, recipientId, manufacturerName, defaultSubject }: Props) {
  // ...
  const [subject, setSubject] = useState(defaultSubject ?? '');

  function openModal() {
    setIsOpen(true);
    setSubject(defaultSubject ?? '');  // reset to defaultSubject on each open
    setBody('');
    setError('');
    setSuccess(false);
  }
  // ... rest unchanged
}
```

**Behavior:**
- `defaultSubject` is optional. When omitted (manufacturer detail page), `defaultSubject ?? ''` evaluates to `''` — identical to current behavior.
- When provided (cable detail page), the subject input is pre-filled with the value (e.g., `"Inquiry about AVSS"`).
- The subject input remains editable (no `readOnly` attribute).
- `useState` initializer and `openModal()` reset both use `defaultSubject ?? ''` for consistency.

### Cable detail page — sidebar inquiry button

**New imports:**
```tsx
import { cookies } from 'next/headers';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
```

**Cookie check** (in component body, after `jsonUrl` definition):
```tsx
const memberToken = (await cookies()).get('member_token')?.value;
const isMember = !!memberToken;
```

**Sidebar manufacturer block** (append after `manufacturer.website` link, inside `{manufacturer && (...)}` block):
```tsx
<div className="mt-3">
  {isMember ? (
    <InquiryFormModal
      recipientType="manufacturer"
      recipientId={manufacturer.id}
      manufacturerName={manufacturer.name}
      defaultSubject={`Inquiry about ${cable.model}`}
    />
  ) : (
    <Link
      href={`/login?from=/cable/${brand_slug}/${slug}`}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium inline-block"
    >
      Login to Contact
    </Link>
  )}
</div>
```

**Key points:**
- `member_token` cookie check is a presence-only check in the server component; actual token validation happens at the backend `/api/member/inquiries` endpoint.
- `login?from=` parameter follows the manufacturer page pattern, redirecting back to the cable detail page after login.
- Button styling matches the manufacturer page (blue button).
- The inquiry entry only renders when `manufacturer` exists (wrapped in `{manufacturer && (...)}`).

## Edge Cases

| Case | Handling |
|---|---|
| Cable has no manufacturer (`manufacturer === null`) | Sidebar manufacturer block does not render → inquiry button also absent. No extra handling needed. |
| User not logged in | Shows "Login to Contact" link → redirects to `/login?from=/cable/{brand_slug}/{slug}`. |
| User logged in but token expired/invalid | Frontend still shows inquiry button (cookie present); submission returns 401 from backend → `InquiryFormModal` displays error via existing `setError(data.message)` logic. |
| User modifies subject then submits | The modified value is submitted; `defaultSubject` only provides the initial value. |
| User reopens modal after closing | `openModal()` resets subject to `defaultSubject ?? ''` each time. |
| Manufacturer detail page (no `defaultSubject`) | `defaultSubject ?? ''` = `''`, subject input is blank — identical to current behavior. |

## Testing Strategy

**No frontend automated tests** (per MVP constraint). Coverage via manual smoke test:

| Scenario | Action | Expected Result |
|---|---|---|
| Unauthenticated visit | Open `/cable/sumitomo/avss` | Sidebar manufacturer block shows "Login to Contact" blue link |
| Unauthenticated click | Click "Login to Contact" | Redirects to `/login?from=/cable/sumitomo/avss` |
| Authenticated visit | Login, then open cable detail page | Sidebar shows "Contact Sumitomo Electric" blue button |
| Open inquiry modal | Click "Contact Sumitomo Electric" | Modal opens, subject pre-filled with "Inquiry about AVSS" |
| Modify subject and submit | Change subject to "Quote request", fill message, click Send Inquiry | Submission succeeds, "Inquiry Sent" panel shows |
| Submit without modifying subject | Fill message, click Send Inquiry | Submission succeeds, backend receives subject = "Inquiry about AVSS" |
| Cable without manufacturer | Visit cable detail page for a cable with no manufacturer | Sidebar manufacturer block and inquiry button absent |
| Manufacturer page regression | Open `/manufacturers/sumitomo-electric` | Manufacturer page inquiry button works as before, subject is blank |

### TypeScript Verification

- `InquiryFormModal` new optional prop does not break existing call sites (manufacturer detail page).
- Run `npx tsc --noEmit` to confirm 0 new errors (current baseline: 8 pre-existing errors in `.next/dev/types/`).
