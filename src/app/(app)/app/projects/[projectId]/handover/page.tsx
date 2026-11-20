import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, FileText } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { HandoverActions } from "@/components/handover-actions";
import { ProjectSubnav } from "@/components/project-subnav";
import {
  AlertBanner,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";

export default async function HandoverPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  const snapshots = await prisma.handoverSnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const revisionId = access.project.activeRevisionId;
  const liveFindings = revisionId
    ? await prisma.verificationFinding.findMany({ where: { revisionId } })
    : [];
  const linkCount = revisionId
    ? await prisma.plannedLink.count({ where: { revisionId } })
    : 0;
  const unresolvedLive = liveFindings.filter(
    (f) =>
      (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") &&
      f.exceptionStatus !== "CLOSED",
  ).length;
  const awaitingLive = liveFindings.filter((f) => f.state === "AWAITING").length;
  const verifiedLive = liveFindings.filter(
    (f) => f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL",
  ).length;
  const notReady = unresolvedLive > 0 || awaitingLive > 0;

  return (
    <div>
      <PageHeader title="Handover" description="Export evidence-backed rack status." />
      <ProjectSubnav projectId={projectId} />

      <div className="mb-6">
        {notReady ? (
          <AlertBanner tone="warning" title="Handover not clear">
            {unresolvedLive > 0 && (
              <span>
                {unresolvedLive === 1
                  ? "1 unresolved exception. "
                  : `${unresolvedLive} unresolved exceptions. `}
              </span>
            )}
            {awaitingLive > 0 && (
              <span>
                {awaitingLive === 1
                  ? "1 link awaiting verification. "
                  : `${awaitingLive} links awaiting verification. `}
              </span>
            )}
            Fix mismatches or complete verification before customer sign-off. Acknowledgment keeps
            discrepancies visible.
          </AlertBanner>
        ) : (
          <AlertBanner tone="success" title="Ready for handover">
            No open mismatches or awaiting-verification links on the active revision.
          </AlertBanner>
        )}
      </div>

      {revisionId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Links"
            value={linkCount}
            icon={<FileText className="h-5 w-5" aria-hidden />}
            tone="info"
          />
          <StatCard
            label="Verified"
            value={verifiedLive}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
            tone="success"
          />
          <StatCard
            label="Unresolved"
            value={unresolvedLive}
            icon={<FileText className="h-5 w-5" aria-hidden />}
            tone={unresolvedLive > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      {!access.canExport ? (
        <EmptyState
          title="Export not allowed"
          description="Requires lead role and activated project."
        />
      ) : (
        <Card title="Export & snapshot" className="mb-6">
          <HandoverActions projectId={projectId} snapshotsEnabled />
        </Card>
      )}

      <Card title="Recent snapshots">
        {snapshots.length === 0 ? (
          <p className="text-sm text-[var(--muted-fg)]">No snapshots yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{s.title || s.id}</p>
                  <p className="text-[var(--muted-fg)]">{format(s.createdAt, "PPpp")}</p>
                  {s.hasUnresolvedExceptions && (
                    <p className="mt-1 text-xs font-medium text-[var(--warning)]">
                      Captured with unresolved exceptions
                    </p>
                  )}
                </div>
                <Link
                  href={`/app/projects/${projectId}/handover/${s.id}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  Print report →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
