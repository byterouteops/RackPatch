# Phase 11 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIAL - continuous compliance CE slice (policy + cron-safe route + email); no built-in scheduler

## Delivered

| Capability | Status |
|------------|--------|
| Verification findings / exceptions | Implemented (prior) |
| Staleness report (per-policy max age, default 7 days) | Implemented |
| Overview banner for stale/missing | Implemented |
| `CompliancePolicy` (enabled, maxEvidenceAgeDays, notifyEmails, recomputeFindings) | Implemented |
| `ComplianceRun` history (status, counts, summary, notified) | Implemented |
| `POST /api/internal/compliance-check` (header `x-compliance-secret`) | Implemented |
| Email alerts via Resend when `RESEND_API_KEY` is set | Implemented |
| `/app/projects/[id]/compliance` page + subnav link | Implemented |
| Built-in scheduler | Not built - call the route from external cron |

## Behavior

- Route returns 503 if `COMPLIANCE_CRON_SECRET` is unset, 401 on missing/wrong header (constant-time compare). Optional JSON body `{ "projectId": "..." }`.
- Each run reuses `computeEvidenceStaleness`, counts open MISMATCH / NEEDS_REVIEW findings on the active revision, and optionally calls `recomputeFindings` first.
- Email is sent only when issues exist, recipients are configured, and the issue fingerprint changed or 24h passed since the last email. Without `RESEND_API_KEY` the run is recorded and no email is sent.
- Policy edits and manual "Run check now" require `canManageProject` (lead/owner).

## Evidence

- Schema/migration: `prisma/migrations/20261121170000_compliance_engine`
- Lib: `src/lib/compliance.ts`, `src/lib/compliance-run.ts`, `src/lib/email.ts`, `src/lib/evidence-staleness.ts`
- Route: `src/app/api/internal/compliance-check/route.ts`
- UI/actions: `src/app/(app)/app/projects/[projectId]/compliance/page.tsx`, `src/components/compliance-policy-form.tsx`, `src/app/actions/compliance.ts`
- Tests: `tests/compliance.test.ts`, `tests/evidence-staleness.test.ts`
