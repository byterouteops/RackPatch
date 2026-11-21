import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Layers,
  Link2Off,
  Lock,
  Network,
  Search,
  Server,
  Unplug,
  Wrench,
  Zap,
} from "lucide-react";
import type { FindingType } from "@prisma/client";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { JobStatusBadge } from "@/components/job-status-badge";
import { LldpImportForm } from "@/components/lldp-import-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Button, Card, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type Cause = "swap" | "wrong" | "missing" | "ambiguous" | "conflict" | "physical";

const CAUSE: Record<Cause, { label: string; why: string; color: string; tone: "danger" | "warning" | "info" | "neutral" }> = {
  swap: { label: "Swapped cable pair", why: "Two cables landed on each other's ports; link lights are up but LLDP neighbors are crossed.", color: "#ef4444", tone: "danger" },
  wrong: { label: "Connected to wrong port / device", why: "Observed neighbor differs from the planned far end.", color: "#f97316", tone: "warning" },
  missing: { label: "LLDP/CDP neighbor not detected", why: "No neighbor reported on the planned port (cable missing, port down, or LLDP disabled).", color: "#8b5cf6", tone: "info" },
  ambiguous: { label: "Ambiguous neighbor identity", why: "Device name could not be matched to the plan; add a device or port alias.", color: "#3b82f6", tone: "info" },
  conflict: { label: "Conflicting observations", why: "The two ends report different neighbors.", color: "#eab308", tone: "warning" },
  physical: { label: "Physical check disagrees", why: "A field verification contradicts the neighbor evidence.", color: "#64748b", tone: "neutral" },
};

function causeOf(type: FindingType, related: string | null): Cause | null {
  switch (type) {
    case "WRONG_ENDPOINT":
      return related ? "swap" : "wrong";
    case "NO_OBSERVATION":
      return "missing";
    case "AMBIGUOUS":
      return "ambiguous";
    case "CONFLICTING_OBSERVATIONS":
      return "conflict";
    case "PHYSICAL_MISMATCH":
      return "physical";
    default:
      return null;
  }
}

const SEV = { ERROR: { label: "Critical", tone: "danger" }, WARNING: { label: "Major", tone: "warning" }, INFO: { label: "Info", tone: "info" } } as const;

export default async function LldpPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const rev = access.project.activeRevisionId;

  const [findings, jobs] = await Promise.all([
    rev
      ? prisma.verificationFinding.findMany({
          where: { revisionId: rev },
          select: {
            id: true,
            state: true,
            findingType: true,
            severity: true,
            expectedSummary: true,
            observedSummary: true,
            relatedCableId: true,
            exceptionStatus: true,
            nextAction: true,
            plannedLink: { select: { id: true, cableId: true, aDevice: true, aPort: true, zDevice: true, zPort: true } },
          },
          orderBy: { computedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.collectionJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const matched = findings.filter((f) => f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL").length;
  const issues = findings
    .filter((f) => (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") && f.exceptionStatus !== "CLOSED")
    .map((f) => ({ ...f, cause: causeOf(f.findingType, f.relatedCableId) }))
    .filter((f): f is typeof f & { cause: Cause } => f.cause !== null);
  const checked = matched + issues.length;
  const byCause = new Map<Cause, number>();
  for (const i of issues) byCause.set(i.cause, (byCause.get(i.cause) ?? 0) + 1);
  const sevCount = (s: "ERROR" | "WARNING" | "INFO") => issues.filter((i) => i.severity === s).length;
  const swap = issues.find((i) => i.cause === "swap");
  const swapPartner = swap ? issues.find((i) => i.plannedLink.cableId === swap.relatedCableId) : undefined;
  const actions = [...new Set(issues.map((i) => i.nextAction).filter((x): x is string => Boolean(x)))].slice(0, 4);

  const summary = [
    { label: "Matched", value: matched, color: "#16a34a" },
    ...[...byCause].map(([c, v]) => ({ label: CAUSE[c].label, value: v, color: CAUSE[c].color })),
  ];

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="LLDP"
        title="Cable Mismatch Detection & Root Cause Analysis"
        description="Import LLDP/CDP neighbor output, detect swapped or wrong-port cables and missing neighbors, and get the fix."
        actions={
          <>
            <Button href="#import" size="sm">
              <Network className="h-4 w-4" aria-hidden />
              Import Neighbors
            </Button>
            <Button href={`/app/projects/${projectId}/exceptions`} size="sm" variant="secondary">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Exceptions
            </Button>
          </>
        }
      />

      {rev && (
        <div className="mb-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-7">
          <StatCard label="Mismatches" value={issues.length} icon={<AlertTriangle aria-hidden />} tone={issues.length ? "danger" : "neutral"} />
          <StatCard label="Swapped" value={byCause.get("swap") ?? 0} icon={<ArrowLeftRight aria-hidden />} tone="warning" />
          <StatCard label="Wrong Port" value={byCause.get("wrong") ?? 0} icon={<Link2Off aria-hidden />} tone="warning" />
          <StatCard label="Missing Neighbor" value={byCause.get("missing") ?? 0} icon={<Unplug aria-hidden />} tone="info" />
          <StatCard label="Ambiguous / Conflict" value={(byCause.get("ambiguous") ?? 0) + (byCause.get("conflict") ?? 0)} icon={<Search aria-hidden />} tone="neutral" />
          <StatCard
            label="Correct Matches"
            value={checked ? `${((matched / checked) * 100).toFixed(1)}%` : "\u2014"}
            icon={<CheckCircle2 aria-hidden />}
            tone="success"
          />
          <StatCard label="Links Checked" value={checked} icon={<Layers aria-hidden />} tone="info" />
        </div>
      )}

      {rev && checked > 0 && (
        <>
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
            <section className="rp-card p-4" aria-label="Verification summary">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Verification Summary</h2>
              <div className="flex items-center gap-4">
                <Donut segments={summary} total={checked} />
                <ul className="flex-1 space-y-1.5 text-[12px]">
                  {summary.map((s) => (
                    <li key={s.label} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {s.label} ({s.value})
                      </span>
                      <span className="text-[var(--muted-fg)]">{((s.value / checked) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rp-card p-4" aria-label="Root cause analysis">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Root Cause Analysis (Top Issues)</h2>
              {byCause.size === 0 ? (
                <p className="text-sm text-[var(--muted-fg)]">No open mismatches.</p>
              ) : (
                <ol className="space-y-2.5 text-[13px]">
                  {[...byCause]
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, v], i) => (
                      <li key={c} className="flex items-start gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: CAUSE[c].color }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{CAUSE[c].label}</span>
                          <span className="block text-xs text-[var(--muted-fg)]">{CAUSE[c].why}</span>
                        </span>
                        <Badge tone={CAUSE[c].tone}>{v} link{v === 1 ? "" : "s"}</Badge>
                      </li>
                    ))}
                </ol>
              )}
            </section>

            <section className="rp-card p-4" aria-label="Issue severity">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Issue Severity &amp; Impact</h2>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted-fg)]">
                    <th className="pb-2">Severity</th>
                    <th className="pb-2 text-right">Count</th>
                    <th className="pb-2 pl-3">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["ERROR", "Link carries traffic to the wrong host; blocks handover"],
                      ["WARNING", "Needs review before sign-off"],
                      ["INFO", "Informational; no action required"],
                    ] as const
                  ).map(([s, impact]) => (
                    <tr key={s} className="border-t border-[var(--border)]">
                      <td className="py-2">
                        <Badge tone={SEV[s].tone}>{SEV[s].label}</Badge>
                      </td>
                      <td className="py-2 text-right font-bold">{sevCount(s)}</td>
                      <td className="py-2 pl-3 text-xs text-[var(--muted-fg)]">{impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="rp-card overflow-hidden" aria-label="Mismatch details">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">Mismatch Details ({issues.length})</h2>
                <Link href={`/app/projects/${projectId}/exceptions`} className="text-xs font-semibold text-[var(--accent-ink)]">
                  View all {"\u2192"}
                </Link>
              </div>
              {issues.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted-fg)]">No open mismatches.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                        <th className="px-4 py-2">Cable ID</th>
                        <th className="px-2 py-2">Expected (Plan)</th>
                        <th className="px-2 py-2">Observed (LLDP/CDP)</th>
                        <th className="px-2 py-2">Issue</th>
                        <th className="px-2 py-2">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.slice(0, 8).map((i) => (
                        <tr key={i.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2">
                            <Link href={`/app/projects/${projectId}/exceptions?ex=${i.id}`} className="rp-mono font-semibold text-[var(--accent-ink)]">
                              {i.plannedLink.cableId}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-xs">{i.expectedSummary}</td>
                          <td className="px-2 py-2 text-xs text-[var(--danger-ink)]">{i.observedSummary ?? "No neighbor detected"}</td>
                          <td className="px-2 py-2">
                            <Badge tone={CAUSE[i.cause].tone}>{CAUSE[i.cause].label.split(" ")[0]}</Badge>
                          </td>
                          <td className="px-2 py-2">
                            <Badge tone={SEV[i.severity].tone}>{SEV[i.severity].label}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rp-card p-4" aria-label="Cabling comparison">
              <h2 className="rp-display mb-3 text-[15px] font-bold">
                Cabling Comparison {swap && <>{"\u2014"} {swap.plannedLink.cableId}</>}
                {swapPartner && <> / {swapPartner.plannedLink.cableId}</>}
              </h2>
              {!swap ? (
                <p className="text-sm text-[var(--muted-fg)]">No swapped pair detected.</p>
              ) : (
                <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="rounded-lg border border-emerald-200 bg-[var(--success-soft)] p-3">
                    <p className="mb-2 text-center text-xs font-bold text-[var(--success-ink)]">Expected (Cable Plan)</p>
                    {[swap, swapPartner].filter(Boolean).map((f) => (
                      <PathRow key={f!.id} a={`${f!.plannedLink.aDevice} ${f!.plannedLink.aPort}`} z={`${f!.plannedLink.zDevice} ${f!.plannedLink.zPort}`} ok />
                    ))}
                  </div>
                  <span className="text-center text-xs font-bold text-[var(--muted-fg)]">VS</span>
                  <div className="rounded-lg border border-red-200 bg-[var(--danger-soft)] p-3">
                    <p className="mb-2 text-center text-xs font-bold text-[var(--danger-ink)]">Observed (Actual)</p>
                    {[swap, swapPartner].filter(Boolean).map((f) => (
                      <p key={f!.id} className="my-1.5 rounded-md bg-white/70 px-2 py-1.5 text-center text-xs font-medium">
                        {f!.observedSummary ?? "No neighbor"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
            <section className="rp-card p-4" aria-label="Recommended actions">
              <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
                <Wrench className="h-4 w-4" aria-hidden />
                Recommended Actions
              </h2>
              {actions.length === 0 ? (
                <p className="text-sm text-[var(--muted-fg)]">Nothing to fix right now.</p>
              ) : (
                <ol className="space-y-2 text-[13px]">
                  {[...actions, "Re-import LLDP/CDP output for the affected devices to confirm the fix."].map((a, i) => (
                    <li key={a} className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--success)] text-[11px] font-bold text-white">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rp-card p-4" aria-label="Quick actions">
              <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
                <Zap className="h-4 w-4" aria-hidden />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button href="#import" size="sm">
                  Re-test (import)
                </Button>
                <Button href={`/app/projects/${projectId}/exceptions`} size="sm" variant="secondary">
                  Acknowledge
                </Button>
                <Button href={`/app/projects/${projectId}/work-orders?new=1`} size="sm" variant="secondary">
                  Create remedy task
                </Button>
                <Button href={`/app/projects/${projectId}/collection`} size="sm" variant="secondary">
                  Collect via SSH
                </Button>
              </div>
            </section>
          </div>
        </>
      )}

      <div id="import" className="scroll-mt-20">
        {!access.canImportEvidence ? (
          <div className="mb-4">
            <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Import not allowed" description="Requires lead role and activated project." />
          </div>
        ) : (
          <Card
            title="Import neighbor evidence"
            description="Paste Cisco NX-OS/IOS-XE LLDP, Cisco CDP, Arista EOS LLDP, or Juniper Junos LLDP output. The parser picks the vendor format."
            className="mb-4"
          >
            <LldpImportForm projectId={projectId} />
          </Card>
        )}
      </div>

      <Card title="Collection jobs" description="Paste imports and SSH collection runs." flush>
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
                    <td className="rp-mono font-medium">
                      <Server className="mr-1.5 inline h-3.5 w-3.5 text-[var(--muted-fg)]" aria-hidden />
                      {j.sourceDevice}
                    </td>
                    <td>
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="text-xs">
                      {j.error ? <span className="text-[var(--danger-ink)]">{j.error}</span> : <span className="text-[var(--muted-fg)]">{j.note ?? "\u2014"}</span>}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
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

function PathRow({ a, z, ok }: { a: string; z: string; ok?: boolean }) {
  return (
    <div className="my-1.5 flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs font-medium">
      <span>{a}</span>
      <span className={cn("h-0.5 flex-1", ok ? "bg-[var(--success)]" : "bg-[var(--danger)]")} aria-hidden />
      <span>{z}</span>
    </div>
  );
}

function Donut({ segments, total }: { segments: Array<{ value: number; color: string }>; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const arcs = segments.reduce<Array<{ len: number; offset: number; color: string }>>((acc, s) => {
    const prev = acc[acc.length - 1];
    acc.push({ len: total ? (s.value / total) * c : 0, offset: prev ? prev.offset + prev.len : 0, color: s.color });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 110 110" className="h-28 w-28 shrink-0" role="img" aria-label={`${total} links checked`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" />
      {arcs.map((a, i) => (
        <circle key={i} cx="55" cy="55" r={r} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={`${a.len} ${c - a.len}`} strokeDashoffset={-a.offset} transform="rotate(-90 55 55)" />
      ))}
      <text x="55" y="56" textAnchor="middle" className="fill-[var(--foreground)] text-[20px] font-bold">
        {total}
      </text>
      <text x="55" y="70" textAnchor="middle" className="fill-[var(--muted-fg)] text-[9px]">
        Links
      </text>
    </svg>
  );
}
