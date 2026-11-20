# Phase 23 — Quality audit

**Date:** 2026-11-21

## Existing automation

| Suite | Command | Role |
|-------|---------|------|
| Unit | `npm test` (Vitest) | CSV, LLDP match, authz helpers, bootstrap, demo |
| Authz script | `npm run test:authz` | Cross-workspace isolation |
| Full workflow | `npm run test:full` | Plan→install→LLDP→verify→handover |
| CI | `.github/workflows/ci.yml` | lint, typecheck, vitest, build (+ audit warn) |

## Not present

Playwright E2E, visual regression platform, flaky-test service, quality dashboard, 100k/1M event perf harness.

## Critical workflow → tests

| Workflow | Coverage |
|----------|----------|
| CSV plan import | unit + full |
| Install transitions | full |
| LLDP NX-OS + mismatch | unit + full |
| Physical verify / no self-verify | full |
| Handover export | full |
| Cross-workspace authz | authz script |
| First-run bootstrap | unit (`bootstrap.test.ts`) |
| QR labels | partial UI only — no dedicated automated test |
| NetBox / AI / fiber | N/A — not implemented |

## Recommendation

**NO-GO** for “comprehensive QE platform.” Existing suites are the launch quality bar; extend Vitest/full-workflow only for critical bugs.
