# Cable Detail Page Inquiry Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inquiry entry point on the cable detail page sidebar so logged-in members can contact the cable's manufacturer, with the subject pre-filled to "Inquiry about {cable.model}".

**Architecture:** Minimal change — reuse the existing `InquiryFormModal` component and manufacturer-scoped inquiry flow. Add an optional `defaultSubject` prop to `InquiryFormModal`, then render it in the cable detail page's sidebar manufacturer block. No backend changes.

**Tech Stack:** Next.js 16 (App Router, server components + client component modal), React, TypeScript, Tailwind CSS.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/components/member/InquiryFormModal.tsx` | Client component modal for submitting inquiries to manufacturers. | Add optional `defaultSubject?: string` prop; use it as `subject` initial value. |
| `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx` | Cable detail page (server component). Renders cable info + sidebar with manufacturer block. | Import `cookies` + `InquiryFormModal`; read `member_token` cookie; render inquiry button or "Login to Contact" link in sidebar manufacturer block. |

---

## Task 1: Add `defaultSubject` prop to InquiryFormModal

**Files:**
- Modify: `frontend/components/member/InquiryFormModal.tsx`

- [ ] **Step 1: Add `defaultSubject` to the Props interface and function signature**

In `frontend/components/member/InquiryFormModal.tsx`, replace lines 6-12:

```tsx
interface Props {
  recipientType: string;
  recipientId: string;
  manufacturerName: string;
}

export function InquiryFormModal({ recipientType, recipientId, manufacturerName }: Props) {
```

with:

```tsx
interface Props {
  recipientType: string;
  recipientId: string;
  manufacturerName: string;
  defaultSubject?: string;
}

export function InquiryFormModal({ recipientType, recipientId, manufacturerName, defaultSubject }: Props) {
```

- [ ] **Step 2: Use `defaultSubject` as the `subject` state initial value**

In `frontend/components/member/InquiryFormModal.tsx`, replace line 15:

```tsx
  const [subject, setSubject] = useState('');
```

with:

```tsx
  const [subject, setSubject] = useState(defaultSubject ?? '');
```

- [ ] **Step 3: Use `defaultSubject` in `openModal` reset**

In `frontend/components/member/InquiryFormModal.tsx`, replace line 23:

```tsx
    setSubject('');
```

with:

```tsx
    setSubject(defaultSubject ?? '');
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:

```bash
npx tsc --noEmit
```

Expected: 8 pre-existing errors in `.next/dev/types/` (unchanged baseline), 0 new errors.

- [ ] **Step 5: Verify manufacturer detail page is not broken (visual check)**

Rebuild the frontend container:

```bash
docker compose up -d --build frontend
```

Then open `http://localhost:3000/manufacturers/sumitomo-electric` in a browser.

Expected: The "Contact Sumitomo Electric" button still appears. Clicking it opens the modal with an empty subject input (no `defaultSubject` passed → `defaultSubject ?? ''` = `''`).

- [ ] **Step 6: Commit**

```bash
cd d:\projects\unowire
git add frontend/components/member/InquiryFormModal.tsx
git commit -m "feat: add optional defaultSubject prop to InquiryFormModal"
```

---

## Task 2: Add inquiry entry to cable detail page sidebar

**Files:**
- Modify: `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Add imports for `cookies` and `InquiryFormModal`**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`, replace lines 1-3:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
```

with:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
```

Then after line 12 (`import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';`), add:

```tsx
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
```

- [ ] **Step 2: Read `member_token` cookie in the component body**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`, after line 41 (`const jsonUrl = ...`), add:

```tsx
  const memberToken = (await cookies()).get('member_token')?.value;
  const isMember = !!memberToken;
```

- [ ] **Step 3: Add inquiry button to the sidebar manufacturer block**

In `frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx`, replace lines 106-122 (the entire `{manufacturer && (...)}` block):

```tsx
          {manufacturer && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{manufacturer.name}</Link>
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
```

with:

```tsx
          {manufacturer && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{manufacturer.name}</Link>
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
            </div>
          )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from `d:\projects\unowire\frontend`:

```bash
npx tsc --noEmit
```

Expected: 8 pre-existing errors in `.next/dev/types/` (unchanged baseline), 0 new errors.

- [ ] **Step 5: Build the frontend container**

Run from `d:\projects\unowire`:

```bash
docker compose up -d --build frontend
```

Expected: Build succeeds, container starts.

- [ ] **Step 6: Commit**

```bash
cd d:\projects\unowire
git add frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx
git commit -m "feat: add inquiry entry to cable detail page sidebar"
```

---

## Task 3: Manual smoke test

**Files:** (none — verification only)

- [ ] **Step 1: Test unauthenticated visit**

Open `http://localhost:3000/cable/sumitomo/avss` in a browser (not logged in).

Expected: The right sidebar "Manufacturer" block shows a "Login to Contact" blue link below the "Visit website →" link.

- [ ] **Step 2: Test unauthenticated click redirects to login**

Click "Login to Contact".

Expected: Browser navigates to `http://localhost:3000/login?from=/cable/sumitomo/avss`.

- [ ] **Step 3: Login as a member**

Login with a verified member account on the login page. If no member account exists, register one at `http://localhost:3000/register`, verify it via the admin panel (`http://localhost:3000/admin/members` → verify button), then login.

Expected: After login, redirected back to `http://localhost:3000/cable/sumitomo/avss`.

- [ ] **Step 4: Test authenticated visit shows inquiry button**

On the cable detail page (logged in), check the right sidebar "Manufacturer" block.

Expected: A "Contact Sumitomo Electric" blue button appears below the "Visit website →" link.

- [ ] **Step 5: Test modal opens with pre-filled subject**

Click "Contact Sumitomo Electric".

Expected: Modal opens. The "Subject" input is pre-filled with "Inquiry about AVSS".

- [ ] **Step 6: Test subject is editable**

In the modal, change the subject from "Inquiry about AVSS" to "Quote request for AVSS".

Expected: The subject input accepts the change and displays the new text.

- [ ] **Step 7: Test successful submission**

Fill in the "Message" textarea with "Need pricing for 1000 units of AVSS 20 AWG.", then click "Send Inquiry".

Expected: The modal shows "Inquiry Sent" panel with message "Your message has been sent to Sumitomo Electric." and a "View My Inquiries" button.

- [ ] **Step 8: Verify inquiry appears in member center**

Click "View My Inquiries".

Expected: Browser navigates to `http://localhost:3000/member/inquiries`. The new inquiry is listed with subject "Quote request for AVSS" (or whatever was submitted).

- [ ] **Step 9: Verify inquiry appears in admin panel**

Open `http://localhost:3000/admin/inquiries` in a separate browser/incognito (login as admin).

Expected: The new inquiry appears in the admin inquiries list, showing the member as sender and Sumitomo Electric as recipient.

- [ ] **Step 10: Test cable without manufacturer**

If a cable without a manufacturer exists in the database, open its detail page. (If no such cable exists, skip this step — the `{manufacturer && (...)}` conditional already handles the null case by not rendering the block.)

Expected: No "Manufacturer" block and no inquiry button in the sidebar.

- [ ] **Step 11: Manufacturer page regression test**

Open `http://localhost:3000/manufacturers/sumitomo-electric` (logged in as member).

Expected: The manufacturer page still shows the "Contact Sumitomo Electric" button. Clicking it opens the modal with an **empty** subject input (no pre-fill — manufacturer page does not pass `defaultSubject`). Behavior is unchanged from before.

- [ ] **Step 12: Final commit (if any fixes were needed)**

If any fixes were made during smoke testing, commit them:

```bash
cd d:\projects\unowire
git add -A
git commit -m "fix: smoke test corrections for cable inquiry entry"
```

If no fixes were needed, skip this step.
