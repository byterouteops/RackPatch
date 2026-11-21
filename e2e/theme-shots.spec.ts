import { expect, test, type Page } from "@playwright/test";
import { scanLayout, type LayoutIssue } from "./lib/layout-scan";
import fs from "node:fs";

/**
 * Theme screenshots + layout defect scan (overlapping text, clipped text,
 * horizontal page overflow) across viewports. Opt-in: THEME_SHOTS=1.
 *   THEME_ROUTES="/app,overview,cables"  (project-relative unless starting with "/")
 *   THEME_VIEWPORTS="1820x1024,390x844"
 */
test.skip(!process.env.THEME_SHOTS, "Set THEME_SHOTS=1");
test.setTimeout(1_200_000);

const VIEWPORTS = (process.env.THEME_VIEWPORTS ?? "1820x1024,1920x1080,1440x900,1366x768,1024x768,768x1024,390x844")
  .split(",")
  .map((v) => v.trim().split("x").map(Number) as [number, number]);

const ROUTES = (
  process.env.THEME_ROUTES ??
  "/app,/app/projects,overview,cables,verify,exceptions,handover,racks,fabric,evidence,qc,/app/help,/app/settings,/app/notifications"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.locator('input[name="email"]').first().fill(process.env.E2E_EMAIL ?? "lead@demo.northstar.local");
  await page.locator('input[name="password"]').fill(process.env.E2E_PASSWORD ?? "password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
}

test("theme screenshots and layout scan", async ({ page }) => {
  const outDir = process.env.THEME_OUT ?? "ui-audit-shots/theme";
  fs.mkdirSync(outDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const href = await page.locator('a[href^="/app/projects/"]').first().getAttribute("href");
  const base = href!.match(/\/app\/projects\/[^/?#]+/)![0];
  const report: Record<string, { status: number | undefined; issues: LayoutIssue[] }> = {};
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console ${page.url()}: ${m.text().slice(0, 300)}`);
  });

  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of ROUTES) {
      const url = r.startsWith("/") ? r : r === "overview" ? base : `${base}/${r}`;
      const res = await page.goto(url, { timeout: 120_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const name = (r.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root").toLowerCase();
      await page.screenshot({ path: `${outDir}/${w}x${h}_${name}.png`, fullPage: true });
      report[`${w}x${h} ${url}`] = { status: res?.status(), issues: await scanLayout(page) };
    }
  }
  fs.writeFileSync(`${outDir}/layout-report.json`, JSON.stringify({ report, consoleErrors }, null, 2));
  const failures = Object.entries(report).filter(([, v]) => (v.status ?? 0) >= 400 || v.issues.length > 0);
  for (const [k, v] of failures) console.log(k, v.status, JSON.stringify(v.issues.slice(0, 8)));
  console.log(`console errors: ${consoleErrors.length}`);
  expect.soft(failures.map(([k]) => k)).toEqual([]);
});
