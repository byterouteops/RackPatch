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
| Exported server actions | 69 (64 guarded, 5 reviewed as public or pure) |
| Interactive controls rendered (48 routes, project lead) | 2,570 (2,005 links, 356 buttons, 209 form fields; 2,663 as owner). Both include the shared shell on each page |
| Roles exercised | 10 (owner, lead, engineer, tech, QC, contractor, viewer, cross-workspace lead, anonymous, platform admin) |
| **Test cases executed after the D-18 and D-25 fixes** | **318**: 274 unit/integration (vitest), 36 SIT browser specs, 8 existing e2e |
| Passed | 318 (after the re-runs listed under "Run notes") |
| Failed | 0 |
| Blocked / not executed | 0 test cases. The AI/HPC demo verifier was not re-run (no demo code changed). Items not covered by a test are listed below |
| Assertion-level checks recorded in raw files | Security 28 checks, resilience 21 checks, layout 252 + 98 checks, axe on 48 routes |

### How the final numbers were produced

| Suite | Command / log | Result |
| --- | --- | --- |
| Unit and integration | `npx vitest run` → `docs/qa/raw/vitest.log` | 37 files, 274 tests passed |
| Type check, lint, build | `tsc --noEmit`, `npm run lint`, `next build` → `sit-build.log` | Clean; build succeeded |
| SIT crawl, controls, fonts, resilience, workflows | `sit-d18-regression.log` (D-18 build) | Crawl 10/10, controls 1/1, fonts 1/1, resilience 8/8, workflows 6/7 (WF-B found D-25) |
| SIT workflows, resilience, security | Final build (D-18 + D-25) | Workflows 7/7, resilience 8/8, security 6/6 |
| Screenshots and layout | `e2e/theme-shots.spec.ts` → `ui-audit-shots/theme-final/` | 1/1 (98 checks, 0 issues) |
| Performance | `sit-perf.json`, `sit-perf-throttled.json`, `sit-perf-throttled-d18-run*.json` (D-18 build) | 2/2; page-load objectives met, two scale objectives missed (below) |
| Existing e2e | `e2e-d18.log` (final build) | 8/8 |
| AI/HPC demo verifier | `ai-hpc-verify.log` | 24/24 checks (earlier build; not re-run) |

**Run notes.**
- In the first SIT final run, one resilience test failed inside Playwright's own trace recorder
  ("ENOENT … recording4.network"), not in an assertion. That run was repeated with a clean `test-results` folder.
- During the D-18 regression run, Workflow B failed because a non-image photo was stored (D-25). That test had
  passed before only because of a race in the test, so the earlier result was a false pass. After the fix, the
  stricter test failed against the old build and passes on the fixed build. Its "no uncaught page errors"
  companion then caught the rejected action's expected HTTP 500 console entry, and now allows exactly that one.
- In `e2e-d18.log` the UI audit was refused at sign-in by the auth rate limiter ("Too many requests") after the
  preceding suites. It passed when re-run alone after the window reset.
- The crawl, controls and fonts specs ran on the D-18 build, one build before the D-25 change, which touches
  only the field-photo action.

## Coverage by module

| Module | What was tested | Tests |
| --- | --- | --- |
| Navigation and routing | All 48 routes × 9 roles; deny pages; anonymous redirect | Crawl (10) |
| Authentication and sessions | Sign-in, rate-limit handling, revocation, cookie-cache window | Security, helpers |
| Authorization and isolation | Server-action replay by 4 unauthorised actors; cable-details replay (cross-workspace, anonymous); API tokens; cross-workspace reads; role-based UI | Security (6), vitest permission boundaries, guard test |
| Cable planning | Create, hosted gate and activation, CSV validation (duplicates, missing columns), publish | WF-A, resilience, vitest CSV tests |
| Installation and field | QR open, install, blocked reason, photo upload and content-signature validation, offline queue, double submit, stale-edit conflict | WF-B, resilience, vitest image signature |
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
| P2 | 11 | 10 | 1 (D-13 Integrations bundle) |
| P3 | 12 | 5 | 7 (D-12, D-14, D-15, D-16, D-17, D-21, D-26) |

After the final pass, D-18 (large cable list) was fixed on request. Re-testing it found D-25 (non-image field
photos accepted; fixed) and D-26 (overview navigation at 5,000 cables; open).

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
| Desktop LCP | 100–400 ms; 368 ms on the 5,000-cable list (was 944 ms) |
| CLS | 0 |
| INP | 40 ms |
| Filtering on 5,000 rows | 59–152 ms |
| Navigation (median of 3, settled) | 86–464 ms; Cable Plan 192–196 ms; **671 ms to Overview on 5,000 cables** (D-26) |
| Throttled LCP | 1,404–2,052 ms; 5,000-cable list 1,312–1,764 ms over 4 runs (was 3,648 ms); full list usable at 3.3 s |
| API p95 | ≤ 42 ms on 172 cables; 259 ms (summary) and **664 ms** (cables) on 5,000 cables (D-14) |

Details: `RACKPATCH_PERFORMANCE_REPORT.md`.

## Accessibility

axe serious/critical violations: **0 on all 48 routes** (final build). About 240 serious or critical nodes were
fixed during SIT (D-06).

## Screenshots

- Before: `ui-audit-shots/theme/`.
- After: `ui-audit-shots/theme-final/`.
- D-18 cable list while streaming, after loading, and with lazily loaded details: `docs/qa/screenshots/d18-*.png`.
- Database-outage before/after: `docs/qa/raw/sit-db-outage-*.png`.

Comparison: `RACKPATCH_UI_VISUAL_COMPARISON.md`.

## Not covered by an executed test

- **Candy Poppins.** No licensed file was available. Poppins (OFL) is used by user decision; no Candy Poppins test was possible.
- **Theme variants.** The app has a single theme; there are no variants to test.
- **Concurrent optimistic-lock race (D-21).** Found by code review; sequential conflicts and double-clicks are tested.
- **Real devices and real switches.** LLDP/CDP was exercised with fixture captures only. No live SSH collection and no physical phone camera scan; the camera permission policy was tested.
- **Production deployment.** Proxy headers (D-15), TLS, CDN and multi-instance behaviour were not tested.
- **The demo verifier** was not re-run after the final UI-only fixes. Those fixes touched no demo or evidence code, and Workflow G passed on the final build.
