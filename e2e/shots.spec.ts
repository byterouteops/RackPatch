import { test } from "@playwright/test";
import fs from "node:fs";

/** Quick screenshots of chosen routes: SHOTS="work-orders,exceptions" (project-relative) or "/app/settings". */
test.skip(!process.env.SHOTS, "Set SHOTS to a comma-separated route list");
test.setTimeout(300_000);

test("screenshots", async ({ page }) => {
  fs.mkdirSync("ui-audit-shots", { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.locator('input[name="email"]').first().fill(process.env.E2E_EMAIL ?? "lead@demo.rackpatch.local");
  await page.locator('input[name="password"]').fill(process.env.E2E_PASSWORD ?? "password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
  const href = await page.locator('a[href^="/app/projects/"]').first().getAttribute("href");
  const base = href!.match(/\/app\/projects\/[^/?#]+/)![0];
  for (const r of process.env.SHOTS!.split(",").map((s) => s.trim()).filter(Boolean)) {
    let url = r.startsWith("/") ? r : `${base}/${r}`.replace(/\/$/, "");
    if (r.startsWith("@")) {
      const ws = await page.locator('a[href^="/app/workspaces/"]').first().getAttribute("href");
      url = ws!.replace(/\/(sites|team)$/, `/${r.slice(1)}`);
    }
    const [path, click] = url.split("!click=");
    url = path;
    const res = await page.goto(url, { timeout: 120_000 });
    if (click) {
      await page.getByRole("button", { name: click }).first().click();
      await page.waitForTimeout(2500);
      await page.reload();
    }
    await page.waitForTimeout(600);
    const name = r.replace(/[^a-z0-9]+/gi, "_") || "overview";
    await page.screenshot({ path: `ui-audit-shots/shot_${name}.png`, fullPage: true });
    console.log(`${res?.status()} ${url}`);
  }
});
