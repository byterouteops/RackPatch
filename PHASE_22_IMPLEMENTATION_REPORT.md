# Phase 22 Implementation Report

**Date:** 2026-11-21
**Status:** PARTIAL - first-party product events (CE slice). No funnel dashboard, feedback CRM, or third-party analytics.

The earlier launch exclusion for product analytics is **lifted for this CE slice only**, and only for
**first-party** events stored in this instance's own database. Third-party analytics/trackers
(Segment, Google Analytics, Mixpanel, etc.) remain **out of scope** and none are included.

## What shipped

| Item | Detail |
|------|--------|
| `ProductEvent` model | `id, projectId?, workspaceId?, actorId?, name, propsJson?, createdAt`; no foreign keys; indexed on `(projectId, createdAt)` and `(name, createdAt)` |
| Migration | `20261121230000_product_events` (hand-written; **not yet applied to a live Postgres** in this repo's verification) |
| Helper | `src/lib/analytics.ts`: `trackEvent`, `sanitizeEventName`, `sanitizeProps`, `countProjectEventsByName` |
| Privacy | Event names must be dotted lowercase identifiers; props limited to finite numbers, booleans and id-like strings (max 10 keys); PII/secret-looking keys (email, name, token, note, url, ...) and free-text/email/URL values are dropped |
| Failure mode | `trackEvent` catches every error and returns `false`; analytics never blocks a user flow (callers `await` one cheap insert) |
| Instrumented actions | `project.create`, `evidence.import` (observation count), `handover.create` (link / unresolved-exception counts), `offline.sync` (item / ok / photo counts) |
| Read page | `/app/projects/[projectId]/analytics`: event counts by name for last 7 and 30 days, from DB rows only; visible to project leads (incl. workspace owners) and platform admins |
| Tests | `tests/analytics.test.ts` (name/props sanitization, row building, track success, invalid name, DB failure) |

## Not shipped / limitations

- Only the four actions above are instrumented; `install.update`, QC, compliance, etc. are not.
- Counts begin when the migration is applied; there is no backfill from `AuditEvent`.
- Counts are per project; no workspace/platform-wide rollups, funnels, retention, or per-user metrics.
- No retention/purge job for `product_event` yet; no opt-out toggle (events contain only counts, ids and actor id).
- The page shows raw counts only - no derived or invented metrics.
- Instrumented flows that fail before the action completes record nothing.

## Recommendation

Keep to first-party events. Any additional vendor SDK or cross-instance telemetry still requires a separate
privacy review and an explicit decision.
