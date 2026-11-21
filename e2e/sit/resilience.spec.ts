import { expect, test, type Page } from "@playwright/test";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, sitDb, writeResult } from "./helpers";

/** SIT error injection: failed/aborted server actions, offline, double submit, invalid and oversized input. */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(300_000);

const db = sitDb();
const results: Array<{ check: string; pass: boolean; detail?: string }> = [];
let scaleId = "";

test.beforeAll(async ({ baseURL }) => {
  assertSitTarget(baseURL);
  scaleId = (await db.project.findFirstOrThrow({ where: { name: "SIT Scale 5000" } })).id;
});
test.afterAll(() => writeResult("sit-resilience", results));

async function plannedLink(skip: number) {
  const rev = (await db.project.findUniqueOrThrow({ where: { id: scaleId } })).activeRevisionId!;
  return db.plannedLink.findFirstOrThrow({ where: { revisionId: rev, runtime: { installStatus: "PLANNED" } }, orderBy: { cableId: "asc" }, skip, include: { runtime: true } });
}
const runtimeOf = (id: string) => db.linkRuntime.findUniqueOrThrow({ where: { plannedLinkId: id } });

function pageErrors(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}

test("server action aborted / 500: error shown, no state change, retry succeeds", async ({ browser }) => {
  const link = await plannedLink(0);
  const { context, page } = await contextAs(browser, NS("lead"));
  const uncaught = pageErrors(page);
  await page.goto(`/app/projects/${scaleId}/cables/${link.id}?action=install`);

  await page.route("**/*", (route) => (route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort("failed") : route.continue()));
  await page.getByRole("button", { name: "Mark installed" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /failed|could not|try again|fetch/i }).first()).toBeVisible({ timeout: 15_000 });
  expect((await runtimeOf(link.id)).installStatus).toBe("PLANNED");
  results.push({ check: "aborted server action shows error, DB unchanged", pass: true });
  await page.unroute("**/*");

  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.fulfill({ status: 500, body: "boom" }) : route.continue(),
  );
  await page.getByRole("button", { name: "Mark installed" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /failed|could not|try again|unexpected/i }).first()).toBeVisible({ timeout: 15_000 });
  expect((await runtimeOf(link.id)).installStatus).toBe("PLANNED");
  results.push({ check: "HTTP 500 from server action shows error, DB unchanged", pass: true });
  await page.unroute("**/*");

  await page.getByRole("button", { name: "Mark installed" }).click();
  await expect.poll(async () => (await runtimeOf(link.id)).installStatus, { timeout: 15_000 }).toBe("INSTALLED");
  results.push({ check: "retry after failure succeeds", pass: true });
  results.push({ check: "no uncaught page errors during injected failures", pass: uncaught.length === 0, detail: uncaught.join(" | ") });
  expect(uncaught).toEqual([]);
  await closeAll(context);
});

test("double submit records one change", async ({ browser }) => {
  const link = await plannedLink(0);
  const v0 = link.runtime!.version;
  const audits0 = await db.auditEvent.count({ where: { projectId: scaleId, action: "install.update", summary: { startsWith: link.cableId } } });
  const { context, page } = await contextAs(browser, NS("lead"));
  await page.goto(`/app/projects/${scaleId}/cables/${link.id}?action=install`);
  await page.getByRole("button", { name: "Mark installed" }).dblclick();
  await expect.poll(async () => (await runtimeOf(link.id)).installStatus, { timeout: 15_000 }).toBe("INSTALLED");
  await page.waitForTimeout(1500);
  const rt = await runtimeOf(link.id);
  const audits = await db.auditEvent.count({ where: { projectId: scaleId, action: "install.update", summary: { startsWith: link.cableId } } });
  const pass = rt.version === v0 + 1 && audits === audits0 + 1;
  results.push({ check: "double-click Mark installed: version +1, one audit row", pass, detail: `version ${v0}->${rt.version}, audit +${audits - audits0}` });
  expect(pass).toBe(true);
  await closeAll(context);
});

test("stale edit from a second session is refused as a conflict", async ({ browser }) => {
  const link = await plannedLink(0);
  const v0 = link.runtime!.version;
  // Same lead on two devices: only the scale project's lead is a member of it.
  const a = await contextAs(browser, NS("lead"));
  const b = await contextAs(browser, NS("lead"));
  await a.page.goto(`/app/projects/${scaleId}/cables/${link.id}?action=install`);
  await b.page.goto(`/app/projects/${scaleId}/cables/${link.id}?action=install`);
  await b.page.getByRole("button", { name: "Mark installed" }).click();
  await expect.poll(async () => (await runtimeOf(link.id)).version, { timeout: 15_000 }).toBe(v0 + 1);

  await a.page.getByRole("button", { name: "Mark installed" }).click();
  await expect(a.page.getByRole("alert").filter({ hasText: /updated elsewhere/i })).toBeVisible({ timeout: 15_000 });
  const rt = await runtimeOf(link.id);
  const pass = rt.version === v0 + 1 && rt.installStatus === "INSTALLED";
  results.push({ check: "stale second-session edit: conflict shown, first writer kept", pass, detail: `version ${v0}->${rt.version}` });
  expect(pass).toBe(true);
  await closeAll(a.context);
  await closeAll(b.context);
});

test("offline QR scan is queued on the device and synced on reconnect", async ({ browser }) => {
  const link = await plannedLink(0);
  const { context, page } = await contextAs(browser, NS("lead"));
  const uncaught = pageErrors(page);
  await page.goto(`/app/projects/${scaleId}/scan`);
  await context.setOffline(true);
  await page.getByLabel("Cable QR URL").fill(`/app/projects/${scaleId}/cables/${link.id}`);
  await page.getByRole("button", { name: "Open cable" }).click();
  await expect(page.getByText(/Offline — queued/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Queued offline items:")).toContainText("1", { timeout: 10_000 });
  await context.setOffline(false);
  await expect(page.getByText(/Synced 1\/1 items/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Queued offline items:")).toContainText("0");
  results.push({ check: "offline QR scan queued in IndexedDB, auto-synced on reconnect, queue cleared", pass: true });
  expect(uncaught).toEqual([]);
  await closeAll(context);
});

test("report generation failure (handover snapshot action returns 500) is reported, nothing created", async ({ browser }) => {
  const aiId = (await db.project.findFirstOrThrow({ where: { name: { startsWith: "AI/HPC Fabric" } } })).id;
  const snaps0 = await db.handoverSnapshot.count({ where: { projectId: aiId } });
  const { context, page } = await contextAs(browser, NS("lead"));
  await page.goto(`/app/projects/${aiId}/handover`);
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.fulfill({ status: 500, body: "boom" }) : route.continue(),
  );
  await page.getByRole("button", { name: "Create snapshot" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
  await page.unroute("**/*");
  expect(await db.handoverSnapshot.count({ where: { projectId: aiId } })).toBe(snaps0);
  results.push({ check: "handover snapshot failure: alert shown, no snapshot row", pass: true });
  await closeAll(context);
});

test("database unavailable: pages fail with a readable message and recover", async ({ browser }) => {
  test.skip(!process.env.SIT_DB_OUTAGE, "Set SIT_DB_OUTAGE=1 (blocks connections to rackpatch_sit only)");
  const { execSync } = await import("node:child_process");
  const psql = (sql: string) => execSync(`docker exec -i rackpatch-postgres-1 psql -U rackpatch -d postgres -v ON_ERROR_STOP=1`, { input: sql });
  const { context, page } = await contextAs(browser, NS("lead"));
  await page.goto(`/app/projects/${scaleId}`);
  const label = process.env.SIT_DB_OUTAGE_LABEL ?? "after fix";
  let health = 0;
  let status = 0;
  let readable = false;
  try {
    psql(`ALTER DATABASE rackpatch_sit ALLOW_CONNECTIONS false; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rackpatch_sit';`);
    health = (await page.request.get("/api/health", { timeout: 30_000 })).status();
    status = (await page.goto(`/app/projects/${scaleId}/cables`, { timeout: 30_000 }))?.status() ?? 0;
    readable = await page.getByRole("heading", { name: /could not load/i }).isVisible();
    await page.screenshot({ path: `docs/qa/raw/sit-db-outage-${label.replace(/\W+/g, "-")}.png` });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 240);
    results.push({ check: `database outage (${label}): page state`, pass: readable, detail: `health ${health}; page HTTP ${status}; body: ${text}` });
  } finally {
    psql(`ALTER DATABASE rackpatch_sit ALLOW_CONNECTIONS true;`);
  }
  expect(health).toBe(503);
  expect(status).toBeGreaterThanOrEqual(500);
  expect(readable).toBe(true);
  await expect.poll(async () => (await page.request.get("/api/health")).status(), { timeout: 30_000 }).toBe(200);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 30_000 });
  results.push({ check: `database outage (${label}): recovery via Try again`, pass: true });
  await closeAll(context);
});

test("offline navigation recovers", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("lead"));
  const uncaught = pageErrors(page);
  await page.goto(`/app/projects/${scaleId}`);
  await context.setOffline(true);
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Cable Plan", exact: true }).click().catch(() => {});
  await page.waitForTimeout(2000);
  await context.setOffline(false);
  await page.goto(`/app/projects/${scaleId}/cables`);
  await expect(page.locator("main h1").first()).toBeVisible();
  results.push({ check: "offline click then reconnect: page loads normally", pass: true, detail: uncaught.join(" | ") || undefined });
  await closeAll(context);
});

test("invalid and oversized input is rejected cleanly", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("lead"));
  const uncaught = pageErrors(page);
  await page.goto(`/app/projects/${scaleId}/plan`);
  await page.getByLabel("Paste CSV").fill("foo,bar\n1,2\n");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText(/required|missing|map/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Publish revision" })).toBeDisabled();
  results.push({ check: "CSV without required columns: errors shown, publish disabled", pass: true });

  // Large pastes are set in one input event (as a real paste is), not typed by Playwright.
  async function paste(chars: number) {
    await page.goto(`/app/projects/${scaleId}/lldp`);
    await page.getByPlaceholder("e.g. Leaf-02").fill("LEAF-S01");
    const ms = await page.getByPlaceholder(/Paste show lldp neighbors detail/).evaluate((el, n) => {
      const t0 = performance.now();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(el, "Local Intf: Eth1/1\n".repeat(Math.ceil(n / 19)).slice(0, n));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return performance.now() - t0;
    }, chars);
    await page.getByRole("button", { name: "Preview parse" }).click();
    await expect(page.getByRole("button", { name: "Preview parse" })).toBeEnabled({ timeout: 60_000 });
    const alert = (await page.getByRole("alert").allInnerTexts()).join(" ").trim();
    const parsed = await page.getByText("Ready", { exact: true }).count();
    return { ms: Math.round(ms), alert, parsed };
  }
  const near = await paste(1_900_000);
  results.push({ check: "1.9 MB LLDP paste (under 2,000,000-char limit) reaches the parser", pass: !/server rejected/i.test(near.alert), detail: `input ${near.ms} ms; alert: ${near.alert || "none"}; preview shown: ${near.parsed > 0}` });
  expect(near.alert).not.toMatch(/server rejected/i);
  const over = await paste(2_100_000);
  results.push({ check: "2.1 MB LLDP paste (over limit) is refused with a message", pass: over.alert.length > 0, detail: over.alert });
  expect(over.alert.length).toBeGreaterThan(0);
  await expect(page.locator("main h1").first()).toBeVisible();

  // Field photo inside the 1.5 MB app limit is accepted (server-action body limit must allow it).
  const rev = (await db.project.findUniqueOrThrow({ where: { id: scaleId } })).activeRevisionId!;
  const installed = await db.plannedLink.findFirstOrThrow({ where: { revisionId: rev, runtime: { installStatus: "INSTALLED" } }, orderBy: { cableId: "desc" } });
  await page.goto(`/app/projects/${scaleId}/cables/${installed.id}`);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), Buffer.alloc(1_200_000, 0x20), Buffer.from([0xff, 0xd9])]);
  const photos0 = await db.fieldPhoto.count({ where: { plannedLinkId: installed.id } });
  await page.getByLabel("Field photo").setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await expect.poll(() => db.fieldPhoto.count({ where: { plannedLinkId: installed.id } }), { timeout: 20_000 }).toBe(photos0 + 1);
  results.push({ check: "1.2 MB field photo (within 1.5 MB limit) stored", pass: true });

  // QR scanning needs camera access on our own origin.
  await page.goto(`/app/projects/${scaleId}/scan`);
  const cam = await page.evaluate(() => (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy?.allowsFeature("camera"));
  results.push({ check: "Permissions-Policy allows camera on self (QR scanner)", pass: cam === true, detail: String(cam) });
  expect(cam).toBe(true);

  const res = await page.goto(`/app/projects/does-not-exist`);
  expect(res?.status() ?? 0).toBeLessThan(500);
  results.push({ check: "unknown project id: no 5xx", pass: true, detail: String(res?.status()) });
  results.push({ check: "no uncaught page errors", pass: uncaught.length === 0, detail: uncaught.join(" | ") || undefined });
  expect(uncaught).toEqual([]);
  await closeAll(context);
});
