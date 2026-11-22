import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, sitDb, writeResult } from "./helpers";
import { measureTopology } from "./topology-metrics";

test.skip(!SIT_ENABLED, "SIT only");
test.setTimeout(240_000);

/** Screenshots and geometry metrics of the topology views (docs/qa/topology/after-*.png). */
test("capture redesigned topology screenshots and metrics", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const ai = await sitDb().project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const gpu = await sitDb().deviceInventory.findFirstOrThrow({ where: { projectId: ai.id, role: "gpu" }, orderBy: { name: "asc" } });
  const { context, page } = await contextAs(browser, NS("lead"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  fs.mkdirSync("docs/qa/topology", { recursive: true });
  const out: Record<string, unknown> = {};
  for (const [name, path] of [
    ["full", "/fabric"],
    ["frontend", "/fabric/fe"],
    ["backend", "/fabric/be"],
    ["trace", `/trace?from=${encodeURIComponent(gpu.name)}&to=BE-SPINE-01`],
  ] as const) {
    await page.goto(`/app/projects/${ai.id}${path}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("topology")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/qa/topology/after-${name}.png`, fullPage: true });
    const collapsed = await measureTopology(page);
    await page.getByRole("button", { name: /Show every cable/ }).click();
    await page.waitForTimeout(300);
    const expanded = await measureTopology(page);
    out[name] = { collapsed, expanded, layoutMs: await page.getByTestId("topology").getAttribute("data-layout-ms") };
  }
  writeResult("topology-after", out);
  await closeAll(context);
});
