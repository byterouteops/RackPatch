# 04 — Design System (target)

Aligned to UI references + master prompt. Implementation starts in Batch 1.

## Brand

- **Name:** RackPatch  
- **Tagline:** Data Center Cabling Management

## Color

| Token | Value | Role |
|-------|-------|------|
| `--navy` / `--sidebar` | `#071B33` | Persistent sidebar |
| `--primary` / `--accent` | `#2563EB` | Primary actions, active nav |
| `--cyan` | `#06B6D4` | Accent line / highlights |
| `--background` | `#F6F8FC` | App canvas |
| `--card` | `#FFFFFF` | Surfaces |
| Semantic | success / warning / danger / info | Status badges |

## Typography

| Role | Font | Delivery |
|------|------|----------|
| Headings | Plus Jakarta Sans | `next/font/google` |
| Body | Inter | `next/font/google` |
| Mono / IDs | JetBrains Mono | `next/font/google` |

## Layout patterns (from references)

- Dark navy left sidebar (~240px) with grouped nav (Operations / Infrastructure / Administration)
- White top bar: workspace switcher, global search, notifications, help, user
- Page header: title + subtitle + action buttons
- Cards with light border/shadow on `#F6F8FC`
- Compact data tables; status pills with text (not color-only)
- Project context via breadcrumbs / project selector — **not** 20+ top-level project tabs

## Information architecture (shipping)

Global sidebar groups (not 65 items):

1. **Operations:** Dashboard, Projects, Installation, Verification, Handover, Evidence  
2. **Infrastructure:** Sites, Devices, Inventory, Reports  
3. **Administration:** Users, Settings, Integrations, Security, Deployment, Help  

Project-scoped tools remain under a project once selected (grouped subnav / secondary nav), mapping existing routes without deleting features.

## Non-negotiables

- Real HTML/CSS/React — no screenshot-as-background
- No fake KPI numbers from PNGs
- Dead controls → disabled + explanation or removed
- Preserve existing authz and data paths
