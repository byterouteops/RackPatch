import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { PlanImportWizard } from "@/components/plan-import-wizard";
import { ProjectSubnav } from "@/components/project-subnav";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  return (
    <div>
      <PageHeader title="Cable plan" description="Import CSV and publish a new revision." />
      <ProjectSubnav projectId={projectId} />
      {!access.canPublishPlan ? (
        <EmptyState
          title="View only"
          description="You need lead access and an activated pilot/paid project to publish plans."
        />
      ) : (
        <Card title="CSV import wizard">
          <PlanImportWizard projectId={projectId} />
        </Card>
      )}
    </div>
  );
}