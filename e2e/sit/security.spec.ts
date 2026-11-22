import { expect, test, type APIRequestContext, type Request } from "@playwright/test";
import { request as pwRequest } from "@playwright/test";
import fs from "node:fs";
import { NS, SIT_ENABLED, assertSitTarget, closeAll, contextAs, resolvePrivateTarget, sitDb, writeResult } from "./helpers";

/**
 * SIT security: direct server-action replay, CSRF origin check, API auth, session expiry, role UI.
 * Every negative replay is paired with a positive control so a "blocked" result cannot come from a broken replay.
 */
test.skip(!SIT_ENABLED, "Set SIT=1 (isolated rackpatch_sit DB + SIT server)");
test.setTimeout(300_000);

const db = sitDb();
const results: Array<{ check: string; status: number | string; dbUnchanged?: boolean; pass: boolean }> = [];
let aiProjectId = "";
let baseURL = "";

test.beforeAll(async ({ baseURL: b }) => {
  assertSitTarget(b);
  baseURL = b!;
  aiProjectId = (await db.project.findFirstOrThrow({ where: { isDemo: true, workspace: { slug: "northstar-ai-demo" } } })).id;
});

test.afterEach(() => {
  const file = "docs/qa/raw/sit-security.json";
  const prior = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as typeof results) : [];
  const merged = new Map(prior.map((r) => [r.check, r]));
  for (const r of results) merged.set(r.check, r);
  writeResult("sit-security", [...merged.values()]);
});

type Captured = { url: string; headers: Record<string, string>; body: string };

async function replay(ctx: APIRequestContext, cap: Captured, args: unknown[], extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  for (const k of ["next-action", "next-router-state-tree", "accept", "content-type"]) if (cap.headers[k]) headers[k] = cap.headers[k];
  headers.origin = baseURL.replace(/\/$/, "");
  Object.assign(headers, extraHeaders);
  const res = await ctx.post(cap.url, { headers, data: JSON.stringify(args), failOnStatusCode: false, maxRedirects: 0 });
  return res.status();
}

test("server-action replay: viewer, cross-workspace, anonymous and forged-origin cannot change install status", async ({ browser }) => {
  const rev = (await db.project.findUniqueOrThrow({ where: { id: aiProjectId } })).activeRevisionId!;
  const link = await db.plannedLink.findFirstOrThrow({ where: { revisionId: rev, runtime: { installStatus: "INSTALLED" } }, orderBy: { cableId: "asc" }, include: { runtime: true } });

  // Capture the lead's real "Mark blocked" server-action request.
  const lead = await contextAs(browser, NS("lead"));
  let cap: Captured | null = null;
  lead.page.on("request", (r: Request) => {
    if (r.method() === "POST" && r.headers()["next-action"] && (r.postData() ?? "").includes(link.id)) cap = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
  });
  await lead.page.goto(`/app/projects/${aiProjectId}/cables/${link.id}?action=install`);
  await lead.page.getByLabel("Blocked reason").fill("SIT capture");
  await lead.page.getByRole("button", { name: "Mark blocked" }).click();
  await expect.poll(async () => (await db.linkRuntime.findUniqueOrThrow({ where: { plannedLinkId: link.id } })).installStatus, { timeout: 15_000 }).toBe("BLOCKED");
  expect(cap).not.toBeNull();
  const captured = cap as unknown as Captured;
  const original = JSON.parse(captured.body) as Array<Record<string, unknown>>;

  const snapshot = async () => {
    const r = await db.linkRuntime.findUniqueOrThrow({ where: { plannedLinkId: link.id } });
    return `${r.installStatus}:${r.version}`;
  };

  async function attempt(label: string, ctx: APIRequestContext, extra: Record<string, string> = {}) {
    const before = await snapshot();
    const version = Number(before.split(":")[1]);
    const status = await replay(ctx, captured, [{ ...original[0], status: "PLANNED", blockedReason: undefined, expectedVersion: version }], extra);
    const after = await snapshot();
    const unchanged = before === after;
    results.push({ check: label, status, dbUnchanged: unchanged, pass: unchanged });
    expect(unchanged, `${label}: install status changed (${before} -> ${after}), HTTP ${status}`).toBe(true);
  }

  const viewer = await contextAs(browser, NS("viewer"));
  await attempt("replay as viewer", viewer.context.request);
  const other = await contextAs(browser, "lead@demo.rackpatch.local");
  await attempt("replay as cross-workspace lead", other.context.request);
  const anon = await pwRequest.newContext({ baseURL });
  await attempt("replay anonymous", anon);
  await attempt("replay as lead with forged Origin (CSRF)", lead.context.request, { origin: "https://evil.example" });

  // Positive control: the identical replay by the lead with a correct Origin succeeds.
  const before = await snapshot();
  const status = await replay(lead.context.request, captured, [{ ...original[0], status: "INSTALLED", blockedReason: undefined, expectedVersion: Number(before.split(":")[1]) }]);
  const after = await snapshot();
  results.push({ check: "control: lead replay with valid origin", status, pass: after.startsWith("INSTALLED") });
  expect(after.startsWith("INSTALLED"), `control replay failed: ${before} -> ${after} HTTP ${status}`).toBe(true);

  await anon.dispose();
  await closeAll(viewer.context, other.context, lead.context);
});

test("server-action replay: cable details are not readable across workspaces or anonymously", async ({ browser }) => {
  const priv = await resolvePrivateTarget();
  const target = await db.verificationFinding.findFirstOrThrow({
    where: { revisionId: priv.revisionId, nextAction: { not: null } },
    select: { plannedLinkId: true, nextAction: true },
  });
  const marker = target.nextAction!;

  const lead = await contextAs(browser, NS("lead"));
  let cap: Captured | null = null;
  lead.page.on("request", (r: Request) => {
    if (r.method() === "POST" && r.headers()["next-action"] && (r.postData() ?? "").includes('"linkId"')) cap = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
  });
  await lead.page.goto(`/app/projects/${priv.projectId}/cables`);
  await expect.poll(() => cap !== null, { timeout: 15_000 }).toBe(true);
  const captured = cap as unknown as Captured;
  const args = [{ projectId: priv.projectId, linkId: target.plannedLinkId }];

  async function read(label: string, ctx: APIRequestContext, expectLeak: boolean) {
    const headers: Record<string, string> = { origin: baseURL.replace(/\/$/, "") };
    for (const k of ["next-action", "next-router-state-tree", "accept", "content-type"]) if (captured.headers[k]) headers[k] = captured.headers[k];
    const res = await ctx.post(captured.url, { headers, data: JSON.stringify(args), failOnStatusCode: false, maxRedirects: 0 });
    const leaked = (await res.text()).includes(marker);
    const pass = leaked === expectLeak;
    results.push({ check: label, status: res.status(), pass });
    expect(pass, `${label}: detail text ${leaked ? "returned" : "not returned"} (HTTP ${res.status()})`).toBe(true);
  }

  await read("control: lead reads cable details", lead.context.request, true);
  const other = await contextAs(browser, "lead@demo.rackpatch.local");
  await read("cable details as cross-workspace lead", other.context.request, false);
  const anon = await pwRequest.newContext({ baseURL });
  await read("cable details anonymous", anon, false);
  await anon.dispose();
  await closeAll(lead.context, other.context);
});

test("API authentication and authorization", async ({ browser }) => {
  const anon = await pwRequest.newContext({ baseURL });
  const priv = await resolvePrivateTarget();
  const photo = await db.fieldPhoto.findFirst({ where: { projectId: aiProjectId } });
  const privPhoto = await db.fieldPhoto.findFirst({ where: { projectId: priv.projectId } });
  const checks: Array<[string, () => Promise<number>, number[]]> = [
    ["v1 summary without token", async () => (await anon.get(`/api/v1/projects/${aiProjectId}/summary`)).status(), [401]],
    ["v1 cables with malformed token", async () => (await anon.get(`/api/v1/projects/${aiProjectId}/cables`, { headers: { authorization: "Bearer nope" } })).status(), [401]],
    ["v1 cables with unknown well-formed token", async () => (await anon.get(`/api/v1/projects/${aiProjectId}/cables`, { headers: { authorization: "Bearer rp_live_0000000000000000000000000000" } })).status(), [401]],
    ["v1 gitops without token", async () => (await anon.get(`/api/v1/projects/${aiProjectId}/gitops`)).status(), [401]],
    ["me/search anonymous", async () => (await anon.get(`/api/me/search?q=CBL`)).status(), [401]],
    ["me/notifications anonymous", async () => (await anon.get(`/api/me/notifications`)).status(), [401]],
    ["internal compliance without secret", async () => (await anon.post(`/api/internal/compliance-check`)).status(), [401, 503]],
    ["internal compliance with wrong secret", async () => (await anon.post(`/api/internal/compliance-check`, { headers: { "x-compliance-secret": "wrong" } })).status(), [401, 503]],
  ];
  if (photo) checks.push(["field photo anonymous", async () => (await anon.get(`/api/field-photos/${photo.id}`)).status(), [401]]);

  // Cross-workspace checks target a private project: the AI/HPC demo is shared read-only with every user.
  const other = await contextAs(browser, "lead@demo.rackpatch.local");
  checks.push(["v1 summary as cross-workspace session", async () => (await other.context.request.get(`/api/v1/projects/${priv.projectId}/summary`)).status(), [403]]);
  if (privPhoto) checks.push(["field photo as cross-workspace session", async () => (await other.context.request.get(`/api/field-photos/${privPhoto.id}`)).status(), [403]]);
  const q = encodeURIComponent(priv.cableId);
  const lead = await contextAs(browser, NS("lead"));
  const control = (await (await lead.context.request.get(`/api/me/search?q=${q}&projectId=${priv.projectId}`)).json()) as { hits: unknown[] };
  results.push({ check: "control: member search finds the private project's cable", status: 200, pass: control.hits.length > 0 });
  expect(control.hits.length).toBeGreaterThan(0);
  const search = await other.context.request.get(`/api/me/search?q=${q}&projectId=${priv.projectId}`);
  const searchBody = (await search.json()) as { hits: unknown[] };
  results.push({ check: "me/search cross-workspace returns no private-project hits", status: search.status(), pass: searchBody.hits.length === 0 });
  expect(searchBody.hits).toHaveLength(0);
  await closeAll(lead.context);

  for (const [label, run, ok] of checks) {
    const status = await run();
    results.push({ check: label, status, pass: ok.includes(status) });
    expect(ok, `${label} returned ${status}`).toContain(status);
  }
  await anon.dispose();
  await closeAll(other.context);
});

test("session revocation signs the user out", async ({ browser }) => {
  const { context, page } = await contextAs(browser, NS("engineer"));
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app/);
  const user = await db.user.findUniqueOrThrow({ where: { email: NS("engineer") } });
  const removed = await db.session.deleteMany({ where: { userId: user.id } });
  // Better Auth cookieCache (maxAge 5 min) keeps the identity until the signed cache cookie expires.
  await page.goto(`/app/projects/${aiProjectId}`);
  results.push({ check: "revoked session within 5-min cookie-cache window (documented P3)", status: /sign-in/.test(page.url()) ? "signed out" : "still signed in", pass: true });
  const cache = (await context.cookies()).filter((c) => c.name.includes("session_data"));
  expect(cache.length, "expected a Better Auth session_data cache cookie").toBeGreaterThan(0);
  await context.clearCookies({ name: cache[0].name });
  await page.goto(`/app/projects/${aiProjectId}`);
  const signedOut = /sign-in/.test(page.url());
  results.push({ check: `revoked session (${removed.count} rows) rejected once cache cookie expires`, status: page.url(), pass: signedOut });
  expect(signedOut).toBe(true);
  await closeAll(context);
});

test("viewer and contractor UI hide restricted actions", async ({ browser }) => {
  const rev = (await db.project.findUniqueOrThrow({ where: { id: aiProjectId } })).activeRevisionId!;
  const link = await db.plannedLink.findFirstOrThrow({ where: { revisionId: rev }, orderBy: { cableId: "asc" } });
  const viewer = await contextAs(browser, NS("viewer"));
  await viewer.page.goto(`/app/projects/${aiProjectId}/cables/${link.id}?action=install`);
  await expect(viewer.page.getByRole("button", { name: "Mark installed" })).toHaveCount(0);
  await viewer.page.goto(`/app/projects/${aiProjectId}/plan`);
  await expect(viewer.page.getByLabel("Paste CSV")).toHaveCount(0);
  results.push({ check: "viewer: no install buttons, no plan import", status: "ui", pass: true });

  const contractor = await contextAs(browser, NS("contractor"));
  await contractor.page.goto(`/app/projects/${aiProjectId}/plan`);
  await expect(contractor.page.getByLabel("Paste CSV")).toHaveCount(0);
  await contractor.page.goto(`/app/projects/${aiProjectId}/handover`);
  await expect(contractor.page.getByRole("button", { name: /Create snapshot/ })).toHaveCount(0);
  results.push({ check: "contractor: no plan import, no handover snapshot", status: "ui", pass: true });
  await closeAll(viewer.context, contractor.context);
});

test("security response headers", async () => {
  const anon = await pwRequest.newContext({ baseURL });
  const res = await anon.get("/sign-in");
  const h = res.headers();
  const want = ["content-security-policy", "x-content-type-options", "referrer-policy"];
  for (const k of want) {
    results.push({ check: `header ${k}`, status: h[k] ? "present" : "missing", pass: !!h[k] });
    expect(h[k], `${k} missing`).toBeTruthy();
  }
  expect(h["x-powered-by"]).toBeUndefined();
  await anon.dispose();
});
