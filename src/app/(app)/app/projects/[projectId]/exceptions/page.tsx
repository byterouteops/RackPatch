import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { ExceptionAckForm } from "@/components/exception-ack-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import { VerificationBadge } from "@/components/status-badges";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui";

export default async function ExceptionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
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

  const project = access.project;
  let findings: Awaited<ReturnType<typeof loadFindings>> = [];

  if (project.activeRevisionId) {
    findings = await loadFindings(project.activeRevisionId);
  }

  const playbooks = buildSwapFixPlaybooks(
    findings.map((f) => ({
      cableId: f.plannedLink.cableId,
      relatedCableId: f.relatedCableId,
      findingType: f.findingType,
      state: f.state,
      expectedSummary: f.expectedSummary,
      observedSummary: f.observedSummary,
      aRack: f.plannedLink.aRack,
      zRack: f.plannedLink.zRack,
      aDevice: f.plannedLink.aDevice,
      aPort: f.plannedLink.aPort,
      zDevice: f.plannedLink.zDevice,
      zPort: f.plannedLink.zPort,
      plannedLinkId: f.plannedLinkId,
    })),
  );

  const openCount = findings.filter((f) => f.exceptionStatus === "OPEN").length;
  const ackCount = findings.filter((f) => f.exceptionStatus === "ACKNOWLEDGED").length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Exceptions"
        title="Exceptions"
        description="Compare expected design vs observed evidence."
      />
      {playbooks.length > 0 && (
        <div className="mb-6">
          <SwapFixPlaybookList projectId={projectId} playbooks={playbooks} />
        </div>
      )}
      {!project.activeRevisionId ? (
        <EmptyState title="No plan" description="Publish a cable plan to see verification exceptions." />
      ) : findings.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          title="No exceptions"
          description="All findings are clear or awaiting evidence."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Open"
              value={openCount}
              icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
              tone={openCount > 0 ? "danger" : "neutral"}
            />
            <StatCard label="Acknowledged" value={ackCount} tone="warning" />
          </div>

          <Card
            title="Findings"
            description="Mismatch and needs-review items that are still unresolved."
            flush
          >
            <div className="hidden overflow-x-auto md:block">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Cable</th>
                    <th>Expected (design)</th>
                    <th>Observed (evidence)</th>
                    <th>Result</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => (
                    <tr key={f.id} className="align-top">
                      <td className="font-semibold">
                        <Link
                          href={`/app/projects/${projectId}/cables/${f.plannedLinkId}`}
                          className="rp-focus rp-mono text-[var(--accent)] hover:underline"
                        >
                          {f.plannedLink.cableId}
                        </Link>
                        <div className="mt-1">
                          <Badge tone={f.exceptionStatus === "OPEN" ? "warning" : "neutral"}>
                            {f.exceptionStatus}
                          </Badge>
                        </div>
                      </td>
                      <td className="text-[var(--muted-fg)]">{f.expectedSummary}</td>
                      <td className="font-medium text-[var(--danger)]">
                        {f.observedSummary ?? "—"}
                      </td>
                      <td>
                        <VerificationBadge state={f.state} compact />
                      </td>
                      <td>
                        <p className="text-xs text-[var(--muted-fg)]">{f.nextAction}</p>
                        {f.exceptionStatus === "OPEN" && access.canResolveExceptions && (
                          <div className="mt-2">
                            <ExceptionAckForm projectId={projectId} findingId={f.id} />
                          </div>
                        )}
                        {f.acknowledgeNote && (
                          <p className="mt-1 text-xs text-[var(--muted-fg)]">
                            Note: {f.acknowledgeNote}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--border)] md:hidden">
              {findings.map((f) => (
                <li key={f.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <VerificationBadge state={f.state} />
                    <Badge tone={f.exceptionStatus === "OPEN" ? "warning" : "neutral"}>
                      {f.exceptionStatus}
                    </Badge>
                  </div>
                  <p className="rp-mono mt-3 font-semibold">{f.plannedLink.cableId}</p>
                  <p className="mt-1 text-sm">{f.expectedSummary}</p>
                  {f.observedSummary && (
                    <p className="mt-1 text-sm text-[var(--danger)]">
                      Observed: {f.observedSummary}
                    </p>
                  )}
                  {f.nextAction && (
                    <p className="mt-2 text-sm text-[var(--muted-fg)]">{f.nextAction}</p>
                  )}
                  <Link
                    href={`/app/projects/${projectId}/cables/${f.plannedLinkId}`}
                    className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
                  >
                    Open cable
                  </Link>
                  {f.exceptionStatus === "OPEN" && access.canResolveExceptions && (
                    <ExceptionAckForm projectId={projectId} findingId={f.id} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

async function loadFindings(revisionId: string) {
  return prisma.verificationFinding.findMany({
    where: {
      revisionId,
      state: { in: ["MISMATCH", "NEEDS_REVIEW"] },
      exceptionStatus: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    include: { plannedLink: true },
    orderBy: { computedAt: "desc" },
  });
}
