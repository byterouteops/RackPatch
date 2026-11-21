# AI/HPC Demo — Capability Audit

> **DEMO / SYNTHETIC DATA.** This audit compares what the flagship demo needs with what RackPatch had before the work, and records what was added.

## Before this work (baseline at commit `03a977e`)

| Area | State | Gap for the AI/HPC demo |
| --- | --- | --- |
| Cable plan | CSV import with validation, revisions | No fabric, speed, connector, rail, colour or purpose columns |
| Devices and racks | Device names on cables only | No rack model, rack-unit placement, interface inventory or discovery profile |
| LLDP/CDP | NX-OS, EOS, Junos, IOS parsers; match/mismatch engine | No lldpd key-value or interface-status parser; no directional observability; no unobservable/stale/parser-error/ambiguous/link-down outcomes; Junos remote port bug (read `Port description` / "Local Port ID") |
| Evidence | Imports per project | No synthetic flag, snapshot or scoping; demo evidence would mix with real |
| Exceptions | Acknowledge, close on re-verify | No owner, due date or waiver |
| QC | Physical confirm only | No rejection UI; QC queue counted any physical check as accepted |
| Handover | Snapshot, CSV, share link | No staged approvals or owner gate |
| Roles | Owner, Lead, Technician, Contractor | No read-only Viewer |
| Guidance | Help articles | No per-page guide, field hints or guided tour |

## Added

- Schema (applied with `migrate deploy`, no reset): Rack, device placement and attributes, cable attributes, finding assignee/due/waiver, HandoverApproval, VIEWER role, evidence kind/synthetic/snapshot, InterfaceStateObservation.
- Parsers: lldpd key-value, interface status; Junos remote-port fix with a regression test.
- Engine: pure `computeOutcomes` with directional observability, explicit aliases, stale-by-policy, parser-error isolation.
- Evidence scoping for demo versus real projects.
- Deterministic topology, evidence generator (3 snapshots, 12 faults), idempotent guarded seed, guarded reset, database verification script.
- UI: racks, fabric topology/FE/BE, trace, evidence explorer with playback, exception owner/due/waiver, QC accept/reject, staged handover approvals, overview fabric readiness and handover gate, cable fabric filter.
- Guidance: page guide on every app route, field hints on every control, demo banner and 20-step tour, Help Center page-guide index.

## Bugs found and fixed during the work

| Bug | Fix |
| --- | --- |
| Junos parser returned the local port ("500") as the remote port | Line-anchored `Port ID`, fallback `Port description`; test added |
| Compliance/overview mixed synthetic and real evidence and listed passive devices as "never imported" | Evidence scope helpers; only collectable devices counted |
| QC queue showed a rejected cable as "Accepted" | Latest physical check decides; rejection → Rejected/Rework |
| Path trace could route a "data path" through the OOB switch | Data paths exclude OOB except a direct hop; OOB-only paths labelled |
| Demo tour pointed at non-existent `?view=` routes | Scenarios 1–2 now open the overview and fabric pages |
| Seed physically verified a link that scenario 8 requires to stay unobservable | Removed from the seed's physical-OK list |

## Known limitations (intentional)

See [AI_HPC_DEMO_FEATURE_COVERAGE.md](AI_HPC_DEMO_FEATURE_COVERAGE.md): playback is not live collection; mobile is a responsive web app; LLDP/CDP cannot verify ECN/PFC, RDMA, BGP or firewall policy.
