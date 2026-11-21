# 00 — Repository Audit (RackPatch)

**Date:** 2026-11-21  
**Scope:** Phase 0 discovery — facts from the repository only.

## Stack

| Area | Finding |
|------|---------|
| App | Next.js **15.5.29** App Router (`src/app`) |
| UI | React **19**, Tailwind **3.4**, Lucide icons |
| Language | TypeScript **5**, `tsc --noEmit` |
| Auth | Better Auth (`better-auth`), session cookies, password + magic link |
| DB | PostgreSQL via Prisma **6.19** (`prisma/schema.prisma`) |
| Tests | Vitest unit/integration; Playwright smoke (`e2e/`) |
| Deploy | Dockerfile + `railway.toml`; migrate-on-start |
| License | Apache-2.0 Community Edition (`package.json` license) |
| Version | `0.2.0` |

## Product workflow (implemented core)

`PLAN → INSTALL → VERIFY → HANDOVER`

Supported today with real data paths: CSV plan import/publish, install status, multi-vendor LLDP/CDP paste (+ SSH allowlisted collect), verification findings, exceptions, physical verify (installer ≠ verifier), handover snapshots + share token, QR labels + camera scan, offline queue + field photos, sites, capacity, inventory sync, panels/circuits, spares ledger, compliance policy/cron route, integrations (NetBox dry-run, webhooks, GitOps export), grounded assistant, SVG rack twin, first-party analytics events.

## App routes (existing `page.tsx`)

### Public / auth
- `/`, `/about`, `/demo`, `/sign-in`
- `/invite/[token]`, `/share/handover/[token]`

### App shell
- `/app` — projects home
- `/app/admin` — platform admin
- `/app/workspaces/[workspaceId]/team`
- `/app/workspaces/[workspaceId]/sites`

### Project-scoped
- `/app/projects/[projectId]` overview
- `.../plan`, `.../cables`, `.../cables/[linkId]`
- `.../lldp` (evidence), `.../collection` (SSH)
- `.../exceptions`, `.../compliance`, `.../qc`
- `.../capacity`, `.../inventory`, `.../twin`, `.../assistant`
- `.../panels`, `.../spares`, `.../handover`, `.../handover/[snapshotId]`
- `.../labels`, `.../scan`
- `.../api`, `.../integrations`, `.../analytics`

### APIs
- `/api/health`, `/api/ready`, `/api/auth/[...all]`
- `/api/v1/projects/[projectId]/summary|cables|gitops`
- `/api/field-photos/[photoId]`
- `/api/internal/compliance-check`

## UI architecture today

- Shell: [`src/components/app-shell.tsx`](../../src/components/app-shell.tsx) — navy sidebar, minimal global nav (Projects + Admin)
- Project chrome: [`src/components/project-subnav.tsx`](../../src/components/project-subnav.tsx) — long horizontal tab strip ( overcrowded vs design references)
- Primitives: [`src/components/ui.tsx`](../../src/components/ui.tsx)
- Tokens: [`src/app/globals.css`](../../src/app/globals.css) — current Cisco-inspired teal (`#049fd9`), not yet the reference navy/blue (`#071B33` / `#2563EB`)

## Design references

- ZIP: `C:\Users\mailp\Downloads\RackPatch_UI_Designs_Complete.zip` (~119 MB)
- Extracted to: `design-references/rackpatch/` (66 PNGs + README)
- Filenames are generative and **not** reliable page numbers (per archive README)

## Git state (at audit)

- Branch: `master` tracking `origin/master`
- Large uncommitted set: prior CE feature slices (Phases 10–19, 22–23) + scan/offline/API work **not yet committed**
- No deploy/publish performed in this phase

## Environment (documented in `.env.example`)

Notable: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `FIELD_SECRETS_KEY`, `COMPLIANCE_CRON_SECRET`, `OPENAI_API_KEY` (optional), `INTEGRATION_ALLOW_PRIVATE_NETWORKS`, `HOSTED_SAAS`

## Constraints carried forward

- No inventing metrics (mock KPIs in PNGs are **not** production data)
- No worker fleet / native mobile / unverified compliance certifications
- No NetBox writes; SSH allowlisted commands only
- No deploy/push without approval
- Apache 2.0 CE preserved
