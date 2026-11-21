import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const EMAIL = process.env.E2E_EMAIL ?? "lead@demo.rackpatch.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";
const OUT = "ui-audit-shots";

test.skip(!process.env.UI_AUDIT, "Set UI_AUDIT=1 to run the authenticated UI audit");
test.setTimeout(600_000);
test.use({ actionTimeout: 20_000 });

async function blockedTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, select, input, [role=tab]"));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.pointerEvents === "none") continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit) && !hit.contains(el)) {
        const label = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40);
        const by = `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 80)}`;
        out.push(`${label} <- covered by ${by}`);
      }
    }
    return out;
  });
}

test("authenticated UI audit", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  const fullErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    errors.push(`[console] ${page.url()} ${m.text().slice(0, 200)}`);
    if (fullErrors.length < 3) fullErrors.push(`${page.url()}\n${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${page.url()} ${e.message.slice(0, 200)}`));

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.locator('input[name="email"]').first().fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });

  const projectHref = await page.locator('a[href^="/app/projects/"]').first().getAttribute("href");
  const projectId = projectHref?.match(/\/app\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();
  const p = `/app/projects/${projectId}`;

  const routes = [
    "/app", "/app/projects", "/app/search", "/app/notifications", "/app/help",
    "/app/settings",
    p, `${p}/cables`, `${p}/plan`, `${p}/lldp`, `${p}/evidence`, `${p}/qc`, `${p}/scan`,
    `${p}/exceptions`, `${p}/handover`, `${p}/reports`, `${p}/labels`, `${p}/work-orders`,
    `${p}/inventory`, `${p}/panels`, `${p}/integrations`, `${p}/analytics`, `${p}/twin`,
    `${p}/capacity`, `${p}/compliance`, `${p}/spares`, `${p}/collection`, `${p}/assistant`, `${p}/api`,
  ];

  const report: string[] = [];
  for (const route of routes) {
    for (const pass of ["cold", "warm"] as const) {
      const t0 = Date.now();
      const res = await page.goto(route, { waitUntil: "load", timeout: 120_000 });
      const ms = Date.now() - t0;
      if (pass === "cold") continue;
      const status = res?.status();
      const blocked = await blockedTargets(page);
      const name = route.replace(p, "/project").replace(/\//g, "_") || "_root";
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      report.push(`${status} ${ms}ms ${route.replace(p, "<project>")}${blocked.length ? `\n   BLOCKED: ${blocked.slice(0, 8).join("\n   BLOCKED: ")}` : ""}`);
    }
  }

  // Client-side nav: every sidebar item must land on its own URL
  await page.goto("/app");
  const sidebar = page.getByRole("navigation", { name: "Primary" });
  const labels = [
    "Projects", "Sites & Racks", "Cable Plans", "Installation", "Verification", "Evidence",
    "Reports & Handover", "Inventory", "LLDP / CDP", "Import / Export", "Settings", "Help", "Dashboard",
  ];
  for (const label of labels) {
    const link = sidebar.getByRole("link", { name: label, exact: true });
    if (!(await link.count())) { report.push(`NAV missing: ${label}`); continue; }
    const before = page.url();
    const t0 = Date.now();
    await link.click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 15_000 }).catch(() => {});
    const ok = page.url() !== before;
    report.push(`NAV ${ok ? "ok  " : "DEAD"} "${label}" ${Date.now() - t0}ms -> ${page.url().replace(p, "<project>")}`);
  }

  // Header workflow tabs
  for (const label of ["Plan", "Install", "Verify", "Handover"]) {
    const t0 = Date.now();
    const before = page.url();
    await page.getByRole("navigation", { name: "Workflow" }).getByRole("link", { name: label }).click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 15_000 }).catch(() => {});
    report.push(`TAB "${label}" ${Date.now() - t0}ms -> ${page.url().replace(p, "<project>")}`);
  }

  // Cable row selection -> details panel
  await page.goto(`${p}/cables`);
  const rowsLoc = page.locator("tbody tr[id^=cable-row-]");
  if ((await rowsLoc.count()) > 2) {
    const row = rowsLoc.nth(2);
    const id = (await row.locator("td").nth(1).innerText()).trim();
    await row.click();
    const panel = page.getByRole("complementary", { name: "Cable details" });
    const shows = await panel.getByText(id).first().isVisible().catch(() => false);
    report.push(`ROW SELECT ${id} -> details panel=${shows} selected=${await row.getAttribute("aria-selected")}`);
    await row.locator("input[type=checkbox]").check();
    report.push(`ROW CHECK -> bar=${await page.getByText("1 selected").isVisible()}`);
    await page.screenshot({ path: `${OUT}/cables-selected.png` });
  }
  await page.getByRole("button", { name: "Topology View" }).click();
  report.push(`TOPOLOGY svg=${await page.getByRole("img", { name: "Cable topology" }).isVisible()}`);
  await page.screenshot({ path: `${OUT}/cables-topology.png` });
  await page.getByRole("button", { name: "Change History" }).click();
  await page.screenshot({ path: `${OUT}/cables-history.png` });
  report.push(`HISTORY items=${await page.locator("time").count()}`);

  // Project "More" menu
  await page.goto(`${p}/cables`);
  await page.getByRole("button", { name: "More" }).click();
  const item = page.getByRole("menuitem", { name: "Inventory" });
  const visible = await item.isVisible();
  report.push(`MORE menu visible=${visible}`);
  if (visible) {
    await item.click();
    await page.waitForURL(/inventory/, { timeout: 15_000 }).catch(() => {});
    report.push(`MORE -> ${page.url().replace(p, "<project>")}`);
  }

  // Global search
  await page.getByRole("button", { name: /Search/ }).first().click();
  await page.getByLabel("Search query").fill("GPU");
  const hit = page.getByRole("dialog", { name: "Global search" }).locator("li button").first();
  const searchOk = await hit.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  report.push(`SEARCH results=${searchOk}`);
  await page.screenshot({ path: `${OUT}/search.png` });
  await page.keyboard.press("Escape");

  // Notifications
  await page.getByRole("button", { name: /notifications/i }).click();
  const notifOk = await page.getByText("Mark all read").isVisible();
  report.push(`NOTIFICATIONS panel=${notifOk}`);
  await page.screenshot({ path: `${OUT}/notifications.png` });
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 990);

  // Project switcher
  const switcher = page.getByLabel("Current project");
  const options = await switcher.locator("option").count();
  report.push(`SWITCHER options=${options}`);
  if (options > 1) {
    const second = await switcher.locator("option").nth(1).getAttribute("value");
    await page.goto(`${p}/cables`);
    await switcher.selectOption(second!);
    await page.waitForURL(new RegExp(`${second}/cables`), { timeout: 15_000 }).catch(() => {});
    report.push(`SWITCHER -> ${page.url()}`);
  }

  fs.writeFileSync(`${OUT}/report.txt`, [...report, "", ...errors].join("\n"));
  fs.writeFileSync(`${OUT}/errors-full.txt`, fullErrors.join("\n\n=====\n\n"));
  console.log(report.join("\n"));
  console.log(errors.join("\n"));
});
