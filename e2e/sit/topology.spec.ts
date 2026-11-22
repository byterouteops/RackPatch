import { expect, test, type Page } from "@playwright/test";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, sitDb, watchErrors, writeResult } from "./helpers";
import { measureTopology } from "./topology-metrics";

/**
 * Topology SIT: the 14 checks of the topology redesign, against the real AI/HPC demo records in rackpatch_sit
 * (plus the generated 20/50/100/500-device projects from scripts/sit-seed-topology-scale.ts for check 12).
 * Expected values are read straight from the database, never from the UI under test.
 */
test.skip(!SIT_ENABLED, "SIT only");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

type View = "full" | "fe" | "be";
const PATH: Record<View, string> = { full: "/fabric", fe: "/fabric/fe", be: "/fabric/be" };
const ROLES: Record<View, string[] | null> = {
  full: null,
  fe: ["fe-spine", "fe-leaf", "border-leaf", "controller", "cpu", "gpu", "storage"],
  be: ["be-spine", "be-leaf", "gpu"],
};
const FABRICS: Record<View, (f: string | null) => boolean> = {
  full: (f) => f !== "OOB" && f !== "PATCH",
  fe: (f) => f === "FE" || f === "STORAGE",
  be: (f) => f === "BE",
};

const results: Record<string, unknown> = {};

/** Cables and devices each view must draw, straight from the published revision and its findings. */
async function dbTruth(projectId: string, view: View) {
  const db = sitDb();
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const rev = p.activeRevisionId!;
  const links = await db.plannedLink.findMany({
    where: { revisionId: rev },
    select: { id: true, cableId: true, fabric: true, aDevice: true, zDevice: true, findings: { where: { revisionId: rev }, take: 1, select: { state: true } } },
  });
  const roles = new Map((await db.deviceInventory.findMany({ where: { projectId }, select: { name: true, role: true } })).map((d) => [d.name.toLowerCase(), d.role]));
  const roleOk = (d: string) => {
    const allowed = ROLES[view];
    const r = roles.get(d.toLowerCase()) ?? null;
    return !allowed || r === null || allowed.includes(r);
  };
  const cables = links.filter((l) => FABRICS[view](l.fabric) && roleOk(l.aDevice) && roleOk(l.zDevice) && l.aDevice.toLowerCase() !== l.zDevice.toLowerCase());
  const state = new Map(cables.map((l) => [l.cableId, l.findings[0]?.state ?? "NONE"]));
  const devices = new Set(cables.flatMap((l) => [l.aDevice, l.zDevice]));
  return { cables, state, devices, byDevice: (d: string) => cables.filter((l) => l.aDevice === d || l.zDevice === d).map((l) => l.cableId).sort() };
}

async function ready(page: Page) {
  await expect(page.getByTestId("topology")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
}

/** Drawn per-cable elements (only present when bundles are expanded). */
async function drawnCables(page: Page) {
  return page.locator('svg[aria-label^="Topology of"] g[data-cable]').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute("data-cable")!, status: e.getAttribute("data-status")!, dim: e.classList.contains("tp-dim") })),
  );
}

async function nodePositions(page: Page) {
  return page.locator("svg [data-topo-node]").evaluateAll((els) =>
    Object.fromEntries(
      els.map((e) => {
        const r = e.querySelector("[data-topo-box]")!;
        return [e.getAttribute("data-name"), `${r.getAttribute("x")},${r.getAttribute("y")}`];
      }),
    ),
  );
}

function trackApi(page: Page) {
  const failures: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/\/_next\/static\/|favicon/.test(u)) failures.push(`${r.status()} ${r.request().method()} ${u}`);
  });
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(reason)) failures.push(`failed ${r.method()} ${r.url()} ${reason}`);
  });
  return failures;
}

test("topology views: tabs, data integrity, statuses, geometry, bundles, filters, panels, tools, determinism", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const db = sitDb();
  const ai = await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const base = `/app/projects/${ai.id}`;
  const { context, page } = await contextAs(browser, NS("lead"));
  const errors = watchErrors(page);
  const api = trackApi(page);

  // 1. Every topology tab works (navigated through the real sub-navigation).
  await page.goto(`${base}/fabric`, { waitUntil: "networkidle" });
  await ready(page);
  const tabs: Record<string, string> = {};
  for (const [label, re] of [
    ["Front-end", /\/fabric\/fe$/],
    ["Back-end", /\/fabric\/be$/],
    ["Trace", /\/trace$/],
    ["Topology", /\/fabric$/],
  ] as const) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForURL(re);
    if (label !== "Trace") {
      await ready(page);
      await expect(page.getByRole("group", { name: /Topology of/ })).toBeVisible();
    } else await expect(page.getByRole("button", { name: "Trace" })).toBeVisible();
    tabs[label] = "ok";
  }
  results.tabs = tabs;

  const perView: Record<string, unknown> = {};
  for (const view of ["full", "fe", "be"] as View[]) {
    const truth = await dbTruth(ai.id, view);
    await page.goto(`${base}${PATH[view]}`, { waitUntil: "networkidle" });
    await ready(page);
    const svg = page.getByRole("group", { name: /Topology of/ });

    // 2. Every device and cable of the source data is represented (and nothing else).
    const names = await page.locator("svg [data-topo-node]").evaluateAll((els) => els.map((e) => e.getAttribute("data-name")!));
    expect(new Set(names)).toEqual(truth.devices);
    await page.getByRole("button", { name: /Show every cable/ }).click();
    const drawn = await drawnCables(page);
    expect(drawn.map((d) => d.id).sort()).toEqual(truth.cables.map((c) => c.cableId).sort());
    expect(new Set(drawn.map((d) => d.id)).size).toBe(drawn.length);

    // 7. Every cable shows its verification state from the database.
    const wrong = drawn.filter((d) => d.status !== truth.state.get(d.id));
    expect(wrong).toEqual([]);

    // 3, 4, 5. Geometry on the rendered SVG (every cable expanded), plus bundled.
    const expanded = await measureTopology(page);
    expect(expanded.nodeOverlaps).toBe(0);
    expect(expanded.segmentsThroughNodes).toBe(0);
    expect(expanded.labelOverflows).toBe(0);
    await page.getByRole("button", { name: /Bundle cables/ }).click();
    const bundled = await measureTopology(page);
    expect(bundled.nodeOverlaps).toBe(0);
    expect(bundled.segmentsThroughNodes).toBe(0);

    // 6. A bundle expands into exactly its own cables.
    const toggle = page.locator("svg [data-bundle-toggle]").first();
    const bundleId = (await toggle.getAttribute("data-bundle-toggle"))!;
    const [ua, ub] = bundleId.split("|");
    await toggle.click({ force: true });
    const inBundle = await page.locator(`svg g[data-bundle="${bundleId}"] g[data-cable]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-cable")!));
    const expectBundle = truth.cables.filter((c) => [c.aDevice, c.zDevice].sort().join("|") === [ua, ub].sort().join("|")).map((c) => c.cableId);
    expect(inBundle.sort()).toEqual(expectBundle.sort());
    expect(inBundle.length).toBeGreaterThan(1);

    // 8. Mismatch and review filters isolate exactly those cables.
    const filterRes: Record<string, number> = {};
    for (const [chip, st] of [
      ["Mismatch", "MISMATCH"],
      ["Needs review", "NEEDS_REVIEW"],
    ] as const) {
      await page.getByRole("group", { name: "Filter cables by status" }).getByRole("button", { name: new RegExp(`^${chip}`) }).click();
      const lit = (await drawnCables(page)).filter((d) => !d.dim);
      expect(lit.every((d) => d.status === st)).toBe(true);
      expect(lit.map((d) => d.id).sort()).toEqual(truth.cables.filter((c) => truth.state.get(c.cableId) === st).map((c) => c.cableId).sort());
      filterRes[st] = lit.length;
      await page.getByRole("button", { name: "Clear filter" }).click();
    }

    // 9. Device details list exactly that device's cables in this view; link details list the bundle's cable records.
    const deviceName = names.sort()[0];
    await svg.locator(`[data-topo-node][data-name="${deviceName}"]`).click();
    const panel = page.getByTestId("topo-device-panel");
    await expect(panel.getByRole("heading", { name: deviceName })).toBeVisible();
    const panelCables = await panel.getByTestId("topo-cable-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-cable")!));
    expect(panelCables.sort()).toEqual(truth.byDevice(deviceName));
    await panel.getByRole("button", { name: "Close details" }).click();
    await page.locator(`svg g[data-bundle="${bundleId}"] g[data-cable] path`).first().dispatchEvent("click");
    const bpanel = page.getByTestId("topo-bundle-panel");
    await expect(bpanel).toBeVisible();
    const bCables = await bpanel.getByTestId("topo-cable-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-cable")!));
    expect(bCables.sort()).toEqual(expectBundle.sort());
    await bpanel.getByRole("button", { name: "Close details" }).click();

    perView[view] = { devices: truth.devices.size, cables: truth.cables.length, expanded, bundled, filters: filterRes, bundleChecked: bundleId, deviceChecked: deviceName };
  }
  results.views = perView;

  // 10. Zoom, pan, search, reset and export on the Back-end view.
  await page.goto(`${base}/fabric/be`, { waitUntil: "networkidle" });
  await ready(page);
  const zoomText = page.getByTestId("topo-zoom");
  const z0 = await zoomText.textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoomText).not.toHaveText(z0!);
  const z1 = await zoomText.textContent();
  const vp = page.locator("svg g[data-viewport]");
  const t0 = await vp.getAttribute("transform");
  await page.getByRole("group", { name: /Topology of/ }).scrollIntoViewIfNeeded();
  const box = (await page.getByRole("group", { name: /Topology of/ }).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => vp.getAttribute("transform")).not.toBe(t0);
  await page.getByLabel("Search device").fill("BE-LEAF-03");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByTestId("topo-device-panel").getByRole("heading", { name: "BE-LEAF-03" })).toBeVisible();
  const before = await nodePositions(page);
  await page.getByRole("button", { name: /Reset layout/ }).click();
  await ready(page);
  await expect(page.getByTestId("topo-device-panel")).toHaveCount(0);
  expect(await nodePositions(page)).toEqual(before);
  const exports: Record<string, number> = {};
  for (const kind of ["SVG", "PNG"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: kind, exact: true }).click()]);
    expect(dl.suggestedFilename()).toBe(`rackpatch-be-topology.${kind.toLowerCase()}`);
    const path = await dl.path();
    const size = (await import("node:fs")).statSync(path!).size;
    expect(size).toBeGreaterThan(kind === "SVG" ? 5_000 : 20_000);
    exports[kind] = size;
  }
  results.tools = { zoom: `${z0} -> ${z1}`, pan: "transform changed", search: "BE-LEAF-03 found", reset: "positions identical", exports };

  // 11. Refresh keeps every position (cached), and a fresh browser with no cache computes the same positions.
  const determinism: Record<string, unknown> = {};
  for (const view of ["full", "fe", "be"] as View[]) {
    await page.goto(`${base}${PATH[view]}`, { waitUntil: "networkidle" });
    await ready(page);
    const p1 = await nodePositions(page);
    const key1 = await page.getByTestId("topology").getAttribute("data-structure-key");
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    expect(await page.getByTestId("topology").getAttribute("data-layout-cached")).toBe("true");
    expect(await page.getByTestId("topology").getAttribute("data-structure-key")).toBe(key1);
    expect(await nodePositions(page)).toEqual(p1);
    const fresh = await contextAs(browser, NS("lead"));
    await fresh.page.goto(`${base}${PATH[view]}`, { waitUntil: "networkidle" });
    await ready(fresh.page);
    expect(await fresh.page.getByTestId("topology").getAttribute("data-layout-cached")).toBe("false");
    expect(await nodePositions(fresh.page)).toEqual(p1);
    await closeAll(fresh.context);
    determinism[view] = { nodes: Object.keys(p1).length, refresh: "identical (cached)", freshBrowser: "identical (recomputed)" };
  }
  results.determinism = determinism;

  // Trace view: path highlighted with interface labels; the hop list still matches.
  const gpu = await db.deviceInventory.findFirstOrThrow({ where: { projectId: ai.id, role: "gpu" }, orderBy: { name: "asc" } });
  await page.goto(`${base}/trace?from=${encodeURIComponent(gpu.name)}&to=BE-SPINE-01`, { waitUntil: "networkidle" });
  await ready(page);
  const hops = await page.getByRole("list", { name: "Interface-level path" }).locator("li").count();
  const lit = (await drawnCables(page)).filter((d) => !d.dim);
  expect(lit.length).toBe(hops);
  results.trace = { from: gpu.name, to: "BE-SPINE-01", hops, highlighted: lit.map((d) => d.id) };

  // 14. No console errors and no failed API calls on any topology page.
  expect(errors).toEqual([]);
  expect(api).toEqual([]);
  results.consoleErrors = errors.length;
  results.failedRequests = api.length;
  await closeAll(context);
});

test("visual regression baselines for the three views", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const ai = await sitDb().project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const { context, page } = await contextAs(browser, NS("lead"));
  for (const view of ["full", "fe", "be"] as View[]) {
    await page.goto(`/app/projects/${ai.id}${PATH[view]}`, { waitUntil: "networkidle" });
    await ready(page);
    await page.waitForTimeout(300);
    await expect(page.getByTestId("topology")).toHaveScreenshot(`topology-${view}.png`, { maxDiffPixelRatio: 0.01, animations: "disabled" });
  }
  await closeAll(context);
});

test("12. large topologies stay responsive (20/50/100/500 devices)", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const { context, page } = await contextAs(browser, NS("lead"));
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__longTasks.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true });
  });
  const errors = watchErrors(page);
  const scale: Record<string, unknown> = {};
  for (const size of [20, 50, 100, 500]) {
    const project = await sitDb().project.findFirst({ where: { name: `SIT Topology ${size}` } });
    test.skip(!project, "run scripts/sit-seed-topology-scale.ts first");
    const truth = await dbTruth(project!.id, "full");
    const t = Date.now();
    await page.goto(`/app/projects/${project!.id}/fabric`, { waitUntil: "domcontentloaded" });
    await ready(page);
    const readyMs = Date.now() - t;
    const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    const shown = await page.locator("svg [data-topo-node]").count();
    const groups = await page.locator("svg [data-topo-node][data-group-size]").evaluateAll((els) => els.reduce((s, e) => s + Number(e.getAttribute("data-group-size")), 0));
    // Every device is either drawn or inside a drawn group.
    expect(shown - (await page.locator("svg [data-topo-node][data-group-size]").count()) + groups).toBe(truth.devices.size);
    await expect(page.getByTestId("topo-summary")).toContainText(`${truth.cables.length} cables`);
    const geo = await measureTopology(page);
    expect(geo.nodeOverlaps).toBe(0);
    expect(geo.segmentsThroughNodes).toBe(0);
    const r: Record<string, unknown> = { devices: truth.devices.size, cables: truth.cables.length, nodesShown: shown, readyMs, layoutMs: Number(await page.getByTestId("topology").getAttribute("data-layout-ms")), maxLongTaskMs: Math.max(0, ...longTasks), geo };

    // Expanding every host group lays out all devices in the worker while the page keeps responding.
    const expandBtn = page.getByRole("button", { name: /^Expand \d+ host groups/ });
    if (await expandBtn.count()) {
      await page.evaluate(() => ((window as unknown as { __longTasks: number[] }).__longTasks = []));
      const t2 = Date.now();
      await expandBtn.click();
      const pings: number[] = [];
      // Above 250 devices off-screen nodes are culled, so completion is read from the summary, not the DOM count.
      const allShown = async () => (await page.getByTestId("topology").getAttribute("data-ready")) === "true" && !/shown/.test((await page.getByTestId("topo-summary").textContent()) ?? "");
      while (!(await allShown())) {
        const p0 = Date.now();
        await page.evaluate(() => 1);
        pings.push(Date.now() - p0);
        if (Date.now() - t2 > 180_000) throw new Error("expanded layout did not finish in 180 s");
        await page.waitForTimeout(250);
      }
      const expandedLong = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
      const geoAll = await measureTopology(page);
      expect(geoAll.nodeOverlaps).toBe(0);
      expect(geoAll.segmentsThroughNodes).toBe(0);
      r.expanded = { nodesInDom: await page.locator("svg [data-topo-node]").count(), readyMs: Date.now() - t2, maxPingMs: Math.max(0, ...pings), maxLongTaskMs: Math.max(0, ...expandedLong), geo: geoAll };
      await expect(page.getByTestId("topo-zoom")).toBeVisible();
    }
    scale[size] = r;
    console.log(`[scale ${size}] ${JSON.stringify(r)}`);
  }
  results.scale = scale;
  expect(errors).toEqual([]);
  await closeAll(context);
});

test.afterAll(() => writeResult("topology-sit", results));
