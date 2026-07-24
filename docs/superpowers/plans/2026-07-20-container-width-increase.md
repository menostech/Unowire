# Container Width Increase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump page-wide container width from 1280px (`max-w-7xl`) to 1536px (`max-w-screen-2xl`) in `Container.tsx` and `HeroSearch.tsx` so content has more horizontal room.

**Architecture:** Two-file, two-line Tailwind class swap. `Container` is the shared layout wrapper for all pages; `HeroSearch` is rendered outside `<Container>` on the homepage but has its own internal width wrapper that must match Container to keep hero content aligned with the stats/grid sections below.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, TypeScript, Docker Compose (for build verification).

**Spec:** `docs/superpowers/specs/2026-07-20-container-width-increase-design.md`

---

### Task 1: Bump Container max-width

**Files:**
- Modify: `frontend/components/layout/Container.tsx` (line 5)

**Why first:** Container is the canonical source of page width. HeroSearch's internal width (Task 2) must mirror this value, so Container goes first.

- [ ] **Step 1: Read current Container.tsx to confirm line 5 content**

Run: read `frontend/components/layout/Container.tsx`

Expected current content (full file):
```tsx
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-6', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Replace `max-w-7xl` with `max-w-screen-2xl`**

Use Edit tool on `frontend/components/layout/Container.tsx`:

old_string:
```
    <div className={cn('mx-auto w-full max-w-7xl px-6', className)}>
```

new_string:
```
    <div className={cn('mx-auto w-full max-w-screen-2xl px-6', className)}>
```

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/layout/Container.tsx`

Expected full content:
```tsx
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-screen-2xl px-6', className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Commit Container change**

Run:
```bash
git add frontend/components/layout/Container.tsx
git commit -m "feat(layout): bump Container max-width from 1280px to 1536px"
```

Expected: 1 file changed, 1 insertion(+), 1 deletion(-)

---

### Task 2: Bump HeroSearch internal max-width

**Files:**
- Modify: `frontend/components/home/HeroSearch.tsx` (line 53)

**Why:** `HeroSearch` is rendered OUTSIDE `<Container>` in `app/(site)/page.tsx` (full-bleed background image) but has its own internal `max-w-7xl mx-auto px-6` wrapper to center hero content. If this doesn't match Container's new width, hero content will be visually misaligned with the stats/grid sections below it on wide screens.

- [ ] **Step 1: Read HeroSearch.tsx around line 53 to confirm content**

Run: read `frontend/components/home/HeroSearch.tsx` lines 45-60

Expected to find:
```tsx
    <div className="relative w-full bg-slate-900">
      <div className="mx-auto w-full max-w-7xl px-6 py-20 text-center">
```

- [ ] **Step 2: Replace `max-w-7xl` with `max-w-screen-2xl` on the inner wrapper**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
      <div className="mx-auto w-full max-w-7xl px-6 py-20 text-center">
```

new_string:
```
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-20 text-center">
```

Note: Do NOT change the inner search input's `max-w-xl` (line 95) — that constrains the search bar width for readability and is intentionally narrower.

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/home/HeroSearch.tsx` lines 45-60

Expected:
```tsx
    <div className="relative w-full bg-slate-900">
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-20 text-center">
```

- [ ] **Step 4: Commit HeroSearch change**

Run:
```bash
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): bump HeroSearch inner wrapper to match Container width (1536px)"
```

Expected: 1 file changed, 1 insertion(+), 1 deletion(-)

---

### Task 3: Verify no other `max-w-7xl` remain in frontend

**Files:**
- No file changes — verification only

**Why:** Ensure no other component hard-codes the old page-wide width, which would cause inconsistent layouts.

- [ ] **Step 1: Grep for remaining `max-w-7xl` in frontend**

Run: Grep with pattern `max-w-7xl`, path `frontend`, output_mode `content`, -n true

Expected: zero matches. If any match remains:
- If it's a page-wide wrapper (like Container/HeroSearch), bump it to `max-w-screen-2xl` too.
- If it's a component-local width (e.g. a modal or card), leave it alone but note it in the task summary.

- [ ] **Step 2: Note grep result in task summary**

If zero matches: "Verified: no other `max-w-7xl` in frontend — Container and HeroSearch were the only two."
If matches found: list them and explain whether each was changed or intentionally left.

---

### Task 4: Docker build verification

**Files:**
- No file changes — build verification only

**Why:** Per project constraint, the frontend container must build successfully via `docker compose --env-file .env.docker build frontend`. tsc runs as part of `next build` and must produce 0 new errors (8 pre-existing baseline in `.next/dev/types/validator.ts` line 440).

- [ ] **Step 1: Run docker build for frontend**

Run (blocking, may take 1-3 minutes):
```bash
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds, exit code 0. Look for the final line like `=> => naming to ...frontend:latest` with no error.

- [ ] **Step 2: Inspect build output for tsc errors**

In the build log, look for the `Next.js` build phase output. The expected pre-existing baseline is 8 errors in `.next/dev/types/validator.ts` line 440 — these are stale generated types and not related to our change.

If the build fails:
- If failure is in our 2 modified files (`Container.tsx` or `HeroSearch.tsx`): fix the typo, rebuild.
- If failure is the pre-existing 8 errors in `validator.ts`: this is a known issue, not a regression. Proceed.
- If failure is anywhere else: investigate before proceeding.

- [ ] **Step 3: Record build status in task summary**

Example: "Docker frontend build succeeded. Exit code 0. No new tsc errors beyond the 8 pre-existing baseline."

---

### Task 5: Restart frontend container and smoke test

**Files:**
- No file changes — runtime verification only

**Why:** The built image must be running for changes to be visible in the browser. After rebuild, the container needs to be recreated to pick up the new image. Then smoke test the affected pages.

- [ ] **Step 1: Restart frontend container with new image**

Run (blocking):
```bash
docker compose --env-file .env.docker up -d frontend
```

Expected: Container recreated with the new image. Exit code 0. Output like `Container unowire-frontend  Recreate ... done`.

- [ ] **Step 2: Wait for Next.js to be ready**

Run (blocking, ~5-10 seconds):
```bash
docker compose --env-file .env.docker logs --tail 20 frontend
```

Expected: log line containing `Ready in` or `started server on`. If not yet ready, wait 5 seconds and re-run.

- [ ] **Step 3: HTTP smoke test on key pages**

Run (blocking) for each URL:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/cables
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/equipment
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
```

Expected: each returns `200`. If any returns non-200:
- `404`: route missing — check `app/` directory structure unchanged
- `500`: server error — check `docker compose logs frontend` for stack trace
- `502`: container not ready — wait and retry

- [ ] **Step 4: Manual browser verification (optional but recommended)**

Open `http://localhost:3000/` in a browser. Verify:
- Hero content is centered and aligned with the stats/grid sections below it (no horizontal offset)
- On a 1920px-wide viewport, content has ~192px whitespace on each side (expected)
- Stats row, Cable category grid, Equipment category grid all render wider than before
- No horizontal scrollbar on the homepage

Open `http://localhost:3000/cables` and `http://localhost:3000/equipment` — verify wider layout, no breakage.

- [ ] **Step 5: Record smoke test results in task summary**

Example: "All 4 pages returned HTTP 200. Browser verified: hero aligned with content below, wider layout on desktop, no horizontal scroll."

---

### Task 6: Final commit and push

**Files:**
- No file changes — git housekeeping only

**Why:** Ensure all changes are committed locally and pushed to the remote branch for deployment.

- [ ] **Step 1: Verify all changes are committed**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`. If uncommitted changes exist, return to the relevant task and commit them.

- [ ] **Step 2: Show commit log for this feature**

Run:
```bash
git log --oneline -5
```

Expected: top 3 commits should be (newest first):
1. `feat(home): bump HeroSearch inner wrapper to match Container width (1536px)`
2. `feat(layout): bump Container max-width from 1280px to 1536px`
3. `docs: add spec for container width increase (1280px to 1536px)`

- [ ] **Step 3: Push to remote**

Run:
```bash
git push origin feat/media-picker-modal
```

Expected: push succeeds. If push fails due to network issues (as happened with the equipment filter fix earlier), retry later — the local commits are safe.

- [ ] **Step 4: Record final status in task summary**

Example: "3 commits pushed to `origin/feat/media-picker-modal`. Container width increase feature complete."

---

## Self-Review

### 1. Spec coverage
- ✅ Container.tsx `max-w-7xl` → `max-w-screen-2xl` — Task 1
- ✅ HeroSearch.tsx `max-w-7xl` → `max-w-screen-2xl` — Task 2
- ✅ No other `max-w-*` classes changed — Task 3 verifies
- ✅ Docker build succeeds — Task 4
- ✅ 0 new tsc errors — Task 4 Step 2
- ✅ Manual smoke test on `/`, `/cables`, `/equipment`, `/login` — Task 5

### 2. Placeholder scan
No "TBD", "TODO", "implement later", "Add appropriate error handling", "Similar to Task N" patterns. Every step has exact code or exact commands.

### 3. Type consistency
No types or function signatures introduced. Two string literal swaps in JSX `className` attributes. No risk of type inconsistency.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-container-width-increase.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
