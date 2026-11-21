# 05 — Implementation Plan (batches)

## Batch 1 — Foundation (NOW)

1. Update CSS tokens + fonts to design system  
2. Redesign `AppShell` (sidebar groups + top bar)  
3. Replace overcrowded `ProjectSubnav` with grouped project nav  
4. Shared primitives polish (`PageHeader`, `StatCard`, badges)  
5. Vitest + typecheck + build  

## Batch 2 — Core ops UI

Dashboard/projects home, project overview, cables, plan import — visual alignment with references while keeping real counts.

## Batch 3 — Field

Installation/cable detail, labels, scan, offline, photos — responsive; evidence library page aggregating `FieldPhoto`.

## Batch 4 — Verify

Evidence/LLDP, collection, exceptions, mismatch/playbook presentation.

## Batch 5 — Handover & reports

Handover package UI; audit list from `AuditEvent`; honest reports from real aggregates.

## Batch 6 — Inventory domains

Inventory, panels, spares, capacity, twin — restyle + IA.

## Batch 7 — Admin

Team/roles, settings page (workspace prefs), integrations/API, compliance, security/settings surfaces.

## Batch 8 — Advanced (P2, after P0/P1 stable)

Global search, work orders (real model if approved), topology canvas, testing/certification (only if data model added), help center.

## Batch 9 — QA

Visual QA matrix, E2E critical flows, security doc, deployment readiness — no publish without approval.

## Priority

P0: shell + PLAN/INSTALL/VERIFY/HANDOVER remain functional  
P1: design consistency on core pages  
P2: screenshot-only concepts without backend deferred or labeled unavailable
