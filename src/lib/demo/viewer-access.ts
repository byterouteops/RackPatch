import { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEMO } from "@/lib/demo/ai-hpc/topology";

/**
 * Gives a signed-in user read-only (VIEWER) access to the shared AI/HPC demo project.
 * Never changes an existing membership, so demo personas and real members keep their roles.
 */
export async function grantDemoViewerAccess(userId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { isDemo: true, name: DEMO.projectName, workspace: { slug: DEMO.workspaceSlug, isDemo: true } },
    select: { id: true },
  });
  if (!project) return;
  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: { projectId: project.id, userId, role: ProjectRole.VIEWER },
    update: {},
  });
}
