import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { CableListClient, type CableRow } from "@/components/cable-list-client";
import { ProjectSubnav } from "@/components/project-subnav";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function CablesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState title="Permission denied" />;
  }

  const project = access.project;
  const rows: CableRow[] = [];
  const racks = new Set<string>();

  if (project.activeRevisionId) {
    const links = await prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      include: {
        runtime: true,
        findings: { where: { revisionId: project.activeRevisionId }, take: 1 },
      },
      orderBy: [{ aRack: "asc" }, { cableId: "asc" }],
    });

    for (const l of links) {
      racks.add(l.aRack);
      racks.add(l.zRack);
      rows.push({
        id: l.id,
        cableId: l.cableId,
        aRack: l.aRack,
        aDevice: l.aDevice,
        aPort: l.aPort,
        zRack: l.zRack,
        zDevice: l.zDevice,
        zPort: l.zPort,
        installStatus: l.runtime?.installStatus ?? "PLANNED",
        verificationState: l.findings[0]?.state ?? "AWAITING",
      });
    }
  }

  return (
    <div>
      <PageHeader title="Cables" description={project.name} />
      <ProjectSubnav projectId={projectId} />
      {!project.activeRevisionId ? (
        <EmptyState title="No plan" description="Publish a cable plan first." />
      ) : (
        <CableListClient
          projectId={projectId}
          rows={rows}
          racks={Array.from(racks).sort()}
        />
      )}
    </div>
  );
}