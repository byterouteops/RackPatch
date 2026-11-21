# RackPatch UI visual comparison

Every statement below comes from inspecting screenshots of the running application, not from reading code.

| Item | Location |
| --- | --- |
| Reference design | `design-references/rackpatch/target-dashboard.jpg` (1820×1024 composition) |
| Before (redesign pass, before SIT fixes; dev server) | `ui-audit-shots/theme/<viewport>_<route>.png` |
| After (final production build, SIT database) | `ui-audit-shots/theme-final/<viewport>_<route>.png`, taken by `e2e/theme-shots.spec.ts` at 1820×1024, 1440×900, 1366×768 and 390×844 on 11 routes |
| Layout scan of the after set | `ui-audit-shots/theme-final/layout-report.json`: 44 page/viewport checks, 0 issues (overlap, clipped text, horizontal overflow) |

## Font

The brief asked for **Candy Poppins**. No licensed Candy Poppins font file was available, so it is **not
implemented**. By the user's decision the UI uses **Poppins** (SIL Open Font License 1.1) for text and **JetBrains
Mono** (OFL) for cable IDs, ports and CLI output. Both are self-hosted woff2 files (latin subset) in `src/fonts/`,
with licence files alongside. `docs/design/THEME.md` records this.

Measured on the production build (`e2e/sit/fonts.spec.ts` → `docs/qa/raw/sit-fonts.json`):

- **Loaded faces:** Poppins 400, 500, 600 and 700; JetBrains Mono 400. Mono 500 and 600 are declared and load on first use.
- **Font requests:** 5 woff2 requests, all HTTP 200 from `/_next/static/media/`. No failed font requests and no third-party font host.
- **Computed fonts:** body text is Poppins; headings are Poppins 700; `.rp-mono` is JetBrains Mono.
- **Layout shift:** CLS is 0 on desktop and ≤ 0.006 throttled (`RACKPATCH_PERFORMANCE_REPORT.md`). `display: swap` uses metric-matched fallbacks.

## Dashboard against the reference (1820×1024)

`ui-audit-shots/theme-final/1820x1024_app.png` compared with `target-dashboard.jpg`:

| Element | Reference | Final build | Match |
| --- | --- | --- | --- |
| Sidebar | Navy, RackPatch mark, grouped nav, community badge at the bottom | Same structure, colours and groups; RackPatch logo (no Cisco assets) | Yes |
| Top bar | Project switcher, Plan / Install / Verify / Handover, search, notifications, help, user | Same | Yes |
| Hero | "Welcome to RackPatch" with accent bar, wave background, "Open Project" | Same | Yes |
| KPI row | 5 cards with icon, figure, percentage pill and progress bar | Same; figures are live counts (5,172 cables / 4,182 installed / 136 verified / 24 exceptions / 2 projects at capture time) | Yes |
| Rack view | Dark rack with unit rows, port LEDs, status dot; details and quick actions on the right | Same. Generated from inventory and rack-unit data; 51-device racks scroll after 15 units (D-19) | Yes |
| Project progress | Big percentage, bar, four legend rows | Same; caption says verified cables also count as installed | Yes |
| LLDP/CDP results | Matched / Mismatch / Needs Review tiles | Same. Matched counts LLDP/CDP-observed matches only (D-01) | Yes |
| Projects table and Recent Activity | Side by side | Same | Yes |

Differences that remain, and why:
- **Data.** The reference shows "Rack A Live Smoke" with 9 cables. The screenshots show SIT data (5,000 + 172 cables). Values are never hard-coded.
- **Page height.** The final dashboard is taller than the reference because it also shows the "New workspace" form and a "How to use" guide strip, both existing features.
- **Polish.** The reference image is a mock-up with heavier drop shadows. The build uses flatter cards, following "no excessive glow / glassmorphism".

## Before and after (defects found by inspecting screenshots)

| Screen / viewport | Before | After | Defect |
| --- | --- | --- | --- |
| Handover, 1366×768 | KPI cards truncated: "V… 157", "P… 14", "Exceptio…", "Snapsho…" (`theme/1366x768_handover.png`); on 5,000 cables "5,…", "!", "36.…" | Two rows of three cards; all figures and labels readable: 5,000 / 0 / 5,000 / 0 / 36.1% / 0 (`theme-final/1366x768_handover.png`) | D-24 |
| Cable Plan, 1366×768 | "Installed 4…", "Remaining 9…", "Planned Cabl…" | 3 + 2 cards: 5,000 / 4,018 / 0 / 982 / 0 | D-24 |
| Project overview, 1820×1024 | KPI strip in 8 columns: "Total Cab…", "Needs re…", "Awaiting …"; ring labels "80.2%" wider than the 40 px ring | 4 × 2 strip with full labels; rings show "80%", "100%", "79%" inside the circle | D-23 |
| Dashboard, 1820×1024 (51-device rack) | Rack panel about 3× viewport height | Panel capped at 15 units, scrollable, keyboard-focusable | D-19 |
| Dashboard, 390×844 | Rack view overflowed horizontally | Single column, no overflow | D-09 |
| Database outage | Bare text "Application error: a server-side exception has occurred…" | Branded "This page could not load" card with reference, "Try again" and "Dashboard" (`docs/qa/raw/sit-db-outage-after-fix.png`) | D-20 |

## Responsive verification

- `crawl.spec.ts` layout scan at 1920, 1440, 1366, 1024, 768 and 390 px on the project-lead route set: 252/252 checks clean (`docs/qa/raw/sit-layout.json`). After D-24, `StatCard` figures cannot truncate silently, so the scan now catches overflowing figures.
- `theme-shots.spec.ts`: 44 page/viewport checks at 1820, 1440, 1366 and 390 px, 0 issues.
- At 390 px the sidebar collapses to a menu button. KPI cards stack in one column. The cable table becomes a card list with ID, ends and status chips. Project tabs wrap onto several lines.

## Accessibility

axe-core (WCAG 2.1 A/AA rules) on all 48 inventoried routes as a project lead: **0 serious or critical violations**
(`docs/qa/raw/sit-crawl-lead.json`). Contrast fixes use `-ink` text tokens (D-06). Error banners use `role="alert"`
(D-08). The rack scroll region is focusable and labelled (D-19).

## Observations not treated as defects

- With the cable-details panel open at 1366 px, the cable table scrolls horizontally inside its card and the "Install" column is partly behind the scroll edge. This is a scroll container, not clipped page content. Closing the panel or widening the window shows the column.
- The breadcrumb on Rack elevations reads "Fabric", the group the Racks tab belongs to.
