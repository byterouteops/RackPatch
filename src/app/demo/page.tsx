import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import { BrandMark } from "@/components/brand-mark";
import { Button, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const demoProject = await prisma.project.findFirst({
    where: { isDemo: true },
    include: { activeRevision: true },
  });

  const mismatches =
    demoProject?.activeRevisionId
      ? await prisma.verificationFinding.findMany({
          where: {
            revisionId: demoProject.activeRevisionId,
            state: "MISMATCH",
          },
          include: { plannedLink: true },
          orderBy: { plannedLink: { cableId: "asc" } },
        })
      : [];

  const awaiting =
    demoProject?.activeRevisionId
      ? await prisma.verificationFinding.count({
          where: {
            revisionId: demoProject.activeRevisionId,
            state: "AWAITING",
            plannedLink: { cableId: "C-203" },
          },
        })
      : 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
      <header className="border-b border-[var(--border)] bg-[var(--chrome)] px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-white">
            <BrandMark size={28} />
            RackPatch
          </Link>
          <Button href="/sign-in" size="sm">
            Sign in
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
          Synthetic demo dataset — not customer data
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Interactive demo</h1>
        <p className="mt-3 text-[var(--muted-fg)]">
          Both cables below are installed and can be link-up. RackPatch shows exactly which two
          ports to fix before handover.
        </p>

        {mismatches.length > 0 ? (
          <div className="mt-8 space-y-4">
            <Card className="border-amber-300 bg-amber-50">
              <div className="flex gap-3">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
                <div className="w-full">
                  <p className="font-semibold text-amber-950">
                    Swapped pair on Leaf-02 — {mismatches.map((m) => m.plannedLink.cableId).join(" & ")}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {mismatches.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm text-amber-950"
                      >
                        <p className="font-semibold">{m.plannedLink.cableId}</p>
                        <p className="mt-1">Expected: {m.expectedSummary}</p>
                        <p className="mt-1">Observed: {m.observedSummary}</p>
                        {m.relatedCableId && (
                          <p className="mt-1 text-amber-800">Related cable: {m.relatedCableId}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {demoProject && (
                    <Button
                      href={`/app/projects/${demoProject.id}/exceptions`}
                      className="mt-4"
                      size="sm"
                    >
                      Open exceptions in app
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {awaiting > 0 && (
              <Card>
                <div className="flex gap-3">
                  <Clock className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                  <div>
                    <p className="font-medium">C-203 remains Awaiting verification</p>
                    <p className="mt-1 text-sm text-[var(--muted-fg)]">
                      Installed with no usable LLDP evidence — missing LLDP never means the cable
                      is absent.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <div className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
                <p className="text-sm text-[var(--muted-fg)]">
                  This page is read-only synthetic data for buyers. Sign in to walk the full install
                  → LLDP → handover workflow on the seeded lab project.
                </p>
              </div>
            </Card>
          </div>
        ) : (
          <Card className="mt-8" title="Demo not seeded">
            <p className="text-sm text-[var(--muted-fg)]">
              Run <code className="rounded bg-[var(--muted)] px-1">SEED_DEMO=true npm run seed:demo</code>{" "}
              to load fixtures with a deliberate swapped pair on Leaf-02.
            </p>
          </Card>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/">Back home</Button>
          <Button href="/sign-in" variant="secondary">
            Sign in to explore
          </Button>
        </div>

        <footer className="mt-12 border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--muted-fg)]">
          © 2026 K G Pramod / VEX-NX · RackPatch · Apache License 2.0
        </footer>
      </main>
    </div>
  );
}
