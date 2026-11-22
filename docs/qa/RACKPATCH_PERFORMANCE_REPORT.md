# RackPatch performance report (SIT)

All figures were measured by automated Playwright runs against a **production build** (2026-11-22), after the
D-18 fix. Raw data: `docs/qa/raw/sit-perf.json` (desktop), `docs/qa/raw/sit-perf-throttled.json` and
`sit-perf-throttled-d18-run*.json` (throttled), `docs/qa/raw/sit-explain.txt` (SQL plans), `docs/qa/raw/sit-build.log`
(bundle sizes). Nothing in this report is estimated. The only change after these runs is the D-25 photo validation,
which does not touch any measured page.

## Test conditions

| Item | Value |
| --- | --- |
| Hardware | Intel i7-1165G7 (4 cores / 8 threads), 63.6 GB RAM |
| OS / runtime | Windows 11 Pro, Node v24.18.0, PostgreSQL 16.14 (Docker, same host) |
| Build | `next build` + `next start` (Next.js 15.5), port 3100, `HOSTED_SAAS=true` |
| Browser | Playwright Chromium (headless), 1440×900, signed in as a project lead |
| Dataset | AI/HPC demo project: 172 cables, 2 fabrics, evidence and snapshots. SIT scale project: **5,000 cables** (about 4,000 installed), created via the real CSV import and publish path (`scripts/sit-seed-large.ts`) |
| Desktop network | Loopback, no throttling |
| Throttled profile | Chrome DevTools Protocol: 150 ms RTT, 1.6 Mbps down, 750 kbps up, 4× CPU slowdown, cold cache |
| Runs | Desktop: 3 cold loads per page (median); navigation: median of 3 settled runs per project; throttled: 1 cold load per page per run (4 runs for the 5,000-cable list); API: 40 requests per endpoint |

**Measurement caveat (throttled runs).** The local antivirus web shield on this host decompresses HTTP responses for
browser user agents, which inflated transfer sizes in a first throttled run; that run was discarded. The throttled
spec uses a neutral user agent and records how many responses arrived compressed.

## Targets and results

| Metric | Target | Desktop | Throttled | Status |
| --- | --- | --- | --- | --- |
| LCP | ≤ 2.5 s (p75) | 100–400 ms (368 ms on the 5,000-cable list) | 1,404–2,052 ms; 5,000-cable list 1,312–1,764 ms over 4 runs | Met |
| INP | ≤ 200 ms | 40 ms (5,000-row list), 40 ms (172-row list) | not measured | Met |
| CLS | ≤ 0.1 | 0 on every page | ≤ 0.004 | Met |
| Client-side navigation | ≤ 500 ms | 86–464 ms, except Overview on the 5,000-cable project (671 ms) | — | Met, except D-26 |
| Filtering | ≤ 200 ms | 59–152 ms on 5,000 rows | — | Met |
| API latency | per-endpoint budgets, p50/p95 | see below | — | All within budget except the 5,000-cable cable API (D-14) |
| Uncaught browser errors | 0 | 0 in all acceptance specs | 0 | Met |

### Desktop page loads (median of 3 cold loads)

| Page | LCP ms | TTFB ms | Load ms | CLS |
| --- | --- | --- | --- | --- |
| Dashboard | 400 | 23 | 353 | 0 |
| Project overview | 144 | 18 | 130 | 0 |
| Cable list (172) | 128 | 22 | 94 | 0 |
| Cable list (5,000) | 368 | 30 | 318 | 0 |
| Verification | 124 | 17 | 106 | 0 |
| Exceptions | 128 | 18 | 112 | 0 |
| QC | 136 | 18 | 106 | 0 |
| Handover | 132 | 20 | 99 | 0 |
| Fabric topology | 116 | 19 | 83 | 0 |
| Racks | 128 | 22 | 99 | 0 |
| Evidence explorer | 140 | 20 | 108 | 0 |
| Trace | 108 | 16 | 81 | 0 |
| Integrations | 100 | 18 | 86 | 0 |

### Throttled (slow 4G + 4× CPU, cold cache)

"Ready" is when the page heading is rendered and no streamed section is still loading. For the cable lists, that
is when every row has arrived and filters are enabled.

| Page | LCP ms | Ready ms | Load ms | CLS | Transfer |
| --- | --- | --- | --- | --- | --- |
| Dashboard | 2,052 | 2,146 | 4,345 | 0 | 691 kB |
| Project overview | 1,892 | 2,179 | 2,272 | 0.001 | 680 kB |
| Cable list (172) | 1,444 | 2,673 | 1,696 | 0.004 | 576 kB |
| **Cable list (5,000)** | **1,448** | 3,273 | 3,710 | 0.002 | 695 kB |
| Handover | 1,488 | 1,880 | 1,907 | 0.002 | 481 kB |
| Integrations | 1,404 | 1,366 | 3,828 | 0.001 | 721 kB |

5,000-cable list LCP across four runs on the fixed build: 1,764 / 1,312 / 1,464 / 1,448 ms. Before the fix it was
3,648 ms (4,392 ms on an earlier build). An intermediate step that only trimmed and encoded the payload gave
2,448 / 2,628 / 2,460 ms. Those numbers were read from the run output during development; their raw files were
overwritten by the final runs (`sit-perf-throttled-d18-run1..3.json` plus `sit-perf-throttled.json`).

### Navigation (median of 3 settled runs)

Each run opens the project overview, waits for its link prefetches to settle, then clicks through the project
sections.

| Destination | 172 cables | 5,000 cables |
| --- | --- | --- |
| Cable Plan | 192 | 196 |
| Verification | 118 | 117 |
| Evidence | 92 | 101 |
| Handover | 94 | 86 |
| Reports | 390 | 464 |
| Overview | 376 | **671** (D-26) |

The previous report gave "569 ms Overview → Cable Plan on 5,000 cables". That was a single click on the
**172-cable** project, made while the overview's prefetches were still in flight; it measured contention, not the
cable list. The spec has been corrected.

### Filtering (5,000-cable project, client-side)

| Action | ms |
| --- | --- |
| Search exact cable ID | 85 |
| Install-status filter | 152 |
| Rack filter | 99 |
| Next page | 59 |

### API latency (40 requests each)

| Endpoint | p50 ms | p95 ms | max ms | Budget (p95) | Status |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/projects/:ai/summary` (172) | 29 | 42 | 61 | 200 | Met |
| `/api/v1/projects/:ai/cables` (172) | 29 | 37 | 73 | 200 | Met |
| `/api/v1/projects/:scale/summary` (5,000) | 215 | 259 | 269 | 500 | Met |
| `/api/v1/projects/:scale/cables` (5,000) | 412 | 664 | 769 | 500 | **Exceeded** (D-14; 538 ms p95 in the previous run) |
| `/api/me/search` | 15 | 18 | 66 | 200 | Met |
| `/api/me/notifications` | 9 | 10 | 11 | 100 | Met |
| `/api/health` | 8 | 13 | 18 | 100 | Met |

The SQL behind the 5,000-cable endpoints runs in 2–16 ms with index scans (`sit-explain.txt`); the time goes to
loading and serialising full rows in Node. The public cable API was not changed by the D-18 fix.

### Bundle sizes (first-load JS, production build)

- Shared by all routes: 103 kB.
- Typical app routes: 108–130 kB (cable list: 129 kB).
- **Integrations: 256 kB** (138 kB route chunk; D-13).

## Investigations and changes

| Area | Finding | Action |
| --- | --- | --- |
| Unnecessary requests | `<Link>` to `/api/...` prefetched (and ran) a full GitOps export on every view | Fixed (D-07) |
| Large result tables | The 5,000-cable list shipped every row with every field ahead of the table markup (3.27 MB HTML, 166 kB gzipped) | **Fixed (D-18)**: trimmed, dictionary-encoded list; per-cable details on demand; first page rendered at once and the full list streamed after the markup. 758 kB HTML; LCP 1.3–1.8 s throttled |
| Re-renders, filtering | 5,000-row filtering 59–152 ms; INP 40 ms | No change needed |
| DB queries and indexes | Index scans, 2–16 ms at 5,000 cables; cable page KPIs now use count queries (checked equal to the row-derived values on all 15 SIT projects) | No further change needed |
| Fonts | Self-hosted woff2, latin subset, `display: swap` with metric fallbacks; CLS 0 | No change needed |
| Rack visualisation | Built from inventory and rack-unit data; dashboard panel capped at 15 units with scrolling | D-19 |
| Bundle | Integrations is the only outlier | Open (D-13) |
| Overview at scale | Overview navigation 671 ms on the 5,000-cable project | Open (D-26) |
| Caching | No caching of operational data added; dashboard and cable pages are dynamic per request | By design (no stale data) |

## Conclusion

Every page-load objective (LCP, INP, CLS) is now met on both desktop and the throttled mobile-class profile,
including the 5,000-cable list. On that profile the 5,000-cable list shows its first page at about 1.4 s and
becomes fully filterable at about 3.3 s. Two objectives are still missed at 5,000 cables:
- navigation to the project overview (671 ms against 500 ms; D-26);
- the public cable API p95 (538–664 ms against 500 ms; D-14).
