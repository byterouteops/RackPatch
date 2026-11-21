# RackPatch SIT defect register

Environment: isolated database `rackpatch_sit` and a production build (`next build` / `next start`, port 3100,
`HOSTED_SAAS=true`, dev login disabled). Raw evidence is in `docs/qa/raw/`.

Severity (as defined in the SIT brief): **P0** security breach, data loss, application unavailable; **P1** core
workflow broken, incorrect verification, invalid handover approval; **P2** significant functional or performance
issue; **P3** minor visual or usability issue.

"Verified" means a named automated test exercised the fix on the production build and passed.

## Summary

| Severity | Found | Fixed | Open |
| --- | --- | --- | --- |
| P0 | 0 | 0 | 0 |
| P1 | 3 | 3 | 0 |
| P2 | 10 | 8 | 2 (D-13, D-18) |
| P3 | 11 | 5 | 6 (D-12, D-14, D-15, D-16, D-17, D-21) |

D-09 is counted as P2.

## Fixed defects

### D-01 · P1 · Dashboard / verification data
- **Reproduction:** Record a physical (QC) verification for a cable with no LLDP evidence, then open `/app`.
- **Expected:** The "Verification Results (LLDP / CDP) → Matched" tile counts only cables whose LLDP/CDP observation matches the plan.
- **Actual:** Physically verified cables were counted as LLDP matches, so evidence-based verification was overstated.
- **Root cause:** `lldpMatched` in `src/lib/dashboard-stats.ts` summed `VERIFIED_LLDP` and `VERIFIED_PHYSICAL`.
- **Fix:** Count `VERIFIED_LLDP` only; the tile caption says what it counts.
- **Regression test:** vitest suite (dashboard stats); dashboard screenshot check.
- **Verification:** Passed. Dashboard shows Matched 118 against 136 verified; the difference is physical-only verifications.

### D-02 · P1 (latent security) · Server actions
- **Reproduction:** Inspect exports of `"use server"` modules. `buildHandoverPayload` and `assertPaidOrThrow` were exported.
- **Expected:** Every function exported from a `"use server"` file is an authenticated, authorised endpoint.
- **Actual:** Both helpers were callable as server actions without a session or project check. The handover payload contains installer e-mail addresses.
- **Root cause:** Shared helpers were placed in action modules; Next.js exposes every export of such a module.
- **Fix:** Moved to `src/lib/handover/payload.ts` and `src/lib/commercial-gate.ts`; 18 imports re-pointed.
- **Regression test:** `tests/server-action-guards.test.ts`. Every exported action calls a guard or is on a reviewed list of 5; the two helpers must not be exported.
- **Verification:** Passed.

### D-03 · P1 · Field evidence / LLDP import
- **Reproduction:** Upload a 1.2 MB JPEG as a field photo, or paste a 1.5 MB LLDP capture.
- **Expected:** Accepted. The app limits are 1.5 MB per photo and 2,000,000 characters per capture.
- **Actual:** Rejected with a redacted server error.
- **Root cause:** Next.js limits server-action request bodies to 1 MB by default. Base64 photos are about 1.33× their file size.
- **Fix:** `experimental.serverActions.bodySizeLimit: "3mb"` (`next.config.ts`).
- **Regression test:** `e2e/sit/resilience.spec.ts`. A 1.2 MB photo is stored; a 1.9 MB paste reaches the parser; a 2.1 MB paste is refused with a message.
- **Verification:** Passed.

### D-04 · P2 · QR scanning
- **Reproduction:** Open `/app/projects/:id/scan` and start the camera.
- **Expected:** The browser asks for camera permission.
- **Actual:** The camera was blocked by policy (`featurePolicy.allowsFeature("camera") === false`).
- **Root cause:** `Permissions-Policy: camera=()` in `next.config.ts`.
- **Fix:** `camera=(self)`; microphone and geolocation stay disabled.
- **Regression test:** `resilience.spec.ts` (camera policy check).
- **Verification:** Passed.

### D-05 · P2 · Error handling
- **Reproduction (production build):** On a cable, click "Mark blocked" without a reason.
- **Expected:** An actionable message.
- **Actual:** "An error occurred in the Server Components render…", shown by 27 client components.
- **Root cause:** Production builds redact messages thrown by server actions; components displayed `error.message` directly.
- **Fix:** `actionErrorMessage()` (`src/lib/action-error.ts`) replaces redacted text with a contextual message. Client-side checks were added for blocked reason and LLDP size.
- **Regression test:** `tests/action-error.test.ts`; `workflows.spec.ts` B; `resilience.spec.ts`.
- **Verification:** Passed. Residual issue tracked as D-17.

### D-06 · P2 · Accessibility
- **Reproduction:** Run axe (WCAG 2.1 AA) on the 48 inventoried routes.
- **Expected:** No serious or critical violations.
- **Actual:** About 240 serious or critical nodes. Causes: accent, success, warning and danger text below 4.5:1 contrast; progress bars, selects, scrollable `<pre>` blocks and SVGs without accessible names; invalid `<dl>` structure.
- **Root cause:** Brand colours used directly as text on light surfaces, plus missing ARIA attributes.
- **Fix:** `-ink` text tokens, ARIA labels and structure fixes across more than 55 files.
- **Regression test:** `e2e/sit/crawl.spec.ts` (axe on every route).
- **Verification:** Passed. 0 serious or critical on 48 routes.

### D-07 · P2 · Performance / API
- **Reproduction:** Open the project Integrations page and watch the network.
- **Expected:** No export runs until the user clicks "Download".
- **Actual:** A full GitOps export ran on every view, and the network never went idle.
- **Root cause:** `<Link href="/api/...">` prefetches route handlers.
- **Fix:** `Button` and `StatCard` render a plain `<a>` for `/api/` URLs.
- **Regression test:** Network probe (idle after 1.2 s) and the final crawl.
- **Verification:** Passed.

### D-08 · P3 · Accessibility
- **Reproduction:** Trigger any error banner with a screen reader running.
- **Expected:** The error is announced.
- **Actual:** It was not announced.
- **Root cause:** `ErrorBanner` had no live-region role.
- **Fix:** `role="alert"`.
- **Regression test:** `resilience.spec.ts` (locates alerts by role).
- **Verification:** Passed.

### D-09 · P2 · Responsive layout
- **Reproduction:** Layout scan at 1920, 1440, 1366, 1024, 768 and 390 px.
- **Expected:** No overlapping or clipped text and no horizontal page overflow.
- **Actual:** Twin exit labels overlapped. The header overflowed at 390–1024 px. KPI strings overflowed on Settings at 1366 px. The work-orders grid, donut legend and dashboard rack view (390 px) also overflowed.
- **Root cause:** Fixed-width grids and non-shrinking flex children.
- **Fix:** Grouped labels, a shrinkable header, `grid-cols-1` and `min-w-0`, and truncation.
- **Regression test:** `crawl.spec.ts` layout scan.
- **Verification:** Passed. 252 of 252 checks clean.

### D-10 · P3 · Dashboard
- **Reproduction:** Have two projects and open `/app`.
- **Expected:** The "Project Progress" scope is stated.
- **Actual:** The label implied a single project while summing all of them.
- **Root cause:** Static label.
- **Fix:** "All projects (n)" or the project name.
- **Regression test:** Screenshot check.
- **Verification:** Passed.

### D-11 · P3 · Security hardening
- **Reproduction:** `curl -I /`
- **Expected:** No framework disclosure.
- **Actual:** `X-Powered-By: Next.js`.
- **Root cause:** Next.js default.
- **Fix:** `poweredByHeader: false`.
- **Regression test:** `security.spec.ts` (headers).
- **Verification:** Passed.

### D-19 · P3 · Dashboard rack view
- **Reproduction:** Sign in as a lead of the 5,000-cable scale project. Its rack S01 has 51 devices. Open `/app` at 1820×1024.
- **Expected:** The rack panel fits the dashboard, as in the reference design.
- **Actual:** The rack unit list made the panel about 3× the viewport height.
- **Root cause:** Unbounded unit list.
- **Fix:** The list is capped at 15 units and scrolls beyond that. The scroll region is keyboard-focusable and labelled (`rack-view-panel.tsx`).
- **Regression test:** `e2e/theme-shots.spec.ts` screenshots; `crawl.spec.ts` axe and layout.
- **Verification:** Passed (screenshot `ui-audit-shots/theme-final/1820x1024_app.png`).

### D-20 · P2 · Error handling (database outage)
- **Reproduction:** While signed in, make the database refuse connections, then load a project page.
- **Expected:** A readable message with a way to retry, and no data written.
- **Actual (observed on the production build):** `/api/health` correctly returned 503. The page returned HTTP 500 with Next's bare text, "Application error: a server-side exception has occurred while loading localhost (see the server logs for more information). Digest: 2909853611", with no RackPatch layout and no way to retry (`docs/qa/raw/sit-resilience-db-outage-before.json`, `sit-db-outage-before-fix.png`).
- **Root cause:** The app had no `error.tsx` boundary.
- **Fix:** `src/app/error.tsx`. It says the page could not load, that nothing was saved, and gives a reference digest, "Try again" (refresh and reset) and "Dashboard".
- **Regression test:** `resilience.spec.ts` "database unavailable" (opt-in `SIT_DB_OUTAGE=1`). It blocks connections to `rackpatch_sit` only.
- **Verification:** Passed. Health 503; the page shows "This page could not load" with a reference; after access is restored, "Try again" reloads the project page (`sit-resilience.json`, `sit-db-outage-after-fix.png`).

### D-22 · P2 · Offline field queue does not sync until reload
- **Reproduction:** As a project lead, open `/app/projects/:id/scan`, go offline, paste a cable QR URL, and click "Open cable". Then reconnect.
- **Expected:** "Queued offline items: 1"; on reconnect the item syncs automatically and the queue empties.
- **Actual (observed):** "Offline — queued …" appeared and the item was stored, but the counter stayed at "Queued offline items: 0". Automatic sync on reconnect and the "Sync offline queue" button are both gated on that count, so the scan would not sync until the page was reloaded. No data was lost: the item stays in IndexedDB.
- **Root cause:** `OfflineFieldSync` read the queue only on mount and after a sync; the scanner enqueued items without notifying it.
- **Fix:** `enqueueFieldItem` fires `FIELD_QUEUE_CHANGED`; the panel re-reads on that event. Reconnect auto-sync now reads IndexedDB instead of component state.
- **Regression test:** `resilience.spec.ts` "offline QR scan is queued on the device and synced on reconnect".
- **Verification:** Passed. Counter 1 while offline; "Synced 1/1 items" on reconnect; counter 0.

### D-23 · P3 · Project overview: ring labels and KPI labels
- **Reproduction:** Open a project overview at 1366×768 and 1820×1024 (`ui-audit-shots/theme-final/*_overview.png`).
- **Expected:** Ring percentages fit inside the ring; KPI labels are readable.
- **Actual:** In the 40 px rings in the project list, "80.2%" and "79.1%" were wider than the ring. At 1820 px or wider the KPI strip switched to 8 columns of about 70 px, truncating labels to "Total Cab…", "Needs re…" and "Awaiting …". The automated layout scan accepts ellipsis truncation, so it did not flag them; they were found by inspecting screenshots.
- **Root cause:** A fixed one-decimal label regardless of ring size; an `min-[1800px]:grid-cols-8` breakpoint inside a card about 620 px wide.
- **Fix:** Rings under 48 px show a whole percentage, floored so an unfinished project never reads "100%", with the exact value as a tooltip. The KPI strip stays at 4 columns.
- **Regression test:** `theme-shots.spec.ts` screenshots; `crawl.spec.ts` layout and axe.
- **Verification:** See `RACKPATCH_UI_VISUAL_COMPARISON.md`.

### D-24 · P2 · KPI figures truncated on laptop widths
- **Reproduction:** Open Handover or Cable Plan for the 5,000-cable project at 1366×768.
- **Expected:** Every KPI figure is fully readable.
- **Actual (observed in screenshots):** Handover showed "5,…", "!" and "36.…" instead of 5,000, 5,000 and 36.1%. Cable Plan showed "4…" and "9…" instead of 4,018 and 982. The layout scan did not flag it because ellipsis truncation is treated as intentional.
- **Root cause:** Shared `StatCard` truncated the figure so the percentage pill stayed on the same line. Sixteen pages used 6-column KPI rows from 1280 px (cards about 160 px wide), and the 7-column rows started at 1536 px.
- **Fix:** `StatCard` never truncates the figure (`whitespace-nowrap`); the pill wraps below it and labels wrap to two lines. KPI rows go to 6 columns only from 1600 px and 7 columns from 1800 px; the cable page uses 3 columns from `lg`. Because figures no longer truncate, any future overflow is caught by the layout scan.
- **Regression test:** `theme-shots.spec.ts` (44 page/viewport layout checks, 0 issues) and `crawl.spec.ts` layout scan.
- **Verification:** Passed. `ui-audit-shots/theme-final/1366x768_handover.png` shows 5,000 / 0 / 5,000 / 0 / 36.1% / 0.

## Open defects

### D-12 · P3 · Session revocation delay
- **Finding:** A revoked session stays valid for up to 5 minutes (Better Auth `cookieCache.maxAge = 300`). Project permissions are read from the database on every request, so removing a membership takes effect immediately; only the identity persists.
- **Evidence:** `security.spec.ts`. Once the cache cookie is cleared, the revoked session is redirected to sign-in.
- **Recommendation:** Accept, or lower `maxAge`. That is an authentication change and needs approval.

### D-13 · P2 · Integrations bundle size
- **Finding:** First-load JS is 256 kB, including a 138 kB route chunk. All other routes are 108–130 kB.
- **Impact:** LCP is 1.4 s on the throttled profile, still within budget.
- **Recommendation:** Lazy-load the NetBox and GitOps panels with `next/dynamic`.

### D-14 · P3 · Cable API latency at 5,000 cables
- **Finding (final build):** `/api/v1/projects/:id/cables` at 5,000 cables: p50 376 ms, p95 538 ms (budget 500 ms). SQL takes 2–16 ms (`sit-explain.txt`); hydrating and serialising the rows dominates.
- **Recommendation:** Pagination and `select` projections before projects exceed about 10k cables.

### D-15 · P3 · Deployment: forwarded host trust
- **Finding:** The Next.js server-action origin check honours `X-Forwarded-Host`. A forged `Origin` alone is rejected (tested), but a server exposed directly to clients would trust a client-sent forwarded host.
- **Recommendation:** Deploy behind a proxy that overwrites `X-Forwarded-Host`, and document it in the deployment guide.

### D-16 · P3 · Offline navigation
- **Finding:** Clicking a navigation link while offline logs "Loading chunk … failed". The page recovers on reconnect. Offline QR scans are queued and synced correctly (tested).
- **Recommendation:** An offline fallback page or a retry for route chunks.

### D-17 · P3 · Specific server validation messages are generic in production
- **Finding:** The residual issue from D-05. A specific thrown reason, such as "That cable end is already mapped to another port", reaches the user only as the contextual fallback.
- **Recommendation:** Return `{ ok: false, error }` for expected validation failures instead of throwing. This changes the action contract and needs approval.

### D-18 · P2 · LCP on the 5,000-cable list under a throttled mobile profile
- **Reproduction:** `e2e/sit/perf-throttled.spec.ts`: 150 ms RTT, 1.6 Mbps down, 750 kbps up, 4× CPU slowdown, cold cache. Open `/app/projects/<scale>/cables`.
- **Expected:** LCP ≤ 2.5 s.
- **Actual (final build):** LCP 3,648 ms (4,392 ms on an earlier build). Other measured pages are 1,368–1,888 ms. Unthrottled desktop LCP for the same page is 944 ms. On desktop, client-side navigation Overview → Cable Plan for this project takes 569 ms, above the 500 ms target; every other navigation is 83–432 ms.
- **Root cause:** The page serialises all 5,000 rows, with every field, into the RSC payload. That is 3.27 MB of HTML uncompressed (166 kB gzipped), parsed and hydrated on a slow CPU. The list paginates on the client only.
- **Recommendation:** Server-side pagination and filtering for the cable list, with a trimmed per-row projection. This changes the cable-list data flow (filters, bulk selection, counts) and needs a design decision.

### D-21 · P3 · Optimistic-lock check is not atomic
- **Finding (code review):** `updateInstallStatus` (`src/app/actions/install.ts`) compares `runtime.version` with `expectedVersion` and then updates by `id` only. Two requests that arrive within the same few milliseconds with the same version could both write; the last write wins and two audit rows are recorded.
- **Evidence:** Sequential stale edits from a second session are refused (tested). Double-clicking records one change, because the client disables the button (tested). The concurrent race was not reproduced by a test.
- **Recommendation:** `updateMany({ where: { id, version: expectedVersion } })` and treat `count === 0` as a conflict. This changes business logic and needs approval.

## Not defects (recorded for traceability)

- The auth rate limiter returns "Too many requests" for rapid repeated sign-ins. This is correct; the SIT helper backs off and retries (`e2e/sit/helpers.ts`).
- The racks page shows "No racks yet" for a newly imported plan until inventory is synced and rack units are set. This is documented, and the screen explains it.
- In self-hosted mode (`HOSTED_SAAS` unset) the pilot/paid gate is off by design; SIT ran hosted mode to exercise it.
- Workflow B once failed on test data: an earlier security test had legitimately set its chosen cable to BLOCKED. The spec now asserts that nothing changed and resets a cable to PLANNED in the SIT database when none is left.
- Workflow C+D once raced the app's deliberate redirect to Exceptions after an LLDP import. The spec now waits for that navigation.
