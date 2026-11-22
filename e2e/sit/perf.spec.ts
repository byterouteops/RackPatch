import { expect, test, type Page } from "@playwright/test";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, sitDb, writeResult } from "./helpers";

/**
 * SIT performance against the production build on :3100 (localhost, no network throttling).
 * Web vitals are read from PerformanceObserver entries in the page; nothing is estimated.
 */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(900_000);

const db = sitDb();
const RUNS = 3;

const OBSERVERS = `
  window.__rp = { lcp: 0, cls: 0, inp: 0, events: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__rp.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__rp.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.interactionId) { window.__rp.inp = Math.max(window.__rp.inp, e.duration); window.__rp.events.push({ name: e.name, d: e.duration }); } } }).observe({ type: "event", buffered: true, durationThreshold: 16 });
`;

type Vitals = { lcp: number; cls: number; inp: number; ttfb: number; dcl: number; load: number };

async function vitals(page: Page): Promise<Vitals> {
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const w = window as unknown as { __rp: { lcp: number; cls: number; inp: number } };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { lcp: w.__rp.lcp, cls: w.__rp.cls, inp: w.__rp.inp, ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
  });
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const median = (xs: number[]) => pct(xs, 50);
const r1 = (n: number) => Math.round(n * 10) / 10;

test("production performance: vitals, navigation, filtering, API latency", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const ai = await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const scale = await db.project.findFirstOrThrow({ where: { name: "SIT Scale 5000" } });
  const scaleCount = await db.plannedLink.count({ where: { revisionId: scale.activeRevisionId! } });

  const { context, page } = await contextAs(browser, NS("lead"));
  await context.addInitScript(OBSERVERS);
  const routes: Array<[string, string]> = [
    ["Dashboard", "/app"],
    ["Project overview", `/app/projects/${ai.id}`],
    ["Cable list (172)", `/app/projects/${ai.id}/cables`],
    [`Cable list (${scaleCount})`, `/app/projects/${scale.id}/cables`],
    ["Verification", `/app/projects/${ai.id}/verify`],
    ["Exceptions", `/app/projects/${ai.id}/exceptions`],
    ["QC", `/app/projects/${ai.id}/qc`],
    ["Handover", `/app/projects/${ai.id}/handover`],
    ["Fabric topology", `/app/projects/${ai.id}/fabric`],
    ["Racks", `/app/projects/${ai.id}/racks`],
    ["Evidence explorer", `/app/projects/${ai.id}/evidence/explorer`],
    ["Trace", `/app/projects/${ai.id}/trace?from=BE-SPINE-01`],
    ["Integrations", `/app/projects/${ai.id}/integrations`],
  ];

  const pages: Array<Record<string, unknown>> = [];
  for (const [name, url] of routes) {
    const runs: Vitals[] = [];
    for (let i = 0; i < RUNS; i++) {
      await page.goto(url, { waitUntil: "load" });
      runs.push(await vitals(page));
    }
    pages.push({
      name,
      url,
      coldLoadMs: r1(runs[0].load),
      lcpMs: r1(median(runs.map((r) => r.lcp))),
      ttfbMs: r1(median(runs.map((r) => r.ttfb))),
      dclMs: r1(median(runs.map((r) => r.dcl))),
      loadMs: r1(median(runs.map((r) => r.load))),
      cls: Math.round(Math.max(...runs.map((r) => r.cls)) * 1000) / 1000,
    });
  }

  // Client-side navigation through the project sub-navigation.
  // Median of 3 runs per project; each run starts once the overview's link prefetches have settled,
  // so the timing reflects the destination page rather than contention with in-flight prefetches.
  const navs: Array<{ project: string; to: string; ms: number; runs: number[] }> = [];
  for (const [projectName, projectId] of [["172 cables", ai.id], ["5,000 cables", scale.id]] as const) {
    const runs = new Map<string, number[]>();
    for (let run = 0; run < 3; run++) {
      await page.goto(`/app/projects/${projectId}`);
      await page.waitForLoadState("networkidle");
      for (const label of ["Cable Plan", "Verification", "Evidence", "Handover", "Reports", "Overview"]) {
        const t0 = Date.now();
        await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: label, exact: true }).click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForFunction(() => !document.querySelector('[role="status"][aria-busy="true"], [data-loading="true"]'));
        runs.set(label, [...(runs.get(label) ?? []), Date.now() - t0]);
        await page.waitForLoadState("networkidle");
      }
    }
    for (const [to, r] of runs) navs.push({ project: projectName, to, ms: [...r].sort((a, b) => a - b)[1], runs: r });
  }

  // Filtering on the scale project (client-side filter over all rows).
  await page.goto(`/app/projects/${scale.id}/cables`);
  const search = page.getByPlaceholder(/Search cables/);
  await expect(search).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(() => {
    (window as unknown as { __rp: { inp: number; events: unknown[] } }).__rp.inp = 0;
  });
  const filters: Array<{ action: string; ms: number }> = [];
  let t0 = Date.now();
  await search.fill("SC-04999");
  await expect(page.getByText(/of\s+1\b/).first()).toBeVisible();
  filters.push({ action: "search exact cable (5k rows)", ms: Date.now() - t0 });
  await search.fill("");
  t0 = Date.now();
  await page.getByLabel("Filter by install status").selectOption({ index: 1 });
  await page.waitForTimeout(50);
  filters.push({ action: "install-status filter (5k rows)", ms: Date.now() - t0 });
  t0 = Date.now();
  await page.getByLabel("Filter by rack").selectOption({ index: 2 });
  await page.waitForTimeout(50);
  filters.push({ action: "rack filter (5k rows)", ms: Date.now() - t0 });
  await page.getByLabel("Filter by rack").selectOption({ index: 0 });
  await page.getByLabel("Filter by install status").selectOption({ index: 0 });
  t0 = Date.now();
  await page.getByRole("button", { name: "Next page" }).click({ timeout: 10_000 });
  filters.push({ action: "next page (5k rows)", ms: Date.now() - t0 });
  const scaleInp = await page.evaluate(() => (window as unknown as { __rp: { inp: number } }).__rp.inp);

  // INP on the 172-cable list.
  await page.goto(`/app/projects/${ai.id}/cables`);
  await expect(page.getByPlaceholder(/Search cables/)).toBeEnabled({ timeout: 30_000 });
  await page.getByPlaceholder(/Search cables/).pressSequentially("CBL-BE", { delay: 30 });
  await page.getByLabel("Filter by fabric").selectOption("BE");
  const aiInp = await page.evaluate(() => (window as unknown as { __rp: { inp: number } }).__rp.inp);

  // API latency with a session cookie (warm, sequential).
  const api: Array<{ endpoint: string; n: number; p50: number; p95: number; max: number }> = [];
  const endpoints = [
    `/api/v1/projects/${ai.id}/summary`,
    `/api/v1/projects/${ai.id}/cables`,
    `/api/v1/projects/${scale.id}/summary`,
    `/api/v1/projects/${scale.id}/cables`,
    `/api/me/search?q=CBL-BE&projectId=${ai.id}`,
    `/api/me/notifications`,
    `/api/health`,
  ];
  for (const ep of endpoints) {
    const times: number[] = [];
    for (let i = 0; i < 40; i++) {
      const s = performance.now();
      const res = await context.request.get(ep);
      expect(res.status(), ep).toBeLessThan(400);
      await res.body();
      times.push(performance.now() - s);
    }
    api.push({ endpoint: ep.replace(ai.id, ":ai").replace(scale.id, ":scale"), n: times.length, p50: r1(pct(times, 50)), p95: r1(pct(times, 95)), max: r1(Math.max(...times)) });
  }

  writeResult("sit-perf", { measuredAt: new Date().toISOString(), runsPerPage: RUNS, scaleCables: scaleCount, pages, navs, filters, inp: { scaleListMs: r1(scaleInp), aiListMs: r1(aiInp) }, api });
  await closeAll(context);
});
