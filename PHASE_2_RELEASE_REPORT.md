# Phase 2 — Open-Source Community Edition Release Report

**Date:** 2026-11-21  
**Status:** Implemented locally — **not published** (no public GitHub / Railway action)

## Changes

1. Apache License 2.0 `LICENSE` + `NOTICE` (Copyright 2026 K G Pramod)
2. `package.json`: `"license": "Apache-2.0"`, `"private": false`, `engines.node >= 20`
3. Community Edition: `HOSTED_SAAS` env — mutations allowed when unset/false; PILOT/PAID gate only when hosted SaaS
4. `.gitignore` covers `.env.*` (keeps `.env.example`)
5. Invite token logging gated to non-production
6. Community docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG
7. GitHub CI + issue/PR templates
8. `/about` page; README license + commercial sections updated
9. Permission tests updated for Community Edition vs hosted SaaS

## Files created / modified

- Created: LICENSE, NOTICE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md, `.github/**`, `src/app/about/page.tsx`, this report
- Modified: `src/lib/env.ts`, `src/lib/authz.ts`, `tests/permission-boundaries.test.ts`, `.gitignore`, `.env.example`, `package.json`, `README.md`, `src/app/page.tsx`, team invite page

## Remaining

- First git commit + Gitleaks (operator)
- Public visibility / remotes require explicit approval
