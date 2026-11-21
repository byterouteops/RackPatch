# Phase 14 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIAL - Sites under workspace plus contractor memberships and QC queue (CE slice); no organization hierarchy / SSO

## Delivered

| Capability | Status |
|------------|--------|
| Workspace -> Project membership | Implemented (prior) |
| `Site` model + project `siteId` | Implemented |
| Auto-create site on project create | Implemented |
| Workspace Sites page | Implemented |
| `contractor` flag on `ProjectMembership` and `Invitation` (`ProjectRole` enum unchanged) | Implemented |
| Contractor invite checkbox on team page (Technician only) | Implemented |
| `canQcAcknowledge` capability + `isContractor` | Implemented |
| QC queue `/app/projects/[id]/qc` (open MISMATCH / NEEDS_REVIEW, acknowledged list) | Implemented |
| Organization hierarchy / SSO / separate public contractor portal | Not built (login still required) |

## Authorization rules

- Contractor = technician-level (install, physical verify) plus QC acknowledge. No lead powers: `canResolveExceptions`, `canManageProject`, `canPublishPlan`, `canImportEvidence`, `canExport` are all false.
- A contractor flag on a stored LEAD membership is downgraded (no lead powers). Workspace owners are never contractors.
- QC acknowledge sets the finding to ACKNOWLEDGED with a `[QC]` note and audit `qc.acknowledge`; it does not close the discrepancy (handover/overview still count it as unresolved).
- Invitations: contractor requires role TECHNICIAN; the invited project must belong to the inviting workspace.
- Pure rules live in `src/lib/authz-capabilities.ts` and are unit-tested.

## Evidence

- Schema/migration: `prisma/migrations/20261121190000_contractor_membership`
- Lib: `src/lib/authz-capabilities.ts`, `src/lib/authz.ts`, `src/lib/qc.ts`, `src/lib/sites.ts`
- Actions/UI: `src/app/actions/qc.ts`, `src/app/actions/workspace.ts`, `src/app/(app)/app/projects/[projectId]/qc/page.tsx`, `src/components/qc-ack-form.tsx`, team page
- Tests: `tests/contractor-authz.test.ts`
