# Phase 23 — Quality audit

**Date:** 2026-11-21

## Existing automation

| Suite | Command | Role |
|-------|---------|------|
| Unit | `npm test` (Vitest) | CSV, LLDP match, authz helpers, bootstrap, demo |
| Authz script | `npm run test:authz` | Cross-workspace isolation |
| Full workflow | `npm run test:full` | Plan→install→LLDP→verify→handover |
| CI | `.github/workflows/ci.yml` | lint, typecheck, vitest, build (+ audit warn) |

## Playwright smoke (CE slice)

| Item | Detail |
|------|--------|
| Dependency | `@playwright/test` (devDependency) |
| Config | `playwright.config.ts` - `baseURL` `http://localhost:3000` (override `E2E_BASE_URL`); `webServer` is **disabled by default** (set `E2E_WEB_SERVER=1` to start `npm run dev`) |
| Spec | `e2e/smoke.spec.ts` - landing `/`, `/about`, `/api/health` (200 or 503 accepted, no DB needed), `/sign-in` (skipped unless `E2E_WITH_DB=1`, since it needs the DB for bootstrap detection) |
| Command | `npm run test:e2e` (`playwright test`); `npx playwright test --list` shows 4 tests |
| Browsers | **Not installed automatically** and not added to CI. Run `npx playwright install chromium` locally first (CI would need that step plus a running app/DB) |
| Verified | Locally with `E2E_WEB_SERVER=1` and no database: 3 passed, 1 skipped (sign-in) |

Full authenticated e2e (sign-in, plan import, install, verify, handover) is **still optional / not implemented**.
Playwright is not part of `.github/workflows/ci.yml`.

## Not present

Authenticated Playwright E2E, visual regression platform, flaky-test service, quality dashboard, 100k/1M event perf harness.

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
