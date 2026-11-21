import { expect, test } from "@playwright/test";
import { SIT_ENABLED, assertSitTarget, writeResult } from "./helpers";

/** Font delivery: self-hosted Poppins and JetBrains Mono load, are applied, and no font request fails. */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");

test("fonts load from self-hosted files and are applied", async ({ page, baseURL }) => {
  assertSitTarget(baseURL);
  const fontResponses: Array<{ url: string; status: number }> = [];
  const failed: string[] = [];
  page.on("response", (r) => {
    if (/\.woff2(\?|$)/.test(r.url())) fontResponses.push({ url: r.url().replace(/^.*\/_next\//, "/_next/"), status: r.status() });
  });
  page.on("requestfailed", (r) => {
    if (/\.woff2(\?|$)/.test(r.url())) failed.push(r.url());
  });
  await page.goto("/sign-in");
  const facts = await page.evaluate(async () => {
    await document.fonts.ready;
    const probe = document.createElement("span");
    probe.className = "rp-mono";
    probe.textContent = "Ethernet1/1";
    document.body.appendChild(probe);
    // Faces load on first use; the sign-in page has no monospace text until the probe is added.
    await new Promise((r) => setTimeout(r, 300));
    await document.fonts.ready;
    const heading = document.querySelector("h1, h2") as HTMLElement | null;
    const faces = Array.from(document.fonts).map((f) => ({ family: f.family.replace(/['"]/g, ""), weight: f.weight, status: f.status }));
    const used = (el: Element) => getComputedStyle(el).fontFamily;
    return {
      bodyFont: used(document.body),
      headingFont: heading ? used(heading) : null,
      headingWeight: heading ? getComputedStyle(heading).fontWeight : null,
      monoFont: used(probe),
      faces,
      poppinsLoaded: faces.filter((f) => /poppins/i.test(f.family) && f.status === "loaded").map((f) => f.weight),
      monoLoaded: faces.filter((f) => /jetbrains/i.test(f.family) && f.status === "loaded").map((f) => f.weight),
    };
  });
  writeResult("sit-fonts", { ...facts, fontResponses, failed });
  expect(failed).toEqual([]);
  expect(fontResponses.every((r) => r.status === 200)).toBe(true);
  expect(fontResponses.every((r) => r.url.startsWith("/_next/static/media/"))).toBe(true);
  expect(facts.bodyFont.toLowerCase()).toContain("poppins");
  expect(facts.monoFont.toLowerCase()).toContain("jetbrains");
  expect(facts.poppinsLoaded).toEqual(expect.arrayContaining(["400", "500", "600", "700"]));
  expect(facts.monoLoaded).toContain("400");
});
