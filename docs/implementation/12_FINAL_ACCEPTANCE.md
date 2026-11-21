# 12 — Acceptance status (UI redesign wave)

**Date:** 2026-11-21  
**Environment:** local only — not deployed/published without approval

## Completed this wave

| Item | Status |
|------|--------|
| Design tokens (navy/blue/cyan + fonts) | Done |
| App shell + workflow strip | Done |
| Grouped project subnav | Done |
| Portfolio dashboard `/app` (live counts) | Done |
| Project pages restyled (overview through analytics) | Done |
| Evidence library `/evidence` | Done |
| Reports page `/reports` (live aggregates) | Done |
| Settings `/app/settings` (read-only, real links) | Done |
| Help `/app/help` | Done |
| Image inventory (66 PNGs) | Done |
| Vitest 178 + tsc | Passing |

## Not complete vs 65-page mockups (honest)

| Item | Status |
|------|--------|
| Pixel-perfect match to every PNG | No — visual QA matrix not fully captured |
| Work orders module | Not built |
| Full label designer / Zebra print | Partial (label sheet only) |
| Global search | Disabled control only |
| In-app notification center | Not built |
| Native mobile app | Out of scope |
| NetBox writes / worker fleet / 3D LIDAR | Explicitly not claimed |
| Commit / Railway deploy of this wave | Pending your request |

## How to review locally

1. http://localhost:3000/sign-in  
2. Demo: `lead@demo.rackpatch.local` / `password123` (if seeded)  
3. http://localhost:3000/app then open a project  

Hard refresh (`Ctrl+Shift+R`) after pulls.
