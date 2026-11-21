import { expect, test } from "@playwright/test";
import { signIn } from "./sit/helpers";

/** Exercises the spare-stock UI end to end. Opt-in: SPARES_FLOW=1 (writes ledger rows). */
test.skip(!process.env.SPARES_FLOW, "Set SPARES_FLOW=1");
test.setTimeout(180_000);

test("add SKU, receive and issue stock", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page, process.env.E2E_EMAIL ?? "lead@demo.rackpatch.local");
  const href = await page.locator('a[href^="/app/projects/"]').first().getAttribute("href");
  const base = href!.match(/\/app\/projects\/[^/?#]+/)![0];
  await page.goto(`${base}/spares`);

  const sku = `DAC-400G-${Date.now().toString().slice(-4)}`;
  await page.getByPlaceholder("SKU (e.g. DAC-3M)").fill(sku);
  await page.getByPlaceholder("Description").fill("400G DAC 3m spare");
  await page.getByPlaceholder("Opening qty").fill("12");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("link", { name: sku })).toBeVisible({ timeout: 30_000 });

  const form = page.locator("form").filter({ has: page.getByRole("tablist", { name: "Transaction type" }) });
  await form.locator("select").selectOption({ label: `${sku} \u2013 400G DAC 3m spare` });
  await form.getByRole("tab", { name: "Issue" }).click();
  await form.locator('input[type="number"]').fill("3");
  await form.getByPlaceholder("Cable ID or work order").fill("C-201");
  await form.getByRole("button", { name: "Record Issue" }).click();
  await expect(form.getByText(`${sku} balance is now 9`)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "ui-audit-shots/shot_spares_flow.png", fullPage: true });
});
