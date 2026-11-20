# Phase 11 — Architecture Plan (Continuous Compliance)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED**  
**Prerequisites missing:** Phases 9–10 (multi-vendor parsers, collection workers, scheduled batches)

## Existing building blocks (verified)

| Area | Status |
|------|--------|
| Plan revisions + active revision | Implemented |
| LLDP evidence + findings | Implemented |
| Handover snapshots | Implemented (handover, not continuous connectivity snapshots) |
| AuditEvent model | Implemented |
| Verification states | Implemented (AWAITING, MISMATCH, VERIFIED_*, etc.) |
| Collection job architecture | **Missing** (Phase 10) |
| Notification infrastructure | Minimal (pilot email optional) — **not** general prefs |
| Continuous connectivity snapshots | **Missing** |
| Change windows / compliance policies | **Missing** |

## Evidence lifecycle (current)

Manual or form import → store evidence → parse NX-OS → match plan → findings. No automated batch snapshot comparison engine.

## Authorization boundaries (current)

`getProjectAccess` / workspace ownership; hosted SaaS commercial gate optional.

## Proposed future models (not migrated)

ConnectivitySnapshot, SnapshotObservation, ChangeEvent, CompliancePolicy, ChangeWindow, NotificationPreference, DailyComplianceReport — only after Phase 10 collection batches exist.

## GO / NO-GO

**NO-GO** for Phase 11 implementation — prerequisites not present; inventing continuous compliance without workers would be fake.
