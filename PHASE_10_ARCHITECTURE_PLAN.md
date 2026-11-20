# Phase 10 — Architecture Plan (Collection Workers)

**Date:** 2026-11-21  
**Implementation status:** **NOT STARTED**  
**Prerequisite:** Phase 9 adapters + evidence pipeline

## What exists today

| Capability | Status |
|------------|--------|
| Manual paste LLDP import | Implemented |
| SSH collection workers | **Not built** |
| Device credential vault | **Not built** |
| Job scheduler | **Not built** |
| Background workers | **Not built** |

## Proposed modes

- **A** Direct collection (optional)  
- **B** On-prem worker, outbound to RackPatch, allowlisted read-only commands only  

## Security non-negotiables

- No plaintext credentials in ordinary columns  
- Host-key verification required  
- Discovery off by default  
- No arbitrary CLI  
- Workspace isolation on jobs/secrets  

## GO / NO-GO

**NO-GO** — highest risk surface; architecture only until Phase 9 stable and security review approved.
