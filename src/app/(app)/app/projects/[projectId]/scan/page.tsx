import { Lock, ScanLine } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { OfflineFieldSync } from "@/components/offline-field-sync";
import { ProjectPageHeader } from "@/components/project-page-header";
import { QrCableScanner } from "@/components/qr-cable-scanner";
import { AlertBanner, Button, Card, EmptyState } from "@/components/ui";

export default async function ProjectScanPage({
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

  if (!access.project.activeRevisionId) {
    return (
      <div>
        <ProjectPageHeader
          projectId={projectId}
          projectName={access.project.name}
          section="Scan"
          title="Scan QR"
          description="Open a cable from a printed label."
        />
        <EmptyState
          icon={<ScanLine className="h-5 w-5" aria-hidden />}
          title="No active plan"
          description="Publish a cable plan and print labels before scanning."
        />
      </div>
    );
  }

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Scan"
        title="Scan QR"
        description="Point the camera at a RackPatch cable label for this project."
        actions={
          <Button href={`/app/projects/${projectId}/labels`} variant="secondary" size="sm">
            Print labels
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="Field scanner"
          description="Uses this device's camera."
          className="lg:col-span-3"
        >
          <QrCableScanner projectId={projectId} />
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Offline queue"
            description="Scans and photos stored on this device while offline."
          >
            <OfflineFieldSync projectId={projectId} />
          </Card>
          <AlertBanner tone="info" title="Field notes">
            Same-project QR only. Photos sync with the offline queue (max ~1.5MB each).
          </AlertBanner>
        </div>
      </div>
    </div>
  );
}
