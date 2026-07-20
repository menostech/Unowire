# Hero Search Polish & Comprehensive Text Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish hero search (white input text + Equipment popular chips) and extend in-memory text filters so `q=` matches manufacturer name, brand name, category label, and spec keywords/values across cable and equipment search.

**Architecture:** Three-file frontend-only change. `HeroSearch.tsx` gets a className swap and a new chip row; `filter.ts` and `equipmentFilter.ts` get extended filter predicates using already-preloaded data (no new fetches, no backend changes). Cable → manufacturer lookup is two-hop (cable → brand → manufacturer) per the type definitions.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Docker Compose (for build verification).

**Spec:** `docs/superpowers/specs/2026-07-20-hero-search-polish-design.md`

---

### Task 1: Extend `filterCablesByText` (global cable search) predicate

**Files:**
- Modify: `frontend/lib/filter.ts:190-194`

**Why first:** This is the global cable search used by `/cables?q=`. Pure predicate extension, no other code touches it. Independent of Task 2 (scoped filter) and Task 3 (equipment filter).

- [ ] **Step 1: Read current `filterCablesByText` predicate to confirm exact content**

Run: read `frontend/lib/filter.ts` lines 179-220

Expected to find at lines 190-194:
```ts
  let filtered = allCables.filter(c =>
    c.model.toLowerCase().includes(q) ||
    c.base_description.toLowerCase().includes(q) ||
    c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
  );
```

And at lines 187-188 (these maps are reused, do NOT touch them):
```ts
  const brandMap = new Map(allBrands.map(b => [b.id, b]));
  const manufacturerMap = new Map(allManufacturers.map(m => [m.id, m]));
```

- [ ] **Step 2: Replace the predicate**

Use Edit tool on `frontend/lib/filter.ts`:

old_string:
```
  let filtered = allCables.filter(c =>
    c.model.toLowerCase().includes(q) ||
    c.base_description.toLowerCase().includes(q) ||
    c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
  );
```

new_string:
```
  let filtered = allCables.filter(c => {
    if (c.model.toLowerCase().includes(q)) return true;
    if (c.base_description.toLowerCase().includes(q)) return true;
    if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
    if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
    const brand = brandMap.get(c.brand_id);
    if (brand && brand.name.toLowerCase().includes(q)) return true;
    if (brand) {
      const mfr = manufacturerMap.get(brand.manufacturer_id);
      if (mfr && mfr.name.toLowerCase().includes(q)) return true;
    }
    return false;
  });
```

Rationale:
- Add `common_specs[].value` match — direct on `cable.common_specs`
- Add `brand.name` match via `brandMap.get(c.brand_id)` — `brandMap` already exists at line 187
- Add `manufacturer.name` match via `manufacturerMap.get(brand.manufacturer_id)` — two-hop lookup (cable → brand → manufacturer), `manufacturerMap` already exists at line 188. This mirrors the existing facet-enrichment pattern at line 204.
- Restructure to `if (...) return true; ... return false;` form for readability with multiple conditions.

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/lib/filter.ts` lines 188-205

Expected:
```ts
  let filtered = allCables.filter(c => {
    if (c.model.toLowerCase().includes(q)) return true;
    if (c.base_description.toLowerCase().includes(q)) return true;
    if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
    if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
    const brand = brandMap.get(c.brand_id);
    if (brand && brand.name.toLowerCase().includes(q)) return true;
    if (brand) {
      const mfr = manufacturerMap.get(brand.manufacturer_id);
      if (mfr && mfr.name.toLowerCase().includes(q)) return true;
    }
    return false;
  });
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/lib/filter.ts
git commit -m "feat(cables): expand filterCablesByText to match brand, manufacturer, common_specs"
```

Expected: 1 file changed, ~10 insertions, ~3 deletions

---

### Task 2: Extend `filterCables` (scoped cable search) predicate

**Files:**
- Modify: `frontend/lib/filter.ts:102-109`

**Why:** The scoped cable filter at `/cables/[industry]/[category]/[product_type]?q=` must match the same fields as the global filter (Task 1) so users get consistent search behavior. Same file, different function.

- [ ] **Step 1: Read current `filterCables` predicate to confirm exact content**

Run: read `frontend/lib/filter.ts` lines 100-115

Expected to find at lines 102-109:
```ts
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }
```

And at lines 91-92 (these maps are reused, do NOT touch them):
```ts
  const brandMap = new Map(allBrands.map(b => [b.id, b]));
  const manufacturerMap = new Map(allManufacturers.map(m => [m.id, m]));
```

- [ ] **Step 2: Replace the predicate**

Use Edit tool on `frontend/lib/filter.ts`:

old_string:
```
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }
```

new_string:
```
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c => {
      if (c.model.toLowerCase().includes(q)) return true;
      if (c.base_description.toLowerCase().includes(q)) return true;
      if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
      if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
      const brand = brandMap.get(c.brand_id);
      if (brand && brand.name.toLowerCase().includes(q)) return true;
      if (brand) {
        const mfr = manufacturerMap.get(brand.manufacturer_id);
        if (mfr && mfr.name.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }
```

Notes:
- Same predicate as Task 1, wrapped in the existing `if (filterParams.q)` block.
- `brandMap` and `manufacturerMap` already exist at lines 91-92 — reuse them.
- The `const q = filterParams.q.toLowerCase();` line is kept inside the `if` block (matches existing pattern).

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/lib/filter.ts` lines 100-120

Expected:
```ts
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c => {
      if (c.model.toLowerCase().includes(q)) return true;
      if (c.base_description.toLowerCase().includes(q)) return true;
      if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
      if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
      const brand = brandMap.get(c.brand_id);
      if (brand && brand.name.toLowerCase().includes(q)) return true;
      if (brand) {
        const mfr = manufacturerMap.get(brand.manufacturer_id);
        if (mfr && mfr.name.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/lib/filter.ts
git commit -m "feat(cables): expand scoped filterCables to match brand, manufacturer, common_specs"
```

Expected: 1 file changed, ~12 insertions, ~5 deletions

---

### Task 3: Extend `filterEquipment` predicate

**Files:**
- Modify: `frontend/lib/equipmentFilter.ts:71-79`

**Why:** Equipment search currently only matches `model` and `description`. User wants it to also match `manufacturer.name`, `category.label`, and `applicable_specs` fields (spec_key, min, max, allowed_values).

- [ ] **Step 1: Read current `filterEquipment` predicate to confirm exact content**

Run: read `frontend/lib/equipmentFilter.ts` lines 70-80

Expected to find at lines 71-79:
```ts
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.model.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
    );
  }
```

- [ ] **Step 2: Replace the predicate**

Use Edit tool on `frontend/lib/equipmentFilter.ts`:

old_string:
```
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.model.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
    );
  }
```

new_string:
```
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter((e) => {
      if (e.model.toLowerCase().includes(q)) return true;
      if ((e.description ?? '').toLowerCase().includes(q)) return true;
      if (e.manufacturer && e.manufacturer.name.toLowerCase().includes(q)) return true;
      if (e.category && e.category.label.toLowerCase().includes(q)) return true;
      if (
        e.applicable_specs.some((spec) => {
          if (spec.spec_key.toLowerCase().includes(q)) return true;
          if (spec.min !== undefined && String(spec.min).includes(q)) return true;
          if (spec.max !== undefined && String(spec.max).includes(q)) return true;
          if (spec.allowed_values && spec.allowed_values.some((v) => String(v).toLowerCase().includes(q))) return true;
          return false;
        })
      ) return true;
      return false;
    });
  }
```

Rationale:
- `e.manufacturer` and `e.category` are optional (`?` in `RecommendedEquipment` type) — guarded with `&&`
- `e.applicable_specs` is always an array (possibly empty) — `.some(...)` is safe
- `spec.min`/`spec.max` are optional numbers — `String(spec.min)` converts to string for substring match (e.g., searching "10" matches min=10)
- `spec.allowed_values` is optional array of `(string | number)[]` — guarded with `&&` and `String(v)` for uniform comparison
- Restructure to `if (...) return true; ... return false;` form for readability

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/lib/equipmentFilter.ts` lines 70-95

Expected:
```ts
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter((e) => {
      if (e.model.toLowerCase().includes(q)) return true;
      if ((e.description ?? '').toLowerCase().includes(q)) return true;
      if (e.manufacturer && e.manufacturer.name.toLowerCase().includes(q)) return true;
      if (e.category && e.category.label.toLowerCase().includes(q)) return true;
      if (
        e.applicable_specs.some((spec) => {
          if (spec.spec_key.toLowerCase().includes(q)) return true;
          if (spec.min !== undefined && String(spec.min).includes(q)) return true;
          if (spec.max !== undefined && String(spec.max).includes(q)) return true;
          if (spec.allowed_values && spec.allowed_values.some((v) => String(v).toLowerCase().includes(q))) return true;
          return false;
        })
      ) return true;
      return false;
    });
  }
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/lib/equipmentFilter.ts
git commit -m "feat(equipment): expand filterEquipment to match manufacturer, category, applicable_specs"
```

Expected: 1 file changed, ~15 insertions, ~5 deletions

---

### Task 4: HeroSearch — add Equipment popular searches

**Files:**
- Modify: `frontend/components/home/HeroSearch.tsx:24` (add new constant) and `frontend/components/home/HeroSearch.tsx:116-130` (render popular row for both tabs)

**Why:** User wants the Equipment tab to also show popular search chips. Currently only Cable tab shows them. The popular searches (`Komax`, `Alpha 488`, `Gamma 333`, `KMV`) are derived from the seed data in `frontend/data/recommended-equipments.json` and `backend/alembic/versions/e3f4a5b6c7d8_add_equipment_manufacturers_and_categories.py:71-83`.

- [ ] **Step 1: Read current HeroSearch.tsx to confirm exact content**

Run: read `frontend/components/home/HeroSearch.tsx` lines 22-30 and lines 115-132

Expected at line 24:
```ts
const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];
```

Expected at lines 116-130:
```tsx
        {/* Popular searches — only on Cable tab */}
        {activeTab === 'cable' && (
          <div className="mt-4 text-xs opacity-90">
            <span className="mr-2">Popular:</span>
            {POPULAR_CABLE_SEARCHES.map(q => (
              <Link
                key={q}
                href={`/cables?q=${encodeURIComponent(q)}`}
                className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
              >
                {q}
              </Link>
            ))}
          </div>
        )}
```

- [ ] **Step 2: Add the POPULAR_EQUIPMENT_SEARCHES constant**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];
```

new_string:
```
const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];
const POPULAR_EQUIPMENT_SEARCHES = ['Komax', 'Alpha 488', 'Gamma 333', 'KMV'];
```

- [ ] **Step 3: Replace the popular searches render block**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
        {/* Popular searches — only on Cable tab */}
        {activeTab === 'cable' && (
          <div className="mt-4 text-xs opacity-90">
            <span className="mr-2">Popular:</span>
            {POPULAR_CABLE_SEARCHES.map(q => (
              <Link
                key={q}
                href={`/cables?q=${encodeURIComponent(q)}`}
                className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
              >
                {q}
              </Link>
            ))}
          </div>
        )}
```

new_string:
```
        {/* Popular searches — per active tab */}
        {(() => {
          const popular = activeTab === 'cable' ? POPULAR_CABLE_SEARCHES : POPULAR_EQUIPMENT_SEARCHES;
          const basePath = activeTab === 'cable' ? '/cables' : '/equipment';
          return (
            <div className="mt-4 text-xs opacity-90">
              <span className="mr-2">Popular:</span>
              {popular.map(q => (
                <Link
                  key={q}
                  href={`${basePath}?q=${encodeURIComponent(q)}`}
                  className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
                >
                  {q}
                </Link>
              ))}
            </div>
          );
        })()}
```

Notes:
- IIFE form `(() => { ... })()` keeps the JSX clean while computing `popular` and `basePath` per tab.
- Both tabs now render the popular row. The chip styling (`bg-white/20 px-3 py-1 text-white`) is identical for both tabs — visual consistency.
- The `key={q}` works because cable and equipment popular searches are disjoint sets (no overlap between `UL1007` etc. and `Komax` etc.).

- [ ] **Step 4: Verify the file content after edit**

Run: read `frontend/components/home/HeroSearch.tsx` lines 22-30 and lines 115-140

Expected at line 24-25:
```ts
const POPULAR_CABLE_SEARCHES = ['UL1007', 'AVSS', 'UL1015', 'UL2468'];
const POPULAR_EQUIPMENT_SEARCHES = ['Komax', 'Alpha 488', 'Gamma 333', 'KMV'];
```

Expected at lines 116-138 (popular row rendered for both tabs via IIFE):
```tsx
        {/* Popular searches — per active tab */}
        {(() => {
          const popular = activeTab === 'cable' ? POPULAR_CABLE_SEARCHES : POPULAR_EQUIPMENT_SEARCHES;
          const basePath = activeTab === 'cable' ? '/cables' : '/equipment';
          return (
            <div className="mt-4 text-xs opacity-90">
              <span className="mr-2">Popular:</span>
              {popular.map(q => (
                <Link
                  key={q}
                  href={`${basePath}?q=${encodeURIComponent(q)}`}
                  className="mr-2 inline-block rounded-full bg-white/20 px-3 py-1 text-white hover:bg-white/30"
                >
                  {q}
                </Link>
              ))}
            </div>
          );
        })()}
```

- [ ] **Step 5: Commit**

Run:
```bash
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): add Equipment popular searches and white input text"
```

Wait — this commit message is premature. The input text change (white text) is Task 5, not this task. Use this message instead:

```bash
git commit -m "feat(home): add popular search chips for Equipment tab"
```

Expected: 1 file changed, ~15 insertions, ~10 deletions

---

### Task 5: HeroSearch — white input text

**Files:**
- Modify: `frontend/components/home/HeroSearch.tsx:106` (input className)

**Why:** User wants search input text to be `#ffffff` (white). Currently it's `text-slate-900` (dark), which is hard to read against the dark hero overlay. Tailwind v4 preflight makes input backgrounds transparent by default, so the hero image shows through — no `bg-*` class needed.

- [ ] **Step 1: Read current input className to confirm exact content**

Run: read `frontend/components/home/HeroSearch.tsx` lines 100-115

Expected at line 106:
```tsx
            className="flex-1 border-0 px-4 py-3 text-sm text-slate-900 outline-none"
```

- [ ] **Step 2: Replace the input className**

Use Edit tool on `frontend/components/home/HeroSearch.tsx`:

old_string:
```
            className="flex-1 border-0 px-4 py-3 text-sm text-slate-900 outline-none"
```

new_string:
```
            className="flex-1 border-0 px-4 py-3 text-sm text-white outline-none placeholder:text-white/70"
```

Rationale:
- `text-slate-900` → `text-white` — typed text becomes #ffffff, readable against dark hero overlay
- Add `placeholder:text-white/70` — placeholder is white at 70% opacity, distinguishes from typed text
- No `bg-*` class — Tailwind v4 preflight (loaded via `@import "tailwindcss"` in `frontend/app/globals.css:1`) makes input backgrounds transparent by default. Hero image shows through.
- Search button stays `bg-blue-600 text-white` — visual anchor (do NOT touch)

- [ ] **Step 3: Verify the file content after edit**

Run: read `frontend/components/home/HeroSearch.tsx` lines 100-115

Expected at line 106:
```tsx
            className="flex-1 border-0 px-4 py-3 text-sm text-white outline-none placeholder:text-white/70"
```

- [ ] **Step 4: Commit**

Run:
```bash
git add frontend/components/home/HeroSearch.tsx
git commit -m "feat(home): make hero search input text white with translucent placeholder"
```

Expected: 1 file changed, 1 insertion, 1 deletion

---

### Task 6: Docker build verification

**Files:**
- No file changes — build verification only

**Why:** Per project constraint, the frontend container must build successfully via `docker compose --env-file .env.docker build frontend`. tsc runs as part of `next build` and must produce 0 new errors. The most likely failure mode for this plan is a TypeScript error in the extended predicates (e.g., `e.manufacturer` being possibly-undefined not handled correctly, or `spec.min`/`spec.max` typing issues).

- [ ] **Step 1: Run docker build for frontend**

Run (blocking, may take 1-3 minutes):
```bash
docker compose --env-file .env.docker build frontend
```

Expected: build succeeds, exit code 0. Look for the final line like `=> => naming to ...frontend:latest` with no error.

- [ ] **Step 2: Inspect build output for tsc errors**

In the build log, look for the Next.js build phase output. The expected pre-existing baseline is 0 tsc errors (as of the last build on commit `2e3ac3a`). Any error is a regression.

If the build fails:
- If failure is in `filter.ts`: check that `c.common_specs` exists on `Cable` type (it does — `frontend/lib/types.ts:116`), check that `brandMap.get(c.brand_id)` returns `Brand | undefined` (it does — `Brand` has `name` and `manufacturer_id`), check that `manufacturerMap.get(brand.manufacturer_id)` returns `Manufacturer | undefined` (it does — `Manufacturer` has `name`)
- If failure is in `equipmentFilter.ts`: check that `e.manufacturer` is `EquipmentManufacturer | null` (it is — `RecommendedEquipment.manufacturer` is nullable per `frontend/lib/types.ts:168`), check that `e.category` is `EquipmentCategory | null` (it is — line 169), check that `spec.min`/`spec.max` are `number | undefined` (they are — `ApplicableSpecRule` at types.ts:121-126), check that `spec.allowed_values` is `(string | number)[] | undefined` (it is — line 125)
- If failure is in `HeroSearch.tsx`: check that the IIFE syntax is valid TSX (it is — `(() => { ... })()` is a standard pattern)

- [ ] **Step 3: Record build status in task summary**

Example: "Docker frontend build succeeded. Exit code 0. 84 pages generated. 0 tsc errors."

---

### Task 7: Restart frontend container and HTTP smoke test

**Files:**
- No file changes — runtime verification only

**Why:** The built image must be running for changes to be visible in the browser. After rebuild, the container needs to be recreated. Then smoke test the affected pages with various `q=` queries to verify the extended search predicates work.

- [ ] **Step 1: Restart frontend container with new image**

Run (blocking):
```bash
docker compose --env-file .env.docker up -d frontend
```

Expected: Container recreated. Exit code 0. Output like `Container unowire-frontend-1  Recreate ... done`.

- [ ] **Step 2: Wait for Next.js to be ready**

Run (blocking, ~5-10 seconds):
```bash
Start-Sleep -Seconds 8
docker compose --env-file .env.docker logs --tail 10 frontend
```

Expected: log line containing `Ready in` or `started server on`. If not yet ready, wait 5 more seconds and re-run.

- [ ] **Step 3: HTTP smoke test on key pages**

Run (blocking) using `curl.exe` (PowerShell aliases `curl` to `Invoke-WebRequest` which doesn't accept `-w`):
```bash
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/cables
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:3000/cables?q=UL1007"
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:3000/cables?q=Komax"
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/equipment
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:3000/equipment?q=Komax"
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:3000/equipment?q=cutting"
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/login
```

Expected: each returns `200`.

Notes on the new search queries:
- `/cables?q=Komax` — should now return cables made by Komax (NEW: previously 0 results)
- `/equipment?q=Komax` — should now return all Komax equipment (NEW: previously 0 results)
- `/equipment?q=cutting` — should now match equipment in the "Cutting & Stripping" category (NEW: matches by category.label)

- [ ] **Step 4: Manual browser verification (optional but recommended)**

Open `http://localhost:3000/` in a browser. Verify:
- Hero search input: typed text is white, placeholder is white-at-70%-opacity
- Hero search input background: transparent (hero image visible through it)
- Click Cable tab: 4 popular chips appear (`UL1007`, `AVSS`, `UL1015`, `UL2468`)
- Click Equipment tab: 4 different popular chips appear (`Komax`, `Alpha 488`, `Gamma 333`, `KMV`)
- Type `Komax` on Equipment tab and submit: results page shows all Komax equipment (Alpha 488, Gamma 333)
- Type `Komax` on Cable tab and submit: results page shows cables made by Komax (if any)
- Type `awg` on Cable tab and submit: results page shows cables with "awg" in spec values

- [ ] **Step 5: Record smoke test results in task summary**

Example: "All 8 HTTP smoke tests returned 200. Browser verified: white input text, translucent placeholder, popular chips on both tabs, Komax/awg searches return expected results."

---

### Task 8: Final commit and push

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
git log --oneline -7
```

Expected: top 6 commits should be (newest first):
1. `feat(home): make hero search input text white with translucent placeholder`
2. `feat(home): add popular search chips for Equipment tab`
3. `feat(equipment): expand filterEquipment to match manufacturer, category, applicable_specs`
4. `feat(cables): expand scoped filterCables to match brand, manufacturer, common_specs`
5. `feat(cables): expand filterCablesByText to match brand, manufacturer, common_specs`
6. `docs: add spec for hero search polish and comprehensive text search`

- [ ] **Step 3: Push to remote**

Run:
```bash
git push origin feat/media-picker-modal
```

Expected: push succeeds. If push fails due to network issues (as happened with prior pushes in this session — `Connection was reset`, `Could not connect to server`), retry later. Local commits are safe.

- [ ] **Step 4: Record final status in task summary**

Example: "6 commits pushed to `origin/feat/media-picker-modal`. Hero search polish and comprehensive text search feature complete."

---

## Self-Review

### 1. Spec coverage
- ✅ Hero search input `text-white` + `placeholder:text-white/70` — Task 5
- ✅ Hero input background transparent (no `bg-*` class added) — Task 5 (no change needed, preflight default)
- ✅ Equipment Popular searches constant + render for both tabs — Task 4
- ✅ `filterCablesByText` extended predicate (model, description, variant specs, common_specs, brand.name, manufacturer.name) — Task 1
- ✅ `filterCables` (scoped) extended predicate (same fields) — Task 2
- ✅ `filterEquipment` extended predicate (model, description, manufacturer.name, category.label, applicable_specs) — Task 3
- ✅ No backend changes — confirmed (no backend files touched)
- ✅ Docker build succeeds — Task 6
- ✅ 0 new tsc errors — Task 6 Step 2
- ✅ HTTP smoke test on `/`, `/cables?q=...`, `/equipment?q=...` — Task 7

### 2. Placeholder scan
No "TBD", "TODO", "implement later", "Add appropriate error handling", "Similar to Task N" patterns. Every step has exact code or exact commands. The one self-referential note in Task 4 Step 5 ("Wait — this commit message is premature...") is a self-correction that explicitly names the correct message — not a placeholder.

### 3. Type consistency
- `Cable` type (`frontend/lib/types.ts:101-118`): has `brand_id` (line 103), `model`, `base_description`, `common_specs: SpecItem[]` (line 116), `variants: CableVariant[]` (line 117). All referenced fields exist.
- `Brand` type (types.ts:21-29): has `manufacturer_id` (line 25), `name`. All referenced fields exist.
- `Manufacturer` type (types.ts:2-19): has `name`. Referenced field exists.
- `RecommendedEquipment` type (types.ts:157-170): has `model`, `description: string | null`, `manufacturer: EquipmentManufacturer | null` (line 168, optional), `category: EquipmentCategory | null` (line 169, optional), `applicable_specs: ApplicableSpecRule[]` (line 163). All referenced fields exist.
- `EquipmentManufacturer` type (types.ts:128-143): has `name`. Referenced field exists.
- `EquipmentCategory` type (types.ts:145-155): has `label`. Referenced field exists.
- `ApplicableSpecRule` type (types.ts:121-126): has `spec_key: string` (line 122), `min?: number` (line 123), `max?: number` (line 124), `allowed_values?: (string | number)[]` (line 125). All referenced fields exist.

All predicate field references match the type definitions exactly. No type inconsistencies.

### 4. Independence check
- Task 1 and Task 2 both modify `frontend/lib/filter.ts` — they touch different functions (`filterCablesByText` vs `filterCables`) but the file is shared. They MUST be done sequentially (Task 1 commits before Task 2 starts) to avoid edit conflicts. The plan order already enforces this.
- Task 3 modifies `frontend/lib/equipmentFilter.ts` — independent file.
- Task 4 and Task 5 both modify `frontend/components/home/HeroSearch.tsx` — Task 4 adds constant + replaces popular row; Task 5 swaps input className. They touch different lines but the file is shared. MUST be done sequentially (Task 4 commits before Task 5 starts). The plan order already enforces this.
- Tasks 6, 7, 8 are verification/housekeeping — depend on Tasks 1-5 being complete.

No parallel execution within Tasks 1-5. The plan order is the required execution order.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-hero-search-polish.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
