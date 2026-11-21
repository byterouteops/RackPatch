import { expect, test } from "@playwright/test";

/** Exercises patch panels and circuits through the UI. Opt-in: PANELS_FLOW=1 (writes data). */
test.skip(!process.env.PANELS_FLOW, "Set PANELS_FLOW=1");
test.setTimeout(180_000);

test("create panels, map a port, create a circuit", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.locator('input[name="email"]').first().fill(process.env.E2E_EMAIL ?? "lead@demo.rackpatch.local");
  await page.locator('input[name="password"]').fill(process.env.E2E_PASSWORD ?? "password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
  const href = await page.locator('a[href^="/app/projects/"]').first().getAttribute("href");
  const base = href!.match(/\/app\/projects\/[^/?#]+/)![0];
  await page.goto(`${base}/panels`);

  const suffix = Date.now().toString().slice(-3);
  for (const [name, rack] of [
    [`FPP-R01-${suffix}`, "R01"],
    [`FPP-R02-${suffix}`, "R02"],
  ]) {
    await page.getByPlaceholder("Panel name (e.g. ODF-A1)").fill(name);
    await page.getByPlaceholder("Rack", { exact: true }).fill(rack);
    await page.getByPlaceholder("Rack U (optional)").fill("42");
    await page.getByPlaceholder("Ports").fill("24");
    await page.getByRole("button", { name: "Create panel" }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  }

  const mapForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Map port" }) });
  await mapForm.locator('select[name="portId"]').selectOption({ label: `FPP-R01-${suffix} #1` });
  await mapForm.getByRole("button", { name: "Map port" }).click();
  await expect(page.getByTitle(/end A/).first()).toBeVisible({ timeout: 30_000 });

  const cForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Create circuit" }) });
  await cForm.getByPlaceholder("Circuit name").fill(`CIR-${suffix}`);
  await cForm.locator('select[name="panelPortAId"]').selectOption({ label: `A: FPP-R01-${suffix} #2` });
  await cForm.locator('select[name="panelPortZId"]').selectOption({ label: `Z: FPP-R02-${suffix} #2` });
  await cForm.getByRole("button", { name: "Create circuit" }).click();
  await expect(page.getByRole("link", { name: `CIR-${suffix}` })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "1", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "ui-audit-shots/shot_panels_flow.png", fullPage: true });
});
