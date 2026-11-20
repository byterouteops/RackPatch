import Link from "next/link";
import { redirect } from "next/navigation";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ExceptionAckForm } from "@/components/exception-ack-form";
import { ProjectSubnav } from "@/components/project-subnav";
import { VerificationBadge } from "@/components/status-badges";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export default async function ExceptionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  const project = access.project;
  let findings: Awaited<ReturnType<typeof loadFindings>> = [];

  if (project.activeRevisionId) {
    findings = await loadFindings(project.activeRevisionId);
  }

  return (
    <div>
      <PageHeader
        title="Exceptions"
        description="Compare expected design vs observed evidence."
      />
      <ProjectSubnav projectId={projectId} />
      {!project.activeRevisionId ? (
        <EmptyState title="No plan" />
      ) : findings.length === 0 ? (
        <EmptyState
          title="No exceptions"
          description="All findings are clear or awaiting evidence."
        />
      ) : (
        <div className="rp-table-wrap">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                <tr>
                  <th className="px-4 py-3">Cable</th>
                  <th className="px-4 py-3">Expected (design)</th>
                  <th className="px-4 py-3">Observed (evidence)</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, idx) => (
                  <tr
                    key={f.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}
                  >
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/app/projects/${projectId}/cables/${f.plannedLinkId}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        {f.plannedLink.cableId}
                      </Link>
                      <div className="mt-1">
                        <Badge tone="neutral">{f.exceptionStatus}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-fg)]">{f.expectedSummary}</td>
                    <td className="px-4 py-3 font-medium text-[var(--danger)]">
                      {f.observedSummary ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <VerificationBadge state={f.state} compact />
                    </td>
                    <td className="px-4 py-3">
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
                  <Badge tone="neutral">{f.exceptionStatus}</Badge>
                </div>
                <p className="mt-3 font-semibold">{f.plannedLink.cableId}</p>
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
                  className="mt-2 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Open cable
                </Link>
                {f.exceptionStatus === "OPEN" && access.canResolveExceptions && (
                  <ExceptionAckForm projectId={projectId} findingId={f.id} />
                )}
              </li>
            ))}
          </ul>
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
