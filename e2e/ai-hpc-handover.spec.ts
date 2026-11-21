import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Staged handover approvals on the synthetic AI/HPC demo. Opt-in: AI_HPC_E2E=1.
 * Creates a temporary snapshot on the demo project and deletes it (with its approvals) afterwards.
 */
test.skip(!process.env.AI_HPC_E2E, "Set AI_HPC_E2E=1 (requires the ai-hpc demo seed)");
test.setTimeout(240_000);

try {
  process.loadEnvFile(".env");
} catch {}
const prisma = new PrismaClient();
const PASSWORD = process.env.DEMO_PASSWORD ?? "password123";
let projectId = "";
let snapshotId = "";

test.beforeAll(async () => {
  const project = await prisma.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo", isDemo: true } } });
  const lead = await prisma.user.findUniqueOrThrow({ where: { email: "lead@demo.northstar.local" } });
  projectId = project.id;
  const snap = await prisma.handoverSnapshot.create({
    data: { projectId, createdById: lead.id, revisionId: project.activeRevisionId!, title: "E2E staged approval", payloadJson: "{}", hasUnresolvedExceptions: true, awaitingCount: 0, mismatchCount: 0 },
  });
  snapshotId = snap.id;
});

test.afterAll(async () => {
  if (snapshotId) await prisma.handoverSnapshot.delete({ where: { id: snapshotId } }).catch(() => {});
  await prisma.auditEvent.deleteMany({ where: { projectId, action: "handover.approve", summary: { endsWith: "on E2E staged approval" } } });
  await prisma.$disconnect();
});

async function as(browser: Browser, who: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Password", exact: true }).click();
  await page.locator('input[name="email"]').first().fill(`${who}@demo.northstar.local`);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
  await page.goto(`/app/projects/${projectId}/handover`);
  return page;
}

const stage = (page: Page, label: string) =>
  page.getByRole("region", { name: "Staged approvals" }).locator("li").filter({ has: page.getByText(label, { exact: true }) });

async function sign(page: Page, label: string) {
  await stage(page, label).getByRole("button", { name: "Sign" }).click();
  await stage(page, label).getByRole("button", { name: `Confirm ${label}` }).click();
  await expect(stage(page, label).getByRole("button", { name: "Sign" })).toHaveCount(0, { timeout: 30_000 });
}

test("installation, independent QC, engineering, then owner blocked by critical exceptions", async ({ browser }) => {
  const tech = await as(browser, "tech");
  await expect(stage(tech, "Independent QC")).toContainText("Sign Installation complete first");
  await sign(tech, "Installation complete");
  await tech.reload();
  await expect(stage(tech, "Independent QC")).toContainText("you signed the installation stage");

  const contractor = await as(browser, "contractor");
  await expect(stage(contractor, "Independent QC")).toContainText("Contractors cannot perform independent QC");

  const viewer = await as(browser, "viewer");
  await expect(stage(viewer, "Independent QC")).toContainText("Read-only members cannot sign");

  const qc = await as(browser, "qc");
  await sign(qc, "Independent QC");

  const engineer = await as(browser, "engineer");
  await sign(engineer, "Engineering acceptance");
  await expect(stage(engineer, "Owner acceptance")).toContainText("Only the workspace owner");

  const owner = await as(browser, "owner");
  await expect(stage(owner, "Owner acceptance")).toContainText(/critical exception\(s\) are open without an authorized waiver/);
  await expect(stage(owner, "Owner acceptance").getByRole("button", { name: "Sign" })).toHaveCount(0);
  await owner.screenshot({ path: "ui-audit-shots/shot_handover_staged.png", fullPage: true });

  const approvals = await prisma.handoverApproval.findMany({ where: { snapshotId }, select: { stage: true } });
  expect(approvals.map((a) => a.stage).sort()).toEqual(["ENGINEERING", "INDEPENDENT_QC", "INSTALLATION"]);
});
