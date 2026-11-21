# Changelog

All notable changes to RackPatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
