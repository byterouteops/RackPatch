# Phase 16 Implementation Report

**Updated:** 2026-11-21  
**Status:** PARTIAL - media type taxonomy plus patch panels, panel ports and circuits (no strand/MPO polarity modelling)

## Delivered

| Capability | Status |
|------------|--------|
| Normalize `cable_type` on CSV import | Implemented |
| Filter cables by media type | Implemented |
| Capacity breakdown by type | Implemented |
| `PatchPanel` (name, rack, optional rack unit, port count; ports 1..N auto-created) | Implemented |
| `PanelPort` mapped to one end (A/Z) of a planned link on the active plan | Implemented |
| `Circuit` (name, media type, A panel port, optional Z panel port) | Implemented |
| `/app/projects/[id]/panels` page + subnav link | Implemented |
| ODF strand / MPO polarity / splice modelling | Not built |

## Uniqueness rules (app validation + database constraints)

- Panel port index is unique per panel; panel name is unique per project.
- A planned-link end (link + side) maps to at most one panel port; a port holds at most one link end (unmap first to change). Side is required when mapping.
- A panel port belongs to at most one circuit (as A or Z); A and Z must differ; circuit name is unique per project.
- Mappings reference a `PlannedLink` row, which belongs to one plan revision. After a new revision is published, old mappings are shown as "Not in active plan" until unmapped and re-mapped.
- Panel/circuit management requires `canManageProject` (lead/owner).

## Evidence

- Schema/migration: `prisma/migrations/20261121210000_fiber_panels_circuits`
- Lib: `src/lib/panels.ts`, `src/lib/cable-type.ts`
- Actions/UI: `src/app/actions/panels.ts`, `src/app/(app)/app/projects/[projectId]/panels/page.tsx`, `src/components/panel-forms.tsx`
- Tests: `tests/panels.test.ts`, `tests/cable-type.test.ts`
