# RackPatch — Open-Source Repository Audit

**Audit date:** 2026-11-21  
**Intended license:** Apache License 2.0  
**Recommendation:** **NO-GO** for public release until remediation in this report is complete.

Status categories: **PASS** | **WARNING** | **BLOCKED** | **NOT VERIFIED**

---

## 1. Executive summary

RackPatch is a working Next.js 15 + Prisma + PostgreSQL + Better Auth application for data-center cabling plan import, installation tracking, Cisco NX-OS LLDP verification, exceptions, and handover. The product is **not open-source ready**: missing LICENSE/OSS docs/CI, empty git history, and a commercial activation gate that blocks Community Edition self-host use.

| Area | Status |
|------|--------|
| Framework / structure / lockfile | **PASS** |
| Dependency licenses vs Apache-2.0 | **PASS** (see DEPENDENCY_LICENSE_AUDIT.md) |
| Secrets in tracked source | **PASS** |
| Git history secret scan | **NOT VERIFIED** |
| LICENSE / NOTICE / OSS community docs | **BLOCKED** |
| CI/CD | **BLOCKED** |
| Self-host without paid activation | **BLOCKED** (Community Edition) |
| Docker / health / fixtures | **PASS** |
| Railway config-as-code | **WARNING** |

---

## 2. Repository inventory

| Item | Finding | Status |
|------|---------|--------|
| Framework | Next.js **15.1.3**, React **19**, TypeScript 5, App Router (`src/app`) | **PASS** |
| Package manager | npm + `package-lock.json` (lockfileVersion 3) | **PASS** |
| `package.json` | `"private": true`, no `license` field, no `engines` | **WARNING** |
| Database / ORM | PostgreSQL + Prisma **6.19.0**; migration `20261120210427_init` | **PASS** |
| Auth | Better Auth **1.7.27**, Prisma adapter, DB sessions (14d), magic link; email/password only if `ENABLE_DEV_LOGIN` | **PASS** |
| Docker | Multi-stage `Dockerfile` (node:22-alpine), `.dockerignore`, `docker-compose.yml` (Postgres 16) | **PASS** |
| Railway | Documented in README; no `railway.toml` / `railway.json` | **WARNING** |
| Env template | `.env.example` | **PASS** |
| Health | `GET /api/health` | **PASS** |
| Existing LICENSE / NOTICE | None | **BLOCKED** |
| CI (`.github/workflows`) | None | **BLOCKED** |
| Git remotes / commits / tags | **0 commits**, no remotes, all files untracked | **BLOCKED** |

### Application structure

- `src/app` — routes, API, server actions  
- `src/components` — UI  
- `src/lib` — auth, authz, csv, lldp, verify, db, env  
- `prisma/` — schema, migrations, seed  
- `fixtures/` — synthetic CSV + LLDP  
- `tests/` — Vitest suites  
- `scripts/` — activate, workflow, authz tests  

### Environment variables (actual)

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ENABLE_DEV_LOGIN`, `RESEND_API_KEY`, `EMAIL_FROM`, `PLATFORM_ADMIN_EMAILS`, `SEED_DEMO`

---

## 3. Source ownership questions

| Question | Status | Notes |
|----------|--------|-------|
| Copyright holder for original RackPatch code | **NOT VERIFIED** pending confirmation | Proposed: `Copyright 2026 K G Pramod` |
| Third-party contractor IP claims | **NOT VERIFIED** | Confirm before public release |
| Fixtures derived from customer data | **PASS** (synthetic labels) | Keep labeled synthetic |
| create-next-app / Prisma / Better Auth scaffold | **PASS** with attribution | Covered by upstream licenses + NOTICE |

Do not assume ownership solely because files exist in the working tree.

---

## 4. Asset and font audit

| Asset | Status | Redistributable? |
|-------|--------|------------------|
| `public/*.svg` (Next defaults) | **PASS** | Yes |
| Custom product screenshots / logo pack | Absent | Capture later for marketplace |
| Local font files | None | N/A |
| Geist / Geist Mono via `next/font/google` | **PASS** | Yes under **OFL-1.1** with attribution |
| `fixtures/demo-*.csv|txt` | **PASS** | Synthetic |
| Vendor NX-OS binaries | None | N/A |

---

## 5. Security findings

| Finding | Severity | Component | Blocks release? | Recommended fix |
|---------|----------|-----------|-----------------|-----------------|
| No live API keys / private keys in source | — | repo | No | Keep secrets in env only |
| Local `.env` gitignored / untracked | Info | `.env` | No | Never force-add |
| `.env.production` / `.env.development` not ignored | Medium | `.gitignore` | Soft | Ignore `.env.*`, keep `!.env.example` |
| Git history secret scan impossible (0 commits) | High (process) | git | **Yes until scanned** | First commit carefully; run Gitleaks |
| Gitleaks not available / not run | Medium | tooling | Soft | Install + CI |
| Demo password in seed/scripts/README | Low–Med | seed | Soft if gated | Keep `SEED_DEMO` opt-in; never seed prod |
| Invite token logged without prod guard | Medium | team page | Soft | Gate or remove |
| Compose/local DB defaults in `.env.example` | Low | docs | No | Document local-only |

**No BLOCKED finding for a confirmed committed production secret.**

---

## 6. Open-source readiness (Community Edition)

| Requirement | Status |
|-------------|--------|
| Runs without Stripe / payment gateway | **PASS** |
| Optional email (Resend); works without proprietary SaaS | **PASS** |
| No hardcoded production DB URL | **PASS** |
| Productive mutations without PILOT/PAID activation | **BLOCKED** |

Evidence: `commercialAllowsMutations()` in `src/lib/authz.ts` allows only `PILOT` | `PAID`. New projects start as `NONE`. Demo projects bypass via `isDemo`.

---

## 7. Railway deployment readiness

| Item | Status |
|------|--------|
| Dockerfile / PORT / HOSTNAME | **PASS** (verify in Phase 3) |
| Migrations committed | **PASS** |
| Health endpoint | **PASS** |
| Pre-deploy migrate config | **WARNING** |
| Marketplace / kickbacks | **NOT STARTED** — requires publish approval |

Kickback eligibility (official docs; re-check at publish): marketplace-published templates; ~15% base + ~10% support bonus (~25% with Template Queue). Private/unpublished templates ineligible.

---

## 8. Missing open-source documentation

LICENSE, NOTICE, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, CI workflows, third-party NOTICE, Community Edition policy, Railway template docs.

---

## 9. Exact remediation plan

1. Write this audit set (Phase 1).  
2. Confirm copyright + Community Edition gate policy.  
3. Apply Apache-2.0 LICENSE + NOTICE; set `package.json` license.  
4. Open self-host mutations by default; gate hosted SaaS via `HOSTED_SAAS` (recommended).  
5. Fix `.gitignore` + invite logging.  
6. Add community docs + CI.  
7. Private first commit → Gitleaks → private remote.  
8. Railway / marketplace / security / GitHub prep (Phases 3–6) without public publish until approved.  

---

## 10. GO / NO-GO

### NO-GO — not ready for public GitHub or Railway Marketplace publication

Release blockers: no LICENSE; no CI; empty git history; commercial gate blocks Community Edition; history secret scan **NOT VERIFIED**.
