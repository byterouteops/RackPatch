import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Lock,
  PieChart,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { canAcknowledgeFinding } from "@/lib/authz-capabilities";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { DonutWithLegend, Panel, pct } from "@/components/charts";
import { QcAckForm } from "@/components/qc-ack-form";
import { ProjectPageHeader } from "@/components/project-page-header";
import { AlertBanner, Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type QcStatus = "Accepted" | "Under QC" | "Rejected" | "Rework" | "Pending";
const STATUS_TONE: Record<QcStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  Accepted: "success",
  "Under QC": "warning",
  Rejected: "danger",
  Rework: "info",
  Pending: "neutral",
};
const PAGE = 15;

export default async function QcQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ item?: string; status?: string; page?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const rev = access.project.activeRevisionId;
  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={access.project.name}
      section="QC"
      title="Contractor QC & Acceptance Queue"
      description="Review installed cables against evidence, acknowledge QC findings, track rework, and see who installed what."
      actions={access.isContractor ? <Badge tone="info">Contractor</Badge> : undefined}
    />
  );
  if (!rev) {
    return (
      <div>
        {header}
        <EmptyState icon={<ClipboardCheck className="h-5 w-5" aria-hidden />} title="No active plan" description="Publish a plan to see the QC queue." />
      </div>
    );
  }

  const [links, memberships] = await Promise.all([
    prisma.plannedLink.findMany({
      where: { revisionId: rev },
      orderBy: { cableId: "asc" },
      include: {
        runtime: { include: { installer: { select: { id: true, name: true, email: true } } } },
        findings: { take: 1 },
        physicalChecks: { orderBy: { verifiedAt: "desc" }, take: 1, include: { verifier: { select: { name: true, email: true } } } },
        fieldPhotos: { select: { id: true, note: true }, orderBy: { capturedAt: "desc" }, take: 2 },
      },
    }),
    prisma.projectMembership.findMany({ where: { projectId, contractor: true }, select: { userId: true } }),
  ]);
  const contractorIds = new Set(memberships.map((m) => m.userId));

  const statusOf = (l: (typeof links)[number]): QcStatus => {
    const f = l.findings[0];
    if (f && (f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL")) return "Accepted";
    if (l.physicalChecks.length) return "Accepted";
    if (f && (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") && f.exceptionStatus !== "CLOSED") return f.exceptionStatus === "ACKNOWLEDGED" ? "Rework" : "Rejected";
    if (l.runtime?.installStatus === "INSTALLED") return "Under QC";
    return "Pending";
  };
  const rows = links.map((l) => ({ link: l, status: statusOf(l) }));
  const counts = { Accepted: 0, "Under QC": 0, Rejected: 0, Rework: 0, Pending: 0 } as Record<QcStatus, number>;
  for (const r of rows) counts[r.status] += 1;

  const queue = rows.filter((r) => r.status !== "Pending");
  const filterStatus = (Object.keys(counts) as QcStatus[]).find((s) => s === sp.status);
  const filtered = filterStatus ? rows.filter((r) => r.status === filterStatus) : queue;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const selected = rows.find((r) => r.link.id === sp.item) ?? shown.find((r) => r.status === "Rejected" || r.status === "Under QC") ?? shown[0];
  const canAck = canAcknowledgeFinding(access);

  const byInstaller = new Map<string, { name: string; contractor: boolean; tasks: number; accepted: number; rejected: number }>();
  for (const r of rows) {
    const inst = r.link.runtime?.installer;
    if (!inst) continue;
    const cur = byInstaller.get(inst.id) ?? { name: inst.name || inst.email, contractor: contractorIds.has(inst.id), tasks: 0, accepted: 0, rejected: 0 };
    cur.tasks += 1;
    if (r.status === "Accepted") cur.accepted += 1;
    if (r.status === "Rejected" || r.status === "Rework") cur.rejected += 1;
    byInstaller.set(inst.id, cur);
  }

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: sp.status, page: sp.page, item: sp.item, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/projects/${projectId}/qc${s ? `?${s}` : ""}`;
  };
  const sel = selected?.link;
  const f = sel?.findings[0];
  const checklist = sel
    ? [
        { label: "Installed in the field", ok: sel.runtime?.installStatus === "INSTALLED" },
        { label: "LLDP/CDP neighbor matches plan", ok: f?.state === "VERIFIED_LLDP", na: !f || f.state === "AWAITING" },
        { label: "Independent physical A/Z check", ok: sel.physicalChecks.length > 0 },
        { label: "Photo evidence attached", ok: sel.fieldPhotos.length > 0 },
        { label: "Cable type recorded", ok: Boolean(sel.cableType) },
        { label: "Verifier differs from installer", ok: Boolean(sel.physicalChecks[0] && sel.runtime?.installerId && sel.physicalChecks[0].verifierId !== sel.runtime.installerId), na: !sel.physicalChecks[0] },
      ]
    : [];

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Cables" value={rows.length} icon={<ClipboardList aria-hidden />} tone="info" />
        <StatCard label="Accepted" value={counts.Accepted} icon={<CheckCircle2 aria-hidden />} tone="success" href={href({ status: "Accepted", page: undefined, item: undefined })} />
        <StatCard label="Under QC" value={counts["Under QC"]} icon={<Clock aria-hidden />} tone="warning" href={href({ status: "Under QC", page: undefined, item: undefined })} />
        <StatCard label="Rejected" value={counts.Rejected} icon={<XCircle aria-hidden />} tone={counts.Rejected ? "danger" : "neutral"} href={href({ status: "Rejected", page: undefined, item: undefined })} />
        <StatCard label="Rework (QC acked)" value={counts.Rework} icon={<RotateCcw aria-hidden />} tone="info" href={href({ status: "Rework", page: undefined, item: undefined })} />
        <StatCard label="Not Submitted" value={counts.Pending} icon={<CircleDashed aria-hidden />} tone="neutral" href={href({ status: "Pending", page: undefined, item: undefined })} />
      </div>

      {!canAck && (
        <div className="mb-4">
          <AlertBanner tone="info" title="Read-only">
            Your role cannot acknowledge QC findings. Ask a lead, or get invited as a contractor.
          </AlertBanner>
        </div>
      )}

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title={`QC Queue \u2014 ${filterStatus ?? "Installed submissions"} (${filtered.length})`}
          icon={ClipboardCheck}
          flush
          action={
            filterStatus && (
              <Link href={href({ status: undefined, page: undefined, item: undefined })} className="text-xs font-semibold text-[var(--accent)]">
                Show queue
              </Link>
            )
          }
        >
          {shown.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">Nothing in this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Cable</th>
                    <th className="px-2 py-2">Rack</th>
                    <th className="px-2 py-2">Link (A {"\u2194"} Z)</th>
                    <th className="px-2 py-2">Installer</th>
                    <th className="px-2 py-2">Submitted</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ link: l, status }) => (
                    <tr key={l.id} className={cn("border-b border-[var(--border)] last:border-0", sel?.id === l.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={href({ item: l.id })} scroll={false} className="rp-mono font-semibold text-[var(--accent)] hover:underline">
                          {l.cableId}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">{l.aRack === l.zRack ? l.aRack : `${l.aRack}/${l.zRack}`}</td>
                      <td className="px-2 py-2 text-xs">
                        {l.aDevice} {l.aPort} {"\u2194"} {l.zDevice} {l.zPort}
                      </td>
                      <td className="max-w-[110px] truncate px-2 py-2 text-xs">{l.runtime?.installer ? l.runtime.installer.name || l.runtime.installer.email : "\u2014"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs">{l.runtime?.installedAt ? l.runtime.installedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014"}</td>
                      <td className="px-4 py-2">
                        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs">
              <span className="text-[var(--muted-fg)]">
                Showing {(page - 1) * PAGE + 1}{"\u2013"}{Math.min(page * PAGE, filtered.length)} of {filtered.length}
              </span>
              <span className="flex gap-1">
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <Link key={n} href={href({ page: String(n), item: undefined })} scroll={false} className={cn("rounded px-2 py-0.5 font-semibold", n === page ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]")}>
                    {n}
                  </Link>
                ))}
              </span>
            </div>
          )}
        </Panel>

        <Panel title={sel ? `QC Review \u2014 ${sel.cableId}` : "QC Review"} icon={ClipboardCheck} action={selected && <Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>}>
          {!sel ? (
            <p className="text-sm text-[var(--muted-fg)]">Select a cable from the queue.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <dl className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px]">
                  <dt className="text-[var(--muted-fg)]">Rack</dt>
                  <dd>{sel.aRack === sel.zRack ? sel.aRack : `${sel.aRack} / ${sel.zRack}`}</dd>
                  <dt className="text-[var(--muted-fg)]">Link</dt>
                  <dd className="text-xs">
                    {sel.aDevice} {sel.aPort} {"\u2194"} {sel.zDevice} {sel.zPort}
                  </dd>
                  <dt className="text-[var(--muted-fg)]">Cable type</dt>
                  <dd>{sel.cableType ?? "\u2014"}</dd>
                  <dt className="text-[var(--muted-fg)]">Installer</dt>
                  <dd>
                    {sel.runtime?.installer ? sel.runtime.installer.name || sel.runtime.installer.email : "\u2014"}
                    {sel.runtime?.installerId && contractorIds.has(sel.runtime.installerId) && (
                      <>
                        {" "}
                        <Badge tone="info">Contractor</Badge>
                      </>
                    )}
                  </dd>
                  <dt className="text-[var(--muted-fg)]">Submitted</dt>
                  <dd className="text-xs">{sel.runtime?.installedAt?.toLocaleString("en-US") ?? "Not installed"}</dd>
                  <dt className="text-[var(--muted-fg)]">Verified by</dt>
                  <dd className="text-xs">{sel.physicalChecks[0] ? `${sel.physicalChecks[0].verifier.name || sel.physicalChecks[0].verifier.email} \u00b7 ${sel.physicalChecks[0].verifiedAt.toLocaleDateString("en-US")}` : "\u2014"}</dd>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {sel.fieldPhotos.length === 0 ? (
                    <div className="col-span-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted-fg)]">No photo evidence</div>
                  ) : (
                    sel.fieldPhotos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={`/api/field-photos/${p.id}`} alt={p.note ?? `Photo of ${sel.cableId}`} className="h-28 w-full rounded-lg border border-[var(--border)] object-cover" />
                    ))
                  )}
                </div>
              </div>

              {f && f.state !== "AWAITING" && (
                <div className="grid gap-2 rounded-lg bg-[var(--muted)]/60 p-3 text-[13px] sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted-fg)]">Expected</p>
                    <p>{f.expectedSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted-fg)]">Observed</p>
                    <p className={f.state === "MISMATCH" ? "text-[var(--danger)]" : ""}>{f.observedSummary ?? "\u2014"}</p>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">QC Checklist (independent verification)</p>
                <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-center gap-2">
                      {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden /> : <CircleDashed className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />}
                      <span className={c.ok ? "" : "text-[var(--muted-fg)]"}>
                        {c.label}
                        {"na" in c && c.na && !c.ok ? " (n/a yet)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {f?.acknowledgeNote && <p className="rounded-md border border-[var(--border)] p-2 text-xs">{f.acknowledgeNote}</p>}
              {canAck && f && (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") && f.exceptionStatus === "OPEN" && <QcAckForm projectId={projectId} findingId={f.id} />}
              <div className="flex flex-wrap gap-2">
                <Button href={`/app/projects/${projectId}/cables/${sel.id}`} size="sm">
                  Open cable record
                </Button>
                {(selected.status === "Rejected" || selected.status === "Rework") && (
                  <Button href={`/app/projects/${projectId}/exceptions?ex=${f?.id ?? ""}`} size="sm" variant="secondary">
                    Corrective action
                  </Button>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Installer Progress" icon={Users} flush>
          {byInstaller.size === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No installs recorded yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Installer</th>
                  <th className="px-2 py-2 text-right">Cables</th>
                  <th className="px-2 py-2 text-right">Accepted</th>
                  <th className="px-2 py-2 text-right">Rejected</th>
                  <th className="px-4 py-2">Acceptance</th>
                </tr>
              </thead>
              <tbody>
                {[...byInstaller.values()]
                  .sort((a, b) => b.tasks - a.tasks)
                  .map((r) => (
                    <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-semibold">
                        {r.name}{" "}
                        {r.contractor && <Badge tone="info">Contractor</Badge>}
                      </td>
                      <td className="rp-mono px-2 py-2 text-right">{r.tasks}</td>
                      <td className="rp-mono px-2 py-2 text-right text-[var(--success)]">{r.accepted}</td>
                      <td className="rp-mono px-2 py-2 text-right text-[var(--danger)]">{r.rejected}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                            <span className="block h-full rounded-full bg-[var(--success)]" style={{ width: `${pct(r.accepted, r.tasks)}%` }} />
                          </span>
                          <span className="w-10 text-right text-xs font-semibold">{Math.round(pct(r.accepted, r.tasks))}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Project QC Summary" icon={PieChart}>
          <DonutWithLegend
            total={rows.length}
            label="cables"
            segments={[
              { label: "Accepted", value: counts.Accepted, color: "#16a34a" },
              { label: "Under QC", value: counts["Under QC"], color: "#f59e0b" },
              { label: "Rejected", value: counts.Rejected, color: "#ef4444" },
              { label: "Rework", value: counts.Rework, color: "#2563eb" },
              { label: "Not submitted", value: counts.Pending, color: "#cbd5e1" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
