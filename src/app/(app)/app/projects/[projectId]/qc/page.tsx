import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { canAcknowledgeFinding } from "@/lib/authz-capabilities";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { QcAckForm } from "@/components/qc-ack-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Badge, Card, EmptyState, StatCard } from "@/components/ui";

export default async function QcQueuePage({
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

  const revisionId = access.project.activeRevisionId;
  const findings = revisionId
    ? await prisma.verificationFinding.findMany({
        where: {
          revisionId,
          state: { in: ["MISMATCH", "NEEDS_REVIEW"] },
          exceptionStatus: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        include: { plannedLink: true },
        orderBy: { computedAt: "desc" },
      })
    : [];

  const open = findings.filter((f) => f.exceptionStatus === "OPEN");
  const acknowledged = findings.filter((f) => f.exceptionStatus === "ACKNOWLEDGED");
  const canAck = canAcknowledgeFinding(access);

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="QC"
        title="QC queue"
        description="Open mismatch and needs-review findings. Acknowledging records a QC note; the discrepancy stays visible until evidence clears it."
        actions={access.isContractor ? <Badge tone="info">Contractor</Badge> : undefined}
      />

      {!revisionId ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
          title="No active plan"
          description="Publish a plan to see QC findings."
        />
      ) : (
        <div className="space-y-6">
          {!canAck && (
            <AlertBanner tone="info" title="Read-only">
              Your role cannot acknowledge findings. Ask a lead to resolve or invite you as a
              contractor.
            </AlertBanner>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Open"
              value={open.length}
              icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
              tone={open.length > 0 ? "danger" : "neutral"}
            />
            <StatCard
              label="Acknowledged"
              value={acknowledged.length}
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
              tone="warning"
            />
          </div>

          <Card title={`Open (${open.length})`} flush>
            {open.length === 0 ? (
              <p className="p-5 text-sm text-[var(--muted-fg)]">No open findings.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {open.map((f) => (
                  <li key={f.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerificationBadge state={f.state} />
                      <Link
                        href={`/app/projects/${projectId}/cables/${f.plannedLinkId}`}
                        className="rp-focus rp-mono font-semibold text-[var(--accent)] hover:underline"
                      >
                        {f.plannedLink.cableId}
                      </Link>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="rp-panel-title">Expected</dt>
                        <dd className="mt-0.5">{f.expectedSummary}</dd>
                      </div>
                      {f.observedSummary && (
                        <div>
                          <dt className="rp-panel-title">Observed</dt>
                          <dd className="mt-0.5 text-[var(--danger)]">{f.observedSummary}</dd>
                        </div>
                      )}
                    </dl>
                    {f.nextAction && (
                      <p className="mt-2 text-xs text-[var(--muted-fg)]">{f.nextAction}</p>
                    )}
                    {canAck && <QcAckForm projectId={projectId} findingId={f.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={`Acknowledged (${acknowledged.length})`}
            description="Still unresolved until evidence clears them."
            flush
          >
            {acknowledged.length === 0 ? (
              <p className="p-5 text-sm text-[var(--muted-fg)]">None.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {acknowledged.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/projects/${projectId}/cables/${f.plannedLinkId}`}
                        className="rp-focus rp-mono font-semibold text-[var(--accent)] hover:underline"
                      >
                        {f.plannedLink.cableId}
                      </Link>
                      <VerificationBadge state={f.state} compact />
                    </div>
                    {f.acknowledgeNote && (
                      <p className="mt-1 text-xs text-[var(--muted-fg)]">{f.acknowledgeNote}</p>
                    )}
                    {f.acknowledgedAt && (
                      <p className="text-xs text-[var(--muted-fg)]">
                        {f.acknowledgedAt.toLocaleString()}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
