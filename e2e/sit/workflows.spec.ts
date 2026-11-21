import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, sitDb, watchErrors } from "./helpers";

/**
 * SIT end-to-end workflows A–G (success + failure paths), asserted against the SIT database.
 * SIT=1 E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/sit/workflows.spec.ts --workers=1
 */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(300_000);

const db = sitDb();
const stamp = Date.now().toString(36);
const PROJECT = `SIT Workflow ${stamp}`;
let projectId = "";
let aiProjectId = "";
const pageErrors: string[] = [];

test.beforeAll(async ({ baseURL }) => {
  assertSitTarget(baseURL);
  const ai = await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  aiProjectId = ai.id;
});

test.afterAll(() => {
  fs.mkdirSync("docs/qa/raw", { recursive: true });
  fs.writeFileSync("docs/qa/raw/sit-workflow-errors.json", JSON.stringify(pageErrors, null, 2));
});

function track(page: Page, label: string) {
  const errs = watchErrors(page);
  return () => errs.map((e) => `${label}: ${e}`);
}

async function pasteCsvAndPreview(page: Page, csv: string) {
  await page.getByLabel("Paste CSV").fill(csv);
  await page.getByRole("button", { name: "Preview import" }).click();
}

test("A. cable planning: create project, gate, validate, publish, reload", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("owner"));
  const errs = track(page, "A");
  await page.goto("/app#create");
  const form = page.locator("form").filter({ has: page.getByPlaceholder("Project name") });
  const ownerUser = await db.user.findUniqueOrThrow({ where: { email: NS("owner") } });
  const ws = await db.workspaceMembership.findFirstOrThrow({ where: { userId: ownerUser.id, role: "OWNER" } });
  await form.getByLabel("Workspace").selectOption(ws.workspaceId);
  await form.getByPlaceholder("Project name").fill(PROJECT);
  await form.getByPlaceholder("Site / location").fill("SIT Lab");
  await form.getByRole("button", { name: "Create project" }).click();
  await expect.poll(async () => (await db.project.findFirst({ where: { name: PROJECT } }))?.id ?? "", { timeout: 20_000 }).not.toBe("");
  projectId = (await db.project.findFirstOrThrow({ where: { name: PROJECT } })).id;

  // Failure path 1 (hosted mode): an unactivated project cannot import a plan.
  await page.goto(`/app/projects/${projectId}/plan`);
  await expect(page.getByText("View only")).toBeVisible();
  await expect(page.getByLabel("Paste CSV")).toHaveCount(0);
  await closeAll(context);

  // Platform admin records activation.
  const admin = await contextAs(browser, "admin@rackpatch.local");
  await admin.page.goto("/app/admin");
  const opt = admin.page.locator('select[name="projectId"] option', { hasText: PROJECT });
  await admin.page.locator('select[name="projectId"]').selectOption(await opt.getAttribute("value"));
  await admin.page.getByLabel("Activation note").fill("SIT activation");
  await admin.page.getByRole("button", { name: "Record activation" }).click();
  await expect.poll(async () => (await db.project.findUniqueOrThrow({ where: { id: projectId } })).commercialStatus, { timeout: 20_000 }).toBe("PILOT");
  await closeAll(admin.context);

  const owner = await contextAs(browser, NS("owner"));
  const p = owner.page;
  const errs2 = track(p, "A2");
  await p.goto(`/app/projects/${projectId}/plan`);
  // Failure path 2: duplicate cable ID is rejected with its line number; publish stays disabled.
  await pasteCsvAndPreview(p, fs.readFileSync("fixtures/demos/ai-hpc/pod-a-duplicate-cable-id.csv", "utf8"));
  await expect(p.getByText(/Line 7:/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Publish revision" })).toBeDisabled();
  // Success path.
  await pasteCsvAndPreview(p, fs.readFileSync("fixtures/demo-cables.csv", "utf8"));
  await expect(p.getByText("Ready", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Publish revision" }).click();
  await p.waitForURL(new RegExp(`/app/projects/${projectId}$`), { timeout: 30_000 });
  const proj = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  expect(proj.activeRevisionId).toBeTruthy();
  expect(await db.plannedLink.count({ where: { revisionId: proj.activeRevisionId! } })).toBe(9);
  await p.goto(`/app/projects/${projectId}/cables`);
  await p.reload();
  await expect(p.getByText("C-205").first()).toBeVisible();
  await p.goto(`/app/projects/${projectId}/racks`);
  await expect(p.getByText("No racks yet")).toBeVisible();
  await expect(p.getByRole("link", { name: "Open inventory" })).toBeVisible();
  pageErrors.push(...errs(), ...errs2());
  await closeAll(owner.context);
});

test("C+D. LLDP import detects swapped cables; corrected evidence re-verifies", async ({ browser }) => {
  test.skip(!projectId, "needs workflow A");
  const { context, page } = await contextAs(browser, NS("owner"));
  const errs = track(page, "CD");
  const swapped = fs.readFileSync("fixtures/demo-lldp-leaf02.txt", "utf8");
  await page.goto(`/app/projects/${projectId}/lldp`);
  // Failure path: unsupported / garbage output is reported, not imported as verified.
  await page.getByPlaceholder("e.g. Leaf-02").fill("Leaf-02");
  await page.getByPlaceholder(/Paste show lldp neighbors detail/).fill("this is not lldp output\n%%%\n");
  await page.getByRole("button", { name: "Preview parse" }).click();
  await expect(page.getByText(/no neighbo|could not|unrecognized|unsupported|0 neighbo|failed/i).first()).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder(/Paste show lldp neighbors detail/).fill(swapped);
  await page.getByRole("button", { name: "Preview parse" }).click();
  await expect(page.getByRole("cell", { name: "GPU-06" }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Import evidence" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}/exceptions$`), { timeout: 30_000 });
  const rev = (await db.project.findUniqueOrThrow({ where: { id: projectId } })).activeRevisionId!;
  const stateOf = async (cable: string) =>
    (await db.verificationFinding.findFirst({ where: { revisionId: rev, plannedLink: { cableId: cable } } }))?.state ?? "NONE";
  await expect.poll(() => stateOf("C-201"), { timeout: 30_000 }).toBe("MISMATCH");
  expect(await stateOf("C-202")).toBe("MISMATCH");
  const ex = await db.verificationFinding.findFirstOrThrow({ where: { revisionId: rev, plannedLink: { cableId: "C-201" } } });

  // Exception: assign corrective action owner + due date.
  await page.goto(`/app/projects/${projectId}/exceptions?ex=${ex.id}`);
  const tech = await db.user.findUniqueOrThrow({ where: { email: NS("owner") } });
  await page.getByLabel("Assignee").selectOption(tech.id);
  await page.getByLabel("Due date").fill("2026-12-31");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await db.verificationFinding.findUniqueOrThrow({ where: { id: ex.id } })).assigneeId, { timeout: 15_000 }).toBe(tech.id);

  // Corrected evidence (the two GPU neighbours swapped back) re-verifies both cables.
  const corrected = swapped.replace("System Name: GPU-06", "System Name: __TMP__").replace("System Name: GPU-05", "System Name: GPU-06").replace("System Name: __TMP__", "System Name: GPU-05");
  await page.goto(`/app/projects/${projectId}/lldp`);
  await page.getByPlaceholder("e.g. Leaf-02").fill("Leaf-02");
  await page.getByPlaceholder(/Paste show lldp neighbors detail/).fill(corrected);
  await page.getByRole("button", { name: "Import evidence" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}/exceptions$`), { timeout: 30_000 });
  await expect.poll(() => stateOf("C-201"), { timeout: 30_000 }).toBe("VERIFIED_LLDP");
  expect(await stateOf("C-202")).toBe("VERIFIED_LLDP");
  pageErrors.push(...errs());
  await closeAll(context);
});

test("B. installation: open via QR link, record install, evidence photo, blocked needs reason", async ({ browser }) => {
  const rev = (await db.project.findUniqueOrThrow({ where: { id: aiProjectId } })).activeRevisionId!;
  let link = await db.plannedLink.findFirst({
    where: { revisionId: rev, OR: [{ runtime: { is: null } }, { runtime: { installStatus: { not: "INSTALLED" } } }] },
    orderBy: { cableId: "asc" },
  });
  if (!link) {
    // Earlier SIT runs installed every cable; return one to PLANNED (SIT database only).
    link = await db.plannedLink.findFirstOrThrow({ where: { revisionId: rev }, orderBy: { cableId: "desc" } });
    await db.linkRuntime.update({
      where: { plannedLinkId: link.id },
      data: { installStatus: "PLANNED", installerId: null, installedAt: null, version: { increment: 1 } },
    });
  }
  const { context, page } = await contextAs(browser, NS("tech"));
  const errs = track(page, "B");
  await page.goto(`/app/projects/${aiProjectId}/scan`);
  await page.getByLabel("Cable QR URL").fill(`/app/projects/${aiProjectId}/cables/${link.id}`);
  await page.getByRole("button", { name: "Open cable" }).click();
  await page.waitForURL(new RegExp(`/cables/${link.id}`));
  await page.goto(`/app/projects/${aiProjectId}/cables/${link.id}?action=install`);

  // Failure path: Blocked without a reason is refused and nothing is written.
  const runtimeBefore = await db.linkRuntime.findUnique({ where: { plannedLinkId: link.id } });
  await page.getByRole("button", { name: "Mark blocked" }).click();
  await expect(page.getByText(/short reason is required/i)).toBeVisible();
  const runtimeAfter = await db.linkRuntime.findUnique({ where: { plannedLinkId: link.id } });
  expect(runtimeAfter?.version ?? 0).toBe(runtimeBefore?.version ?? 0);
  expect(runtimeAfter?.installStatus ?? "PLANNED").toBe(runtimeBefore?.installStatus ?? "PLANNED");

  await page.getByRole("button", { name: "Mark installed" }).click();
  const tech = await db.user.findUniqueOrThrow({ where: { email: NS("tech") } });
  await expect.poll(async () => (await db.linkRuntime.findUnique({ where: { plannedLinkId: link.id } }))?.installStatus, { timeout: 15_000 }).toBe("INSTALLED");
  expect((await db.linkRuntime.findUniqueOrThrow({ where: { plannedLinkId: link.id } })).installerId).toBe(tech.id);

  // Evidence photo: a real 1x1 PNG is stored; a non-image file is rejected.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const before = await db.fieldPhoto.count({ where: { plannedLinkId: link.id } });
  await page.getByLabel("Field photo").setInputFiles({ name: "evidence.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => db.fieldPhoto.count({ where: { plannedLinkId: link.id } }), { timeout: 15_000 }).toBe(before + 1);
  await page.getByLabel("Field photo").setInputFiles({ name: "malware.png", mimeType: "image/png", buffer: Buffer.from("MZ this is not an image") });
  await expect(page.getByText(/not a valid|invalid|unsupported|could not|failed|must be/i).first()).toBeVisible({ timeout: 15_000 });
  expect(await db.fieldPhoto.count({ where: { plannedLinkId: link.id } })).toBe(before + 1);

  await page.reload();
  await expect(page.getByText("Installed").first()).toBeVisible();
  expect(await db.auditEvent.count({ where: { projectId: aiProjectId, actorId: tech.id, action: { startsWith: "install." } } })).toBeGreaterThan(0);
  pageErrors.push(...errs());
  await closeAll(context);
});

test("E. independent QC: installer cannot QC own work; reject needs note; accept recorded with audit", async ({ browser }) => {
  const tech = await db.user.findUniqueOrThrow({ where: { email: NS("tech") } });
  const qcUser = await db.user.findUniqueOrThrow({ where: { email: NS("qc") } });
  const rev = (await db.project.findUniqueOrThrow({ where: { id: aiProjectId } })).activeRevisionId!;
  const own = await db.plannedLink.findFirstOrThrow({ where: { revisionId: rev, runtime: { installerId: tech.id, installStatus: "INSTALLED" } } });

  const techCtx = await contextAs(browser, NS("tech"));
  await techCtx.page.goto(`/app/projects/${aiProjectId}/qc?item=${own.id}`);
  await expect(techCtx.page.getByText(own.cableId).first()).toBeVisible();
  await expect(techCtx.page.getByText("Record QC result")).toHaveCount(0);
  await closeAll(techCtx.context);

  const { context, page } = await contextAs(browser, NS("qc"));
  const errs = track(page, "E");
  await page.goto(`/app/projects/${aiProjectId}/qc?item=${own.id}`);
  await expect(page.getByText("Record QC result")).toBeVisible();
  await page.getByLabel(/Z end correct/).uncheck();
  const reject = page.getByRole("button", { name: /reject/i });
  await expect(reject).toBeDisabled();
  await page.getByPlaceholder(/Required: what is wrong/).fill("Z end landed in the wrong port");
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect.poll(async () => (await db.physicalVerification.findFirst({ where: { plannedLinkId: own.id, verifierId: qcUser.id }, orderBy: { verifiedAt: "desc" } }))?.id ?? "", { timeout: 15_000 }).not.toBe("");
  const rejected = await db.physicalVerification.findFirstOrThrow({ where: { plannedLinkId: own.id, verifierId: qcUser.id }, orderBy: { verifiedAt: "desc" } });
  expect(rejected.zConfirmed).toBe(false);
  expect(await db.auditEvent.count({ where: { projectId: aiProjectId, actorId: qcUser.id, action: "verify.physical_reject" } })).toBeGreaterThan(0);

  // Accept path on another installed cable that the QC user did not install.
  const other = await db.plannedLink.findFirstOrThrow({
    where: { revisionId: rev, id: { not: own.id }, runtime: { installStatus: "INSTALLED", installerId: { notIn: [qcUser.id] } } },
    orderBy: { cableId: "desc" },
  });
  await page.goto(`/app/projects/${aiProjectId}/qc?item=${other.id}`);
  await page.getByRole("button", { name: "Accept both ends" }).click();
  await expect
    .poll(async () => (await db.physicalVerification.findFirst({ where: { plannedLinkId: other.id, verifierId: qcUser.id, aConfirmed: true, zConfirmed: true } }))?.id ?? "", { timeout: 15_000 })
    .not.toBe("");
  pageErrors.push(...errs());
  await closeAll(context);
});

test("F. handover: blocked owner sign-off, CSV package and snapshot", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("lead"));
  const errs = track(page, "F");
  await page.goto(`/app/projects/${aiProjectId}/handover`);
  await expect(page.getByRole("region", { name: "Staged approvals" }).or(page.locator('[aria-label="Staged approvals"]'))).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("button", { name: "Download CSV" }).click()]);
  const csv = fs.readFileSync((await download.path())!, "utf8");
  expect(csv.split(/\r?\n/).length).toBeGreaterThan(100);
  const before = await db.handoverSnapshot.count({ where: { projectId: aiProjectId } });
  await page.getByPlaceholder("Snapshot title (optional)").fill(`SIT package ${stamp}`);
  await page.getByRole("button", { name: /Create snapshot/ }).click();
  await expect.poll(() => db.handoverSnapshot.count({ where: { projectId: aiProjectId } }), { timeout: 20_000 }).toBe(before + 1);
  pageErrors.push(...errs());
  await closeAll(context);
});

test("G. AI/HPC demo: fabrics, GPU trace, raw evidence, playback permissions", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("lead"));
  const errs = track(page, "G");
  await page.goto(`/app/projects/${aiProjectId}/fabric`);
  await expect(page.getByRole("group", { name: /Topology of/ })).toBeVisible();
  for (const f of ["Front-end", "Back-end"]) await expect(page.getByRole("link", { name: f, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back-end", exact: true }).click();
  await expect(page).toHaveURL(/\/fabric\/be$/);
  await expect(page.getByRole("link", { name: /^BE-LEAF-01/ }).first()).toBeVisible();
  const gpu = await db.deviceInventory.findFirstOrThrow({ where: { projectId: aiProjectId, role: { contains: "GPU", mode: "insensitive" } }, orderBy: { name: "asc" } });
  await page.goto(`/app/projects/${aiProjectId}/trace?from=${encodeURIComponent(gpu.name)}`);
  await expect(page.getByRole("link", { name: /CBL-/ }).first()).toBeVisible();
  await page.goto(`/app/projects/${aiProjectId}/evidence/explorer`);
  await expect(page.getByText(/SHA-256 matches stored capture|Raw text differs/).first()).toBeVisible();
  await expect(page.getByText("This is not a live SSH collection", { exact: false }).first()).toBeVisible();
  await closeAll(context);

  const viewer = await contextAs(browser, NS("viewer"));
  await viewer.page.goto(`/app/projects/${aiProjectId}/evidence/explorer`);
  await expect(viewer.page.getByText("Only a project lead can switch playback.")).toBeVisible();
  await closeAll(viewer.context);
  pageErrors.push(...errs());
});

test("no uncaught page errors during workflows", () => {
  expect(pageErrors).toEqual([]);
});
