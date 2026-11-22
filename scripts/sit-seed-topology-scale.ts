/**
 * SIT only: create topology scale projects (20, 50, 100, 500 devices) through the real CSV import + publish path,
 * with device roles in the inventory. Refuses to run unless DATABASE_URL is the isolated rackpatch_sit database.
 *   npx tsx scripts/sit-seed-topology-scale.ts           # create (idempotent)
 *   npx tsx scripts/sit-seed-topology-scale.ts --remove  # delete only these SIT projects
 */
import { prisma } from "@/lib/db";
import { importPlanCsv } from "@/lib/csv/plan-import";
import { normalizeDevice } from "@/lib/csv/normalize";
import { publishPlanRevision } from "@/lib/plan/publish";
import { scaleCsv, scalePlan } from "../tests/fixtures/topology-scale";

const SIZES = [20, 50, 100, 500];
const nameFor = (n: number) => `SIT Topology ${n}`;

async function main() {
  if (!/\/rackpatch_sit(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: DATABASE_URL is not rackpatch_sit");
  if (process.argv.includes("--remove")) {
    const r = await prisma.project.deleteMany({ where: { name: { in: SIZES.map(nameFor) }, isDemo: false } });
    console.log(`removed ${r.count} SIT topology projects`);
    return;
  }
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: "northstar-ai-demo" } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@demo.northstar.local" } });
  const lead = await prisma.user.findUniqueOrThrow({ where: { email: "lead@demo.northstar.local" } });
  const out: Record<number, string> = {};
  for (const size of SIZES) {
    const existing = await prisma.project.findFirst({ where: { name: nameFor(size) } });
    if (existing) {
      out[size] = existing.id;
      continue;
    }
    const plan = scalePlan(size);
    const project = await prisma.project.create({
      data: { workspaceId: ws.id, name: nameFor(size), site: "SIT Topology Hall", commercialStatus: "PILOT", isDemo: false },
    });
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: lead.id, role: "LEAD" } });
    await prisma.deviceInventory.createMany({
      data: plan.devices.map((d) => ({ projectId: project.id, name: d.name, nameNorm: normalizeDevice(d.name), rack: d.rack, role: d.role })),
    });
    const csv = scaleCsv(plan);
    const parsed = importPlanCsv(csv);
    if (parsed.errors.length) throw new Error(`CSV errors: ${parsed.errors.slice(0, 3).map((e) => e.message).join("; ")}`);
    await publishPlanRevision({ projectId: project.id, actorId: owner.id, rows: parsed.rows, importKey: `sit-topology-${size}-${Date.now()}`, sourceCsv: csv, note: "SIT topology scale" });
    const rev = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).activeRevisionId!;
    const ids = (await prisma.plannedLink.findMany({ where: { revisionId: rev }, select: { id: true } })).map((l) => l.id);
    await prisma.linkRuntime.updateMany({ where: { plannedLinkId: { in: ids } }, data: { installStatus: "INSTALLED", installerId: owner.id, installedAt: new Date() } });
    out[size] = project.id;
    console.log(`created ${nameFor(size)} ${project.id}: ${plan.devices.length} devices, ${ids.length} cables`);
  }
  console.log(JSON.stringify(out));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
