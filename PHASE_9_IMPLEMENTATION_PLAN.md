# Phase 9 — Architecture Plan (Multi-Vendor LLDP, Racks, Tracing)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED** (plan only)  
**Prerequisite:** Stable v1 Community Edition (Phases 1–7)

## What exists today (verified in code)

| Capability | Status |
|------------|--------|
| Cisco NX-OS text LLDP parser | Implemented (`src/lib/lldp*`) |
| Plan vs observed verification | Implemented |
| Evidence / findings models | Implemented in Prisma |
| Cable list + A/Z detail UI | Implemented |
| Rack visualization canvas | **Not built** |
| Arista / Juniper adapters | **Not built** |
| Interactive cable tracing map | **Not built** |
| Vendor-neutral adapter interface | **Not built** (NX-OS path is direct) |

## Proposed architecture (future)

1. `LldpAdapter` interface → normalize observations  
2. Adapters: `nxos`, `eos`, `junos` (claim only tested formats)  
3. Interface normalization module per vendor  
4. Explicit device alias table (no silent ambiguous picks)  
5. `RackLayout` / `RackDevicePlacement` tables + UI  
6. Trace panel reusing findings + plan links  

## GO / NO-GO for coding now

**NO-GO** for full Phase 9 build in this release train — document-first until v1 published and approved.
