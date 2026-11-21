import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { BrandMark } from "@/components/brand-mark";
import { AlertBanner, Badge } from "@/components/ui";

type Payload = {
  project: { name: string; customerName: string | null; site: string };
  revision: { number: number; publishedAt: string };
  counts: {
    links: number;
    verifiedLldp: number;
    verifiedPhysical: number;
    awaiting: number;
    unresolvedExceptions: number;
  };
  unresolvedExceptions: Array<{
    expected: string;
    observed: string | null;
    nextAction: string | null;
    relatedCableId: string | null;
  }>;
};

export default async function PublicHandoverSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const snap = await prisma.handoverSnapshot.findFirst({
    where: { shareToken: token },
    include: { project: true },
  });

  if (!snap || !snap.shareExpiresAt || snap.shareExpiresAt.getTime() < Date.now()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <BrandMark />
        <h1 className="mt-6 text-xl font-semibold">Link unavailable</h1>
        <p className="mt-2 text-sm text-[var(--muted-fg)]">
          This customer handover link is missing, expired, or was revoked.
        </p>
      </div>
    );
  }

  let payload: Payload;
  try {
    payload = JSON.parse(snap.payloadJson) as Payload;
  } catch {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Invalid snapshot</h1>
      </div>
    );
  }

  const clear =
    payload.counts.unresolvedExceptions === 0 && payload.counts.awaiting === 0;
  const verified =
    (payload.counts.verifiedLldp ?? 0) + (payload.counts.verifiedPhysical ?? 0);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
      <header className="border-b border-[var(--border)] bg-[var(--chrome)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 text-sm font-semibold text-white">
          <BrandMark className="h-7 w-7" />
          <span>
            RackPatch
            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">
              Customer handover
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
          Read-only snapshot · not a live console
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{payload.project.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">
          {payload.project.site}
          {payload.project.customerName ? ` · ${payload.project.customerName}` : ""}
          {" · "}
          Plan r{payload.revision.number}
          {" · "}
          Captured {format(snap.createdAt, "PPpp")}
        </p>

        <div className="mt-6">
          {clear ? (
            <AlertBanner tone="success" title="Handover clear at capture">
              No unresolved exceptions or awaiting-verification links in this snapshot.
            </AlertBanner>
          ) : (
            <AlertBanner tone="warning" title="Handover not clear at capture">
              Unresolved exceptions remain visible. This link does not hide discrepancies.
            </AlertBanner>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Links" value={payload.counts.links} />
          <Stat label="Verified" value={verified} />
          <Stat label="Awaiting" value={payload.counts.awaiting} />
          <Stat label="Unresolved" value={payload.counts.unresolvedExceptions} />
        </div>

        {payload.unresolvedExceptions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
              Unresolved exceptions
            </h2>
            <ul className="mt-3 space-y-3">
              {payload.unresolvedExceptions.map((ex, i) => (
                <li
                  key={i}
                  className="border border-[var(--border)] border-l-4 border-l-[var(--warning)] bg-white p-3 text-sm"
                >
                  <p className="font-medium">{ex.expected}</p>
                  {ex.observed && (
                    <p className="mt-1 text-[var(--danger)]">Observed: {ex.observed}</p>
                  )}
                  {ex.nextAction && (
                    <p className="mt-1 text-[var(--muted-fg)]">{ex.nextAction}</p>
                  )}
                  {ex.relatedCableId && (
                    <Badge tone="neutral" className="mt-2">
                      Related {ex.relatedCableId}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-fg)]">
          Watermark: {snap.project.name} · snapshot {snap.id} · expires{" "}
          {format(snap.shareExpiresAt, "PPpp")}. Generated by RackPatch Community Edition
          (Apache 2.0). Unresolved exceptions stay visible on purpose.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-white px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
