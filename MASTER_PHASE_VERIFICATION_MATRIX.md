# MASTER PHASE VERIFICATION MATRIX — RackPatch

**Date:** 2026-11-21  
**Rule:** Status reflects repository evidence, not phase prompt existence.

| Phase | Theme | Status | Evidence |
|-------|-------|--------|----------|
| 1–2 | CE core + release prep | VERIFIED | App tree, LICENSE, CHANGELOG |
| 3 | Railway prep | VERIFIED | `railway.toml`, Dockerfile, live smoke |
| 4 | Marketplace | VERIFIED | Published `rackpatch` template |
| 5 | Tests | VERIFIED | Vitest suite (expanding with CE slices) |
| 6 | GitHub release | VERIFIED | v0.1.0 / v0.2.x published |
| 7–8 | Launch / growth docs | VERIFIED | LinkedIn drafts, FIRST_10 plans |
| 9 | Multi-vendor LLDP | VERIFIED | Parsers + neighbor-evidence tests |
| 10 | Collection workers | PARTIALLY IMPLEMENTED | Manual jobs + SSH allowlisted collect; no on-prem worker fleet |
| 11 | Continuous compliance | PARTIALLY IMPLEMENTED | CompliancePolicy + ComplianceRun, `POST /api/internal/compliance-check` (external cron, `COMPLIANCE_CRON_SECRET`), `/compliance` page, Resend email; no built-in scheduler. Staleness check — no scheduler |
| 12 | Capacity / impact | PARTIALLY IMPLEMENTED | DeviceInventory/DevicePort synced from active plan, `/inventory` page with impact simulation (`calculateImpact`); no BOM/what-if scenarios. Plan-link capacity page — no inventory |
| 13 | QR / labels extend | PARTIALLY IMPLEMENTED | Labels + scan + offline queue + photos; label designer limited |
| 14 | Multi-site / contractors | PARTIALLY IMPLEMENTED | Workspace Sites; `contractor` membership flag + `/qc` queue with `canQcAcknowledge` (login required); no org hierarchy/SSO |
| 15 | Cable lifecycle / spares | PARTIALLY IMPLEMENTED | Serial/length/retire; `StockItem` + immutable `StockTransaction` ledger and `/spares` page; no procurement/work orders |
| 16 | Fiber / panels / circuits | PARTIALLY IMPLEMENTED | Media-type taxonomy; `PatchPanel`/`PanelPort`/`Circuit` + `/panels` page; no strand/MPO polarity modelling |
| 17 | Digital twin 3D | PARTIALLY IMPLEMENTED | `/twin` schematic 2.5D SVG rack elevation from active plan endpoints (`buildRackLayout`, `tests/rack-layout.test.ts`); no Three.js/WebGL, no real U positions, not surveyed/LIDAR |
| 18 | AI assistant | PARTIALLY IMPLEMENTED | `/assistant` rule-based grounded answers (`answerQuestion`, `tests/assistant-answer.test.ts`) + optional OpenAI rewording with number-grounding guard; client-side history only, keyword intents, LLM path untested against live API |
| 19 | NetBox / REST / webhooks | PARTIALLY IMPLEMENTED | Read-only `/api/v1` + tokens (existing); new: `/integrations` page with NetBox **import-only dry-run** (`IntegrationConfig`/`SyncJob`, encrypted token, https + SSRF guard `src/lib/net/ssrf.ts`, DNS-pinned `safe-fetch`, JSON-fixture preview), outbound HMAC-SHA256 webhooks (`WebhookEndpoint`, `enqueueOutboundWebhook`, best-effort/no retry), GitOps YAML/JSON export (`GET /api/v1/projects/:id/gitops`, `exportPlanGitOps`) + import dry-run. Tests: `ssrf`, `webhooks`, `netbox`, `gitops`. **Not built:** NetBox writes/apply-sync, webhook retries/queue, GitOps auto-publish, live NetBox verified only against fixtures (no real instance tested) |
| 20 | Prod hardening | VERIFIED | Headers, ready, backup scripts |
| 21 | Launch docs | VERIFIED | README, Railway docs, freeze |
| 22 | Product analytics | PARTIAL | First-party `ProductEvent` + `/analytics` counts only; no third-party trackers; migration not applied to live Postgres |
| 23 | Playwright platform | PARTIAL | Smoke spec on public pages; no authenticated e2e; not in CI |
| 24 | Railway live | VERIFIED | Smoke URL online Nov 21 |
| 25 | Launch candidate | VERIFIED | Marketplace + public GitHub |

**v0.2 Field Trust** (playbook, clearance audit, share link, QR actions): IMPLEMENTED.

**Phases 10–16, 19 CE slices:** implemented incrementally Nov 21 — full enterprise scope remains deferred.

**Phase 19 CE additions (Nov 21):** NetBox dry-run, outbound webhooks and GitOps export/import-dry-run added on top of the read-only API. DB migration `20261121220000_netbox_webhooks_gitops` is hand-written and not yet applied to a live Postgres in this repo's verification.

**Phases 17-18 CE slices (Nov 21):** schematic SVG rack twin and grounded rule-based assistant (optional LLM rewording). Not a 3D/surveyed twin; not a conversational AI platform.
