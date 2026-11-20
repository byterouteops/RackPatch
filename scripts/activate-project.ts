/**
 * Platform-admin CLI: record external payment / pilot grant and activate a project.
 *
 * Usage:
 *   npx tsx scripts/activate-project.ts --projectId=<id> --status=PAID --note="Invoice 123"
 *
 * Requires PLATFORM_ADMIN_ACTOR_EMAIL in env (must be a user in the DB),
 * or pass --actorEmail=.
 */
import { PrismaClient, CommercialStatus } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const projectId = arg("projectId");
  const statusRaw = (arg("status") || "PAID").toUpperCase();
  const note = arg("note");
  const actorEmail =
    arg("actorEmail") || process.env.PLATFORM_ADMIN_ACTOR_EMAIL || process.env.PLATFORM_ADMIN_EMAILS?.split(",")[0];

  if (!projectId) {
    console.error("Missing --projectId=");
    process.exit(1);
  }
  if (statusRaw !== "PILOT" && statusRaw !== "PAID") {
    console.error("--status must be PILOT or PAID");
    process.exit(1);
  }

  const actor = actorEmail
    ? await prisma.user.findUnique({ where: { email: actorEmail.trim().toLowerCase() } })
    : null;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { commercialStatus: statusRaw as CommercialStatus },
  });

  await prisma.commercialActivation.create({
    data: {
      projectId,
      status: statusRaw as CommercialStatus,
      actorId: actor?.id,
      note: note || "Activated via CLI after external payment",
    },
  });

  await prisma.auditEvent.create({
    data: {
      projectId,
      actorId: actor?.id,
      action: "commercial.activate",
      summary: `CLI activated project as ${statusRaw}`,
      metadata: JSON.stringify({ note, actorEmail }),
    },
  });

  console.log(`Activated ${project.name} (${project.id}) as ${statusRaw}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
