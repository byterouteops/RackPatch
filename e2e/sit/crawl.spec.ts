import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { scanLayout, type LayoutIssue } from "../lib/layout-scan";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, concreteRoutes, contextAs, resolveIds, watchErrors, writeResult, type Ids } from "./helpers";

/** SIT route crawl. SIT=1 E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/sit/crawl.spec.ts */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(1_800_000);

const VIEWPORTS: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [390, 844],
];
const AI_NAME = "AI/HPC Fabric Commissioning";
const DENIED = /permission denied|not found|do not have access|no access|404|could not be found/i;

let ids: Ids;
test.beforeAll(async ({ baseURL }) => {
  assertSitTarget(baseURL);
  ids = await resolveIds();
});

type Visit = { route: string; url: string; status: number | null; finalUrl: string; errors: string[]; denied: boolean; appError: boolean; ms: number };

async function crawl(page: import("@playwright/test").Page, urls: { route: string; url: string }[]) {
  const out: Visit[] = [];
  const errors = watchErrors(page);
  for (const { route, url } of urls) {
    errors.length = 0;
    const t0 = Date.now();
    const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 20_000);
    out.push({
      route,
      url,
      status: res?.status() ?? null,
      finalUrl: new URL(page.url()).pathname,
      errors: [...errors],
      denied: DENIED.test(body),
      appError: /application error|unhandled runtime error|internal server error/i.test(body),
      ms: Date.now() - t0,
    });
  }
  return out;
}

test("lead: every route loads without errors; axe serious/critical recorded", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("lead"));
  const routes = concreteRoutes(ids);
  const visits = await crawl(page, routes);
  type AxeRow = { id: string; impact: string | null | undefined; nodes: number; help: string; samples: string[] };
  const axe: Record<string, AxeRow[]> = {};
  for (const { route, url } of routes) {
    await page.goto(url, { waitUntil: "load" });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    axe[route] = r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
        samples: v.nodes.slice(0, 6).map((n) => {
          const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number };
          return `${n.target.join(" ")} :: ${n.html.slice(0, 140)}${d.fgColor ? ` :: fg ${d.fgColor} bg ${d.bgColor} ratio ${d.contrastRatio}` : ""}`;
        }),
      }));
  }
  writeResult("sit-crawl-lead", { visits, axe });
  await closeAll(context);
  const broken = visits.filter((v) => (v.status ?? 500) >= 500 || v.appError || v.errors.length > 0);
  expect.soft(broken.map((v) => `${v.route} ${v.status} ${v.errors.join(" | ").slice(0, 200)}`)).toEqual([]);
  const axeFailures = Object.entries(axe).filter(([, v]) => v.length > 0);
  expect.soft(axeFailures.map(([k, v]) => `${k}: ${v.map((x) => `${x.id}(${x.nodes})`).join(",")}`)).toEqual([]);
});

test("lead: responsive layout scan at 6 viewports", async ({ browser }) => {
  const report: Record<string, LayoutIssue[]> = {};
  const { context, page } = await contextAs(browser, NS("lead"));
  const routes = concreteRoutes(ids).filter((r) => r.route.startsWith("/app"));
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const { route, url } of routes) {
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const issues = await scanLayout(page);
      if (issues.length) report[`${w}x${h} ${route}`] = issues;
    }
  }
  writeResult("sit-layout", { checked: routes.length * VIEWPORTS.length, failing: Object.keys(report).length, report });
  await closeAll(context);
  expect.soft(Object.keys(report)).toEqual([]);
});

for (const role of ["owner", "tech", "contractor", "qc", "engineer", "viewer"]) {
  test(`${role}: every route renders or denies cleanly`, async ({ browser }) => {
    const { context, page } = await contextAs(browser, NS(role));
    const visits = await crawl(page, concreteRoutes(ids));
    writeResult(`sit-crawl-${role}`, { visits });
    await closeAll(context);
    const broken = visits.filter((v) => (v.status ?? 500) >= 500 || v.appError || v.errors.length > 0);
    expect.soft(broken.map((v) => `${v.route} ${v.status} ${v.errors.join(" | ").slice(0, 200)}`)).toEqual([]);
    const admin = visits.find((v) => v.route === "/app/admin");
    expect.soft(admin && (admin.denied || admin.finalUrl !== "/app/admin"), "non-admin must not see /app/admin").toBeTruthy();
  });
}

test("cross-workspace user cannot read AI/HPC project pages", async ({ browser }) => {
  const { context, page } = await contextAs(browser, "lead@demo.rackpatch.local");
  const routes = concreteRoutes(ids).filter((r) => r.route.includes("[projectId]") || r.route.includes("[workspaceId]"));
  const leaks: string[] = [];
  const visits: Visit[] = [];
  for (const r of routes) {
    const [v] = await crawl(page, [r]);
    visits.push(v);
    const text = await page.locator("main").innerText().catch(() => "");
    if (text.includes(AI_NAME) || text.includes("CBL-FE-") || text.includes("NS-DC1")) leaks.push(r.route);
  }
  writeResult("sit-crawl-cross-workspace", { visits, leaks });
  await closeAll(context);
  expect(leaks).toEqual([]);
  expect.soft(visits.filter((v) => (v.status ?? 500) >= 500 || v.appError).map((v) => v.route)).toEqual([]);
});

test("anonymous user is redirected to sign-in for every /app route", async ({ browser }) => {
  const { context, page } = await contextAs(browser, null);
  const visits = await crawl(page, concreteRoutes(ids));
  writeResult("sit-crawl-anonymous", { visits });
  await closeAll(context);
  const exposed = visits.filter((v) => v.route.startsWith("/app") && !v.finalUrl.startsWith("/sign-in"));
  expect(exposed.map((v) => `${v.route} -> ${v.finalUrl}`)).toEqual([]);
  expect.soft(visits.filter((v) => (v.status ?? 500) >= 500 || v.appError).map((v) => `${v.route} ${v.status}`)).toEqual([]);
});
