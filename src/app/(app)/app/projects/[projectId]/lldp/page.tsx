import { CheckCircle2, Clock, Link2Off, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { JobStatusBadge } from "@/components/job-status-badge";
import { LldpImportForm } from "@/components/lldp-import-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Card, EmptyState, StatCard } from "@/components/ui";

export default async function LldpPage({
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

  const jobs = await prisma.collectionJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="LLDP"
        title="Neighbor evidence"
        description="Import Cisco NX-OS/IOS-XE LLDP, Cisco CDP, Arista EOS LLDP, or Juniper Junos LLDP."
      />

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
            tone={swapped > 0 ? "danger" : "neutral"}
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
        <div className="mb-6">
          <EmptyState
            icon={<Lock className="h-5 w-5" aria-hidden />}
            title="Import not allowed"
            description="Requires lead role and activated project."
          />
        </div>
      ) : (
        <Card
          title="Import wizard"
          description="Paste neighbor output from a device; the parser picks the matching vendor format."
          className="mb-6"
        >
          <LldpImportForm projectId={projectId} />
        </Card>
      )}

      <Card
        title="Collection jobs"
        description="Manual paste imports recorded as jobs. No SSH workers in CE."
        flush
      >
        {jobs.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted-fg)]">No collection jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rp-table rp-table-auto">
              <thead>
                <tr>
                  <th>Source device</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th className="text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="rp-mono font-medium">{j.sourceDevice}</td>
                    <td>
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="text-xs">
                      {j.error ? (
                        <span className="text-[var(--danger)]">{j.error}</span>
                      ) : (
                        <span className="text-[var(--muted-fg)]">{j.note ?? "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">
                      {j.createdAt.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
