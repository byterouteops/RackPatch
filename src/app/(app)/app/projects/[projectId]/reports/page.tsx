import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Cable,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Layers,
  PieChart,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeCapacitySummary } from "@/lib/capacity";
import { HandoverActions } from "@/components/handover-actions";
import { ProjectPageHeader } from "@/components/project-page-header";
import { EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const TYPE_COLORS = ["#2563eb", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444", "#64748b", "#22c55e"];

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

export default async function ProjectReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  const project = access.project;
  const rev = project.activeRevisionId;
  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={project.name}
      section="Reports"
      title="Reports & Executive Analytics"
      description="Cabling progress, verification quality and handover readiness from live project data."
    />
  );
  if (!rev) {
    return (
      <div>
        {header}
        <EmptyState title="No active plan" description="Import and publish a plan first." />
      </div>
    );
  }

  const [links, findings, photos, snapshots, reportEvents] = await Promise.all([
    prisma.plannedLink.findMany({ where: { revisionId: rev }, include: { runtime: true } }),
    prisma.verificationFinding.findMany({
      where: { revisionId: rev },
      select: { plannedLinkId: true, state: true, exceptionStatus: true, closedAt: true, captureTime: true },
    }),
    prisma.fieldPhoto.findMany({ where: { projectId }, select: { plannedLinkId: true } }),
    prisma.handoverSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, createdAt: true, hasUnresolvedExceptions: true, createdBy: { select: { name: true, email: true } } },
    }),
    prisma.auditEvent.findMany({
      where: { projectId, action: { in: ["handover.csv_export", "handover.snapshot", "handover.share_link", "labels.print"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
  ]);

  const capacity = computeCapacitySummary(
    links.map((l) => ({
      aRack: l.aRack,
      zRack: l.zRack,
      aDevice: l.aDevice,
      zDevice: l.zDevice,
      aPort: l.aPort,
      zPort: l.zPort,
      cableType: l.cableType,
      installStatus: l.runtime?.installStatus ?? null,
      retiredAt: l.runtime?.retiredAt ?? null,
    })),
  );
  const total = links.length;
  const installed = capacity.byInstallStatus.INSTALLED ?? 0;
  const blocked = capacity.byInstallStatus.BLOCKED ?? 0;
  const planned = Math.max(0, total - installed - blocked);
  const findingByLink = new Map(findings.map((f) => [f.plannedLinkId, f]));
  const isVerified = (s?: string) => s === "VERIFIED_LLDP" || s === "VERIFIED_PHYSICAL";
  const isBad = (s?: string) => s === "MISMATCH" || s === "NEEDS_REVIEW";
  const verified = findings.filter((f) => isVerified(f.state)).length;
  const bad = findings.filter((f) => isBad(f.state)).length;
  const openEx = findings.filter((f) => isBad(f.state) && f.exceptionStatus !== "CLOSED").length;
  const exTotal = findings.filter((f) => isBad(f.state) || f.closedAt).length;
  const checked = verified + bad;
  const passRate = pct(verified, checked);
  const evidenceLinks = new Set([...photos.map((p) => p.plannedLinkId).filter(Boolean), ...findings.filter((f) => isVerified(f.state)).map((f) => f.plannedLinkId)]);
  const completion = (pct(installed, total) + pct(verified, total)) / 2;
  const handoverReady = total > 0 && openEx === 0 && verified === total;

  const rackRows = capacity.byRack.slice(0, 8).map((r) => {
    const rackLinks = links.filter((l) => l.aRack === r.rack || l.zRack === r.rack);
    const v = rackLinks.filter((l) => isVerified(findingByLink.get(l.id)?.state)).length;
    return { rack: r.rack, total: r.links, verified: v, installed: Math.max(0, r.installed - v) };
  });

  const byInstaller = new Map<string, { links: number; verified: number; bad: number }>();
  for (const l of links) {
    const id = l.runtime?.installerId;
    if (!id || l.runtime?.installStatus !== "INSTALLED") continue;
    const cur = byInstaller.get(id) ?? { links: 0, verified: 0, bad: 0 };
    cur.links += 1;
    const s = findingByLink.get(l.id)?.state;
    if (isVerified(s)) cur.verified += 1;
    if (isBad(s)) cur.bad += 1;
    byInstaller.set(id, cur);
  }
  const installerUsers = byInstaller.size
    ? await prisma.user.findMany({ where: { id: { in: [...byInstaller.keys()] } }, select: { id: true, name: true, email: true } })
    : [];
  const installerRows = [...byInstaller]
    .map(([id, v]) => {
      const u = installerUsers.find((x) => x.id === id);
      return { name: u ? u.name || u.email : "Unknown", ...v, pass: pct(v.verified, v.verified + v.bad) };
    })
    .sort((a, b) => b.links - a.links)
    .slice(0, 5);

  const days = new Map<string, { pass: number; fail: number }>();
  for (const f of findings) {
    if (!f.captureTime || !(isVerified(f.state) || isBad(f.state))) continue;
    const k = f.captureTime.toISOString().slice(0, 10);
    const cur = days.get(k) ?? { pass: 0, fail: 0 };
    if (isVerified(f.state)) cur.pass += 1;
    else cur.fail += 1;
    days.set(k, cur);
  }
  const trend = [...days].sort((a, b) => a[0].localeCompare(b[0])).slice(-10);

  const quality = [
    { label: "Verification pass rate", value: passRate },
    { label: "Exceptions resolved", value: exTotal ? pct(exTotal - openEx, exTotal) : 100 },
    { label: "Evidence coverage", value: pct(evidenceLinks.size, total) },
    { label: "Cables installed", value: pct(installed, total) },
    { label: "Cable type documented", value: pct(links.filter((l) => l.cableType).length, total) },
  ];

  const insights = [
    `Overall completion is ${completion.toFixed(1)}% (installed and verified averaged).`,
    checked > 0 ? `Verification pass rate is ${passRate.toFixed(1)}% across ${checked} checked link(s).` : "No links have been checked against evidence yet.",
    openEx > 0 ? `${openEx} exception(s) still block a clean handover.` : "No open exceptions on the active revision.",
    blocked > 0 ? `${blocked} cable(s) are blocked in the field.` : "No cables are blocked in the field.",
    capacity.byCableType[0] ? `${capacity.byCableType[0].type} is the most common cable type (${capacity.byCableType[0].count}).` : "Cable types are not set in the plan.",
  ];

  const statusSegments = [
    { label: "Installed", value: installed, color: "#16a34a" },
    { label: "Planned", value: planned, color: "#f59e0b" },
    { label: "Blocked", value: blocked, color: "#ef4444" },
  ];

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="Overall Completion" value={`${completion.toFixed(1)}%`} icon={<CheckCircle2 aria-hidden />} tone="success" />
        <StatCard label="Cable Links" value={total} icon={<Cable aria-hidden />} tone="info" />
        <StatCard label="Racks" value={capacity.byRack.length} icon={<Server aria-hidden />} tone="neutral" />
        <StatCard label="Verification Pass" value={`${passRate.toFixed(1)}%`} icon={<ShieldCheck aria-hidden />} tone="success" />
        <StatCard label="Open Exceptions" value={openEx} icon={<AlertTriangle aria-hidden />} tone={openEx ? "danger" : "neutral"} href={`/app/projects/${projectId}/exceptions`} />
        <StatCard label="Handover Ready" value={handoverReady ? "Yes" : "No"} icon={<FileText aria-hidden />} tone={handoverReady ? "success" : "warning"} href={`/app/projects/${projectId}/handover`} />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4" aria-label="Progress by rack">
          <h2 className="rp-display mb-1 flex items-center gap-2 text-[15px] font-bold">
            <Layers className="h-4 w-4" aria-hidden />
            Progress by Rack
          </h2>
          <Legend items={[["Verified", "bg-[var(--success)]"], ["Installed", "bg-[var(--accent)]"], ["Planned", "bg-amber-300"]]} />
          <ul className="space-y-2.5 text-[13px]">
            {rackRows.map((r) => (
              <li key={r.rack} className="grid grid-cols-[70px_minmax(0,1fr)_44px] items-center gap-2">
                <span className="truncate font-medium">{r.rack}</span>
                <span className="flex h-4 overflow-hidden rounded bg-amber-300">
                  <span className="bg-[var(--success)]" style={{ width: `${pct(r.verified, r.total)}%` }} />
                  <span className="bg-[var(--accent)]" style={{ width: `${pct(r.installed, r.total)}%` }} />
                </span>
                <span className="text-right text-xs font-semibold">{Math.round(pct(r.verified + r.installed, r.total))}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rp-card p-4" aria-label="Cabling status">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <PieChart className="h-4 w-4" aria-hidden />
            Cabling Status
          </h2>
          <div className="flex items-center gap-5">
            <Donut segments={statusSegments} total={total} label="Cable Links" />
            <ul className="min-w-0 flex-1 space-y-2 text-[13px]">
              {statusSegments.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                  <span className="w-12 text-right text-xs text-[var(--muted-fg)]">{pct(s.value, total).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rp-card p-4" aria-label="Verification trend">
          <h2 className="rp-display mb-1 flex items-center gap-2 text-[15px] font-bold">
            <TrendingUp className="h-4 w-4" aria-hidden />
            Verification Results by Capture Day
          </h2>
          <Legend items={[["Pass", "bg-[var(--success)]"], ["Fail", "bg-red-500"]]} />
          {trend.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No evidence captured yet.</p>
          ) : (
            <TrendBars data={trend.map(([day, v]) => ({ day: day.slice(5), ...v }))} />
          )}
        </section>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4" aria-label="Cable installation by category">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <BarChart3 className="h-4 w-4" aria-hidden />
            Cables by Type
          </h2>
          {capacity.byCableType.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No cable types set.</p>
          ) : (
            <div className="flex items-center gap-5">
              <Donut
                segments={capacity.byCableType.map((t, i) => ({ value: t.count, color: TYPE_COLORS[i % TYPE_COLORS.length] }))}
                total={total}
                label="Links"
              />
              <ul className="flex-1 space-y-1.5 text-[13px]">
                {capacity.byCableType.slice(0, 7).map((t, i) => (
                  <li key={t.type} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t.type}</span>
                    <span className="font-semibold">{t.count}</span>
                    <span className="w-12 text-right text-xs text-[var(--muted-fg)]">{pct(t.count, total).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rp-card overflow-hidden" aria-label="Installer performance">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <Users className="h-4 w-4" aria-hidden />
              Installer Performance
            </h2>
          </div>
          {installerRows.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No installs attributed to a user yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Installer</th>
                  <th className="px-2 py-2 text-right">Installed</th>
                  <th className="px-2 py-2 text-right">Verified</th>
                  <th className="px-4 py-2 text-right">Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {installerRows.map((r) => (
                  <tr key={r.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-2 py-2 text-right">{r.links}</td>
                    <td className="px-2 py-2 text-right">{r.verified}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-bold", r.bad ? "bg-amber-50 text-amber-700" : "bg-[var(--success-soft)] text-[var(--success-ink)]")}>
                        {r.verified + r.bad ? `${r.pass.toFixed(0)}%` : "\u2014"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Quality">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Quality &amp; Readiness
          </h2>
          <ul className="space-y-2 text-[13px]">
            {quality.map((q) => (
              <li key={q.label} className="flex items-center gap-2">
                <CheckCircle2 className={cn("h-4 w-4 shrink-0", q.value >= 100 ? "text-[var(--success-ink)]" : "text-[var(--muted-fg)]")} aria-hidden />
                <span className="flex-1">{q.label}</span>
                <span className="font-bold">{q.value.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4" aria-label="Key insights">
          <h2 className="rp-display mb-3 text-[15px] font-bold">Key Insights</h2>
          <ul className="space-y-2 text-[13px]">
            {insights.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                {i === insights.length - 1 ? (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden />
                )}
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="rp-card overflow-hidden" aria-label="Recent reports">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[15px] font-bold">Recent Reports</h2>
          </div>
          {snapshots.length === 0 && reportEvents.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No reports generated yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.title || "Handover snapshot"}</span>
                    <span className="text-[11px] text-[var(--muted-fg)]">
                      {s.createdAt.toISOString().slice(0, 16).replace("T", " ")} {"\u00b7"} {s.createdBy.name || s.createdBy.email}
                    </span>
                  </span>
                  <Link href={`/app/projects/${projectId}/handover/${s.id}`} className="text-[var(--accent-ink)]" aria-label="Open report">
                    <Download className="h-4 w-4" />
                  </Link>
                </li>
              ))}
              {reportEvents
                .filter((e) => e.action !== "handover.snapshot")
                .map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-4 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.summary}</span>
                      <span className="text-[11px] text-[var(--muted-fg)]">
                        {e.createdAt.toISOString().slice(0, 16).replace("T", " ")} {"\u00b7"} {e.actor ? e.actor.name || e.actor.email : "System"}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Generate report">
          <h2 className="rp-display mb-2 text-[15px] font-bold">Generate Report</h2>
          {access.canExport ? (
            <>
              <p className="mb-3 text-xs text-[var(--muted-fg)]">CSV export of every link, or a frozen snapshot with a printable handover report.</p>
              <HandoverActions projectId={projectId} snapshotsEnabled />
            </>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">Exports require the lead role on an activated project.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
            <Link href={`/app/projects/${projectId}/analytics`} className="text-[var(--accent-ink)]">
              Analytics {"\u2192"}
            </Link>
            <Link href={`/app/projects/${projectId}/capacity`} className="text-[var(--accent-ink)]">
              Capacity {"\u2192"}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mb-3 flex gap-3 text-[11px] text-[var(--muted-fg)]">
      {items.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-sm", cls)} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

function TrendBars({ data }: { data: Array<{ day: string; pass: number; fail: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.pass + d.fail));
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-32 w-full max-w-[36px] flex-col justify-end overflow-hidden rounded-t">
            <div className="bg-red-500" style={{ height: `${(d.fail / max) * 100}%` }} title={`${d.fail} fail`} />
            <div className="bg-[var(--success)]" style={{ height: `${(d.pass / max) * 100}%` }} title={`${d.pass} pass`} />
          </div>
          <span className="text-[10px] text-[var(--muted-fg)]">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ segments, total, label }: { segments: Array<{ value: number; color: string }>; total: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const arcs = segments.reduce<Array<{ len: number; offset: number; color: string }>>((acc, s) => {
    const prev = acc[acc.length - 1];
    acc.push({ len: total ? (s.value / total) * c : 0, offset: prev ? prev.offset + prev.len : 0, color: s.color });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 110 110" className="h-32 w-32 shrink-0" role="img" aria-label={`${total} ${label}`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" />
      {arcs.map((a, i) => (
        <circle
          key={i}
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={a.color}
          strokeWidth="14"
          strokeDasharray={`${a.len} ${c - a.len}`}
          strokeDashoffset={-a.offset}
          transform="rotate(-90 55 55)"
        />
      ))}
      <text x="55" y="55" textAnchor="middle" className="fill-[var(--foreground)] text-[20px] font-bold">
        {total.toLocaleString("en-US")}
      </text>
      <text x="55" y="70" textAnchor="middle" className="fill-[var(--muted-fg)] text-[9px]">
        {label}
      </text>
    </svg>
  );
}
