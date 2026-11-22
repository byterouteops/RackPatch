import { ProjectRole } from "@prisma/client";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { DemoTour } from "@/components/demo-tour";
import { DEMO_SCENARIOS } from "@/lib/demo/ai-hpc/scenarios";
import { DEMO } from "@/lib/demo/ai-hpc/topology";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  const project = access?.project;
  return (
    <>
      {project?.isDemo && (
        <DemoTour
          projectId={projectId}
          snapshot={project.demoEvidenceSnapshot}
          emailDomain={DEMO.emailDomain}
          scenarios={project.demoEvidenceSnapshot ? DEMO_SCENARIOS : []}
          viewOnly={access?.projectRole === ProjectRole.VIEWER && !access.isOwner}
        />
      )}
      {children}
    </>
  );
}
