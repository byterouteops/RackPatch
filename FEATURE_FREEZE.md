# Feature freeze — RackPatch Community Edition v0.1 launch candidate

**Date:** 2026-11-21  
**Scope:** Only features that exist in this repository.

## In scope (ship)

| Workflow | Status |
|----------|--------|
| Workspaces + project membership / invites | Implemented |
| CSV cable plan import + publish revisions | Implemented |
| Installation tracking (Planned / Installed / Blocked) | Implemented |
| QR labels (print sheet → cable URL) | Partial — print/QR only |
| NX-OS LLDP evidence import | Implemented |
| Expected vs observed / mismatch detection | Implemented |
| Independent physical verification | Implemented |
| Exceptions ack (mismatches stay visible) | Implemented |
| Handover snapshot + CSV export | Implemented |
| Demo project + public `/demo` | Implemented |
| Pilot request form + platform admin activate | Implemented |
| Apache 2.0 Community Edition (`HOSTED_SAAS` opt-in gate) | Implemented |
| First-run administrator bootstrap | Implemented |
| `/api/health` + `/api/ready` | Implemented |

## Explicitly out of scope (do not claim)

Multi-vendor LLDP beyond NX-OS, rack 3D / digital twin, AI assistant, NetBox/API/webhooks, fiber/circuits, multi-site orgs, product analytics dashboards, collection workers, continuous compliance, capacity planning, full offline QR scanner.

## Freeze rules

- Fix bugs, security, and deployment blockers only.
- No major new product features before public launch approval.
