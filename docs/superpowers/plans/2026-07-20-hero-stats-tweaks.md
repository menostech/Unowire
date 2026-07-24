# Hero Height, Search Width, Stats Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three visual tweaks to the homepage: increase hero vertical padding by 50%, double the search form max-width, and replace the plain stats row with a 5-card responsive grid.

**Architecture:** Two-file frontend-only change. `HeroSearch.tsx` gets two className swaps (padding + max-width). `StatsRow.tsx` gets its render block swapped from flex to grid with card-styled children. No data flow, props, or type changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Docker Compose (for build verification).

**Spec:** `docs/superpowers/specs/2026-07-20-hero-stats-tweaks-design.md`

---

### Task 1: HeroSearch — increase hero padding by 50%

**Files:**
- Modify: `frontend/components/home/HeroSearch.tsx:54`

**Why:** User wants the hero section height increased by 50%. Padding goes from `py-20` (80px each side, 160px total) to `py-[120px]` (120px each side, 240px total) — exactly +50% on padding.

- [ ] **Step 1: Read current HeroSearch.tsx line 54 to confirm exact content**

Run: read `frontend/components/home/HeroSearch.tsx` lines 50-60

Expected at line 54:
```tsx
      <div className="w-full px-8 md:px-12 py-20 text-center">
```

- [ ] **Step 2: Replace the className**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
      <div className="w-full px-8 md:px-12 py-20 text-center">
```

new_string:
```
      <div className="w-full px-8 md:px-12 py-[120px] text-center">
```

Rationale:
- `py-20` = 80px each side (160px total vertical padding)
- `py-[120px]` = 120px each side (240px total) = exactly +50% on padding
- Arbitrary value `py-[120px]` is used because Tailwind v4's spacing scale has no `py-30` class (jumps from `py-24`=96px to `py-32`=128px)
- All other classes on this div unchanged (`w-full px-8 md:px-12 text-center`)

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/home/HeroSearch.tsx` lines 50-60

Expected at line 54:
```tsx
      <div className="w-full px-8 md:px-12 py-[120px] text-center">
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): increase hero vertical padding by 50% (py-20 -> py-[120px])"
```

Expected: 1 file changed, 1 insertion, 1 deletion

---

### Task 2: HeroSearch — double the search form width

**Files:**
- Modify: `frontend/components/home/HeroSearch.tsx:96`

**Why:** User wants the search form width doubled. `max-w-xl` (576px) → `max-w-6xl` (1152px) = exactly ×2.

- [ ] **Step 1: Read current HeroSearch.tsx line 96 to confirm exact content**

Run: read `frontend/components/home/HeroSearch.tsx` lines 92-100

Expected at line 96:
```tsx
          className="mx-auto flex max-w-xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
```

- [ ] **Step 2: Replace the className**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
          className="mx-auto flex max-w-xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
```

new_string:
```
          className="mx-auto flex max-w-6xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
```

Rationale:
- `max-w-xl` = 36rem = 576px
- `max-w-6xl` = 72rem = 1152px = exactly ×2
- On viewports narrower than 1152px (plus horizontal padding), the form continues to fill available width via `flex` — behavior unchanged below the breakpoint
- All other form classes unchanged (`mx-auto flex overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white`)
- Search input (`flex-1`) grows automatically; search button (`px-6`) stays fixed — no other changes needed

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/home/HeroSearch.tsx` lines 92-100

Expected at line 96:
```tsx
          className="mx-auto flex max-w-6xl overflow-hidden rounded-b-lg rounded-tr-lg border-2 border-white"
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): double hero search form width (max-w-xl -> max-w-6xl)"
```

Expected: 1 file changed, 1 insertion, 1 deletion

---

### Task 3: StatsRow — replace flex row with card grid

**Files:**
- Modify: `frontend/components/home/StatsRow.tsx:23-34`

**Why:** User wants stats displayed as cards instead of plain text. Cards = white background + border + shadow, arranged in a responsive grid (2 cols mobile, 3 cols tablet, 5 cols desktop).

- [ ] **Step 1: Read current StatsRow.tsx render block to confirm exact content**

Run: read `frontend/components/home/StatsRow.tsx` lines 22-36

Expected at lines 23-34:
```tsx
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="flex flex-wrap justify-center gap-8 md:gap-12">
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

- [ ] **Step 2: Replace the render block**

Use Edit tool on `frontend/components/home/StatsRow.tsx`:

old_string:
```
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="flex flex-wrap justify-center gap-8 md:gap-12">
        {stats.map(stat => (
          <div key={stat.label} className="text-center">
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

new_string:
```
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

Rationale:
- **Grid replaces flex:** `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5` — 5 cards distribute as single row on desktop (5 cols), 3+2 on tablet (3 cols), 2+2+1 on mobile (2 cols)
- **Card styling:** `rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm` — white card on gray section background, subtle border and shadow for depth
- **Stat number and label:** unchanged styling (`text-3xl font-bold text-blue-600` + `text-sm text-gray-500`)
- **Section wrapper:** unchanged (`border-b bg-gray-50 py-8`) — gray background makes white cards pop
- **Gap:** `gap-4` (16px) between cards

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/home/StatsRow.tsx` lines 22-40

Expected:
```tsx
  return (
    <section className="border-b bg-gray-50 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
          >
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/components/home/StatsRow.tsx
git commit -m "feat(home): replace stats flex row with responsive card grid"
```

Expected: 1 file changed, ~6 insertions, ~4 deletions

---

### Task 4: Docker build verification

**Files:**
- No file changes — build verification only

**Why:** Per project constraint, the frontend container must build successfully via `docker compose --env-file .env.docker build frontend`. tsc runs as part of `next build` and must produce 0 new errors. The changes in this plan are className-only and render-block-only — TypeScript risk is minimal, but build verification is required.

- [ ] **Step 1: Run docker build for frontend**

Run (blocking, may take 1-3 minutes):
```bash
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds, exit code 0. Look for the final line like `=> => naming to ...frontend:latest` with no error.

- [ ] **Step 2: Inspect build output for errors**

In the build log, look for the Next.js build phase output. Any tsc error is a regression.

If the build fails (unlikely for className-only changes):
- Check that `py-[120px]` is valid Tailwind v4 arbitrary value syntax (it is — square bracket notation)
- Check that `max-w-6xl` exists in Tailwind v4 (it does — standard spacing scale)
- Check that `grid-cols-2`, `md:grid-cols-3`, `lg:grid-cols-5` exist (they do — standard grid scale)
- Check that `shadow-sm` exists in Tailwind v4 (it does — standard shadow scale)

- [ ] **Step 3: Record build status in task summary**

Example: "Docker frontend build succeeded. Exit code 0. 84 pages generated. 0 tsc errors."

---

### Task 5: Restart frontend container and HTTP smoke test

**Files:**
- No file changes — runtime verification only

**Why:** The built image must be running for changes to be visible in the browser. After rebuild, the container needs to be recreated. Then smoke test the homepage to verify it returns 200.

- [ ] **Step 1: Restart frontend container with new image**

Run (blocking):
```bash
docker compose --env-file .env.docker up -d frontend
```

Expected: Container recreated. Exit code 0. Output like `Container unowire-frontend-1  Recreate ... done`.

- [ ] **Step 2: Wait for Next.js to be ready**

Run (blocking, ~10 seconds):
```bash
Start-Sleep -Seconds 10
docker compose --env-file .env.docker logs --tail 10 frontend
```

Expected: log line containing `Ready in` or `started server on`. If not yet ready, wait 5 more seconds and re-run.

- [ ] **Step 3: HTTP smoke test on homepage**

Run (blocking):
```bash
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/
```

Expected: `200`.

- [ ] **Step 4: Manual browser verification (optional but recommended)**

Open `http://localhost:3000/` in a browser. Verify:
- Hero section is visibly taller than before (more vertical space above h1 and below popular chips)
- Search form on desktop (≥1200px viewport) is visibly wider than before — fills most of the hero content width
- Search form on mobile (<768px) still fits viewport (max-w-6xl doesn't apply below the breakpoint, flex fills available width)
- Stats section shows 5 white cards in a single row on desktop (5 columns)
- Stats section shows 3+2 layout on tablet (3 columns)
- Stats section shows 2+2+1 layout on mobile (2 columns)
- Card numbers and labels are unchanged: Cables, Brands, Industries, Equipment, Manufacturers
- Cards have visible border and subtle shadow against the gray section background

- [ ] **Step 5: Record smoke test results in task summary**

Example: "Homepage returned 200. Browser verified: taller hero, wider search form, 5-card stats grid in single row on desktop."

---

### Task 6: Final commit verification and push

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

Expected: top 4 commits should be (newest first):
1. `feat(home): replace stats flex row with responsive card grid`
2. `feat(home): double hero search form width (max-w-xl -> max-w-6xl)`
3. `feat(home): increase hero vertical padding by 50% (py-20 -> py-[120px])`
4. `docs: add spec for hero height, search width, stats cards tweaks`

- [ ] **Step 3: Push to remote**

Run:
```bash
git push origin feat/media-picker-modal
```

Expected: push succeeds. If push fails due to network issues (as has happened in prior sessions — `Connection was reset`, `Could not connect to server`), retry later. Local commits are safe.

- [ ] **Step 4: Record final status in task summary**

Example: "4 commits pushed to `origin/feat/media-picker-modal`. Hero/stats tweaks feature complete."

---

## Self-Review

### 1. Spec coverage
- ✅ Hero padding `py-20` → `py-[120px]` (+50%) — Task 1
- ✅ Search form `max-w-xl` → `max-w-6xl` (×2) — Task 2
- ✅ Stats render block: flex row → card grid — Task 3
- ✅ Each card has `rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm` — Task 3
- ✅ Stat number and label styling unchanged — Task 3 (preserved exactly)
- ✅ Section wrapper unchanged (`border-b bg-gray-50 py-8`) — Task 3 (preserved exactly)
- ✅ Docker build succeeds — Task 4
- ✅ 0 new tsc errors — Task 4 Step 2
- ✅ HTTP smoke test on `/` returns 200 — Task 5 Step 3

### 2. Placeholder scan
No "TBD", "TODO", "implement later", "Add appropriate error handling", "Similar to Task N" patterns. Every step has exact code or exact commands. All before/after blocks are complete and character-for-character explicit.

### 3. Type consistency
- No type changes in this plan. All changes are className strings and JSX structure.
- `Stat` interface (`{ label: string; value: number }`) — unchanged, still used in `stats.map`
- `StatsRowProps` — unchanged
- No new types, no new props, no new function signatures

### 4. Independence check
- Task 1 and Task 2 both modify `frontend/components/home/HeroSearch.tsx` — they touch different lines (54 and 96) but the file is shared. MUST be done sequentially (Task 1 commits before Task 2 starts) to avoid edit conflicts. The plan order enforces this.
- Task 3 modifies `frontend/components/home/StatsRow.tsx` — independent file. Could run in parallel with Tasks 1-2 in theory, but for simplicity the plan runs sequentially.
- Tasks 4, 5, 6 are verification/housekeeping — depend on Tasks 1-3 being complete.

No parallel execution within Tasks 1-3. The plan order is the required execution order.

### 5. Risk check
- **Tailwind v4 arbitrary values:** `py-[120px]` uses square-bracket arbitrary value syntax — fully supported in Tailwind v4. No risk.
- **Tailwind v4 standard classes:** `max-w-6xl`, `grid-cols-2`, `md:grid-cols-3`, `lg:grid-cols-5`, `gap-4`, `rounded-lg`, `border`, `border-gray-200`, `bg-white`, `p-6`, `shadow-sm` — all standard, all exist in Tailwind v4. No risk.
- **Mobile layout:** 5 cards in 2-column grid produces a 2+2+1 layout. The lone 5th card sits in column 1 of row 3. Acceptable per spec.
- **Tablet layout:** 3 columns × 2 rows = 6 cells, 5 cards. Row 2 has 2 cards in columns 1-2, column 3 of row 2 is empty. Acceptable per spec.
- **Search form width on mobile:** `max-w-6xl` doesn't apply below 1152px viewport — flex fills available width. No overflow risk.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-hero-stats-tweaks.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
