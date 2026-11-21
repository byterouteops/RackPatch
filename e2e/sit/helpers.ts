import { PrismaClient } from "@prisma/client";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";

/**
 * SIT runs only against the isolated `rackpatch_sit` database and the SIT server
 * (default http://localhost:3100). Never point these specs at a dev or production DB.
 */
export const SIT_ENABLED = !!process.env.SIT;
export const SIT_DB = process.env.SIT_DATABASE_URL ?? "postgresql://rackpatch:rackpatch@localhost:5432/rackpatch_sit?schema=public";

export function assertSitTarget(baseURL: string | undefined) {
  if (!/\/rackpatch_sit(\?|$)/.test(SIT_DB)) throw new Error(`SIT refused: database is not rackpatch_sit (${SIT_DB.replace(/:[^:@]+@/, ":***@")})`);
  if (!baseURL || !/localhost:3100|127\.0\.0\.1:3100/.test(baseURL)) throw new Error(`SIT refused: baseURL must be the SIT server on :3100 (got ${baseURL})`);
}

let client: PrismaClient | null = null;
export function sitDb() {
  client ??= new PrismaClient({ datasourceUrl: SIT_DB });
  return client;
}

export const PASSWORD = process.env.DEMO_PASSWORD ?? "password123";
export const NS = (role: string) => `${role}@demo.northstar.local`;

export let rateLimitHits = 0;

/** Retries when the auth rate limiter answers "Too many requests" (expected under rapid SIT sign-ins). */
export async function signIn(page: Page, email: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Password", exact: true }).click();
    await page.locator('input[name="email"]').first().fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    const limited = page.getByText("Too many requests", { exact: false });
    const outcome = await Promise.race([
      page.waitForURL(/\/app/, { timeout: 30_000 }).then(() => "ok" as const),
      limited.waitFor({ timeout: 30_000 }).then(() => "limited" as const),
    ]);
    if (outcome === "ok") return;
    rateLimitHits++;
    await page.waitForTimeout(11_000);
  }
  throw new Error(`Sign-in for ${email} still rate-limited after retries`);
}

export async function contextAs(browser: Browser, email: string | null, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  if (email) await signIn(page, email);
  return { context, page };
}

export type Ids = {
  aiProject: string;
  aiWorkspace: string;
  rackA: string;
  rackAWorkspace: string;
  link: string;
  snapshot: string | null;
  workOrder: string | null;
  rack: string;
  fabric: string;
};

export async function resolveIds(): Promise<Ids> {
  const db = sitDb();
  const ai = await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } });
  const other = await db.project.findFirstOrThrow({ where: { id: { not: ai.id }, workspace: { slug: { not: "northstar-ai-demo" } } }, orderBy: { createdAt: "asc" } });
  const link = await db.plannedLink.findFirstOrThrow({ where: { revisionId: ai.activeRevisionId! }, orderBy: { cableId: "asc" } });
  const snapshot = await db.handoverSnapshot.findFirst({ where: { projectId: ai.id }, orderBy: { createdAt: "desc" } });
  const workOrder = await db.workOrder.findFirst({ where: { projectId: ai.id } }).catch(() => null);
  const rack = await db.rack.findFirst({ where: { projectId: ai.id }, orderBy: { name: "asc" } });
  const fabricLink = await db.plannedLink.findFirst({ where: { revisionId: ai.activeRevisionId!, fabric: { not: null } } });
  return {
    aiProject: ai.id,
    aiWorkspace: ai.workspaceId,
    rackA: other.id,
    rackAWorkspace: other.workspaceId,
    link: link.id,
    snapshot: snapshot?.id ?? null,
    workOrder: workOrder?.id ?? null,
    rack: rack?.name ?? "R01",
    fabric: fabricLink?.fabric ?? "FE",
  };
}

/** Concrete URLs for every page route in docs/qa/sit-inventory.json. */
export function concreteRoutes(ids: Ids) {
  const inv = JSON.parse(fs.readFileSync("docs/qa/sit-inventory.json", "utf8")) as { pages: { route: string }[] };
  return inv.pages.map(({ route }) => {
    const url = route
      .replace("[projectId]", ids.aiProject)
      .replace("[linkId]", ids.link)
      .replace("[snapshotId]", ids.snapshot ?? "missing-snapshot")
      .replace("[workOrderId]", ids.workOrder ?? "missing-work-order")
      .replace("[rack]", encodeURIComponent(ids.rack))
      .replace("[fabric]", encodeURIComponent(ids.fabric))
      .replace("[workspaceId]", ids.aiWorkspace)
      .replace("[token]", "sit-invalid-token");
    return { route, url };
  });
}

/** Collects console errors and uncaught page errors for a page. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  return errors;
}

export function writeResult(name: string, data: unknown) {
  fs.mkdirSync("docs/qa/raw", { recursive: true });
  fs.writeFileSync(`docs/qa/raw/${name}.json`, JSON.stringify(data, null, 2) + "\n");
}

export async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
}
