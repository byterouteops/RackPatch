import { prisma } from "@/lib/db";
import { buildGitOpsDocument, serializeGitOps, type GitOpsFormat } from "@/lib/gitops";

export type GitOpsExport = {
  filename: string;
  contentType: string;
  text: string;
  revisionNumber: number;
  cableCount: number;
};

/** Export the active plan revision as a GitOps document. Throws if there is no active plan. */
export async function buildActivePlanGitOps(
  projectId: string,
  format: GitOpsFormat,
): Promise<GitOpsExport> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { activeRevision: true },
  });
  if (!project.activeRevisionId || !project.activeRevision) {
    throw new Error("No active plan revision");
  }
  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    orderBy: [{ aRack: "asc" }, { cableId: "asc" }],
  });
  const doc = buildGitOpsDocument({
    projectName: project.name,
    site: project.site,
    revisionNumber: project.activeRevision.revisionNumber,
    links,
  });
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  return {
    filename: `${slug}-plan-r${project.activeRevision.revisionNumber}.${format === "json" ? "json" : "yaml"}`,
    contentType: format === "json" ? "application/json" : "application/yaml",
    text: serializeGitOps(doc, format),
    revisionNumber: project.activeRevision.revisionNumber,
    cableCount: links.length,
  };
}
