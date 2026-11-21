# AI/HPC Demo — Presenter Script

> **DEMO / SYNTHETIC DATA.** Say this out loud at the start: "Everything you see is a fictional organisation with synthetic evidence. RackPatch verifies physical cabling; it does not verify routing, BGP, PFC/ECN or RDMA performance."

## Setup (local only)

```powershell
$env:DEMO_SEED="ai-hpc"; npm run demo:seed:ai-hpc     # idempotent; add -- --refresh to rebuild
npm run demo:verify:ai-hpc                             # 24 database checks
npm run dev
```

Sign in at `/sign-in` → **Password** with `<user>@demo.northstar.local` and the demo password (`DEMO_PASSWORD`, default `password123` for local use only).

| Key | Person (fictional) | Role |
| --- | --- | --- |
| owner | Morgan Reyes | Workspace owner + project lead |
| lead | Priya Natarajan | Lead |
| tech | Jonas Weber | Technician |
| contractor | Kai Okafor | Technician (contractor) |
| qc | Lena Brandt | Technician (independent QC) |
| engineer | Diego Alvarez | Technician (fabric engineer) |
| viewer | Sam Ortiz | Viewer (read-only auditor) |

The project opens in the **Fault injected** snapshot. Click **Start demo tour** on the amber banner to step through the 20 scenarios in [AI_HPC_DEMO_SCENARIOS.md](AI_HPC_DEMO_SCENARIOS.md).

## 15-minute flow

1. **Overview (owner).** KPI strip → Fabric readiness → Handover gate shows owner acceptance blocked by critical exceptions. Click a KPI to show it is backed by records.
2. **Fabric → Racks (lead).** 14 elevations; colour = worst finding. Open R08 → GPU-08A: one FE port is a mismatch.
3. **Topology and BE rails (engineer).** FE and BE are separate; design attributes are labelled "design, not verified by LLDP".
4. **Evidence → Explorer (engineer).** Pick GPU-10B: raw lldpd output, SHA-256 match with the stored capture, expected vs observed (`swp16` instead of `swp6`).
5. **Exceptions (lead).** FE swap with its partner and a fix playbook; BE NIC swap is "wrong port". Assign the wrong-device exception to Kai Okafor with a due date.
6. **Verify (engineer).** Firewall HA and console links are *Unobservable* — physical check required, never LLDP-verified. RTR-02 is stale; OOB-SW2 failed to parse.
7. **QC (qc).** Reject a cable end with a note → it becomes a rework item. Note the installer cannot verify their own work.
8. **Playback (lead).** Evidence → Explorer → **Corrected**. Exceptions close automatically with an audit entry. Switch back to **Fault injected** afterwards.
9. **Handover (tech → qc → engineer → owner).** Create a snapshot as lead, then sign stages in order. Show the QC stage refusing the installation signer, and owner acceptance blocked until exceptions are closed or waived.
10. **Viewer.** Sign in as Sam Ortiz: everything is visible, nothing can be changed.

## Honest limitations to state

- Playback replays stored synthetic files; it is not a live SSH collection.
- Mobile is a responsive web app with offline capability, not a native app.
- LLDP/CDP proves neighbor adjacency (physical cabling). It cannot prove ECN/PFC, RDMA, congestion control, BGP or firewall policy.
- Passive panels, demarcs, disconnected ports, power cables and devices without a parser never get fabricated LLDP observations.

## Reset

```powershell
$env:CONFIRM="NS-DC1-AI-POD-A"; npm run demo:reset:ai-hpc
```

Deletes only the demo workspace. You must set the confirmation explicitly.
