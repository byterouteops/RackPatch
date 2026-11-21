/**
 * Northstar DC1 · AI/HPC Pod A demo seed (DEMO / SYNTHETIC DATA).
 *
 * Usage: DEMO_SEED=ai-hpc npm run demo:seed:ai-hpc [-- --refresh]
 *
 * Safety: touches only the `northstar-ai-demo` workspace (isDemo=true). Refuses to run if that
 * slug belongs to a non-demo workspace. Idempotent by content fingerprint; `--refresh` (or a
 * changed fingerprint) replaces only the demo project inside the demo workspace.
 */
import { createHash } from "crypto";
import { deflateSync } from "zlib";
import { InstallStatus, ProjectRole, WorkOrderStatus } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { recordAudit } from "../src/lib/audit";
import { importPlanCsv } from "../src/lib/csv/plan-import";
import { publishPlanRevision } from "../src/lib/plan/publish";
import { normalizeDevice, normalizePort } from "../src/lib/csv/normalize";
import { storeEvidence } from "../src/lib/evidence/store";
import { recomputeFindings } from "../src/lib/verify/recompute";
import { runComplianceCheck } from "../src/lib/compliance-run";
import { DEMO, buildTopology, planCsv } from "../src/lib/demo/ai-hpc/topology";
import { validateTopology } from "../src/lib/demo/ai-hpc/validate";
import { SNAPSHOTS, demoAliases, evidenceFiles, faultExpectations, type Snapshot } from "../src/lib/demo/ai-hpc/evidence";

const SEED_VERSION = "ai-hpc-v1";
const DEFAULT_SNAPSHOT: Snapshot = "FAULT_INJECTED";

export const DEMO_USERS = [
  { key: "owner", name: "Morgan Reyes", title: "Infrastructure Owner", projectRole: ProjectRole.LEAD, contractor: false },
  { key: "lead", name: "Priya Natarajan", title: "Network Engineering Lead", projectRole: ProjectRole.LEAD, contractor: false },
  { key: "tech", name: "Jonas Weber", title: "Installation Technician", projectRole: ProjectRole.TECHNICIAN, contractor: false },
  { key: "contractor", name: "Kai Okafor", title: "Cabling Contractor", projectRole: ProjectRole.TECHNICIAN, contractor: true },
  { key: "qc", name: "Lena Brandt", title: "Independent QC Verifier", projectRole: ProjectRole.TECHNICIAN, contractor: false },
  { key: "engineer", name: "Diego Alvarez", title: "Fabric Engineer", projectRole: ProjectRole.TECHNICIAN, contractor: false },
  { key: "viewer", name: "Sam Ortiz", title: "Customer Auditor (read-only)", projectRole: ProjectRole.VIEWER, contractor: false },
] as const;

export const demoEmail = (key: string) => `${key}@${DEMO.emailDomain}`;

export function seedFingerprint() {
  const h = createHash("sha256").update(SEED_VERSION).update(planCsv());
  for (const s of SNAPSHOTS) for (const f of evidenceFiles(s)) h.update(f.text);
  return h.digest("hex").slice(0, 12);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** Tiny solid-colour PNG with a darker label band (synthetic "photo"). */
function syntheticPng(rgb: [number, number, number], w = 160, h = 120) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const band = y > h * 0.4 && y < h * 0.6;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = band ? rgb[0] >> 1 : rgb[0];
      raw[o + 1] = band ? rgb[1] >> 1 : rgb[1];
      raw[o + 2] = band ? rgb[2] >> 1 : rgb[2];
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  if (process.env.DEMO_SEED !== "ai-hpc") {
    console.error("Refusing to seed: set DEMO_SEED=ai-hpc to load the synthetic AI/HPC demo.");
    process.exit(1);
  }
  const refresh = process.argv.includes("--refresh");
  const t = buildTopology();
  const issues = validateTopology(t);
  if (issues.length) {
    console.error(issues);
    throw new Error("Demo topology failed validation");
  }
  const fingerprint = seedFingerprint();
  const importKey = `${SEED_VERSION}-${fingerprint}`;

  const existingWs = await prisma.workspace.findUnique({ where: { slug: DEMO.workspaceSlug } });
  if (existingWs && !existingWs.isDemo) {
    throw new Error(`Workspace slug ${DEMO.workspaceSlug} exists and is not a demo workspace; refusing to touch it.`);
  }

  // Users (fictional, demo domain only).
  const users: Record<string, { id: string; name: string }> = {};
  for (const u of DEMO_USERS) {
    users[u.key] = await prisma.user.upsert({
      where: { email: demoEmail(u.key) },
      create: { email: demoEmail(u.key), name: u.name, emailVerified: true },
      update: { name: u.name },
      select: { id: true, name: true },
    });
  }

  // Local credential login (dev only); never replaces an existing credential.
  const { hashPassword } = await import("better-auth/crypto");
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD ?? "password123");
  for (const u of Object.values(users)) {
    const has = await prisma.account.findFirst({ where: { userId: u.id, providerId: "credential" } });
    if (!has) await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: "credential", password: passwordHash } });
  }

  const workspace =
    existingWs ??
    (await prisma.workspace.create({ data: { name: DEMO.workspaceName, slug: DEMO.workspaceSlug, isDemo: true } }));
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: users.owner.id } },
    create: { workspaceId: workspace.id, userId: users.owner.id, role: "OWNER" },
    update: {},
  });
  const site = await prisma.site.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: DEMO.siteSlug } },
    create: { workspaceId: workspace.id, name: DEMO.site, slug: DEMO.siteSlug },
    update: { name: DEMO.site },
  });

  const existing = await prisma.project.findFirst({ where: { workspaceId: workspace.id, name: DEMO.projectName, isDemo: true } });
  if (existing) {
    const same = await prisma.planRevision.findUnique({ where: { projectId_importKey: { projectId: existing.id, importKey } } });
    if (same && !refresh) {
      console.log(`AI/HPC demo already seeded (fingerprint ${fingerprint}); nothing to do. Use --refresh to rebuild.`);
      console.log(`Project id: ${existing.id}`);
      return;
    }
    console.log(same ? "Refreshing demo project (--refresh)..." : `Fingerprint changed; rebuilding demo project (${fingerprint})...`);
    await prisma.project.delete({ where: { id: existing.id } });
  }

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: DEMO.projectName,
      customerName: DEMO.customer,
      site: `${DEMO.site} \u2014 ${DEMO.location}`,
      siteId: site.id,
      timeZone: "UTC",
      commercialStatus: "PAID",
      isDemo: true,
      demoEvidenceSnapshot: DEFAULT_SNAPSHOT,
      memberships: {
        create: DEMO_USERS.map((u) => ({ userId: users[u.key].id, role: u.projectRole, contractor: u.contractor })),
      },
      compliancePolicy: { create: { enabled: true, maxEvidenceAgeDays: 7, notifyEmails: [], recomputeFindings: false } },
    },
  });
  const projectId = project.id;
  const lead = users.lead.id;

  await prisma.rack.createMany({
    data: t.racks.map((r) => ({ projectId, name: r.name, heightU: r.heightU, purpose: r.purpose, row: r.row, position: r.position })),
  });

  // Plan through the real importer + publisher.
  const csv = planCsv();
  const parsed = importPlanCsv(csv);
  if (parsed.errors.length) {
    console.error(parsed.errors.slice(0, 10));
    throw new Error("Demo plan CSV failed validation");
  }
  await publishPlanRevision({ projectId, actorId: lead, rows: parsed.rows, note: `${DEMO.projectCode} synthetic plan`, importKey, sourceCsv: csv });
  const active = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { activeRevisionId: true } });
  const revisionId = active.activeRevisionId!;
  const links = await prisma.plannedLink.findMany({ where: { revisionId }, include: { runtime: true } });
  const byCable = new Map(links.map((l) => [l.cableId, l]));

  // Inventory with rack placement and full interface list.
  const cableAt = new Map<string, string>();
  for (const c of t.cables) {
    cableAt.set(`${normalizeDevice(c.a.device)}|${normalizePort(c.a.port)}`, c.cableId);
    cableAt.set(`${normalizeDevice(c.z.device)}|${normalizePort(c.z.port)}`, c.cableId);
  }
  for (const d of t.devices) {
    const dev = await prisma.deviceInventory.create({
      data: {
        projectId,
        name: d.name,
        nameNorm: normalizeDevice(d.name),
        rack: d.rack,
        rackUnit: d.rackUnit,
        uHeight: d.uHeight,
        model: d.model,
        vendor: d.vendor,
        role: d.role,
        face: "front",
        attributes: { synthetic: true, os: d.os, discovery: d.discovery, design: d.design } as object,
      },
    });
    await prisma.devicePort.createMany({
      data: d.ports.map((p) => {
        const cableId = cableAt.get(`${normalizeDevice(d.name)}|${normalizePort(p.name)}`) ?? null;
        return { deviceId: dev.id, portLabel: p.name, portNorm: normalizePort(p.name), speed: p.speed, status: cableId ? "USED" : "FREE", plannedCableId: cableId };
      }),
    });
  }

  // Explicit identity mapping rules (BMC hostnames, MAC-based port IDs).
  const { deviceAliases, portAliases } = demoAliases(t);
  await prisma.deviceAlias.createMany({
    data: deviceAliases.map((a) => ({ projectId, alias: a.alias, aliasNorm: normalizeDevice(a.alias), deviceName: a.deviceName, deviceNorm: normalizeDevice(a.deviceName) })),
  });
  await prisma.portAlias.createMany({
    data: portAliases.map((p) => ({ projectId, deviceNorm: normalizeDevice(p.deviceName), alias: p.alias, aliasNorm: normalizePort(p.alias), portLabel: p.portLabel, portNorm: normalizePort(p.portLabel) })),
  });

  // Install progress: trunks/console partly outstanding (honest, physical-only items).
  const installer = users.tech.id;
  const pending = new Set(["CBL-TRK-0004", "CBL-CON-0019", "CBL-CON-0020"]);
  const blocked = new Map([
    ["CBL-TRK-0005", "Awaiting MPO-12 OM4 trunk delivery (PO synthetic-0042)"],
    ["CBL-TRK-0006", "Awaiting MPO-12 OM4 trunk delivery (PO synthetic-0042)"],
  ]);
  const installBase = new Date("2026-11-15T08:00:00Z").getTime();
  const runtimeWrites = links.map((l, i) => {
    const reason = blocked.get(l.cableId);
    const status = reason ? InstallStatus.BLOCKED : pending.has(l.cableId) ? InstallStatus.PLANNED : InstallStatus.INSTALLED;
    const at = new Date(installBase + (i % 72) * 3_600_000);
    return prisma.linkRuntime.update({
      where: { id: l.runtime!.id },
      data:
        status === InstallStatus.INSTALLED
          ? { installStatus: status, installerId: installer, installedAt: at, statusChangedAt: at, statusChangedBy: installer, lengthMeters: l.lengthM, version: 2 }
          : { installStatus: status, blockedReason: reason ?? null, statusChangedAt: at, statusChangedBy: installer, version: 2 },
    });
  });
  for (let i = 0; i < runtimeWrites.length; i += 150) await prisma.$transaction(runtimeWrites.slice(i, i + 150));

  // Synthetic evidence for all three playback snapshots.
  let importCount = 0;
  for (const snapshot of SNAPSHOTS) {
    for (const f of evidenceFiles(snapshot, t).filter((x) => x.importForVerification)) {
      await storeEvidence({
        projectId,
        sourceDevice: f.device,
        text: f.text,
        uploadedById: lead,
        filename: `${snapshot}/${f.device}__${f.command.replace(/[^a-z0-9]+/gi, "-")}.txt`,
        captureTime: new Date(f.captureTime),
        format: (f.formatId ?? "auto") as Parameters<typeof storeEvidence>[0]["format"],
        synthetic: true,
        demoSnapshot: snapshot,
        osProfile: f.os,
      });
      importCount++;
    }
  }

  // Independent physical verification for links LLDP cannot observe.
  const qc = users.qc.id;
  const physicalOk = ["CBL-EXT-0001", "CBL-EXT-0002", "CBL-TRK-0001", "CBL-TRK-0002", "CBL-TRK-0003", ...Array.from({ length: 10 }, (_, i) => `CBL-CON-${String(i + 1).padStart(4, "0")}`)];
  for (const [i, cableId] of physicalOk.entries()) {
    const link = byCable.get(cableId);
    if (!link) continue;
    await prisma.physicalVerification.create({
      data: { plannedLinkId: link.id, revisionId, verifierId: qc, verifiedAt: new Date(installBase + (80 + i) * 3_600_000), note: "Both ends traced, labelled and seated (synthetic QC)", aConfirmed: true, zConfirmed: true },
    });
  }
  const rejected = byCable.get("CBL-CON-0011");
  if (rejected) {
    await prisma.physicalVerification.create({
      data: { plannedLinkId: rejected.id, revisionId, verifierId: qc, verifiedAt: new Date(installBase + 96 * 3_600_000), note: "Z-end label missing; rollover seated in unlabelled console port", aConfirmed: true, zConfirmed: false },
    });
  }

  // Synthetic field photos.
  const photoColors: Array<[string, [number, number, number], string]> = [
    ["CBL-FE-0025", [40, 120, 200], "FE-LEAF-01 Ethernet1/1 seated, label visible (synthetic)"],
    ["CBL-BE-0017", [220, 170, 40], "BE-LEAF-01 rail A bundle dressed (synthetic)"],
    ["CBL-TRK-0001", [60, 180, 180], "MPO trunk R14 \u2192 R02 polarity label (synthetic)"],
    ["CBL-EXT-0012", [200, 60, 60], "Firewall HA DAC (synthetic)"],
  ];
  for (const [cableId, rgb, note] of photoColors) {
    const link = byCable.get(cableId);
    if (!link) continue;
    const data = syntheticPng(rgb);
    await prisma.fieldPhoto.create({
      data: { projectId, plannedLinkId: link.id, mimeType: "image/png", byteSize: data.length, sha256: createHash("sha256").update(data).digest("hex"), data, note, source: "online", uploadedById: installer },
    });
  }

  // Patch panels, cross-connect mappings and circuits.
  for (const d of t.devices.filter((x) => x.role === "panel")) {
    const mappings = t.panelMappings.filter((m) => m.panel === d.name);
    const portCount = d.name.startsWith("PP-LC") ? Math.max(24, mappings.length) : d.ports.length;
    const panel = await prisma.patchPanel.create({ data: { projectId, name: d.name, rack: d.rack, rackUnit: d.rackUnit, portCount } });
    await prisma.panelPort.createMany({
      data: Array.from({ length: portCount }, (_, i) => {
        const m = mappings.find((x) => x.portIndex === i + 1);
        const link = m ? byCable.get(m.cableId) : undefined;
        return { panelId: panel.id, portIndex: i + 1, side: link ? m!.side : null, plannedLinkId: link?.id ?? null };
      }),
    });
  }
  for (const c of t.circuits) {
    const panelA = await prisma.patchPanel.findUniqueOrThrow({ where: { projectId_name: { projectId, name: c.a.panel } } });
    const portA = await prisma.panelPort.findUniqueOrThrow({ where: { panelId_portIndex: { panelId: panelA.id, portIndex: c.a.portIndex } } });
    await prisma.circuit.create({ data: { projectId, name: c.name, mediaType: c.mediaType, panelPortAId: portA.id, note: c.note } });
  }

  // Spare stock (ledger-backed).
  const stock: Array<[string, string, number]> = [
    ["AOC-400G-QSFPDD-10M", "400G QSFP-DD AOC 10 m (fictional SKU)", 12],
    ["AOC-800G-OSFP-10M", "800G OSFP AOC 10 m (fictional SKU)", 6],
    ["AOC-400G-OSFP-5M", "400G OSFP AOC 5 m (fictional SKU)", 8],
    ["AOC-100G-QSFP28-5M", "100G QSFP28 AOC 5 m (fictional SKU)", 20],
    ["AOC-25G-SFP28-5M", "25G SFP28 AOC 5 m (fictional SKU)", 16],
    ["MPO12-OM4-30M", "MPO-12 OM4 trunk 30 m (fictional SKU)", 0],
    ["CAT6A-3M", "Cat6A patch 3 m (fictional SKU)", 48],
  ];
  for (const [sku, description, qty] of stock) {
    const item = await prisma.stockItem.create({ data: { projectId, sku, description, quantityOnHand: qty } });
    if (qty > 0) await prisma.stockTransaction.create({ data: { itemId: item.id, delta: qty, reason: "Initial receipt (synthetic)", actorId: lead, quantityAfter: qty } });
  }

  // Work orders.
  const ids = (prefix: string, pred: (cableId: string) => boolean = () => true) => links.filter((l) => l.cableId.startsWith(prefix) && pred(l.cableId)).map((l) => l.id);
  const fx = faultExpectations(t);
  const faultIds = Array.from(new Set(fx.filter((f) => f.id !== 1 && f.id !== 7 && f.id !== 8).flatMap((f) => f.cableIds))).map((c) => byCable.get(c)!.id);
  const workOrders: Array<{ code: string; title: string; status: WorkOrderStatus; assignee: string; due: string; links: string[]; notes: string }> = [
    { code: "WO-FE-001", title: "FE fabric: spine/leaf + GPU front-end cabling", status: WorkOrderStatus.DONE, assignee: users.tech.id, due: "2026-11-17T17:00:00Z", links: [...ids("CBL-FE-"), ...ids("CBL-STO-")], notes: "Racks R02, R04, R05, R08\u2013R12" },
    { code: "WO-BE-001", title: "BE fabric: rail-aligned GPU RDMA cabling", status: WorkOrderStatus.DONE, assignee: users.tech.id, due: "2026-11-18T17:00:00Z", links: ids("CBL-BE-"), notes: "Racks R03, R06, R07, R08\u2013R10. Rail A = BE-LEAF-01/02, rail B = BE-LEAF-03/04." },
    { code: "WO-OOB-001", title: "OOB management + serial console", status: WorkOrderStatus.IN_PROGRESS, assignee: users.contractor.id, due: "2026-11-22T17:00:00Z", links: [...ids("CBL-OOB-"), ...ids("CBL-CON-")], notes: "Two console runs outstanding" },
    { code: "WO-PATCH-001", title: "R14 MPO trunks to fabric racks", status: WorkOrderStatus.OPEN, assignee: users.contractor.id, due: "2026-11-24T17:00:00Z", links: ids("CBL-TRK-"), notes: "Blocked on trunk delivery" },
    { code: "WO-REM-001", title: "Remediate field discrepancies (fault snapshot)", status: WorkOrderStatus.OPEN, assignee: users.contractor.id, due: "2026-11-21T12:00:00Z", links: faultIds, notes: "Swaps, wrong device/port, missing uplink, link down, duplicate host identity" },
  ];
  for (const w of workOrders) {
    await prisma.workOrder.create({
      data: { projectId, code: w.code, title: w.title, status: w.status, assigneeId: w.assignee, dueAt: new Date(w.due), notes: w.notes, createdById: lead, items: { create: w.links.map((plannedLinkId) => ({ plannedLinkId })) } },
    });
  }

  await recomputeFindings(projectId);

  // Assign open fault exceptions to the contractor with a due date.
  await prisma.verificationFinding.updateMany({
    where: { revisionId, plannedLinkId: { in: faultIds }, state: { in: ["MISMATCH", "NEEDS_REVIEW"] } },
    data: { assigneeId: users.contractor.id, dueAt: new Date("2026-11-21T12:00:00Z") },
  });

  await runComplianceCheck(projectId, "manual");

  await recordAudit({
    projectId,
    actorId: lead,
    action: "demo.seed",
    summary: `Seeded ${DEMO.projectCode} synthetic demo (${links.length} cables, ${t.devices.length} devices, ${importCount} evidence captures)`,
    metadata: { fingerprint, snapshot: DEFAULT_SNAPSHOT, synthetic: true },
  });

  const groups = await prisma.verificationFinding.groupBy({ by: ["findingType"], where: { revisionId }, _count: { _all: true } });
  console.log(`AI/HPC demo seeded (DEMO / SYNTHETIC DATA). Fingerprint ${fingerprint}`);
  console.log(`Workspace: ${workspace.id}  Project: ${projectId}`);
  console.log(`Cables ${links.length} · devices ${t.devices.length} · racks ${t.racks.length} · evidence captures ${importCount}`);
  console.log(`Active snapshot: ${DEFAULT_SNAPSHOT}. Findings: ${groups.map((g) => `${g.findingType}=${g._count._all}`).join(", ")}`);
  console.log(`Users (${DEMO.emailDomain}): ${DEMO_USERS.map((u) => `${u.key}@ (${u.projectRole}${u.contractor ? ", contractor" : ""})`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
