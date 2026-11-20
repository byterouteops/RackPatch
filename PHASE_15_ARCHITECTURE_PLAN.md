# Phase 15 — Architecture Plan (Cable Lifecycle & Asset Management)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED**  
**Recommendation:** **NO-GO** for coding until v1 is published and Phases 9–14 prerequisites are real.

## Verified current capabilities

| Capability | Status |
|------------|--------|
| Planned connections (`PlannedLink`) | Implemented |
| Install / block / physical verify | Implemented |
| Handover snapshots | Implemented |
| Audit events | Implemented |
| QR / labels page | Partial (labels route; not asset lifecycle) |
| Distinct physical cable **asset** model | **Missing** |
| Spare stock / procurement / receiving | **Missing** |
| Maintenance work orders | **Missing** |
| Asset transfer / retirement | **Missing** |
| Organization → Site hierarchy | **Missing** (Phase 14) |
| Work packages / contractors | **Missing** (Phase 14) |

## Missing dependencies

- Phase 14 org/site models (for multi-site stock)
- Phase 13 full QR asset flows
- Inventory transaction ledger design

## Proposed future model (not migrated)

Separate **PhysicalCableAsset** from **PlannedLink**; immutable stock transactions; lifecycle state machine (Ordered→…→Disposed); maintenance plans/work orders; replacement history preserving old associations.

## Security notes (when built)

Organization/site isolation; contractors must not mutate unrelated inventory; no negative stock; transactional allocations.

## GO / NO-GO

**NO-GO** — would invent asset/stock systems on top of a plan-centric v1 schema.
