# CDP/LLDP Verification Results

> **DEMO / SYNTHETIC DATA.** Results from running the production parsers and verification engine on the synthetic captures. Produced by `npm run demo:verify:ai-hpc` (database) and `npx vitest run tests/ai-hpc-demo.test.ts` (pure engine) on 2026-11-21. Raw output: [ai-hpc-verify-result.json](ai-hpc-verify-result.json).

## Database verification (24 / 24 passed)

| Check | Result |
| --- | --- |
| Demo workspace and project flagged `isDemo` | Pass |
| Cables / devices / racks match topology | 172/172, 50/50, 14 |
| Demo evidence is all synthetic | 0 non-synthetic imports |
| No synthetic evidence in non-demo projects | 0 found |
| BASELINE: no LLDP mismatches or review items | Pass (only the seeded QC rejection remains) |
| CORRECTED: no LLDP mismatches or review items | Pass (only the seeded QC rejection remains) |
| Scenarios 1–12 (see [CDP_LLDP_FAULT_SCENARIOS.md](CDP_LLDP_FAULT_SCENARIOS.md)) | 12 / 12 pass |
| Idempotent reseed | No-op (fingerprint unchanged) |
| Other workspaces unchanged by reseed | Pass |
| Playback restored to original snapshot | FAULT_INJECTED |

## Findings in the FAULT_INJECTED snapshot

Recorded after seeding. The same numbers appear in the app on Verify and Exceptions.

| Finding type | Count |
| --- | --- |
| EXACT_MATCH | 134 |
| UNOBSERVABLE | 14 |
| PARSER_ERROR | 7 |
| STALE_EVIDENCE | 4 |
| AMBIGUOUS_IDENTITY | 4 |
| WRONG_NEIGHBOR | 3 |
| WRONG_PORT | 3 |
| MISSING_NEIGHBOR | 1 |
| LINK_DOWN | 1 |
| PHYSICAL_MISMATCH | 1 (seeded QC rejection) |

## What these results do and do not show

- They show that the production parsers read each vendor format correctly and that the engine classifies each injected fault as designed.
- **UNOBSERVABLE** links (passive panels, demarcs, firewall HA without a parser, console server) are never reported as LLDP-verified.
- The captures are synthetic files replayed from the database. **No live SSH collection was performed.**
- LLDP/CDP adjacency says nothing about ECN/PFC, RoCEv2/RDMA performance, congestion control, BGP or firewall policy. None of those are claimed.
