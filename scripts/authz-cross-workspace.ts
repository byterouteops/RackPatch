import { PrismaClient, ProjectRole } from "@prisma/client";
import { getProjectAccess } from "../src/lib/authz";

const prisma = new PrismaClient();

async function main() {
  const lead = await prisma.user.findUniqueOrThrow({
    where: { email: "lead@demo.rackpatch.local" },
  });
  const other = await prisma.workspace.create({
    data: {
      name: "Foreign WS",
      slug: `foreign-${Date.now()}`,
    },
  });
  const foreignOwner = await prisma.user.upsert({
    where: { email: "foreign-owner@test.local" },
    create: { email: "foreign-owner@test.local", name: "Foreign", emailVerified: true },
    update: {},
  });
  await prisma.workspaceMembership.create({
    data: { workspaceId: other.id, userId: foreignOwner.id, role: "OWNER" },
  });
  const foreignProject = await prisma.project.create({
    data: {
      workspaceId: other.id,
      name: "Secret Project",
      site: "Elsewhere",
      commercialStatus: "PAID",
      memberships: {
        create: { userId: foreignOwner.id, role: ProjectRole.LEAD },
      },
    },
  });

  const access = await getProjectAccess(
    { id: lead.id, email: lead.email, name: lead.name },
    foreignProject.id,
  );

  console.log(access === null ? "PASS cross-workspace denied" : "FAIL lead can see foreign project");

  // Guessing demo project as outsider
  const outsider = await prisma.user.upsert({
    where: { email: "nosy@test.local" },
    create: { email: "nosy@test.local", name: "Nosy", emailVerified: true },
    update: {},
  });
  const demo = await prisma.project.findFirstOrThrow({ where: { isDemo: true } });
  const outsiderAccess = await getProjectAccess(
    { id: outsider.id, email: outsider.email, name: outsider.name },
    demo.id,
  );
  console.log(
    outsiderAccess === null
      ? "PASS outsider denied demo project by ID guess"
      : "FAIL outsider can access demo",
  );

  await prisma.workspace.delete({ where: { id: other.id } });
  await prisma.user.deleteMany({
    where: { email: { in: ["foreign-owner@test.local", "nosy@test.local"] } },
  });

  if (access !== null || outsiderAccess !== null) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
