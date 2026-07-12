# Push Project to GitHub — Design Spec

**Date:** 2026-07-12
**Author:** brainstorming session
**Status:** approved

## Goal

Push the unowire monorepo (master + feat/media-picker-modal branches) to a pre-created GitHub repository using GitHub CLI (gh) for authentication, with a clean .gitignore so no runtime artifacts, virtual environments, or local-only files enter the repository.

## Current State

- **Working directory:** `d:\projects\unowire`
- **Branches:** `master` @ `17cc1d5`, `feat/media-picker-modal` @ `ca86b64` (current)
- **Git remote:** none configured
- **gh CLI:** not installed
- **SSH:** `~/.ssh/id_rsa` exists (unused in this plan)
- **Uncommitted changes:** 22 modified files + 7 untracked files (including `cookies.txt`, `industries.json` empty file, `backend/media/uploads/*.webp`, `docs/PROJECT_STRUCTURE*.md`, `frontend/public/cable-default.svg`)
- **.gitignore gaps:** `backend/media/uploads/`, `backend/venv/`, `cookies.txt`, `industries.json` not excluded

## Approach

Use GitHub CLI (`gh`) for authentication — user-selected choice. HTTPS protocol with credential caching handled by gh.

## Design

### Step 1: Update .gitignore

Append to existing `.gitignore`:

```
# Runtime uploads (user-uploaded media, not source code)
backend/media/uploads/

# Python virtual env
backend/venv/

# Misc local files
cookies.txt
industries.json
```

Existing entries (`node_modules/`, `.env`, `.next/`, `__pycache__/`, etc.) remain unchanged.

### Step 2: Install gh CLI

```powershell
winget install --id GitHub.cli -e
```

After install, **restart terminal** so `gh` is on PATH.

Fallback if winget fails: download msi from https://cli.github.com/

### Step 3: Authenticate

```powershell
gh auth login
```

Interactive prompt — user selects:
- GitHub.com
- HTTPS
- Login with a web browser (opens browser for OAuth)

### Step 4: Configure remote

User provides GitHub repo URL (already created). Then:

```powershell
git remote add origin https://github.com/<username>/unowire.git
```

Verify: `git remote -v` shows origin pointing to the repo.

### Step 5: Commit all pending changes

```powershell
git add -A
git commit -m "feat: manufacturer recommendations sidebar, cable detail image, admin list columns"
```

Commit content covers:
- Shared `ManufacturerRecommendations` component + integration into 3 pages (cable detail, manufacturers list, manufacturer detail)
- Cable detail page product image with default placeholder SVG
- Admin manufacturers list: new Img Rec / Text Rec columns
- Grid gap adjustment to `gap-16` (64px) on 3 pages
- `cable-default.svg` default product image
- Project structure docs (EN + ZH)
- .gitignore cleanup

### Step 6: Push both branches

```powershell
git push -u origin master
git push -u origin feat/media-picker-modal
```

### Step 7: Verify

- Visit GitHub repo URL in browser — both branches visible
- Confirm excluded paths NOT in repo: `node_modules/`, `backend/venv/`, `backend/media/uploads/`, `cookies.txt`, `industries.json`
- Set default branch to `master` in GitHub Settings → Branches (if not already)

## Edge Cases

- **gh CLI not on PATH after install:** restart terminal (Windows env var refresh). If still missing, log out/in or reboot.
- **gh auth login fails (browser doesn't open):** copy the one-time code from terminal, open https://github.com/login/device manually, paste code.
- **git push rejected (remote has commits):** user's repo was created with README/.gitignore. Fix with `git pull --rebase origin master` then push. User said repo is pre-created — assume empty (no README).
- **Large file push rejected (>100MB):** none expected. `backend/venv/` and `media/uploads/` excluded. Largest tracked files are source code.
- **credential.helper conflicts:** gh sets its own credential helper. If prior `git config credential.helper store` was set, gh overrides. No action needed.

## Non-Goals

- Setting up CI/CD
- Configuring branch protection rules
- Creating pull requests
- Migrating feature branch to master (deferred to user authorization)

## Success Criteria

1. `git remote -v` shows `origin` pointing to GitHub repo
2. `git log origin/master` matches local `master`
3. `git log origin/feat/media-picker-modal` matches local `feat/media-picker-modal`
4. GitHub repo does not contain `node_modules/`, `backend/venv/`, `backend/media/uploads/`, `cookies.txt`, or `industries.json`
5. All pending code changes are committed and pushed (22 modified files + 3 new untracked files: `docs/PROJECT_STRUCTURE.md`, `docs/PROJECT_STRUCTURE.zh-CN.md`, `frontend/public/cable-default.svg`. The other 4 untracked files — `cookies.txt`, `industries.json`, `backend/media/uploads/*.webp` — are excluded by .gitignore)
