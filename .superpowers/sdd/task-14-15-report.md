# Task 14 (Sitemap) & Task 15 (Robots.txt) Report

## Status: DONE

## Files Created
- `frontend/app/sitemap.ts` — Dynamic sitemap generator using Next.js `MetadataRoute.Sitemap`.
- `frontend/app/robots.ts` — Robots.txt generator using Next.js `MetadataRoute.Robots`.

Both files transcribed verbatim per task instructions (no Next.js 16 adaptation).

## Implementation Summary

### sitemap.ts
- Static pages: `/`, `/cables`, `/equipments`, `/manufacturers` (priority 0.9–1.0, weekly).
- `/match` intentionally excluded (noindex tool page).
- Dynamic cable pages from `api.cables.sitemap()` → `/cables/{brand_slug}/{slug}` (priority 0.7, monthly).
- Dynamic equipment pages from `api.equipments.sitemap()` → `/equipments/{brand_slug}/{slug}` (priority 0.7, monthly).
- Dynamic manufacturer pages from `api.manufacturers.list()` → `/manufacturers/{slug}` (priority 0.6, monthly).
- `SITE_URL` resolved from `NEXT_PUBLIC_SITE_URL` env var with `https://www.unowire.com` fallback.

### robots.ts
- Single rule: `userAgent: *`, `allow: /`, `disallow: ['/match', '/api/']`.
- Sitemap pointer: `${SITE_URL}/sitemap.xml`.

## Verification

### tsc check
Command: `npx tsc --noEmit` (run from `d:\projects\unowire\frontend`)
Result: **Exit code 0 — 0 errors.**

### API method compatibility confirmed
- `api.cables.sitemap()` — exists (api.ts:98–104).
- `api.equipments.sitemap()` — exists (api.ts:141–147).
- `api.manufacturers.list()` — exists (api.ts:33–35).

## Commit
- SHA: `c32c538`
- Subject: `feat: add dynamic sitemap.xml and robots.txt routes`
- Files: 2 changed, 53 insertions(+)
- Repository: `d:\projects\unowire` (branch: master)

## Notes
- Git emitted LF→CRLF warnings on Windows (cosmetic only; line-ending normalization, no content impact).
- No Next.js 16 adaptation was performed, per task instructions ("Transcribe verbatim").
