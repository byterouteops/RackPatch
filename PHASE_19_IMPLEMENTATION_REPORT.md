# Phase 19 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIAL - read-only `/api/v1` + tokens (earlier slice), plus NetBox **import-only dry-run**, outbound webhooks, and GitOps export/import dry-run (this slice)

## Delivered

| Capability | Status |
|------------|--------|
| `GET /api/v1/projects/:id/summary` | Implemented (earlier slice) |
| `GET /api/v1/projects/:id/cables` | Implemented (earlier slice) |
| Project API tokens (hashed) | Implemented (earlier slice) |
| Session or Bearer auth | Implemented (earlier slice) |
| NetBox config (URL + token, token AES-256-GCM encrypted via `src/lib/crypto/secrets.ts`) | Implemented |
| NetBox live dry-run (read-only `GET /api/dcim/devices/` + `/cables/`, paged, 10s timeout) | Implemented; **not verified against a real NetBox instance** |
| NetBox JSON-fixture preview (3.3+ `a_terminations` and legacy `termination_a`) | Implemented + unit tested |
| `SyncJob` history (always `dryRun=true`, counts-only summary) | Implemented |
| NetBox writes / apply sync to plan | **Not built** (CE has no NetBox write path at all) |
| SSRF controls (https only, no userinfo, loopback/link-local/metadata/reserved always blocked, RFC1918/CGNAT blocked unless `INTEGRATION_ALLOW_PRIVATE_NETWORKS`, obfuscated-IP canonicalisation, connect-time DNS validation, no redirects, size cap) | Implemented + tested (`tests/ssrf.test.ts`) |
| Outbound webhooks (`WebhookEndpoint`, add/revoke UI, secret encrypted, shown once) | Implemented |
| Webhook delivery: `enqueueOutboundWebhook` fire-and-forget, HMAC-SHA256 over `timestamp.body`, 5s timeout, single attempt, auto-disable after 10 consecutive failures | Implemented; signing tested (`tests/webhooks.test.ts`); delivery path exercised only via the SSRF-guarded fetch, not an end-to-end DB test |
| Webhook events wired | `evidence.import` (manual LLDP import), `install.update`, `handover.create`. SSH collection and field-photo imports do **not** emit events |
| Webhook retries / durable queue / delivery guarantees | **Not built** (best-effort; may be lost on process restart) |
| GitOps export (`GET /api/v1/projects/:id/gitops?format=yaml|json`, action `exportPlanGitOps`) | Implemented |
| GitOps import dry-run (validates through the CSV plan-import normalizer, diffs vs. active plan, emits plan-import CSV) | Implemented + tested (`tests/gitops.test.ts`) |
| GitOps auto-publish / Git provider sync | **Not built** (publishing still goes through the Plan import page) |

## Security notes

- Tokens and webhook secrets are stored as ciphertext only; the NetBox token is never returned to the client, the webhook secret is shown once at creation.
- Webhook payloads carry ids/counts only (no raw evidence text, no secrets).
- NetBox `next` pagination links are never followed (offsets are built locally).
- YAML parsing uses the core schema, alias cap, strict fields, and requires string cable ids (so `001` is not silently turned into `1`).
- The hand-written migration `20261121220000_netbox_webhooks_gitops` has not been applied to a live database as part of this work; `prisma generate` + typecheck pass.

## Evidence

- `src/lib/net/{ssrf,safe-fetch}.ts`, `src/lib/{netbox,netbox-client,gitops,gitops-export,webhooks,webhook-dispatch}.ts`
- `src/app/actions/{integrations,webhooks}.ts`, `src/app/api/v1/projects/[projectId]/gitops/route.ts`
- `src/app/(app)/app/projects/[projectId]/integrations/page.tsx`, `src/components/{netbox-panel,webhook-create-form,gitops-panel}.tsx`
- `prisma/migrations/20261121220000_netbox_webhooks_gitops/migration.sql`
- Earlier slice: `src/app/api/v1/projects/[projectId]/{summary,cables}/route.ts`, `src/lib/api-token.ts`, `src/lib/api-auth.ts`, `src/app/actions/api-tokens.ts`, `/app/projects/[id]/api`