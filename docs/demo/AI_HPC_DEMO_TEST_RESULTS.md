# AI/HPC Demo — Test Results

> **DEMO / SYNTHETIC DATA.** Every result below was produced by actually running the command on 2026-11-21 against the local development database (`localhost:5432/rackpatch`). Nothing was deployed.

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit -p .` | Pass (no errors) |
| Lint | `npm run lint` | Pass (no warnings or errors) |
| Unit and integration tests | `npx vitest run` | **261 / 261 passed** in 33 files |
| Production build | `npm run build` | Pass. Warning: optional `cpu-features` module for `ssh2`, not caused by this work. One earlier attempt failed downloading a Google font (network); the retry passed. |
| Database verification | `npm run demo:verify:ai-hpc` | **24 / 24 passed** ([ai-hpc-verify-result.json](ai-hpc-verify-result.json)) |
| Browser: staged handover approvals | `AI_HPC_E2E=1 npx playwright test e2e/ai-hpc-handover.spec.ts` | Pass. Cleans up its snapshot and audit rows. |

## Demo-specific test files

| File | Tests | Covers |
| --- | --- | --- |
| `tests/ai-hpc-demo.test.ts` | 26 | Inventory counts, topology validation, determinism, CSV import, fictional IPs only, every evidence file parses (except the deliberate failure), Baseline/Corrected clean, unobservable never LLDP-verified, each of the 12 fault scenarios, no unexpected flags, swap partner, snapshot order, plan fixtures (valid, duplicate ID at line 7, port conflict at line 9) |
| `tests/guidance-and-trace.test.ts` | 48 | A page guide exists for every app route (scanned from `src/app/(app)/app/**/page.tsx`); field hints never empty; path trace shortest path, no OOB transit on data paths, OOB-only path, direct OOB hop |
| `tests/handover-approval.test.ts` | 5 | Stage order, viewer blocked, QC independence and contractor block, owner gate on critical exceptions, no re-signing |
| `tests/neighbor-evidence.test.ts` | 8 | Includes the Junos remote-port regression |

## Browser flow asserted by `e2e/ai-hpc-handover.spec.ts`

1. Technician: QC stage shows "Sign Installation complete first"; signs installation.
2. Technician: QC stage refuses them ("you signed the installation stage").
3. Contractor: "Contractors cannot perform independent QC".
4. Viewer: "Read-only members cannot sign".
5. QC verifier signs independent QC; engineer signs engineering acceptance and is refused owner acceptance.
6. Owner: owner acceptance blocked by open critical exceptions, with no Sign button.
7. Database holds exactly INSTALLATION, INDEPENDENT_QC and ENGINEERING approvals.

## Not run

- `e2e/ai-hpc-handover.spec.ts` is opt-in and was run locally only; it is not part of CI.
- No load or performance testing beyond observing dev-mode page responses (about 0.3–0.7 s).
