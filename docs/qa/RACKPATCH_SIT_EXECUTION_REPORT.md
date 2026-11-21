# RackPatch SIT execution report

Execution window: 2026-11-21 to 2026-11-22. Target: production build (`next build` / `next start`, port 3100,
`HOSTED_SAAS=true`, dev login disabled) against the isolated database `rackpatch_sit`. No production or
development records were used for destructive tests. Each SIT spec refuses to run unless the database is
`rackpatch_sit` and the server is on port 3100.

## Totals

| Item | Count |
| --- | --- |
| Page routes discovered | 48 |
| API route handlers | 10 |
| Exported server actions | 68 (63 guarded, 5 reviewed as public or pure) |
| Interactive controls rendered (48 routes, project lead) | 2,570 (2,005 links, 356 buttons, 209 form fields; 2,663 as owner). Both include the shared shell on each page |
| Roles exercised | 10 (owner, lead, engineer, tech, QC, contractor, viewer, cross-workspace lead, anonymous, platform admin) |
| **Test cases executed on the final build** | **309**: 267 unit/integration (vitest), 35 SIT browser specs, 7 existing e2e |
| Passed | 309 |
| Failed | 0 |
| Blocked / not executed | 0 test cases. Items not covered by a test are listed below |
| Assertion-level checks recorded in raw files | Security 25 checks, resilience 21 checks, layout 252 + 44 checks, axe on 48 routes |

### How the final numbers were produced

| Suite | Command / log | Result |
| --- | --- | --- |
| Unit and integration | `npx vitest run` → `docs/qa/raw/vitest.log` | 35 files, 267 tests passed |
| Type check, lint, build | `tsc --noEmit`, `npm run lint`, `next build` → `sit-build.log` | Clean; build succeeded |
| SIT crawl, controls, security | `sit-final-run.log` | Crawl 10/10, controls 1/1, security 5/5 |
| SIT resilience and workflows | `sit-final-run-2.log` | 15/15 |
| Fonts | `e2e/sit/fonts.spec.ts` → `sit-fonts.json` | 1/1 |
| Screenshots and layout | `e2e/theme-shots.spec.ts` → `ui-audit-shots/theme-final/` | 1/1 (44 checks, 0 issues) |
| Performance | `sit-perf-run.log` → `sit-perf.json`, `sit-perf-throttled.json` | 2/2 specs ran to completion; objectives partly missed (below) |
| Existing e2e | `e2e-existing.log` | 7/7 |
| AI/HPC demo verifier | `ai-hpc-verify.log` | 24/24 checks (run before the final UI-only fixes) |

**Run note.** In the first final run, one resilience test failed inside Playwright's own trace recorder
("ENOENT … recording4.network"), not in an assertion, and the reporter marked 7 tests "did not run". The
resilience and workflow specs were re-run on the same build with a clean `test-results` folder and passed 15/15.
Both logs are kept.

## Coverage by module

| Module | What was tested | Tests |
| --- | --- | --- |
| Navigation and routing | All 48 routes × 9 roles; deny pages; anonymous redirect | Crawl (10) |
| Authentication and sessions | Sign-in, rate-limit handling, revocation, cookie-cache window | Security, helpers |
| Authorization and isolation | Server-action replay by 4 unauthorised actors; API tokens; cross-workspace reads; role-based UI | Security (5), vitest permission boundaries, guard test |
| Cable planning | Create, hosted gate and activation, CSV validation (duplicates, missing columns), publish | WF-A, resilience, vitest CSV tests |
| Installation and field | QR open, install, blocked reason, photo upload and validation, offline queue, double submit, stale-edit conflict | WF-B, resilience |
| LLDP/CDP evidence | Garbage and unsupported output, swapped cables, corrected capture, size limits, parsers (NX-OS, IOS, CDP, EOS, Junos, lldpd) | WF-CD, resilience, vitest |
| Exceptions and QC | Assignee and due date; installer cannot QC own work; reject note; accept | WF-CD, WF-E |
| Handover | Blocked owner sign-off, CSV package, snapshot, failure injection | WF-F, resilience, vitest approval and blocking |
| AI/HPC demo | Fabrics, GPU trace, raw evidence with SHA, simulated-playback notice, playback permissions | WF-G, demo verifier, vitest |
| Error handling | Aborted and 500 actions, database outage, offline, oversized input, unknown ids | Resilience (8) |
| Dashboard and KPIs | Live counts; LLDP-matched counts only LLDP evidence | vitest, screenshots |
| Responsive layout | 6 + 4 viewports | Crawl layout scan, theme shots |
| Accessibility | axe WCAG A/AA serious/critical | Crawl |
| Fonts and theme | Font files, weights, computed fonts, CLS | Fonts spec, performance |
| Performance | Web vitals, navigation, filtering, API, throttled loads | Perf (2) |

## Defects

From `RACKPATCH_SIT_DEFECTS.md`:

| Severity | Found | Fixed and verified | Open |
| --- | --- | --- | --- |
| P0 | 0 | 0 | 0 |
| P1 | 3 | 3 | 0 |
| P2 | 10 | 8 | 2 (D-13 Integrations bundle, D-18 large cable list) |
| P3 | 11 | 5 | 6 (D-12, D-14, D-15, D-16, D-17, D-21) |

Six defects were found during this final pass and fixed on the final build:
- **D-19** dashboard rack height.
- **D-20** no error page during a database outage.
- **D-22** offline scans not syncing until reload.
- **D-23** ring and KPI label clipping.
- **D-24** KPI figures truncated at laptop widths.
- **D-23 / D-24** were found by inspecting screenshots, because the automated layout scan accepts ellipsis truncation.

## Performance (final build)

| Measurement | Result |
| --- | --- |
| Desktop LCP | 104–332 ms; 944 ms on the 5,000-cable list |
| CLS | 0 |
| INP | ≤ 64 ms |
| Filtering on 5,000 rows | 81–146 ms |
| Navigation | 80–408 ms; 569 ms Overview → Cable Plan on 5,000 cables |
| Throttled LCP | 1,368–1,888 ms; **3,648 ms on the 5,000-cable list** |
| API p95 | ≤ 35 ms on 172 cables; 306 ms (summary) and **538 ms** (cables) on 5,000 cables |

Details: `RACKPATCH_PERFORMANCE_REPORT.md`.

## Accessibility

axe serious/critical violations: **0 on all 48 routes** (final build). About 240 serious or critical nodes were
fixed during SIT (D-06).

## Screenshots

- Before: `ui-audit-shots/theme/`.
- After: `ui-audit-shots/theme-final/`.
- Database-outage before/after: `docs/qa/raw/sit-db-outage-*.png`.

Comparison: `RACKPATCH_UI_VISUAL_COMPARISON.md`.

## Not covered by an executed test

- **Candy Poppins.** No licensed file was available. Poppins (OFL) is used by user decision; no Candy Poppins test was possible.
- **Theme variants.** The app has a single theme; there are no variants to test.
- **Concurrent optimistic-lock race (D-21).** Found by code review; sequential conflicts and double-clicks are tested.
- **Real devices and real switches.** LLDP/CDP was exercised with fixture captures only. No live SSH collection and no physical phone camera scan; the camera permission policy was tested.
- **Production deployment.** Proxy headers (D-15), TLS, CDN and multi-instance behaviour were not tested.
- **The demo verifier** was not re-run after the final UI-only fixes. Those fixes touched no demo or evidence code, and Workflow G passed on the final build.
