# Phase 20 — Production Audit

**Date:** 2026-11-21  
**Scope:** Actual RackPatch v1 Community Edition (not Phases 9–19 plans)

## Architecture (real)

| Component | Status |
|-----------|--------|
| Next.js 15 App Router web | Implemented |
| PostgreSQL + Prisma | Implemented |
| Better Auth (sessions, magic link) | Implemented |
| Background workers | Not present |
| Object storage | Not present (evidence in DB) |
| NetBox / public REST / AI | Not present |

## Findings

| ID | Severity | Finding | Remediation |
|----|----------|---------|-------------|
| P20-1 | HIGH | No production security headers in `next.config.ts` | Add headers() |
| P20-2 | HIGH | Single `/api/health` mixes liveness with DB; error may echo message | Split ready; sanitize errors |
| P20-3 | HIGH | No documented/tested pg_dump restore procedure | Backup scripts + restore exercise |
| P20-4 | MEDIUM | `docker-compose.yml` is Postgres-only | Add optional app service |
| P20-5 | MEDIUM | Production env secret strength not validated at startup | Validate `BETTER_AUTH_SECRET` |
| P20-6 | MEDIUM | Middleware is no-op (auth in layout/actions — OK if documented) | Document trust model |
| P20-7 | LOW | No SBOM / npm audit in CI | Add CI steps |
| P20-8 | INFORMATIONAL | Phases 9–19 are architecture-only | Do not claim in launch |
| P20-9 | CRITICAL (process) | Git: historically empty remotes / no Gitleaks before public | Block public release |

## Implemented vs not

**Yes:** plan import, install, NX-OS LLDP, exceptions, handover, rate limit auth/pilot, Community Edition `HOSTED_SAAS`, Apache 2.0, CI lint/test/build, Dockerfile standalone, railway.toml.

**No:** workers, S3, NetBox, AI, multi-site, fiber twin, asset AM.

## Gate before Phase 21 public launch

Public launch **BLOCKED** until: headers + ready check + backup restore evidence + Gitleaks/history + maintainer publish approval.
