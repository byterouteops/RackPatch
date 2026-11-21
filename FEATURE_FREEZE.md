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
| Neighbor evidence import (NX-OS/IOS-XE LLDP, CDP, Arista, Junos) | Implemented |
| Expected vs observed / mismatch detection | Implemented |
| Swap fix playbook (paired mismatches) | Implemented (v0.2) |
| Evidence clearance audit on re-import | Implemented (v0.2) |
| Customer handover share link | Implemented (v0.2) |
| Independent physical verification | Implemented |
| Exceptions ack (mismatches stay visible) | Implemented |
| Handover snapshot + CSV export | Implemented |
| QR → cable field actions | Implemented (v0.2 partial) |
| Demo project + public `/demo` | Implemented |
| Pilot request form + platform admin activate | Implemented |
| Apache 2.0 Community Edition (`HOSTED_SAAS` opt-in gate) | Implemented |
| First-run administrator bootstrap | Implemented |
| `/api/health` + `/api/ready` | Implemented |

## Explicitly out of scope (do not claim)

Additional CLI formats beyond NX-OS/IOS-XE LLDP, CDP, Arista EOS, Junos; rack 3D / digital twin; AI assistant; NetBox/API/webhooks; fiber/circuits; multi-site orgs; product analytics; collection workers; continuous compliance; capacity planning; full offline QR scanner.

## Freeze rules

- Fix bugs, security, and deployment blockers only.
- No major new product features before public launch approval.
