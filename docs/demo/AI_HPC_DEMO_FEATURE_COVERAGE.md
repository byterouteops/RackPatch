# AI/HPC Demo — Feature Coverage

> **DEMO / SYNTHETIC DATA.**

Status: **Real** = production feature exercised by the demo. **Demo-only** = exists only for the synthetic demo. **Limitation** = stated honestly to the audience.

| Capability | Where | Status | Notes |
| --- | --- | --- | --- |
| Cable plan import with validation (duplicates, port conflicts, line numbers) | Plan | Real | Fixtures in `fixtures/demos/ai-hpc/` |
| Fabric/speed/connector/rail/length cable attributes | Cables (fabric filter) | Real | |
| Rack elevations with device placement | Fabric → Racks | Real | Colour = worst finding on the device's cables |
| Spine/leaf topology, FE/BE rails | Fabric → Topology / Front-end / Back-end | Real | Design metadata labelled "design" |
| Path trace | Fabric → Trace | Real | Data paths never transit OOB; OOB-only paths labelled |
| Multi-vendor LLDP/CDP parsing (NX-OS, EOS, Junos, IOS-XE, lldpd/Cumulus/Linux) | LLDP / CDP, Evidence | Real | |
| Interface status parsing (link down) | Evidence | Real | |
| Directional observability, unobservable links | Verify | Real | Never LLDP-verified; physical check required |
| Stale evidence by policy | Compliance, Verify | Real | 7-day policy in demo |
| Parser error handling | Evidence, Verify | Real | Affects only links no other side observes |
| Ambiguous identity (duplicate host names) | Verify | Real | |
| Swap detection + fix playbook | Exceptions, Overview | Real | |
| Exception owner, due date, overdue | Exceptions | Real | Audited |
| Authorized waiver for critical exceptions | Exceptions | Real | Lead only, reason ≥ 10 chars, stays visible |
| Independent physical QC accept/reject | QC, cable record | Real | Installer cannot verify own work; rejection needs note |
| Staged handover approvals with owner gate | Handover | Real | Order, independence and exception gate enforced server-side |
| Read-only Viewer role | All pages | Real | |
| Evidence explorer (raw → parsed → expected vs observed) | Evidence → Explorer | Real | Raw text shown for demo is regenerated and SHA-256-checked against the stored capture |
| Evidence playback (Baseline / Fault / Corrected) | Evidence → Explorer | Demo-only | Stored synthetic captures, **not** a live SSH collection |
| Demo banner + 20-step tour | Demo project pages | Demo-only | |
| Page guides + field hints | Every page / form | Real | Also listed on Help |
| Work orders, stock ledger, panels, circuits | Work orders, Spares, Panels | Real | |
| Mobile field workflow | Scan, cable record | Limitation | Responsive web app with offline capability, not a native app |
| ECN/PFC, RoCEv2, RDMA performance, congestion control | — | Limitation | Not verifiable via LLDP; shown as design metadata only |
| BGP sessions, firewall policy, reachability | — | Limitation | Out of scope (physical cabling only) |
| Live SSH collection | Collection | Real (separate) | Not used by the demo; demo never claims a live collection |
