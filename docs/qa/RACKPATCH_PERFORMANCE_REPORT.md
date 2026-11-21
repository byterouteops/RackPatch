# RackPatch performance report (SIT)

All figures were measured by automated Playwright runs against the **final production build** (2026-11-22,
after all SIT fixes). Raw data: `docs/qa/raw/sit-perf.json` (desktop), `docs/qa/raw/sit-perf-throttled.json`
(throttled), `docs/qa/raw/sit-perf-run.log`, `docs/qa/raw/sit-explain.txt` (SQL plans), `docs/qa/raw/sit-build.log`
(bundle sizes). Nothing in this report is estimated. Earlier runs on intermediate builds gave the same picture
(for example, 5,000-cable list throttled LCP 4,392 ms then, 3,648 ms now).

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
| Runs | Desktop: 3 cold loads per page (median); throttled: 1 cold load per page; API: 40 requests per endpoint |

**Measurement caveat (throttled runs).** The local antivirus web shield on this host decompresses HTTP responses for
browser user agents, which inflated transfer sizes in a first throttled run; that run was discarded. The throttled
spec uses a neutral user agent and records how many responses arrived compressed (34/35 to 49/51 per page; the rest
are tiny or uncompressible).

## Targets and results

| Metric | Target | Desktop | Throttled | Status |
| --- | --- | --- | --- | --- |
| LCP | ≤ 2.5 s (p75) | 104–332 ms; 944 ms on the 5,000-cable list | 1,368–1,888 ms; **3,648 ms on the 5,000-cable list** | Met, except the 5,000-cable list on the throttled profile (D-18) |
| INP | ≤ 200 ms | 48 ms (5,000-row list), 64 ms (172-row list) | not measured | Met |
| CLS | ≤ 0.1 | 0 on every page | ≤ 0.004 | Met |
| Client-side navigation | ≤ 500 ms | 80–408 ms; **569 ms** Overview → Cable Plan on 5,000 cables | — | Met, except the 5,000-cable plan (D-18) |
| Filtering | ≤ 200 ms | 81–146 ms on 5,000 rows | — | Met |
| API latency | per-endpoint budgets, p50/p95 | see below | — | All within budget except the 5,000-cable cable list (D-14) |
| Uncaught browser errors | 0 | 0 in all acceptance specs | 0 | Met |

### Desktop page loads (median of 3 cold loads)

| Page | LCP ms | TTFB ms | Load ms | CLS |
| --- | --- | --- | --- | --- |
| Dashboard | 332 | 14 | 300 | 0 |
| Project overview | 184 | 19 | 153 | 0 |
| Cable list (172) | 164 | 18 | 123 | 0 |
| Cable list (5,000) | 944 | 21 | 620 | 0 |
| Verification | 136 | 20 | 91 | 0 |
| Exceptions | 128 | 21 | 95 | 0 |
| QC | 140 | 16 | 108 | 0 |
| Handover | 128 | 21 | 97 | 0 |
| Fabric topology | 104 | 19 | 77 | 0 |
| Racks | 116 | 14 | 100 | 0 |
| Evidence explorer | 148 | 33 | 115 | 0 |
| Trace | 116 | 19 | 93 | 0 |
| Integrations | 140 | 24 | 213 | 0 |

### Throttled (slow 4G + 4× CPU, cold cache)

| Page | LCP ms | TTFB ms | Load ms | CLS | Transfer |
| --- | --- | --- | --- | --- | --- |
| Dashboard | 1,888 | 151 | 2,123 | 0.001 | 595 kB |
| Project overview | 1,812 | 151 | 3,890 | 0.003 | 635 kB |
| Cable list (172) | 1,576 | 151 | 1,930 | 0.004 | 491 kB |
| **Cable list (5,000)** | **3,648** | 152 | 4,164 | 0.001 | 695 kB |
| Handover | 1,476 | 151 | 1,821 | 0.002 | 678 kB |
| Integrations | 1,368 | 151 | 3,797 | 0.001 | 715 kB |

### Navigation and filtering (5,000-cable project)

| Action | ms |
| --- | --- |
| Overview → Cable Plan | 569 |
| → Verification | 90 |
| → Evidence | 80 |
| → Handover | 91 |
| → Reports | 385 |
| → Overview | 408 |
| Search exact cable ID | 81 |
| Install-status filter | 146 |
| Rack filter | 111 |
| Next page | 91 |

### API latency (40 requests each)

| Endpoint | p50 ms | p95 ms | max ms | Budget (p95) | Status |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/projects/:ai/summary` (172) | 25 | 35 | 81 | 200 | Met |
| `/api/v1/projects/:ai/cables` (172) | 28 | 32 | 40 | 200 | Met |
| `/api/v1/projects/:scale/summary` (5,000) | 207 | 306 | 504 | 500 | Met |
| `/api/v1/projects/:scale/cables` (5,000) | 376 | 538 | 676 | 500 | **Exceeded** (D-14) |
| `/api/me/search` | 15 | 21 | 32 | 200 | Met |
| `/api/me/notifications` | 9 | 11 | 13 | 100 | Met |
| `/api/health` | 7 | 9 | 10 | 100 | Met |

Budgets were set during SIT as reasonable targets for an interactive operations tool. The SQL behind the
5,000-cable endpoints runs in 2–16 ms with index scans (`sit-explain.txt`); the time goes to loading and
serialising full rows in Node.

### Bundle sizes (first-load JS, production build)

- Shared by all routes: 103 kB.
- Typical app routes: 108–130 kB.
- **Integrations: 256 kB** (138 kB route chunk; D-13).

## Investigations and changes

| Area | Finding | Action |
| --- | --- | --- |
| Unnecessary requests | `<Link>` to `/api/...` prefetched (and ran) a full GitOps export on every view | Fixed (D-07) |
| Re-renders, filtering | 5,000-row filtering 81–146 ms; INP 48 ms | No change needed |
| DB queries and indexes | Index scans, 2–16 ms at 5,000 cables | No change needed |
| Fonts | Self-hosted woff2, latin subset, `display: swap` with metric fallbacks; CLS 0 | No change needed |
| Rack visualisation | Built from inventory and rack-unit data; dashboard panel capped at 15 units with scrolling | D-19 |
| Large result tables | The 5,000-cable list ships every row to the client (3.27 MB HTML, 166 kB gzipped) | **Open (D-18)**: needs server-side pagination |
| Bundle | Integrations is the only outlier | Open (D-13) |
| Caching | No caching of operational data added; dashboard and cable pages are dynamic per request | By design (no stale data) |

## Conclusion

For projects the size of the AI/HPC demo (172 cables), every objective is met on both desktop and the throttled
mobile-class profile. With 5,000 cables, three objectives are missed:
- the cable list's throttled LCP (3.6 s against 2.5 s);
- the Overview → Cable Plan navigation (569 ms against 500 ms);
- the cable API p95 (538 ms against 500 ms).

All three have the same cause, the full-row cable list (D-18, D-14).
