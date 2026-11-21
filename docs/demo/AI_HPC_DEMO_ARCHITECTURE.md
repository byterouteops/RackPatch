# AI/HPC Demo — Architecture

> **DEMO / SYNTHETIC DATA.** Northstar Infrastructure Labs and everything in the demo is fictional.

## Single source of truth

`src/lib/demo/ai-hpc/topology.ts` builds a deterministic topology: 14 racks, 50 devices, 172 cables, patch-panel mappings and circuits. Everything else is derived from it:

| Consumer | File | Uses |
| --- | --- | --- |
| Validation | `src/lib/demo/ai-hpc/validate.ts` | RU bounds/overlap, duplicate ports/devices/cables, endpoint existence, cable speed ≤ port speed, port reuse, fabric roles, no FE↔BE switch bridge |
| Plan CSV fixture | `scripts/gen-ai-hpc-fixtures.ts` → `fixtures/demos/ai-hpc/*.csv` | valid plan + duplicate-ID + port-conflict files |
| Evidence generator | `src/lib/demo/ai-hpc/evidence.ts` | per-OS CLI text for 3 snapshots and 12 fault scenarios |
| Seed | `prisma/seed-ai-hpc.ts` | workspace, users, racks, devices, plan revision, evidence, work orders, stock, findings |
| Docs | `scripts/gen-ai-hpc-docs.ts` | rack layout, inventory, cable matrix, scenarios, CDP/LLDP coverage/outputs/faults |

## Evidence pipeline (production code, not demo-specific)

1. Raw CLI text → `parseNeighborEvidence` (NX-OS, EOS, Junos, IOS/IOS-XE, lldpd key-value) or `parseInterfaceStatus`.
2. Stored as `EvidenceImport` (with `synthetic` and `demoSnapshot` flags) plus `Observation` / `InterfaceStateObservation` rows.
3. `src/lib/verify/compute.ts` (pure) computes per-link match, observability and outcome:
   - latest successful import per device and kind;
   - directional observability: a side is observable when the local device is collectable and the remote transmits (per-port overrides, e.g. `bmc0`);
   - explicit aliases (BMC host names, port aliases, MAC port IDs) — no fuzzy matching;
   - stale evidence only when a compliance policy is enabled; parse failures only matter when no other side can observe the link.
4. `src/lib/verify/recompute.ts` writes `VerificationFinding` rows, closes resolved exceptions and audits.

## Evidence scoping

`src/lib/evidence/scope.ts`: a demo project with `demoEvidenceSnapshot` reads only synthetic imports from that snapshot; every other project reads only non-synthetic imports. Applied to verify, evidence, compliance, overview, assistant facts and the summary API.

## Playback

`src/lib/demo/playback.ts` + `src/app/actions/demo.ts`: switches the demo project between `BASELINE`, `FAULT_INJECTED` and `CORRECTED`, recomputes findings and audits `demo.evidence_snapshot`. Rejected for non-demo projects. The UI says "stored synthetic captures — not a live SSH collection".

## UI added for the demo (works for any project with the data)

| Route | Purpose |
| --- | --- |
| `/racks`, `/racks/[rack]` | rack elevations, device ports, cables grouped by fabric/rack/status |
| `/fabric`, `/fabric/[fe\|be]` | tiered topology, per-fabric stats, rails, problem list |
| `/trace` | device/port/cable trace; data paths never transit OOB (OOB-only paths labelled) |
| `/evidence/explorer` | raw CLI (SHA-256 checked against stored capture) → parsed neighbors → expected vs observed |
| `/exceptions` | assign owner + due date, authorized waiver for critical exceptions |
| `/qc`, cable record | accept or reject each end (rejection needs a note) |
| `/handover` | staged approvals INSTALLATION → INDEPENDENT_QC → ENGINEERING → OWNER |
| overview | Fabric readiness table and Handover gate |

Guidance: `src/lib/help/hints.ts` (page guides for every app route, field hints for every control), `PageGuide`, `FieldHints`, `DemoTour`.

## Handover gate

`src/lib/handover/approval.ts` (pure) decides whether an actor may sign a stage:

- stages must be signed in order and only once;
- viewers cannot sign;
- independent QC cannot be signed by a contractor or by the installation signer;
- engineering cannot be signed by a contractor;
- owner acceptance needs the workspace owner and zero open ERROR findings without a waiver (`src/lib/handover/blocking.ts`).

The server action `approveHandoverStage` re-checks everything server-side.

## Safety

- Seed refuses to run without `DEMO_SEED=ai-hpc` and refuses if the slug belongs to a non-demo workspace.
- Reset requires `CONFIRM=NS-DC1-AI-POD-A` and deletes only the `isDemo` workspace plus orphan users on the demo e-mail domain.
- No migration reset is used; schema changes were applied with `prisma migrate deploy`.
