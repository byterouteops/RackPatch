# Phase 18 — Architecture Plan (AI Assistant)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED**  
**Recommendation:** **NO-GO**

## Verified current capabilities

| Capability | Status |
|------------|--------|
| Deterministic inventory / verify / handover | Implemented (v1 scope) |
| LLM / chat / tool registry | **Missing** |
| Circuit graph tools | **Missing** (Phase 16) |
| Capacity planning tools | **Missing** (Phase 12) |
| Digital twin tools | **Missing** (Phase 17) |
| Historical connectivity snapshots | **Missing** (Phase 11) |

## Design principles (future)

- LLM is **not** source of truth  
- Core app works with AI disabled  
- Typed server tools only; session-derived authz; no arbitrary SQL/shell  
- Evidence-grounded citations; prompt-injection resistant  
- No credentials in model context  

## GO / NO-GO

**NO-GO** — most proposed tools depend on unimplemented domains; shipping chat would hallucinate over thin data.
