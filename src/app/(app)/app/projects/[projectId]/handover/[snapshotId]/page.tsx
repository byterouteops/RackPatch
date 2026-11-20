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
    <article className="mx-auto max-w-4xl bg-white p-8 text-[var(--foreground)] print:p-0">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-fg)]">RackPatch handover</p>
        <h1 className="mt-2 text-3xl font-semibold">{payload.project.name}</h1>
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
          <h2 className="text-lg font-semibold text-red-900">Unresolved exceptions</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {payload.unresolvedExceptions.map((e, i) => (
              <li key={i} className="rounded border border-red-200 bg-red-50 p-3">
                {e.expected}
                {e.observed ? ` → observed: ${e.observed}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Cable inventory</h2>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-2">Cable</th>
              <th className="py-2 pr-2">A</th>
              <th className="py-2 pr-2">Z</th>
              <th className="py-2 pr-2">Verify</th>
            </tr>
          </thead>
          <tbody>
            {payload.links.map((l) => (
              <tr key={l.cableId} className="border-b border-[var(--border)]">
                <td className="py-2 pr-2 font-medium">{l.cableId}</td>
                <td className="py-2 pr-2">
                  {l.aDevice}/{l.aPort}
                </td>
                <td className="py-2 pr-2">
                  {l.zDevice}/{l.zPort}
                </td>
                <td className="py-2 pr-2">
                  <VerificationBadge state={l.verificationState} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="no-print mt-8 flex justify-center">
        <PrintButton />
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[var(--border)] p-3">
      <p className="text-[var(--muted-fg)]">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}