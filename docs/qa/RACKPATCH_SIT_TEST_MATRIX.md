# RackPatch SIT test matrix

Each row is an automated test that was executed. "Result" is the outcome on the **final production build**, from
the run logged in `docs/qa/raw/sit-final-run.log` unless noted. Nothing was marked passed without running.

Inventory (`docs/qa/sit-inventory.json`, generated from the source tree by `scripts/sit-inventory.ts`):
**48 page routes, 10 API route handlers, 68 exported server actions**. All 68 actions call an auth guard, except 5
reviewed as intentionally public or pure (bootstrap ×2, `listCollectionProfiles`, `submitPilotRequest`, `hashCsv`).
Rendered interactive controls (`docs/qa/raw/sit-controls.json`, all 48 routes): **2,570 as project lead**
(2,005 links, 356 buttons, 209 form fields) and 2,663 as workspace owner. Both counts include the shared shell
(sidebar, top bar, project tabs) on every page.

Roles used: workspace owner, project lead, engineer, field tech, QC, contractor, viewer, a lead from another
workspace, anonymous, and platform admin. All are SIT demo accounts in `rackpatch_sit`.

## Navigation, routes and roles

| ID | Test | Spec | Result |
| --- | --- | --- | --- |
| NAV-01 | Every inventoried route loads as lead: no 5xx, no console or page errors | `e2e/sit/crawl.spec.ts` | Passed |
| NAV-02 | Every route renders or denies cleanly for owner, tech, contractor, QC, engineer and viewer (6 tests) | `crawl.spec.ts` | Passed |
| NAV-03 | Cross-workspace lead cannot read AI/HPC project pages | `crawl.spec.ts` | Passed |
| NAV-04 | Anonymous user is redirected to sign-in for every `/app` route | `crawl.spec.ts` | Passed |
| NAV-05 | Interactive control inventory on 48 routes (lead, owner) | `e2e/sit/controls.spec.ts` | Passed |

## Core workflows (UI, success and failure paths)

| ID | Test | Spec | Result |
| --- | --- | --- | --- |
| WF-A | Create project; hosted gate blocks import until a platform admin records activation; duplicate-cable CSV rejected ("Line 7"), Publish disabled; valid CSV publishes 9 links; racks empty state | `e2e/sit/workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-B | Field tech opens a cable from a QR URL; "Mark blocked" without a reason is refused and nothing is written; "Mark installed" records the installer; photo stored; bogus file rejected; audit row written | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-CD | Garbage LLDP refused; swapped capture → C-201/C-202 MISMATCH; exception assignee and due date saved; corrected capture → VERIFIED_LLDP | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-E | Installer cannot QC own work; reject needs a 5-character note; reject recorded with audit; accept recorded | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-F | Handover: owner sign-off blocked while exceptions are open; CSV package (>100 lines); snapshot created | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-G | AI/HPC demo: fabric topology, BE fabric, GPU trace, raw evidence with SHA and "not a live SSH collection" notice; viewer cannot switch playback | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| WF-Z | No uncaught page errors across all workflows | `workflows.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |

## Security and permissions

| ID | Test | Spec | Result |
| --- | --- | --- | --- |
| SEC-01 | Captured "Mark blocked" server action replayed as viewer, cross-workspace lead, anonymous, and with a forged `Origin`: all refused, DB unchanged; valid replay by lead succeeds (control) | `e2e/sit/security.spec.ts` | Passed |
| SEC-02 | API access control: v1 summary/cables/gitops without or with bad tokens → 401; `me/search` and notifications anonymous → 401; internal compliance without or with wrong secret → 401/503; field photo anonymous 401, cross-workspace 403; cross-workspace search 0 hits | `security.spec.ts` | Passed |
| SEC-03 | Session revocation: rejected once the 5-minute cache cookie expires (window documented, D-12) | `security.spec.ts` | Passed |
| SEC-04 | Role-based UI: viewer has no install or import controls; contractor has no import or snapshot | `security.spec.ts` | Passed |
| SEC-05 | Security headers: CSP, nosniff, referrer-policy; no `x-powered-by` | `security.spec.ts` | Passed |
| SEC-06 | Every exported server action is guarded or reviewed; internal helpers not exported | `tests/server-action-guards.test.ts` (vitest) | Passed (vitest) |
| SEC-07 | Permission boundaries (capability matrix per role) | `tests/permission-boundaries.test.ts` (vitest) | Passed (vitest) |

## Error handling and recovery

| ID | Test | Spec | Result |
| --- | --- | --- | --- |
| ERR-01 | Aborted and HTTP 500 server actions: alert shown, DB unchanged, retry succeeds, no uncaught errors | `e2e/sit/resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-02 | Double-click submit records one change (version +1, one audit row) | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-03 | Stale edit from a second session refused as a conflict; first write kept | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-04 | Offline QR scan queued in IndexedDB; auto-synced on reconnect; queue cleared (D-22) | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-05 | Report generation failure (snapshot action 500): alert, no snapshot row | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-06 | Database unavailable (connections to `rackpatch_sit` blocked): health 503, readable error page, recovery via "Try again" (D-20) | `resilience.spec.ts` (`SIT_DB_OUTAGE=1`) | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-07 | Offline navigation then reconnect: page loads | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-08 | Invalid CSV, LLDP paste at 1.9 MB (accepted to parser) and 2.1 MB (refused), 1.2 MB photo stored, camera policy, unknown project id | `resilience.spec.ts` | Passed (clean re-run, `sit-final-run-2.log`) |
| ERR-09 | Unsupported vendor output and missing neighbours are classified, never shown as verified | `tests/neighbor-evidence.test.ts` (vitest); WF-CD | Passed |

## Performance, responsive, accessibility and theme

| ID | Test | Spec | Result |
| --- | --- | --- | --- |
| PERF-01 | Desktop: 13 pages × 3 cold loads (LCP, CLS, TTFB), navigation, filtering, INP, API p50/p95 | `e2e/sit/perf.spec.ts` | Executed, spec passed; objectives missed on 5,000 cables only (navigation 569 ms, cable API p95 538 ms), see performance report |
| PERF-02 | Throttled (slow 4G, 4× CPU): 6 pages LCP/CLS | `e2e/sit/perf-throttled.spec.ts` | Executed, spec passed; LCP objective missed on the 5,000-cable list only (3,648 ms), see performance report |
| RESP-01 | Layout scan at 1920/1440/1366/1024/768/390 px | `crawl.spec.ts` | Passed |
| RESP-02 | Screenshots and layout scan, 11 routes × 4 viewports | `e2e/theme-shots.spec.ts` | Passed (44 checks, 0 issues, 0 console errors) |
| A11Y-01 | axe serious/critical on all 48 routes | `crawl.spec.ts` | Passed |
| FONT-01 | Self-hosted Poppins and JetBrains Mono load (HTTP 200) and are applied | `e2e/sit/fonts.spec.ts` | Passed |

## Unit and integration tests, build, existing e2e

| ID | Test | Result |
| --- | --- | --- |
| UNIT-01 | `npx vitest run` (35 files, including LLDP/CDP parsers, verification evaluation, handover blocking and approval, AI/HPC demo, CSV import, authz) | Passed: 35 files, 267 tests |
| BUILD-01 | `tsc --noEmit`, `npm run lint`, `next build` | Passed |
| E2E-01 | Pre-existing e2e: smoke, panels flow, spares flow, AI/HPC handover | Passed 7/7 |
| DEMO-01 | `npm run demo:verify:ai-hpc` (synthetic CDP/LLDP fixtures, scenarios, idempotent reseed, isolation) | Passed 24/24 (`docs/qa/raw/ai-hpc-verify.log`; run before the final UI fixes, which did not touch the demo or evidence code) |
