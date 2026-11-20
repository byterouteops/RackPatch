import { CheckCircle2, Link2Off, Clock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { LldpImportForm } from "@/components/lldp-import-form";
import { ProjectSubnav } from "@/components/project-subnav";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function LldpPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  let matches = 0;
  let swapped = 0;
  let missing = 0;

  if (access.project.activeRevisionId) {
    const findings = await prisma.verificationFinding.findMany({
      where: { revisionId: access.project.activeRevisionId },
    });
    matches = findings.filter(
      (f) => f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL",
    ).length;
    swapped = findings.filter((f) => f.state === "MISMATCH").length;
    missing = findings.filter((f) => f.state === "AWAITING").length;
  }

  return (
    <div>
      <PageHeader
        title="LLDP evidence"
        description="Paste Cisco NX-OS show lldp neighbors detail output."
      />
      <ProjectSubnav projectId={projectId} />

      {access.project.activeRevisionId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Matches"
            value={matches}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
            tone="success"
          />
          <StatCard
            label="Swapped"
            value={swapped}
            icon={<Link2Off className="h-5 w-5" aria-hidden />}
            tone="danger"
          />
          <StatCard
            label="Missing / awaiting"
            value={missing}
            icon={<Clock className="h-5 w-5" aria-hidden />}
            tone="neutral"
          />
        </div>
      )}

      {!access.canImportEvidence ? (
        <EmptyState
          title="Import not allowed"
          description="Requires lead role and activated project."
        />
      ) : (
        <Card title="Import wizard">
          <LldpImportForm projectId={projectId} />
        </Card>
      )}
    </div>
  );
}
