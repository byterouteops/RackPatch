import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const w = await prisma.workspace.findFirst({
    where: { slug: "rackpatch-demo" },
    include: { projects: true },
  });
  console.log("existing", w?.id, w?.projects?.map((p) => p.id));
  if (w) {
    await prisma.workspace.delete({ where: { id: w.id } });
    console.log("deleted workspace");
  }
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@demo.rackpatch.local" } },
        { email: "admin@rackpatch.local" },
      ],
    },
  });
  console.log("deleted demo users");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
