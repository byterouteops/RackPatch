# Feature freeze — RackPatch Community Edition v0.1 launch candidate

**Date:** 2026-11-21  
**Scope:** Only features that exist in this repository.

## In scope (ship)

| Workflow | Status |
|----------|--------|
| Workspaces + project membership / invites | Implemented |
| CSV cable plan import + publish revisions | Implemented |
| Installation tracking (Planned / Installed / Blocked) | Implemented |
| QR labels + label designer (templates, field toggles, print sheet) | Implemented |
| Installation work orders (assign cables, status, progress) | Implemented |
| Global search (cables/devices/projects; ⌘K) | Implemented |
| In-app notification center | Implemented |
| Neighbor evidence import (NX-OS/IOS-XE LLDP, CDP, Arista, Junos) | Implemented |
| Expected vs observed / mismatch detection | Implemented |
| Swap fix playbook (paired mismatches) | Implemented (v0.2) |
| Evidence clearance audit on re-import | Implemented (v0.2) |
| Customer handover share link | Implemented (v0.2) |
| Independent physical verification | Implemented |
| Exceptions ack (mismatches stay visible) | Implemented |
| Handover snapshot + CSV export | Implemented |
| QR → cable field actions | Implemented (v0.2 partial) |
| In-app camera QR scan (same project) | Implemented (Phase 13 incremental) |
| Offline QR queue + field photo evidence | Implemented |
| Workspace sites (location entities) | Implemented (Phase 14 CE slice) |
| Cable asset serial / length / retire | Implemented (Phase 15 CE slice) |
| Collection job records on evidence import | Implemented (Phase 10 CE stub) |
| SSH collection (allowlisted show-commands) | Implemented |
| Evidence staleness banner (7-day) | Implemented (Phase 11 CE slice) |
| Capacity summary (plan-link aggregates) | Implemented (Phase 12 CE slice) |
| Cable media-type taxonomy + filter | Implemented (Phase 16 CE slice) |
| Read-only `/api/v1` + project API tokens | Implemented (Phase 19 CE slice) |
| NetBox dry-run + apply-to-plan + gated write (PATCH labels when writeEnabled + typed confirm; token encrypted, https + SSRF-blocked) | Implemented |
| Outbound webhooks (`evidence.import`, `install.update`, `handover.create`; HMAC-SHA256, single best-effort attempt, secret encrypted) | Implemented (Phase 19 CE slice) |
| GitOps plan export (YAML/JSON) + import dry-run (validate/diff only; publish via Plan import) | Implemented (Phase 19 CE slice) |
| Continuous compliance (policy, cron route, run history, Resend email) | Implemented (Phase 11 CE slice) |
| Port inventory + impact simulation (plan-synced ports) | Implemented (Phase 12 CE slice) |
| Contractor memberships + QC queue (QC acknowledge, login required) | Implemented (Phase 14 CE slice) |
| Spare stock ledger (immutable transactions, never negative) | Implemented (Phase 15 CE slice) |
| Patch panels, panel-port mapping, circuits | Implemented (Phase 16 CE slice) |
| Schematic 2.5D rack twin from plan data (SVG; not surveyed/LIDAR, no real U positions) | Implemented (Phase 17 CE slice) |
| Project assistant: rule-based answers from findings/playbook/staleness/capacity; optional OpenAI rewording with `OPENAI_API_KEY` (grounded, falls back) | Implemented (Phase 18 CE slice) |
| First-party product events (`ProductEvent`; counts/ids only; 4 instrumented actions; lead/admin counts page `/analytics`; no third-party trackers) | Implemented (Phase 22 CE slice) |
| Playwright smoke e2e (`npm run test:e2e`; public pages only; no authenticated e2e) | Implemented (Phase 23 CE slice) |
| Demo project + public `/demo` | Implemented |
| Pilot request form + platform admin activate | Implemented |
| Apache 2.0 Community Edition (`HOSTED_SAAS` opt-in gate) | Implemented |
| First-run administrator bootstrap | Implemented |
| `/api/health` + `/api/ready` | Implemented |

## Explicitly out of scope (do not claim)

Additional CLI formats beyond NX-OS/IOS-XE LLDP, CDP, Arista EOS, Junos; true 3D / surveyed or LIDAR digital twin, rack-unit positioning; open-ended or conversational AI (persisted threads, general advice, autonomous actions); full bidirectional NetBox sync / webhook retries/queues/delivery guarantees, GitOps auto-publish or Git-provider integration (no repo polling); ODF strand / MPO polarity / splice modelling; enterprise org hierarchy / SSO / public contractor portals; third-party analytics / trackers (Segment, GA, Mixpanel, ...), funnel dashboards, feedback CRM; BOM / procurement what-if capacity planning; pixel-identical reproduction of every design PNG (CE matches design system + key layouts).

## Freeze rules

- Fix bugs, security, and deployment blockers only.
- No major new product features before public launch approval.
