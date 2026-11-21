/**
 * SIT only: create a 5,000-cable project through the real CSV import + publish path, for performance tests.
 * Refuses to run unless DATABASE_URL points at the isolated rackpatch_sit database. Idempotent.
 *   $env:DATABASE_URL="postgresql://rackpatch:rackpatch@localhost:5432/rackpatch_sit?schema=public"; npx tsx scripts/sit-seed-large.ts
 */
import { prisma } from "@/lib/db";
import { importPlanCsv } from "@/lib/csv/plan-import";
import { publishPlanRevision } from "@/lib/plan/publish";

const NAME = "SIT Scale 5000";
const RACKS = 50;
const SERVERS_PER_RACK = 50;
const NICS = 2;

async function main() {
  if (!/\/rackpatch_sit(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: DATABASE_URL is not rackpatch_sit");
  const existing = await prisma.project.findFirst({ where: { name: NAME } });
  if (existing) {
    console.log(`exists ${existing.id}`);
    return;
  }
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: "northstar-ai-demo" } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@demo.northstar.local" } });
  const lead = await prisma.user.findUniqueOrThrow({ where: { email: "lead@demo.northstar.local" } });
  const project = await prisma.project.create({
    data: { workspaceId: ws.id, name: NAME, site: "SIT Scale Hall", commercialStatus: "PILOT", isDemo: false },
  });
  await prisma.projectMembership.create({ data: { projectId: project.id, userId: lead.id, role: "LEAD" } });

  const lines = ["cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port,cable_type,notes"];
  let n = 0;
  for (let r = 1; r <= RACKS; r++) {
    const rack = `S${String(r).padStart(2, "0")}`;
    for (let s = 1; s <= SERVERS_PER_RACK; s++) {
      for (let k = 0; k < NICS; k++) {
        n++;
        const port = (s - 1) * NICS + k + 1;
        lines.push(`SC-${String(n).padStart(5, "0")},${rack},SRV-${rack}-${String(s).padStart(2, "0")},eth${k},${rack},LEAF-${rack},Ethernet1/${port},25G DAC,scale`);
      }
    }
  }
  const csv = lines.join("\n");
  const parsed = importPlanCsv(csv);
  if (parsed.errors.length) throw new Error(`CSV errors: ${parsed.errors.slice(0, 3).map((e) => e.message).join("; ")}`);
  const t0 = Date.now();
  await publishPlanRevision({ projectId: project.id, actorId: owner.id, rows: parsed.rows, importKey: `sit-scale-${Date.now()}`, sourceCsv: csv, note: "SIT scale" });
  const rev = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).activeRevisionId!;
  const ids = (await prisma.plannedLink.findMany({ where: { revisionId: rev }, select: { id: true }, orderBy: { cableId: "asc" } })).map((l) => l.id);
  const installed = ids.filter((_, i) => i % 5 !== 0);
  await prisma.linkRuntime.updateMany({ where: { plannedLinkId: { in: installed } }, data: { installStatus: "INSTALLED", installerId: owner.id, installedAt: new Date() } });
  console.log(`created ${project.id}: ${ids.length} links (${installed.length} installed) in ${Date.now() - t0} ms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
