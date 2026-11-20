# Changelog

All notable changes to RackPatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Apache License 2.0 (`LICENSE`, `NOTICE`)
- Open-source audit deliverables and community docs (`CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`)
- Community Edition: self-host mutations no longer require PILOT/PAID unless `HOSTED_SAAS=true`
- GitHub Actions CI workflow (lint, typecheck, test, build)
- Railway deployment documentation set (Phase 3+)

### Changed

- Invite token server logging gated to non-production
- `.gitignore` covers `.env.*` (keeps `.env.example`)

## [0.1.0] - 2026-11-21

### Added

- Initial RackPatch Community Edition application: workspaces, CSV plan import, install workflow, NX-OS LLDP verify, exceptions, handover, demo fixtures
