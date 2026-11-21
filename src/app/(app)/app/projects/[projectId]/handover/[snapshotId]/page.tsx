import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { PrintButton } from "@/components/print-button";
import { VerificationBadge } from "@/components/status-badges";
import type { InstallStatus, VerificationState } from "@prisma/client";

type Payload = {
  project: { name: string; site: string; customerName: string | null };
  revision: { number: number; publishedAt: string };
  counts: Record<string, number>;
  links: Array<{
    cableId: string;
    aDevice: string;
    aPort: string;
    zDevice: string;
    zPort: string;
    installStatus: InstallStatus;
    verificationState: VerificationState;
    expected: string | null;
    observed: string | null;
  }>;
  unresolvedExceptions: Array<{ expected: string; observed: string | null; state: string }>;
};

export default async function HandoverReportPage({
  params,
}: {
  params: Promise<{ projectId: string; snapshotId: string }>;
}) {
  const { projectId, snapshotId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access?.canView) notFound();

  const snap = await prisma.handoverSnapshot.findFirst({
    where: { id: snapshotId, projectId },
    include: { createdBy: true },
  });
  if (!snap) notFound();

  const payload = JSON.parse(snap.payloadJson) as Payload;

  return (
    <div>
      <div className="no-print mb-4">
        <Link
          href={`/app/projects/${projectId}/handover`}
          className="rp-focus text-sm font-semibold text-[var(--accent-ink)] hover:underline"
        >
          ← Back to handover
        </Link>
      </div>
      <article className="rp-card mx-auto max-w-4xl p-8 text-[var(--foreground)] print:border-0 print:p-0 print:shadow-none">
        <header className="border-b-2 border-b-[var(--accent-line)] pb-6">
          <p className="rp-panel-title text-[var(--accent-ink)]">RackPatch handover</p>
          <h1 className="rp-display mt-2 text-3xl font-semibold">{payload.project.name}</h1>
          <p className="text-[var(--muted-fg)]">
            {payload.project.site}
            {payload.project.customerName ? ` · ${payload.project.customerName}` : ""}
          </p>
          <p className="mt-2 text-sm">
            Revision {payload.revision.number} · snapshot {format(snap.createdAt, "PPpp")} · by{" "}
            {snap.createdBy.email}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Cables" value={payload.counts.links} />
          <Stat label="Installed" value={payload.counts.installed} />
          <Stat label="Mismatches" value={payload.counts.mismatch} />
          <Stat label="Unresolved" value={payload.counts.unresolvedExceptions} />
        </section>

        {payload.unresolvedExceptions.length > 0 && (
          <section className="mt-8">
            <h2 className="rp-display text-lg font-semibold text-[var(--danger-ink)]">Unresolved exceptions</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {payload.unresolvedExceptions.map((e, i) => (
                <li key={i} className="rounded-[var(--radius)] border border-[#efb4b7] border-l-4 border-l-[var(--danger)] bg-[var(--danger-soft)] p-3">
                  {e.expected}
                  {e.observed ? ` → observed: ${e.observed}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="rp-display text-lg font-semibold">Cable inventory</h2>
          <div className="rp-table-wrap mt-3">
            <table className="rp-table rp-table-auto text-xs">
              <thead>
                <tr>
                  <th>Cable</th>
                  <th>A</th>
                  <th>Z</th>
                  <th>Verify</th>
                </tr>
              </thead>
              <tbody>
                {payload.links.map((l) => (
                  <tr key={l.cableId}>
                    <td className="rp-mono font-medium">{l.cableId}</td>
                    <td>
                      {l.aDevice}/<span className="rp-mono">{l.aPort}</span>
                    </td>
                    <td>
                      {l.zDevice}/<span className="rp-mono">{l.zPort}</span>
                    </td>
                    <td>
                      <VerificationBadge state={l.verificationState} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="no-print mt-8 flex justify-center">
          <PrintButton />
        </div>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] border-l-4 border-l-[var(--accent)] p-3">
      <p className="rp-panel-title">{label}</p>
      <p className="rp-mono mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}