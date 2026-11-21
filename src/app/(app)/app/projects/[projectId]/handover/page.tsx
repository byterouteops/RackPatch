import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, FileText, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { HandoverActions } from "@/components/handover-actions";
import { HandoverShareButton } from "@/components/handover-share-button";
import { ProjectPageHeader } from "@/components/project-page-header";
import { getAppUrl } from "@/lib/env";
import {
  AlertBanner,
  Badge,
  Card,
  EmptyState,
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
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

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
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Handover"
        title="Handover"
        description="Export evidence-backed rack status."
      />

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
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            tone={unresolvedLive > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      {!access.canExport ? (
        <div className="mb-6">
          <EmptyState
            icon={<Lock className="h-5 w-5" aria-hidden />}
            title="Export not allowed"
            description="Requires lead role and activated project."
          />
        </div>
      ) : (
        <Card
          title="Export & snapshot"
          description="Download a CSV export or freeze the current state as a snapshot."
          className="mb-6"
        >
          <HandoverActions projectId={projectId} snapshotsEnabled />
        </Card>
      )}

      <Card title="Recent snapshots" description="Latest 20 snapshots, newest first." flush>
        {snapshots.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted-fg)]">No snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Snapshot</th>
                  <th>Created</th>
                  <th>State</th>
                  <th className="text-right">Report &amp; sharing</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="font-medium">{s.title || s.id}</td>
                    <td className="whitespace-nowrap text-[var(--muted-fg)]">
                      {format(s.createdAt, "PPpp")}
                    </td>
                    <td>
                      {s.hasUnresolvedExceptions ? (
                        <Badge tone="warning">Unresolved exceptions</Badge>
                      ) : (
                        <Badge tone="success">Clear</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/app/projects/${projectId}/handover/${s.id}`}
                        className="rp-focus font-semibold text-[var(--accent)] hover:underline"
                      >
                        Print report →
                      </Link>
                      {access.canExport && (
                        <HandoverShareButton
                          projectId={projectId}
                          snapshotId={s.id}
                          existingUrl={
                            s.shareToken ? `${getAppUrl()}/share/handover/${s.shareToken}` : null
                          }
                          expiresAt={s.shareExpiresAt?.toISOString() ?? null}
                        />
                      )}
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
