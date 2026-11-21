import { test } from "@playwright/test";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, sitDb, signIn, writeResult } from "./helpers";

/**
 * Throttled pass (Lighthouse "slow 4G" network: 150 ms RTT, 1.6 Mbps down, 750 Kbps up; CPU 4x slowdown).
 * Cold cache per page (new context), so static chunks are downloaded under throttling.
 */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(600_000);

const OBSERVERS = `
  window.__rp = { lcp: 0, cls: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__rp.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__rp.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
`;

test("throttled cold loads (slow 4G + 4x CPU)", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const db = sitDb();
  const ai = await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const scale = await db.project.findFirstOrThrow({ where: { name: "SIT Scale 5000" } });
  const routes: Array<[string, string]> = [
    ["Dashboard", "/app"],
    ["Project overview", `/app/projects/${ai.id}`],
    ["Cable list (172)", `/app/projects/${ai.id}/cables`],
    ["Cable list (5000)", `/app/projects/${scale.id}/cables`],
    ["Handover", `/app/projects/${ai.id}/handover`],
    ["Integrations", `/app/projects/${ai.id}/integrations`],
  ];
  const out: Array<Record<string, unknown>> = [];
  for (const [name, url] of routes) {
    // A local antivirus web shield on the SIT host decompresses responses for Chrome user agents
    // (it adds X-Content-Encoding-Over-Network). A neutral UA keeps the server's gzip intact on the wire.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "RackPatch-SIT-Perf/1.0 (Chromium headless)" });
    const page = await context.newPage();
    await signIn(page, NS("lead"));
    await context.addInitScript(OBSERVERS);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    let bytes = 0;
    let compressed = 0;
    let textual = 0;
    cdp.on("Network.responseReceived", (e: { type: string; response: { headers: Record<string, string> } }) => {
      if (!["Document", "Script", "Stylesheet", "Fetch"].includes(e.type)) return;
      textual++;
      if (e.response.headers["content-encoding"] || e.response.headers["Content-Encoding"]) compressed++;
    });
    cdp.on("Network.loadingFinished", (e: { encodedDataLength: number }) => (bytes += e.encodedDataLength));
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const w = window as unknown as { __rp: { lcp: number; cls: number } };
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return { lcp: w.__rp.lcp, cls: w.__rp.cls, ttfb: nav.responseStart, load: nav.loadEventEnd };
    });
    out.push({ name, lcpMs: Math.round(m.lcp), ttfbMs: Math.round(m.ttfb), loadMs: Math.round(m.load), cls: Math.round(m.cls * 1000) / 1000, transferKB: Math.round(bytes / 1024), compressedResponses: `${compressed}/${textual}` });
    await closeAll(context);
  }
  writeResult("sit-perf-throttled", { measuredAt: new Date().toISOString(), profile: "150ms RTT, 1.6 Mbps down, 750 Kbps up, CPU 4x", pages: out });
});
