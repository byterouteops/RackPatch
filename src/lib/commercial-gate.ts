import { prisma } from "@/lib/db";
import { commercialAllowsMutations } from "@/lib/authz";

/** Throws unless the project is a demo or activated for a pilot/paid plan. Call after authorization. */
export async function assertPaidOrThrow(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.isDemo && !commercialAllowsMutations(project.commercialStatus)) {
    throw new Error(
      "This project is not activated for a pilot or paid plan. Ask a platform admin after external payment.",
    );
  }
  return project;
}
