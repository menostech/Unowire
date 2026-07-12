# Push Project to GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the unowire monorepo (master + feat/media-picker-modal branches) to a pre-created GitHub repository using gh CLI for authentication, with a clean .gitignore.

**Architecture:** Update .gitignore to exclude runtime artifacts → install gh CLI → authenticate via browser → configure remote → commit pending changes → push both branches → verify.

**Tech Stack:** Git, GitHub CLI (gh), PowerShell on Windows

**Spec:** `docs/superpowers/specs/2026-07-12-push-to-github-design.md`

---

## File Structure

- **Modify:** `.gitignore` — append exclusion rules for runtime uploads, venv, local files
- **No code files created or modified**

## Special Note on Interactive Steps

This plan contains **user-interactive steps** that cannot be executed by a subagent:
- Task 2: `winget install` may prompt for confirmation
- Task 3: `gh auth login` requires user to select options and complete browser OAuth
- Task 4: requires user-provided GitHub repo URL
- Task 6: push may prompt for credentials (handled by gh)

Tasks 1 and 5 are automatable. Tasks 2-4 and 6 require user-in-the-loop. Execute inline with checkpoints, OR dispatch subagent for Tasks 1 and 5 only and handle 2-4, 6 interactively.

---

### Task 1: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append exclusion rules to .gitignore**

Append the following to the end of `d:\projects\unowire\.gitignore` (after the existing line `backend/fix_files.py`):

```
# Runtime uploads (user-uploaded media, not source code)
backend/media/uploads/

# Python virtual env
backend/venv/

# Misc local files
cookies.txt
industries.json
```

- [ ] **Step 2: Verify .gitignore is correct**

Run from `d:\projects\unowire`:
```powershell
git check-ignore -v backend/media/uploads/test.webp backend/venv/Scripts/python.exe cookies.txt industries.json
```
Expected: each path prints with the matching .gitignore rule. If any path is NOT ignored, the .gitignore edit failed — fix before continuing.

- [ ] **Step 3: Verify untracked file list is now clean**

Run from `d:\projects\unowire`:
```powershell
git status --short
```
Expected: the untracked files `backend/media/uploads/*.webp`, `cookies.txt`, `industries.json` NO LONGER appear. The files `docs/PROJECT_STRUCTURE.md`, `docs/PROJECT_STRUCTURE.zh-CN.md`, `frontend/public/cable-default.svg` SHOULD still appear as untracked (`??`).

- [ ] **Step 4: Commit**

Run from `d:\projects\unowire`:
```powershell
git add .gitignore
git commit -m "chore: exclude runtime uploads, venv, and local files from git"
```

---

### Task 2: Install gh CLI

**Files:** None (system tool installation)

- [ ] **Step 1: Check if gh is already installed**

Run:
```powershell
gh --version
```
- If output shows version (e.g., `gh version 2.x.x`), skip to Task 3.
- If error "gh not recognized", continue to Step 2.

- [ ] **Step 2: Install gh CLI via winget**

Run:
```powershell
winget install --id GitHub.cli -e
```
Expected: installation completes successfully.

- [ ] **Step 3: Restart terminal and verify gh is on PATH**

Close and reopen the terminal, then run:
```powershell
gh --version
```
Expected: shows version number like `gh version 2.x.x (date)`.

If still not found after terminal restart:
- Fallback A: download msi from https://cli.github.com/ and install manually
- Fallback B: check if gh is at `C:\Program Files\GitHub CLI\gh.exe` and add to PATH

---

### Task 3: Authenticate with GitHub

**Files:** None (authentication only)

**This step is interactive — user must complete it manually.**

- [ ] **Step 1: Run gh auth login**

Run:
```powershell
gh auth login
```

Respond to the interactive prompts as follows:
- **What account do you want to log into?** → `GitHub.com`
- **What is your preferred protocol for Git operations?** → `HTTPS`
- **Authenticate Git with your GitHub credentials?** → `Y` (yes)
- **How would you like to authenticate GitHub CLI?** → `Login with a web browser`

- [ ] **Step 2: Complete browser OAuth**

The terminal displays a one-time code (e.g., `XXXX-XXXX`) and prompts to press Enter to open browser.
- Press Enter
- Browser opens to https://github.com/login/device
- Paste the one-time code
- Click "Authorize github"

If browser doesn't open automatically:
- Manually visit https://github.com/login/device
- Enter the code shown in terminal

- [ ] **Step 3: Verify authentication**

Run:
```powershell
gh auth status
```
Expected: output includes `Logged in to github.com as <username>` and `Token: gho_****` and `Git operations protocol: https`.

If authentication failed, retry from Step 1.

---

### Task 4: Configure git remote

**Files:** None (git config only)

**Requires user-provided GitHub repo URL.**

- [ ] **Step 1: Get the GitHub repo URL from user**

Ask the user for their GitHub repository URL. It should look like:
`https://github.com/<username>/unowire.git`

- [ ] **Step 2: Add origin remote**

Replace `<REPO_URL>` with the actual URL provided by the user:
```powershell
git remote add origin <REPO_URL>
```

- [ ] **Step 3: Verify remote is configured**

Run:
```powershell
git remote -v
```
Expected: two lines showing `origin <REPO_URL> (fetch)` and `origin <REPO_URL> (push)`.

If the remote already exists (error: "remote origin already exists"):
```powershell
git remote set-url origin <REPO_URL>
```

---

### Task 5: Commit all pending changes

**Files:**
- Modifies: 22 tracked files (cable detail page, manufacturers pages, admin page, etc.)
- Adds: 3 new files (`docs/PROJECT_STRUCTURE.md`, `docs/PROJECT_STRUCTURE.zh-CN.md`, `frontend/public/cable-default.svg`)

- [ ] **Step 1: Review what will be committed**

Run from `d:\projects\unowire`:
```powershell
git status --short
```
Expected output (22 modified `M` files + 3 untracked `??` files):
```
 M backend/Dockerfile
 M backend/alembic/versions/f5a6b7c8d9e0_add_admin_menu_items.py
 M backend/app/schemas/taxonomy.py
 M docker-compose.yml
 M docs/superpowers/plans/2026-07-08-inmail.md
 M frontend/Dockerfile
 M frontend/app/(site)/cable/[brand_slug]/[slug]/page.tsx
 M frontend/app/(site)/cables/[industry]/[category]/[product-type]/page.tsx
 M frontend/app/(site)/cables/page.tsx
 M frontend/app/(site)/manufacturers/[slug]/page.tsx
 M frontend/app/(site)/manufacturers/page.tsx
 M frontend/app/(site)/page.tsx
 M frontend/app/admin/(dashboard)/layout.tsx
 M frontend/app/admin/(dashboard)/manufacturers/page.tsx
 M frontend/app/api/admin/uploads/route.ts
 M frontend/app/globals.css
 M frontend/app/sitemap.ts
 M frontend/components/admin/form/MediaUploader.tsx
 M frontend/components/admin/layout/AdminSidebar.tsx
 M frontend/components/cable/CableFilters.tsx
 M frontend/data/cables.json
 M frontend/lib/clientUploads.ts
 M frontend/next.config.js
?? docs/PROJECT_STRUCTURE.md
?? docs/PROJECT_STRUCTURE.zh-CN.md
?? frontend/public/cable-default.svg
```

**Important:** `backend/media/uploads/*.webp`, `cookies.txt`, `industries.json` must NOT appear (excluded by .gitignore from Task 1). If they do appear, Task 1 failed — go back and fix.

- [ ] **Step 2: Stage all changes**

Run:
```powershell
git add -A
```

- [ ] **Step 3: Commit**

Run:
```powershell
git commit -m "feat: manufacturer recommendations sidebar, cable detail image, admin list columns"
```

- [ ] **Step 4: Verify commit succeeded**

Run:
```powershell
git log --oneline -3
git status
```
Expected:
- `git log` shows the new commit at HEAD
- `git status` shows `nothing to commit, working tree clean`

---

### Task 6: Push both branches to GitHub

**Files:** None (git push only)

- [ ] **Step 1: Push master branch**

Run from `d:\projects\unowire`:
```powershell
git checkout master
git push -u origin master
```
Expected: output like `* [new branch] master -> master` and `branch 'master' set up to track 'origin/master'`.

If push is rejected because remote has commits (README/.gitignore created on GitHub):
```powershell
git pull --rebase origin master
git push -u origin master
```

- [ ] **Step 2: Push feat/media-picker-modal branch**

Run:
```powershell
git checkout feat/media-picker-modal
git push -u origin feat/media-picker-modal
```
Expected: output like `* [new branch] feat/media-picker-modal -> feat/media-picker-modal`.

- [ ] **Step 3: Verify both branches are on remote**

Run:
```powershell
git branch -r
```
Expected output includes:
```
  origin/master
  origin/feat/media-picker-modal
```

---

### Task 7: Verify on GitHub

**Files:** None (verification only)

- [ ] **Step 1: Verify branches via gh CLI**

Run:
```powershell
gh api repos/<username>/unowire/branches --jq ".[].name"
```
Expected: output includes `master` and `feat/media-picker-modal`.

(Replace `<username>` with the actual GitHub username.)

- [ ] **Step 2: Verify excluded paths are not in repo**

Run:
```powershell
gh api repos/<username>/unowire/contents/node_modules
```
Expected: 404 error (`Not Found`) — confirms node_modules not pushed.

Run:
```powershell
gh api repos/<username>/unowire/contents/backend/venv
```
Expected: 404 error.

Run:
```powershell
gh api repos/<username>/unowire/contents/cookies.txt
```
Expected: 404 error.

- [ ] **Step 3: Verify key files ARE in repo**

Run:
```powershell
gh api repos/<username>/unowire/contents/frontend/public/cable-default.svg --jq ".name"
```
Expected: `cable-default.svg`.

Run:
```powershell
gh api repos/<username>/unowire/contents/docs/PROJECT_STRUCTURE.md --jq ".name"
```
Expected: `PROJECT_STRUCTURE.md`.

- [ ] **Step 4: Set default branch to master (if needed)**

Run:
```powershell
gh api repos/<username>/unowire -X PATCH -f default_branch=master --jq ".default_branch"
```
Expected: `master`.

- [ ] **Step 5: Open repo in browser for final visual check**

Run:
```powershell
gh repo view --web
```
Expected: browser opens to the repo page showing both branches in the branch dropdown.

---

## Self-Review

**1. Spec coverage:**
- Spec Step 1 (.gitignore) → Task 1 ✓
- Spec Step 2 (install gh) → Task 2 ✓
- Spec Step 3 (auth) → Task 3 ✓
- Spec Step 4 (remote) → Task 4 ✓
- Spec Step 5 (commit) → Task 5 ✓
- Spec Step 6 (push) → Task 6 ✓
- Spec Step 7 (verify) → Task 7 ✓
- Edge cases (gh not on PATH, auth fail, push rejected) → covered in respective tasks ✓

**2. Placeholder scan:** No TBD/TODO. All commands are concrete with expected outputs. The only variable is `<REPO_URL>` and `<username>` which must come from the user — this is documented in Task 4 Step 1 and Task 7.

**3. Type consistency:** N/A (no code/types).

No issues found. Plan is complete.
