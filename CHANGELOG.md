# Changelog

All notable changes to RackPatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 13 incremental: in-app camera QR scanner (`/scan`) with same-project validation and paste fallback
- Phase 14 CE: workspace `Site` entities + Sites page; projects link via `siteId`
- Phase 15 CE: cable asset serial / length / retire on link runtime
- Phase 10 CE stub: `CollectionJob` records for manual evidence imports
- Phase 11 CE: evidence staleness check on project overview
- Phase 12 CE: capacity summary page (rack / device / media type aggregates)
- Phase 16 CE: cable media-type taxonomy, CSV normalize, cable list filter
- Phase 19 CE: read-only `/api/v1` summary + cables; hashed project API tokens
- Phase 19 CE: `/integrations` page: NetBox import-only dry-run (encrypted token, https-only + SSRF guard, pasted-JSON fallback), outbound HMAC-SHA256 webhooks for `evidence.import` / `install.update` / `handover.create`, GitOps plan export (YAML/JSON) + import dry-run
- Phase 22 CE: first-party `ProductEvent` analytics (`trackEvent`, sanitized counts/ids only, never blocks flows); instrumented `project.create`, `evidence.import`, `handover.create`, `offline.sync`; `/analytics` project page (7/30-day counts) for leads and platform admins; no third-party trackers
- Phase 23 CE: Playwright smoke tests (`playwright.config.ts`, `e2e/smoke.spec.ts`, `npm run test:e2e`); browsers are not installed automatically
- `INTEGRATION_ALLOW_PRIVATE_NETWORKS` env (self-host opt-in for RFC1918 NetBox/webhook targets)

## [0.2.0] - 2026-11-21

### Added

- Swap fix playbook for paired WRONG_ENDPOINT mismatches (Overview, Exceptions, cable detail)
- Evidence clearance audit (`verify.evidence_cleared`) when re-import resolves exceptions
- Time-boxed customer handover share links (`/share/handover/[token]`)
- Cable QR deep-links with field actions (`?action=install|verify|fix`)

### Changed

- README documents multi-vendor neighbor evidence and `/demo` seed requirement

## [0.1.0] - 2026-11-21

### Added

- Initial RackPatch Community Edition application: workspaces, CSV plan import, install workflow, NX-OS LLDP verify, exceptions, handover, demo fixtures
- Apache License 2.0, CI, Railway docs, Community Edition `HOSTED_SAAS` gate
