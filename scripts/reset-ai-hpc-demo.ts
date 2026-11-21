/**
 * Destructive reset of the Northstar AI/HPC demo ONLY.
 *
 * Usage: CONFIRM=NS-DC1-AI-POD-A npm run demo:reset:ai-hpc
 *
 * Deletes the `northstar-ai-demo` workspace (must be isDemo=true) and users on the demo email
 * domain who have no membership outside that workspace. Nothing else is touched.
 */
import { prisma } from "../src/lib/db";
import { DEMO } from "../src/lib/demo/ai-hpc/topology";

async function main() {
  if (process.env.CONFIRM !== DEMO.projectCode) {
    console.error(`Refusing to reset: set CONFIRM=${DEMO.projectCode} to delete the synthetic AI/HPC demo.`);
    process.exit(1);
  }
  const ws = await prisma.workspace.findUnique({ where: { slug: DEMO.workspaceSlug }, include: { projects: { select: { id: true, name: true } } } });
  if (ws && !ws.isDemo) throw new Error(`Workspace ${DEMO.workspaceSlug} is not a demo workspace; refusing.`);
  if (ws) {
    await prisma.workspace.delete({ where: { id: ws.id } });
    console.log(`Deleted demo workspace ${ws.id} (${ws.projects.length} project(s))`);
  } else {
    console.log("Demo workspace not found; nothing to delete.");
  }
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO.emailDomain}` } },
    select: { id: true, email: true, _count: { select: { workspaceMemberships: true, projectMemberships: true } } },
  });
  const orphan = users.filter((u) => u._count.workspaceMemberships === 0 && u._count.projectMemberships === 0);
  const kept = users.length - orphan.length;
  for (const u of orphan) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
    } catch (e) {
      console.warn(`Kept ${u.email}: still referenced (${e instanceof Error ? e.message.split("\n")[0] : e})`);
    }
  }
  console.log(`Removed ${orphan.length} demo user(s); kept ${kept} with other memberships.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
