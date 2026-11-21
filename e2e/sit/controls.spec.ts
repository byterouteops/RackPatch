import { test } from "@playwright/test";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, concreteRoutes, contextAs, resolveIds, writeResult } from "./helpers";

/** Counts the interactive controls rendered on every inventoried route (as project lead and as owner). */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(900_000);

test("interactive control inventory", async ({ browser, baseURL }) => {
  assertSitTarget(baseURL);
  const routes = concreteRoutes(await resolveIds());
  const out: Record<string, unknown> = {};
  for (const role of ["lead", "owner"]) {
    const { context, page } = await contextAs(browser, NS(role));
    const perRoute: Array<{ route: string; links: number; buttons: number; fields: number; total: number }> = [];
    for (const { route, url } of routes) {
      await page.goto(url, { waitUntil: "load" }).catch(() => null);
      const c = await page.evaluate(() => {
        const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed";
        const q = (s: string) => Array.from(document.querySelectorAll(s)).filter(visible).length;
        return {
          links: q("a[href]"),
          buttons: q("button, [role=button], summary"),
          fields: q("input:not([type=hidden]), select, textarea"),
        };
      });
      perRoute.push({ route, ...c, total: c.links + c.buttons + c.fields });
    }
    out[role] = {
      routes: perRoute.length,
      totals: perRoute.reduce(
        (a, r) => ({ links: a.links + r.links, buttons: a.buttons + r.buttons, fields: a.fields + r.fields, total: a.total + r.total }),
        { links: 0, buttons: 0, fields: 0, total: 0 },
      ),
      perRoute,
    };
    await closeAll(context);
  }
  writeResult("sit-controls", out);
});
