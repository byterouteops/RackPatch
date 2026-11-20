# Phase 19 — Architecture Plan (NetBox, REST API, Webhooks, GitOps)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED** (beyond app-internal Next routes)  
**Recommendation:** **NO-GO**

## Verified current capabilities

| Capability | Status |
|------------|--------|
| Next.js App Router + server actions | Implemented |
| Public REST `/api/v1` resource API | **Missing** |
| Scoped API tokens | **Missing** |
| NetBox connector | **Missing** |
| Outbound webhooks | **Missing** |
| GitOps plan import/export | **Missing** |
| Background job processor | **Missing** |
| Auth for browsers (Better Auth) | Implemented |

## Prerequisites / risks

- Stable external IDs for devices/ports/cables (Phases 12/15/16)  
- Field ownership policy before NetBox writes  
- SSRF controls for NetBox URL + webhook destinations  
- Default sync: import-only / dry-run  

## Future modules (not built)

Integration registry, encrypted credential refs, sync jobs/conflicts, OpenAPI, HMAC webhooks, GitOps dry-run.

## GO / NO-GO

**NO-GO** — no live NetBox connection; no public API surface without design + security review.
