import { Lock, Upload } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { PlanImportWizard } from "@/components/plan-import-wizard";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Button, Card, EmptyState } from "@/components/ui";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Import"
        title="Cable plan"
        description="Import a CSV and publish a new revision of the cable plan."
        actions={
          access.project.activeRevisionId ? (
            <Button href={`/app/projects/${projectId}/cables`} variant="secondary" size="sm">
              View active cables
            </Button>
          ) : undefined
        }
      />
      {!access.canPublishPlan ? (
        <EmptyState
          icon={<Lock className="h-5 w-5" aria-hidden />}
          title="View only"
          description="You need lead access and an activated pilot/paid project to publish plans."
        />
      ) : (
        <Card
          title="CSV import wizard"
          description="Validate the file, review the diff against the active revision, then publish."
          action={<Upload className="h-4 w-4 text-[var(--muted-fg)]" aria-hidden />}
        >
          <PlanImportWizard projectId={projectId} />
        </Card>
      )}
    </div>
  );
}
