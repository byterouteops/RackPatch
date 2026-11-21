# FINAL RELEASE BLOCKERS

**Date:** 2026-11-21

| ID | Severity | Module | Issue | Status |
|----|----------|--------|-------|--------|
| — | — | — | No open P0 blockers for CE launch | CLEAR |
| B1 | Residual HIGH | next/postcss | Nested postcss advisories | Accepted — wait Next patch; no force to Next 16 |
| B2 | Residual | vitest/tinypool | Critical in audit via test toolchain | Accepted — not prod runtime |
| B3 | Ops | Free plan | Services may sleep; project limit | Documented; template soft-delete done |
| B4 | Docs | `/demo` | Unseeded on prod smoke | Documented; not a P0 |
| B5 | Perf | Scale | 10k cable benchmarks | NOT TESTED — not a launch blocker |

v0.2 share links reviewed — no P0 defect found pre-deploy.

| B6 | P0 (fixed) | Docker migrate | `railway up` skipped preDeploy; lean image lacked prisma `effect` dep | Fixed in Dockerfile (full node_modules + migrate-on-start); v0.2.1 |
