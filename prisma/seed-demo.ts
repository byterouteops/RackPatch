/**
 * Opt-in synthetic demo seed. Never overwrites non-demo workspaces.
 *
 * Usage: SEED_DEMO=true npm run seed:demo
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import {
  InstallStatus,
  PrismaClient,
  ProjectRole,
  VerificationState,
} from "@prisma/client";
import { importPlanCsv } from "../src/lib/csv/plan-import";
import { publishPlanRevision } from "../src/lib/plan/publish";
import { parseNxosLldpNeighborsDetail } from "../src/lib/lldp/nxos-neighbors-detail";
import { normalizeDevice } from "../src/lib/csv/normalize";
import { recomputeFindings } from "../src/lib/verify/recompute";

const prisma = new PrismaClient();

async function upsertUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    create: { email, name, emailVerified: true },
    update: { name },
  });
}

async function main() {
  if (process.env.SEED_DEMO !== "true") {
    console.error("Refusing to seed: set SEED_DEMO=true to load the synthetic demo.");
    process.exit(1);
  }

  const existingDemo = await prisma.workspace.findFirst({
    where: { isDemo: true, slug: "rackpatch-demo" },
  });
  if (existingDemo) {
    console.log("Demo workspace already exists; leaving it untouched.");
    console.log(`Workspace id: ${existingDemo.id}`);
    return;
  }

  const lead = await upsertUser("lead@demo.rackpatch.local", "Demo Lead");
  const tech = await upsertUser("tech@demo.rackpatch.local", "Demo Technician");
  const verifier = await upsertUser("verifier@demo.rackpatch.local", "Demo Verifier");
  await upsertUser("admin@rackpatch.local", "Platform Admin");

  const workspace = await prisma.workspace.create({
    data: {
      name: "RackPatch Demo Lab",
      slug: "rackpatch-demo",
      isDemo: true,
      memberships: {
        create: { userId: lead.id, role: "OWNER" },
      },
    },
  });

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Two-Leaf Eight-Server Lab",
      customerName: "Synthetic Customer",
      site: "Demo DC Row A",
      timeZone: "UTC",
      commercialStatus: "PAID",
      isDemo: true,
      memberships: {
        create: [
          { userId: lead.id, role: ProjectRole.LEAD },
          { userId: tech.id, role: ProjectRole.TECHNICIAN },
          { userId: verifier.id, role: ProjectRole.TECHNICIAN },
        ],
      },
    },
  });

  const csvPath = join(process.cwd(), "fixtures", "demo-cables.csv");
  const csvText = readFileSync(csvPath, "utf8");
  const imported = importPlanCsv(csvText);
  if (imported.errors.length) {
    console.error(imported.errors);
    throw new Error("Demo CSV failed validation");
  }

  await publishPlanRevision({
    projectId: project.id,
    actorId: lead.id,
    rows: imported.rows,
    note: "Synthetic demo plan",
    importKey: "demo-seed-v1",
    sourceCsv: csvText,
  });

  const active = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
  const links = await prisma.plannedLink.findMany({
    where: { revisionId: active.activeRevisionId! },
    include: { runtime: true },
  });
  const byCable = new Map(links.map((l) => [l.cableId, l]));

  for (const cableId of ["C-101", "C-201", "C-202", "C-203", "C-204"]) {
    const link = byCable.get(cableId)!;
    await prisma.linkRuntime.update({
      where: { id: link.runtime!.id },
      data: {
        installStatus: InstallStatus.INSTALLED,
        installerId: tech.id,
        installedAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedBy: tech.id,
        version: 2,
      },
    });
  }

  const blocked = byCable.get("C-205")!;
  await prisma.linkRuntime.update({
    where: { id: blocked.runtime!.id },
    data: {
      installStatus: InstallStatus.BLOCKED,
      blockedReason: "Awaiting 400G optics for Leaf-02 Ethernet1/5",
      statusChangedAt: new Date(),
      statusChangedBy: tech.id,
      version: 2,
    },
  });

  for (const [file, device] of [
    ["demo-lldp-leaf01.txt", "Leaf-01"],
    ["demo-lldp-leaf02.txt", "Leaf-02"],
  ] as const) {
    const text = readFileSync(join(process.cwd(), "fixtures", file), "utf8");
    const parsed = parseNxosLldpNeighborsDetail(text);
    if (parsed.failed) throw new Error(parsed.error);
    await prisma.evidenceImport.create({
      data: {
        projectId: project.id,
        sourceDevice: device,
        sourceDeviceNorm: normalizeDevice(device),
        uploadedById: lead.id,
        filename: file,
        rawTextHash: createHash("sha256").update(text).digest("hex"),
        parseWarnings: parsed.warnings,
        captureTime: new Date("2026-11-20T18:00:00Z"),
        observations: {
          create: parsed.observations.map((o) => ({
            localInterface: o.localInterface,
            localInterfaceNorm: o.localInterfaceNorm,
            remoteSystemName: o.remoteSystemName,
            remoteSystemNorm: o.remoteSystemNorm,
            remotePortId: o.remotePortId,
            remotePortNorm: o.remotePortNorm,
            sourceExcerpt: o.sourceExcerpt,
          })),
        },
      },
    });
  }

  const phys = byCable.get("C-204")!;
  await prisma.physicalVerification.create({
    data: {
      plannedLinkId: phys.id,
      revisionId: active.activeRevisionId!,
      verifierId: verifier.id,
      note: "Both ends labeled and seated",
      aConfirmed: true,
      zConfirmed: true,
    },
  });

  await recomputeFindings(project.id);

  const findings = await prisma.verificationFinding.findMany({
    where: { revisionId: active.activeRevisionId! },
    include: { plannedLink: true },
  });

  // Attach Better Auth credential passwords for local ENABLE_DEV_LOGIN
  const { hashPassword } = await import("better-auth/crypto");
  const passwordHash = await hashPassword("password123");
  for (const u of [lead, tech, verifier]) {
    await prisma.account.deleteMany({ where: { userId: u.id, providerId: "credential" } });
    await prisma.account.create({
      data: {
        userId: u.id,
        accountId: u.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
  }

  console.log("Demo seeded (synthetic data only).");
  console.log(`Project id: ${project.id}`);
  console.log(
    "Users: lead@demo.rackpatch.local / tech@demo.rackpatch.local / verifier@demo.rackpatch.local",
  );
  console.log("Dev password for all demo users: password123");
  console.log("Finding summary:");
  for (const f of findings) {
    console.log(`  ${f.plannedLink.cableId}: ${f.state} ${f.observedSummary ?? ""}`);
  }

  const mismatches = findings.filter((f) => f.state === VerificationState.MISMATCH);
  if (mismatches.length < 2) {
    console.warn("Warning: expected at least 2 mismatched (swapped) links in demo findings.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
