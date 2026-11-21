# FINAL REPOSITORY INVENTORY — RackPatch

**Date:** 2026-11-21  
**Source of truth:** working tree + published `origin/master` (v0.1.0 live; v0.2 Field Trust in this tree)

| Subsystem | Location | Purpose | Status | Dependencies | Known risks | Tests | Action |
|-----------|----------|---------|--------|--------------|-------------|-------|--------|
| Next.js App Router | `src/app/` | UI + RSC routes | VERIFIED | next 15.5.29 | Share routes public by design | smoke + unit | None |
| Better Auth | `src/lib/auth.ts` | Sessions, magic link, password | VERIFIED | better-auth, Resend optional | IP rate-limit warn behind Railway | bootstrap tests | Accept residual |
| First-run bootstrap | `src/lib/bootstrap.ts` | Admin create + advisory lock | VERIFIED | Prisma/Postgres | Race handled by lock | `tests/bootstrap.test.ts` | None |
| AuthZ | `src/lib/authz.ts` | Workspace/project permissions | VERIFIED | Prisma | UI not sole control | permission + diff-authz tests | None |
| Prisma / Postgres | `prisma/` | Schema + migrations | VERIFIED | Prisma 6 | Share token migration new in v0.2 | migrate status | Deploy migrate |
| Plan CSV | `src/lib/csv/` | Import/validate/diff | VERIFIED | csv-parse | Malformed rows rejected | plan-import tests | None |
| Install tracking | `src/app/actions/install.ts` | PLANNED/INSTALLED/BLOCKED | VERIFIED | Prisma | Optimistic version | workflow scripts | None |
| Neighbor evidence | `src/lib/lldp/`, evidence actions | NX-OS/IOS-XE/CDP/Arista/Junos | VERIFIED | parsers | Paste-only, no live SSH | neighbor-evidence + lldp-match | None |
| Match / swap | `src/lib/verify/match.ts` | Expected vs observed | VERIFIED | — | Classic swap pairs | lldp-match tests | None |
| Fix playbook | `src/lib/verify/fix-playbook.ts` | Ordered swap remediation | VERIFIED (v0.2) | — | One-way related only | fix-playbook tests | Deploy |
| Physical verify | `src/app/actions/verify.ts` | Installer ≠ verifier | VERIFIED | Prisma | — | full-workflow scripts | None |
| Handover | `src/app/actions/handover.ts` | Snapshot + CSV + share | VERIFIED | nanoid | Public token URL | manual smoke | Deploy share |
| Public share | `src/app/share/handover/[token]/` | Customer read-only | VERIFIED (v0.2) | Prisma | Payload may include site/customer | review + live | Deploy |
| QR labels | `…/labels/page.tsx` | Print QR → cable | VERIFIED | qrcode | Requires auth session after scan | manual | None |
| Docker | `Dockerfile` | Standalone Next image | VERIFIED config | node 20 | Local rebuild may be NOT TESTED this pass | Railway builds | Record Docker status |
| Railway | `railway.toml` | migrate + healthcheck | VERIFIED live | Railway | Free sleep limits | live smoke | Redeploy v0.2 |
| CI | `.github/workflows/ci.yml` | lint/typecheck/test/build | VERIFIED | GitHub Actions | — | CI green on master | Push triggers |
| License | `LICENSE`, `NOTICE` | Apache 2.0 | VERIFIED | — | Third-party via audit | dependency audit doc | None |
| Demo seed | `prisma/seed-demo.ts` | Synthetic lab | PARTIAL | SEED_DEMO | Prod `/demo` unseeded | demo-e2e | Optional seed |
| Analytics / NetBox / AI / 3D | phase 9–22 docs | Future | NOT IMPLEMENTED | — | Do not claim | N/A | Defer |

## Naming note

Product uses **workspaces + projects**, not separate Organizations/Sites entities.
