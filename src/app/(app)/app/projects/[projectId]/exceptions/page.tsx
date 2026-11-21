import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import type { ExceptionStatus, FindingSeverity, FindingType, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { ExceptionAckForm } from "@/components/exception-ack-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import { VerificationBadge } from "@/components/status-badges";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const CATEGORY: Record<FindingType, { label: string; color: string }> = {
  WRONG_ENDPOINT: { label: "Wrong endpoint / swap", color: "#ef4444" },
  PHYSICAL_MISMATCH: { label: "Physical mismatch", color: "#f59e0b" },
  CONFLICTING_OBSERVATIONS: { label: "Conflicting evidence", color: "#8b5cf6" },
  AMBIGUOUS: { label: "Ambiguous neighbor", color: "#3b82f6" },
  NO_OBSERVATION: { label: "Missing neighbor", color: "#14b8a6" },
  AWAITING: { label: "Awaiting evidence", color: "#94a3b8" },
  EXACT_MATCH: { label: "Exact match", color: "#22c55e" },
};

const SEVERITY: Record<FindingSeverity, { label: string; bar: string; tone: "danger" | "warning" | "info" }> = {
  ERROR: { label: "Critical", bar: "bg-red-500", tone: "danger" },
  WARNING: { label: "Major", bar: "bg-amber-400", tone: "warning" },
  INFO: { label: "Info", bar: "bg-slate-400", tone: "info" },
};

const STATUS_FILTERS: Array<{ id: string; label: string; status?: ExceptionStatus }> = [
  { id: "active", label: "Active" },
  { id: "open", label: "Open", status: "OPEN" },
  { id: "ack", label: "Acknowledged", status: "ACKNOWLEDGED" },
  { id: "closed", label: "Resolved", status: "CLOSED" },
];

const STATUS_BADGE: Record<ExceptionStatus, { label: string; tone: "danger" | "warning" | "success" }> = {
  OPEN: { label: "Open", tone: "danger" },
  ACKNOWLEDGED: { label: "Acknowledged", tone: "warning" },
  CLOSED: { label: "Resolved", tone: "success" },
};

function fmt(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "\u2014";
}

export default async function ExceptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ex?: string; status?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
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
  const rev = project.activeRevisionId;
  const base = `/app/projects/${projectId}/exceptions`;
  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={project.name}
      section="Exceptions"
      title="Exception Management & Corrective Actions"
      description="Track cabling exceptions, review root cause, acknowledge, fix, re-verify and close."
      actions={
        <>
          <Button href={`/app/projects/${projectId}/work-orders?new=1`} size="sm">
            <ClipboardList className="h-4 w-4" aria-hidden />
            Create Work Order
          </Button>
          <Button href={`/app/projects/${projectId}/lldp`} size="sm" variant="secondary">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Re-Verify
          </Button>
          <Button href={`/app/projects/${projectId}/reports`} size="sm" variant="secondary">
            <FileBarChart className="h-4 w-4" aria-hidden />
            Report
          </Button>
        </>
      }
    />
  );

  if (!rev) {
    return (
      <div>
        {header}
        <EmptyState title="No plan" description="Publish a cable plan to see verification exceptions." />
      </div>
    );
  }

  const exceptionScope: Prisma.VerificationFindingWhereInput = {
    revisionId: rev,
    OR: [{ state: { in: ["MISMATCH", "NEEDS_REVIEW"] } }, { closedAt: { not: null } }],
  };
  const all = await prisma.verificationFinding.findMany({
    where: exceptionScope,
    include: { plannedLink: true },
    orderBy: { computedAt: "desc" },
  });

  const active = all.filter((f) => f.exceptionStatus !== "CLOSED");
  const openCount = all.filter((f) => f.exceptionStatus === "OPEN").length;
  const ackCount = all.filter((f) => f.exceptionStatus === "ACKNOWLEDGED").length;
  const closed = all.filter((f) => f.exceptionStatus === "CLOSED");
  const swapCount = active.filter((f) => f.relatedCableId).length;
  const closureRate = all.length ? Math.round((closed.length / all.length) * 1000) / 10 : 0;

  const byCategory = new Map<FindingType, number>();
  const bySeverity = new Map<FindingSeverity, number>();
  for (const f of active) {
    byCategory.set(f.findingType, (byCategory.get(f.findingType) ?? 0) + 1);
    bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);
  }

  const filter = STATUS_FILTERS.find((f) => f.id === sp.status) ?? STATUS_FILTERS[0];
  const list = filter.status ? all.filter((f) => f.exceptionStatus === filter.status) : active;
  const selected = all.find((f) => f.id === sp.ex) ?? list[0] ?? null;

  const ackUserIds = [...new Set(all.map((f) => f.acknowledgedById).filter((x): x is string => Boolean(x)))];
  const ackUsers = ackUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: ackUserIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userName = (id: string | null) => {
    const u = ackUsers.find((x) => x.id === id);
    return u ? u.name || u.email : null;
  };

  const playbooks = buildSwapFixPlaybooks(
    active.map((f) => ({
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

  const recentClosed = [...closed].sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0)).slice(0, 5);

  function qs(next: { ex?: string; status?: string }) {
    const p = new URLSearchParams();
    const status = next.status ?? filter.id;
    if (status !== "active") p.set("status", status);
    const ex = next.ex ?? (next.status ? undefined : selected?.id);
    if (ex) p.set("ex", ex);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }

  const workflow = [
    { label: "Identify", sub: "Exception", count: all.length, icon: AlertTriangle },
    { label: "Acknowledge", sub: "Owner note", count: ackCount, icon: UserCheck },
    { label: "Fix", sub: "Re-patch / update plan", count: active.length, icon: Wrench },
    { label: "Re-Verify", sub: "LLDP / CDP", count: null, icon: RefreshCw },
    { label: "Close", sub: "Resolved", count: closed.length, icon: CheckCircle2 },
  ];

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open" value={openCount} icon={<AlertTriangle aria-hidden />} tone={openCount ? "danger" : "neutral"} />
        <StatCard label="Acknowledged" value={ackCount} icon={<UserCheck aria-hidden />} tone="warning" />
        <StatCard label="Resolved" value={closed.length} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Potential Swaps" value={swapCount} icon={<ArrowLeftRight aria-hidden />} tone={swapCount ? "warning" : "neutral"} />
        <StatCard label="Closure Rate" value={`${closureRate}%`} icon={<ShieldCheck aria-hidden />} tone="info" />
        <StatCard label="Total (this revision)" value={all.length} icon={<ClipboardList aria-hidden />} tone="neutral" />
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          title="No exceptions"
          description="All findings are clear or awaiting evidence."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <section className="rp-card p-4" aria-label="Exceptions by category">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Exceptions by Category</h2>
              <div className="flex items-center gap-5">
                <Donut segments={[...byCategory].map(([k, v]) => ({ value: v, color: CATEGORY[k].color }))} total={active.length} />
                <ul className="flex-1 space-y-1.5 text-[13px]">
                  {[...byCategory].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY[k].color }} aria-hidden />
                      <span className="flex-1">{CATEGORY[k].label}</span>
                      <span className="font-semibold">{v}</span>
                      <span className="w-12 text-right text-xs text-[var(--muted-fg)]">{Math.round((v / active.length) * 100)}%</span>
                    </li>
                  ))}
                  {active.length === 0 && <li className="text-[var(--muted-fg)]">No active exceptions.</li>}
                </ul>
              </div>
            </section>

            <section className="rp-card p-4" aria-label="Exceptions by severity">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Exceptions by Severity</h2>
              <ul className="space-y-3">
                {(Object.keys(SEVERITY) as FindingSeverity[]).map((s) => {
                  const v = bySeverity.get(s) ?? 0;
                  return (
                    <li key={s} className="flex items-center gap-3 text-[13px]">
                      <Badge tone={SEVERITY[s].tone}>{SEVERITY[s].label}</Badge>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                        <div className={cn("h-full rounded-full", SEVERITY[s].bar)} style={{ width: `${active.length ? (v / active.length) * 100 : 0}%` }} />
                      </div>
                      <span className="w-6 text-right font-semibold">{v}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rp-card p-4" aria-label="Resolution status">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Resolution Status</h2>
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-[var(--muted)]">
                <div className="bg-red-500" style={{ width: `${(openCount / all.length) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(ackCount / all.length) * 100}%` }} />
                <div className="bg-emerald-500" style={{ width: `${(closed.length / all.length) * 100}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat value={openCount} label="Open" className="border-red-200 bg-[var(--danger-soft)] text-[var(--danger)]" />
                <MiniStat value={ackCount} label="Acknowledged" className="border-amber-200 bg-amber-50 text-amber-700" />
                <MiniStat value={closed.length} label="Resolved" className="border-emerald-200 bg-[var(--success-soft)] text-[var(--success-ink)]" />
              </div>
              <p className="mt-3 text-xs text-[var(--muted-fg)]">
                Exceptions close automatically when new evidence matches the plan.
              </p>
            </section>
          </div>

          <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <section className="rp-card overflow-hidden" aria-label="Exception list">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">Exception List ({list.length})</h2>
                <div className="flex flex-wrap gap-1">
                  {STATUS_FILTERS.map((f) => (
                    <Link
                      key={f.id}
                      href={qs({ status: f.id })}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-semibold",
                        filter.id === f.id
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--border)] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                      )}
                    >
                      {f.label}
                    </Link>
                  ))}
                </div>
              </div>
              {list.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted-fg)]">Nothing in this view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                        <th className="px-4 py-2">Cable ID</th>
                        <th className="px-2 py-2">Issue</th>
                        <th className="px-2 py-2">Severity</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((f) => {
                        const sel = f.id === selected?.id;
                        return (
                          <tr
                            key={f.id}
                            className={cn(
                              "border-b border-[var(--border)] last:border-0",
                              sel ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60",
                            )}
                          >
                            <td className="px-4 py-2">
                              <Link href={qs({ ex: f.id })} scroll={false} className="rp-mono font-bold text-[var(--accent)] hover:underline">
                                {f.plannedLink.cableId}
                              </Link>
                            </td>
                            <td className="px-2 py-2">
                              <Link href={qs({ ex: f.id })} scroll={false} className="block">
                                {CATEGORY[f.findingType].label}
                                {f.relatedCableId && <span className="text-[var(--muted-fg)]"> {"\u2194"} {f.relatedCableId}</span>}
                              </Link>
                            </td>
                            <td className="px-2 py-2">
                              <Badge tone={SEVERITY[f.severity].tone}>{SEVERITY[f.severity].label}</Badge>
                            </td>
                            <td className="px-2 py-2">
                              <Badge tone={STATUS_BADGE[f.exceptionStatus].tone}>{STATUS_BADGE[f.exceptionStatus].label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rp-card" aria-label="Exception details">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">
                  Exception Details {selected && <>{"\u2014"} <span className="rp-mono">{selected.plannedLink.cableId}</span></>}
                </h2>
                {selected && <Badge tone={STATUS_BADGE[selected.exceptionStatus].tone}>{STATUS_BADGE[selected.exceptionStatus].label}</Badge>}
              </div>
              {selected ? (
                <div className="p-4">
                  <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                    <dt className="text-[var(--muted-fg)]">Issue</dt>
                    <dd className="font-semibold">{CATEGORY[selected.findingType].label}</dd>
                    <dt className="text-[var(--muted-fg)]">Result</dt>
                    <dd>
                      <VerificationBadge state={selected.state} compact />
                    </dd>
                    <dt className="text-[var(--muted-fg)]">Plan (Expected)</dt>
                    <dd>{selected.expectedSummary}</dd>
                    <dt className="text-[var(--muted-fg)]">Observed</dt>
                    <dd className="font-medium text-[var(--danger)]">{selected.observedSummary ?? "\u2014"}</dd>
                    <dt className="text-[var(--muted-fg)]">Evidence</dt>
                    <dd className="break-words text-xs">{selected.evidenceSource ?? "\u2014"}</dd>
                    <dt className="text-[var(--muted-fg)]">Captured</dt>
                    <dd>{fmt(selected.captureTime)}</dd>
                    {selected.relatedCableId && (
                      <>
                        <dt className="text-[var(--muted-fg)]">Swapped with</dt>
                        <dd className="rp-mono font-semibold">{selected.relatedCableId}</dd>
                      </>
                    )}
                    <dt className="text-[var(--muted-fg)]">Next action</dt>
                    <dd>{selected.nextAction ?? "\u2014"}</dd>
                    {selected.acknowledgedAt && (
                      <>
                        <dt className="text-[var(--muted-fg)]">Acknowledged</dt>
                        <dd>
                          {fmt(selected.acknowledgedAt)}
                          {userName(selected.acknowledgedById) && <> by {userName(selected.acknowledgedById)}</>}
                          {selected.acknowledgeNote && <p className="text-xs text-[var(--muted-fg)]">{selected.acknowledgeNote}</p>}
                        </dd>
                      </>
                    )}
                    {selected.closedAt && (
                      <>
                        <dt className="text-[var(--muted-fg)]">Resolved</dt>
                        <dd>
                          {fmt(selected.closedAt)}
                          {selected.closedReason && <> {"\u2014"} {selected.closedReason}</>}
                        </dd>
                      </>
                    )}
                  </dl>
                  {selected.exceptionStatus === "OPEN" && access.canResolveExceptions && (
                    <ExceptionAckForm projectId={projectId} findingId={selected.id} />
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button href={`/app/projects/${projectId}/cables/${selected.plannedLinkId}`} size="sm" variant="secondary">
                      Open cable record
                    </Button>
                    <Button href={`/app/projects/${projectId}/verify?cable=${selected.plannedLinkId}`} size="sm" variant="secondary">
                      Compare evidence
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="p-4 text-sm text-[var(--muted-fg)]">Select an exception.</p>
              )}
            </section>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <section className="rp-card p-4" aria-label="Corrective action workflow">
              <h2 className="rp-display mb-4 text-[15px] font-bold">Corrective Action Workflow</h2>
              <ol className="flex items-start justify-between gap-1">
                {workflow.map((w, i) => (
                  <li key={w.label} className="flex flex-1 flex-col items-center text-center">
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl border",
                        i === 0 && "border-red-200 bg-[var(--danger-soft)] text-[var(--danger)]",
                        i === 1 && "border-blue-200 bg-[var(--accent-soft)] text-[var(--accent)]",
                        i === 2 && "border-amber-200 bg-amber-50 text-amber-700",
                        i === 3 && "border-violet-200 bg-violet-50 text-violet-700",
                        i === 4 && "border-emerald-200 bg-[var(--success-soft)] text-[var(--success-ink)]",
                      )}
                    >
                      <w.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="mt-1.5 text-xs font-bold">{w.label}</span>
                    <span className="text-[10px] leading-tight text-[var(--muted-fg)]">{w.sub}</span>
                    {w.count !== null && <span className="mt-1 text-xs font-semibold">{w.count}</span>}
                  </li>
                ))}
              </ol>
            </section>

            <section className="rp-card p-4" aria-label="Recent corrective actions">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Recently Resolved (last 5)</h2>
              {recentClosed.length === 0 ? (
                <p className="text-sm text-[var(--muted-fg)]">No resolved exceptions yet.</p>
              ) : (
                <ul className="space-y-2 text-[13px]">
                  {recentClosed.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
                      <Link href={qs({ ex: f.id, status: "closed" })} className="rp-mono font-semibold text-[var(--accent)]">
                        {f.plannedLink.cableId}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-[var(--muted-fg)]">{f.closedReason ?? "Resolved"}</span>
                      <span className="text-xs text-[var(--muted-fg)]">{f.closedAt?.toISOString().slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rp-card p-4" aria-label="Quick actions">
              <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
                <Zap className="h-4 w-4" aria-hidden />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button href={`/app/projects/${projectId}/lldp`} size="sm">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Re-Verify
                </Button>
                <Button href={`/app/projects/${projectId}/work-orders?new=1`} size="sm" variant="secondary">
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  Corrective Task
                </Button>
                <Button href={`/app/projects/${projectId}/evidence`} size="sm" variant="secondary">
                  <Search className="h-4 w-4" aria-hidden />
                  Add Evidence
                </Button>
                <Button href={`/app/projects/${projectId}/plan`} size="sm" variant="secondary">
                  <FileBarChart className="h-4 w-4" aria-hidden />
                  Update Plan
                </Button>
              </div>
            </section>
          </div>

          {playbooks.length > 0 && <SwapFixPlaybookList projectId={projectId} playbooks={playbooks} />}
        </>
      )}
    </div>
  );
}

function MiniStat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={cn("rounded-lg border px-2 py-2", className)}>
      <p className="rp-display text-xl font-bold">{value}</p>
      <p className="text-[11px] font-semibold">{label}</p>
    </div>
  );
}

function Donut({ segments, total }: { segments: Array<{ value: number; color: string }>; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 110 110" className="h-28 w-28 shrink-0" role="img" aria-label={`${total} active exceptions`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="16" />
      {total > 0 &&
        segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="55"
              cy="55"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
            />
          );
          offset += len;
          return el;
        })}
      <text x="55" y="54" textAnchor="middle" className="fill-[var(--foreground)] text-[22px] font-bold">
        {total}
      </text>
      <text x="55" y="70" textAnchor="middle" className="fill-[var(--muted-fg)] text-[10px]">
        Active
      </text>
    </svg>
  );
}
