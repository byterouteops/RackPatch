import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({ where: { isDemo: true } });
  if (!project?.activeRevisionId) throw new Error("no demo");
  console.log("DEMO_PROJECT=" + project.id);
  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    include: { runtime: true },
  });
  for (const l of links) {
    console.log(
      `${l.cableId} id=${l.id} status=${l.runtime?.installStatus} ver=${l.runtime?.version}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
