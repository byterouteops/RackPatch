# RackPatch release readiness

**Recommendation: GO with documented limitations** for the current build, committed locally only. Nothing has
been pushed, deployed or published; that needs your explicit approval.

This is not a claim that the application is bug-free. Eight defects remain open: two P2 and six P3, listed below.
The SIT brief allows release with open P2/P3 issues when they are recorded transparently, and requires every
P0/P1 to be fixed first. All P0/P1 defects are fixed and verified.

## Final release gate

| Gate requirement | Status | Evidence |
| --- | --- | --- |
| Candy Poppins theme visually verified | **Met as amended by your decision.** Candy Poppins is not implemented (no licensed file). The theme uses Poppins (OFL), verified visually and by font-loading tests | `RACKPATCH_UI_VISUAL_COMPARISON.md`, `sit-fonts.json`, `docs/design/THEME.md` |
| Every discovered menu and tool assessed | Met. 48 routes loaded for 9 roles; 2,570 rendered controls inventoried and axe-checked; core tools exercised by workflow specs | Crawl, `sit-controls.json` |
| All critical end-to-end workflows pass | Met. Workflows A–G 7/7 on the final build | `sit-final-run-2.log` |
| No known P0/P1 defects remain | Met. 3 P1 found, 3 fixed and verified; 0 P0 | `RACKPATCH_SIT_DEFECTS.md` |
| Required permission tests pass | Met. Security 5/5 (server-action replay by 4 unauthorised actors, API auth, isolation, revocation, headers); vitest guard and permission tests | `sit-security.json` |
| Production build succeeds | Met | `sit-build.log` |
| Performance measured and documented | Met (measured). Objectives are missed only on the 5,000-cable project; see limitations | `RACKPATCH_PERFORMANCE_REPORT.md` |
| Responsive layouts verified | Met. 252 + 44 layout checks, 0 issues; screenshots inspected | Crawl, theme shots |
| AI/HPC demo works with its synthetic CDP/LLDP fixtures | Met. Demo verifier 24/24; Workflow G on the final build | `ai-hpc-verify.log` |
| Remaining limitations documented | Met | This file |

## Limitations to accept before release

1. **D-18 (P2): large cable lists are slow on mobile-class devices.** With 5,000 cables, the cable list's LCP is 3.6 s on slow 4G with a 4× CPU slowdown (target 2.5 s), and Overview → Cable Plan takes 569 ms on desktop (target 500 ms). Projects of about 170 cables meet every target. The fix is server-side pagination of the cable list, which needs a design decision.
2. **D-13 (P2): Integrations page JS is 256 kB** (other pages 108–130 kB). LCP is still within budget.
3. **D-14 (P3):** 5,000-cable API p95 is 538 ms against a 500 ms budget. Same root cause as D-18.
4. **D-12 (P3):** a revoked session stays valid for up to 5 minutes (auth cookie cache). Permission changes apply immediately.
5. **D-15 (P3, deployment):** deploy behind a proxy that overwrites `X-Forwarded-Host`.
6. **D-16 (P3):** clicking a link while offline logs a chunk-load error; the page recovers on reconnect.
7. **D-17 (P3):** specific server validation reasons appear as a generic contextual message in production.
8. **D-21 (P3):** the install-status optimistic lock is check-then-write, not atomic.
9. **Font:** Poppins, not Candy Poppins.
10. **Not tested:** live switch SSH collection, real phone camera scanning, and the production hosting environment.

## What would turn this into a NO-GO

The gate requirements are all met. Treat the result as **NO-GO** if either of these applies:
- You require the 2.5 s LCP objective for projects with thousands of cables on mobile-class devices (D-18).
- You do not accept the Poppins substitution for Candy Poppins.

## Changes made during SIT (local, uncommitted until the final commit)

- **Security:** unguarded server-action exports removed (D-02); `X-Powered-By` removed.
- **Reliability:** server-action body limit raised to 3 MB (D-03); app error boundary (D-20); offline queue sync (D-22); readable action errors (D-05).
- **UI:** contrast and ARIA (D-06); responsive fixes (D-09); KPI figures never truncate (D-24); rack, ring and label fixes (D-19, D-23).
- **Data accuracy:** LLDP "Matched" counts LLDP evidence only (D-01).
- **Performance:** no prefetch of API routes (D-07).
- **Tests:** SIT specs under `e2e/sit/`, guard and error unit tests, the 5,000-cable seed script (SIT-only), and the inventory script.
