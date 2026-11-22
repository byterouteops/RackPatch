# RackPatch release readiness

**Recommendation: GO with documented limitations** for the current build, committed locally only. Nothing has
been pushed, deployed or published; that needs your explicit approval.

This is not a claim that the application is bug-free. Eight defects remain open: one P2 and seven P3, listed below.
The SIT brief allows release with open P2/P3 issues when they are recorded transparently, and requires every
P0/P1 to be fixed first. All P0/P1 defects are fixed and verified.

## Final release gate

| Gate requirement | Status | Evidence |
| --- | --- | --- |
| Candy Poppins theme visually verified | **Met as amended by your decision.** Candy Poppins is not implemented (no licensed file). The theme uses Poppins (OFL), verified visually and by font-loading tests | `RACKPATCH_UI_VISUAL_COMPARISON.md`, `sit-fonts.json`, `docs/design/THEME.md` |
| Every discovered menu and tool assessed | Met. 48 routes loaded for 9 roles; 2,570 rendered controls inventoried and axe-checked; core tools exercised by workflow specs | Crawl, `sit-controls.json` |
| All critical end-to-end workflows pass | Met. Workflows A–G 7/7 on the final build. The earlier Workflow B result for "bogus photo rejected" was a false pass (D-25); the defect is fixed and the stricter test passes | `sit-final-run-2.log`, `sit-d18-regression.log` |
| No known P0/P1 defects remain | Met. 3 P1 found, 3 fixed and verified; 0 P0 | `RACKPATCH_SIT_DEFECTS.md` |
| Required permission tests pass | Met. Security 6/6 (server-action replay by 4 unauthorised actors, cable-details replay cross-workspace and anonymous, API auth, isolation, revocation, headers); vitest guard and permission tests | `sit-security.json` |
| Production build succeeds | Met | `sit-build.log` |
| Performance measured and documented | Met (measured). LCP, INP and CLS are met everywhere, including the 5,000-cable list on the throttled profile. Overview navigation and the cable API miss their targets at 5,000 cables; see limitations | `RACKPATCH_PERFORMANCE_REPORT.md` |
| Responsive layouts verified | Met. 252 + 44 layout checks, 0 issues; screenshots inspected | Crawl, theme shots |
| AI/HPC demo works with its synthetic CDP/LLDP fixtures | Met. Demo verifier 24/24; Workflow G on the final build | `ai-hpc-verify.log` |
| Remaining limitations documented | Met | This file |

## Limitations to accept before release

1. **D-13 (P2): Integrations page JS is 256 kB** (other pages 108–130 kB). LCP is still within budget.
2. **D-14 (P3):** 5,000-cable public cable API p95 is 538–664 ms against a 500 ms budget.
3. **D-26 (P3):** navigating to the overview of a 5,000-cable project takes about 670 ms (target 500 ms).
4. **Large cable lists (D-18, fixed):** with 5,000 cables on slow 4G with a 4× CPU slowdown, the first page shows at about 1.4 s, but search and filters stay disabled until all rows arrive, at about 3.3 s.
5. **D-12 (P3):** a revoked session stays valid for up to 5 minutes (auth cookie cache). Permission changes apply immediately.
6. **D-15 (P3, deployment):** deploy behind a proxy that overwrites `X-Forwarded-Host`.
7. **D-16 (P3):** clicking a link while offline logs a chunk-load error; the page recovers on reconnect.
8. **D-17 (P3):** specific server validation reasons appear as a generic contextual message in production.
9. **D-21 (P3):** the install-status optimistic lock is check-then-write, not atomic.
10. **Font:** Poppins, not Candy Poppins.
11. **Not tested:** live switch SSH collection, real phone camera scanning, and the production hosting environment.
12. **Existing data:** the SIT database contains non-image "photos" stored before the D-25 fix. Any other environment where the photo upload was used may also hold such rows; the fix prevents new ones but does not remove old ones.

## What would turn this into a NO-GO

The gate requirements are all met. Treat the result as **NO-GO** if either of these applies:
- You require every navigation to stay under 500 ms on projects with thousands of cables (D-26), or the public cable API to meet its 500 ms p95 at that size (D-14).
- You do not accept the Poppins substitution for Candy Poppins.

## Changes made during SIT (local, uncommitted until the final commit)

- **Security:** unguarded server-action exports removed (D-02); `X-Powered-By` removed; field photos must have a real image signature (D-25).
- **Reliability:** server-action body limit raised to 3 MB (D-03); app error boundary (D-20); offline queue sync (D-22); readable action errors (D-05).
- **UI:** contrast and ARIA (D-06); responsive fixes (D-09); KPI figures never truncate (D-24); rack, ring and label fixes (D-19, D-23).
- **Data accuracy:** LLDP "Matched" counts LLDP evidence only (D-01).
- **Performance:** no prefetch of API routes (D-07); cable list payload trimmed, details loaded on demand, full list streamed after the first page (D-18).
- **Tests:** SIT specs under `e2e/sit/`, guard and error unit tests, the 5,000-cable seed script (SIT-only), and the inventory script.
