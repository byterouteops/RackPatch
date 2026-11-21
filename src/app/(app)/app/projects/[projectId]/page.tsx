import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  Cable,
  Calendar,
  CheckCircle2,
  Clock,
  FileUp,
  FolderKanban,
  HelpCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import type { VerificationState } from "@prisma/client";
import { getProjectAccess, listVisibleProjects } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { loadProjectDashStats, projectPhase, PHASE_LABEL, type ProjectPhase } from "@/lib/dashboard-stats";
import { requireSessionUser } from "@/lib/session";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { ProjectSubnav } from "@/components/project-subnav";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import { VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Button, EmptyState, ProgressBar, ProgressRing } from "@/components/ui";
import { cn } from "@/lib/utils";

const PHASE_TONE: Record<ProjectPhase, string> = {
  "no-plan": "bg-slate-100 text-slate-600",
  "in-progress": "bg-[var(--success-soft)] text-[var(--success-ink)]",
  verifying: "bg-violet-50 text-violet-700",
  completed: "bg-[var(--accent-soft)] text-[var(--accent)]",
};

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState title="Permission denied" description="You do not have access to this project." />;
  }
  const project = access.project;
  const rev = project.activeRevisionId;

  const projects = await listVisibleProjects(user);
  const stats = await loadProjectDashStats(
    projects.map((p) => ({ id: p.id, name: p.name, site: p.site, activeRevisionId: p.activeRevisionId })),
  );
  const customer = new Map(projects.map((p) => [p.id, p.customerName]));
  const me = stats.find((s) => s.id === projectId);
  const phase = me ? projectPhase(me) : "no-plan";

  const revision = rev
    ? await prisma.planRevision.findUnique({ where: { id: rev }, select: { revisionNumber: true, publishedAt: true } })
    : null;

  let body: React.ReactNode;
  if (!rev) {
    body = (
      <EmptyState
        icon={<Cable className="h-5 w-5" aria-hidden />}
        title="No active plan"
        description="Import and publish a cable plan to get started."
        action={
          access.canPublishPlan ? (
            <Button href={`/app/projects/${projectId}/plan`} size="sm">
              Import cable plan
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    const [total, installed, blocked, stateGroups, swaps, preview, openFindings, linkSlim, imports] = await Promise.all([
      prisma.plannedLink.count({ where: { revisionId: rev } }),
      prisma.plannedLink.count({ where: { revisionId: rev, runtime: { installStatus: "INSTALLED" } } }),
      prisma.plannedLink.count({ where: { revisionId: rev, runtime: { installStatus: "BLOCKED" } } }),
      prisma.verificationFinding.groupBy({ by: ["state"], where: { revisionId: rev }, _count: { _all: true } }),
      prisma.verificationFinding.count({ where: { revisionId: rev, relatedCableId: { not: null }, exceptionStatus: { not: "CLOSED" } } }),
      prisma.plannedLink.findMany({
        where: { revisionId: rev },
        orderBy: { cableId: "asc" },
        take: 10,
        select: {
          id: true,
          cableId: true,
          aDevice: true,
          aPort: true,
          zDevice: true,
          zPort: true,
          findings: { where: { revisionId: rev }, take: 1, select: { state: true, observedSummary: true } },
        },
      }),
      prisma.verificationFinding.findMany({
        where: { revisionId: rev, exceptionStatus: { not: "CLOSED" }, state: { in: ["MISMATCH", "NEEDS_REVIEW"] } },
        include: {
          plannedLink: { select: { id: true, cableId: true, aRack: true, zRack: true, aDevice: true, aPort: true, zDevice: true, zPort: true } },
        },
        orderBy: { computedAt: "desc" },
        take: 40,
      }),
      prisma.plannedLink.findMany({
        where: { revisionId: rev },
        select: { aRack: true, zRack: true, aDevice: true, zDevice: true, runtime: { select: { installStatus: true } } },
      }),
      prisma.evidenceImport.findMany({
        where: { projectId },
        select: { sourceDevice: true, sourceDeviceNorm: true, uploadedAt: true, captureTime: true, parseFailed: true },
        orderBy: { uploadedAt: "desc" },
        take: 200,
      }),
    ]);
    const count = (s: VerificationState) => stateGroups.find((g) => g.state === s)?._count._all ?? 0;
    const matched = count("VERIFIED_LLDP") + count("VERIFIED_PHYSICAL");
    const mismatch = count("MISMATCH");
    const review = count("NEEDS_REVIEW");
    const awaiting = Math.max(0, total - matched - mismatch - review);
    const pct = (n: number) => (total ? `${Math.round((n / total) * 1000) / 10}%` : "0%");

    const staleness = computeEvidenceStaleness({
      imports,
      plannedDevices: Array.from(new Set(linkSlim.flatMap((l) => [l.aDevice, l.zDevice]))),
      maxAgeDays: 7,
    });
    const byRack = new Map<string, { total: number; installed: number }>();
    for (const l of linkSlim) {
      for (const rack of new Set([l.aRack, l.zRack])) {
        const cur = byRack.get(rack) ?? { total: 0, installed: 0 };
        cur.total += 1;
        if (l.runtime?.installStatus === "INSTALLED") cur.installed += 1;
        byRack.set(rack, cur);
      }
    }
    const rackProgress = [...byRack].map(([rack, v]) => ({ rack, ...v })).sort((a, b) => a.rack.localeCompare(b.rack)).slice(0, 8);
    const playbooks = buildSwapFixPlaybooks(
      openFindings.map((f) => ({
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
        plannedLinkId: f.plannedLink.id,
      })),
    );

    const kpis = [
      { label: "Total Cables", value: total, icon: Cable, cls: "bg-[var(--accent-soft)] text-[var(--accent)]", href: "/cables" },
      { label: "Matched", value: matched, hint: pct(matched), icon: CheckCircle2, cls: "bg-[var(--success-soft)] text-[var(--success-ink)]", href: "/verify?result=match" },
      { label: "Swapped", value: swaps, hint: pct(swaps), icon: ArrowLeftRight, cls: "bg-orange-50 text-orange-600", href: "/exceptions" },
      { label: "Mismatch", value: mismatch, hint: pct(mismatch), icon: XCircle, cls: "bg-[var(--danger-soft)] text-[var(--danger)]", href: "/verify?result=mismatch" },
      { label: "Needs review", value: review, hint: pct(review), icon: HelpCircle, cls: "bg-violet-50 text-violet-700", href: "/verify?result=review" },
      { label: "Awaiting evidence", value: awaiting, hint: pct(awaiting), icon: Clock, cls: "bg-slate-100 text-slate-600", href: "/verify?result=pending" },
      { label: "Installed", value: installed, hint: pct(installed), icon: Wrench, cls: "bg-teal-50 text-teal-700", href: "/work-orders" },
      { label: "Blocked", value: blocked, icon: AlertTriangle, cls: "bg-amber-50 text-amber-700", href: "/cables?status=BLOCKED" },
    ];

    body = (
      <div className="space-y-4">
        <section className="rp-card overflow-hidden" aria-label="Cable plan expected vs observed">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="rp-display text-[16px] font-bold">Cable Plan {"\u2014"} Expected vs Observed</h2>
            <div className="flex flex-wrap gap-2">
              {access.canPublishPlan && (
                <Button href={`/app/projects/${projectId}/plan`} size="sm">
                  <FileUp className="h-4 w-4" aria-hidden />
                  Import CSV
                </Button>
              )}
              <Button href={`/app/projects/${projectId}/verify`} size="sm" variant="secondary">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Verification
              </Button>
              <Button href={`/app/projects/${projectId}/cables`} size="sm" variant="secondary">
                All cables
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] p-3 sm:grid-cols-4 min-[1800px]:grid-cols-8">
            {kpis.map((k) => (
              <Link
                key={k.label}
                href={`/app/projects/${projectId}${k.href}`}
                className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2.5 hover:border-[var(--accent)]"
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", k.cls)}>
                  <k.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-[var(--muted-fg)]">{k.label}</span>
                  <span className="rp-display block text-lg font-extrabold leading-tight">{k.value.toLocaleString("en-US")}</span>
                  {k.hint && <span className="block text-[10px] text-[var(--muted-fg)]">{k.hint}</span>}
                </span>
              </Link>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Cable ID</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Destination</th>
                  <th className="px-2 py-2">Observed</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l) => {
                  const f = l.findings[0];
                  const bad = f?.state === "MISMATCH" || f?.state === "NEEDS_REVIEW";
                  return (
                    <tr key={l.id} className={cn("border-b border-[var(--border)] last:border-0", bad ? "bg-orange-50/60" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={`/app/projects/${projectId}/cables/${l.id}`} className="rp-mono font-bold text-[var(--accent)] hover:underline">
                          {l.cableId}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className="font-semibold">{l.aDevice}</span> <span className="rp-mono text-xs text-[var(--muted-fg)]">{l.aPort}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="font-semibold">{l.zDevice}</span> <span className="rp-mono text-xs text-[var(--muted-fg)]">{l.zPort}</span>
                      </td>
                      <td className={cn("px-2 py-2 text-xs", bad ? "font-medium text-[var(--danger)]" : "text-[var(--muted-fg)]")}>{f?.observedSummary ?? "\u2014"}</td>
                      <td className="px-2 py-2">
                        <VerificationBadge state={f?.state ?? "AWAITING"} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > preview.length && (
            <div className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
              Showing {preview.length} of {total.toLocaleString("en-US")} cables {"\u00b7"}{" "}
              <Link href={`/app/projects/${projectId}/cables`} className="font-semibold text-[var(--accent)]">
                Open cable plans
              </Link>
            </div>
          )}
        </section>

        {(staleness.stale.length > 0 || staleness.neverImported.length > 0) && (
          <AlertBanner tone="warning" title="Evidence freshness">
            {staleness.stale.length > 0 && <span>{staleness.stale.length} device(s) with evidence older than 7 days (or failed parse). </span>}
            {staleness.neverImported.length > 0 && <span>{staleness.neverImported.length} planned device(s) have no import yet. </span>}
            <Link href={`/app/projects/${projectId}/lldp`} className="font-semibold underline">
              Import evidence
            </Link>
          </AlertBanner>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rp-card p-4" aria-label="Installation progress by rack">
            <h2 className="rp-display mb-3 text-[15px] font-bold">Installation progress by rack</h2>
            {rackProgress.length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">No rack data yet.</p>
            ) : (
              <div className="space-y-3">
                {rackProgress.map((r) => (
                  <ProgressBar key={r.rack} label={r.rack} value={r.installed} max={r.total} />
                ))}
              </div>
            )}
          </section>
          <section className="rp-card p-4" aria-label="Exceptions requiring attention">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="rp-display text-[15px] font-bold">Exceptions requiring attention ({openFindings.length})</h2>
              <Link href={`/app/projects/${projectId}/exceptions`} className="text-xs font-semibold text-[var(--accent)]">
                View all {"\u2192"}
              </Link>
            </div>
            {openFindings.length === 0 ? (
              <AlertBanner tone="success" title="No open exceptions">
                Verification looks clear for active mismatches and review items.
              </AlertBanner>
            ) : (
              <ul className="space-y-2">
                {openFindings.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/app/projects/${projectId}/exceptions?ex=${f.id}`}
                      className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] border-l-4 border-l-[var(--warning)] px-3 py-2 hover:bg-[var(--accent-soft)]"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
                      <span className="min-w-0 text-[13px]">
                        <span className="rp-mono font-semibold">{f.plannedLink.cableId}</span>
                        <span className="block truncate text-xs text-[var(--muted-fg)]">{f.expectedSummary}</span>
                        {f.observedSummary && <span className="block truncate text-xs text-[var(--danger)]">Observed: {f.observedSummary}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {playbooks.length > 0 && <SwapFixPlaybookList projectId={projectId} playbooks={playbooks} />}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="rp-card hidden overflow-hidden xl:block" aria-label="Projects">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="rp-display flex items-center gap-2 text-[17px] font-extrabold">
            <FolderKanban className="h-5 w-5" aria-hidden />
            Projects
          </h2>
          <Button href="/app#create" size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Create
          </Button>
        </div>
        <ul className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto p-3">
          {stats.map((p) => {
            const ph = projectPhase(p);
            const active = p.id === projectId;
            return (
              <li key={p.id}>
                <Link
                  href={`/app/projects/${p.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-xl border p-3 transition-colors",
                    active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar)] text-[var(--cyan)]">
                      <Building2 className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="rp-display block truncate text-[14px] font-bold">{p.name}</span>
                      <span className="flex items-center gap-1 truncate text-[11px] text-[var(--muted-fg)]">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        {p.site}
                      </span>
                      {customer.get(p.id) && <span className="block truncate text-[11px] text-[var(--muted-fg)]">{customer.get(p.id)}</span>}
                    </span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", PHASE_TONE[ph])}>{PHASE_LABEL[ph]}</span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-4 items-center gap-1 text-center">
                    <span>
                      <span className="block text-[10px] text-[var(--muted-fg)]">Cables</span>
                      <span className="rp-display text-[15px] font-extrabold">{p.cables.toLocaleString("en-US")}</span>
                    </span>
                    <span className="flex flex-col items-center">
                      <span className="text-[10px] text-[var(--muted-fg)]">Install</span>
                      <ProgressRing value={p.installed} max={p.cables} tone="success" size={40} />
                    </span>
                    <span className="flex flex-col items-center">
                      <span className="text-[10px] text-[var(--muted-fg)]">Verify</span>
                      <ProgressRing value={p.verified} max={p.cables} tone="info" size={40} />
                    </span>
                    <span>
                      <span className="block text-[10px] text-[var(--muted-fg)]">Exceptions</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold",
                          p.exceptions ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--success-soft)] text-[var(--success-ink)]",
                        )}
                      >
                        {p.exceptions ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
                        {p.exceptions}
                      </span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs font-medium text-[var(--muted-fg)]">
          <Link href="/app/projects" className="hover:text-[var(--accent)]">
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--foreground)]">{project.name}</span>
        </nav>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="rp-display flex flex-wrap items-center gap-3 text-[28px] font-extrabold leading-tight tracking-tight">
              <Building2 className="h-7 w-7" aria-hidden />
              {project.name}
              <span className={cn("whitespace-nowrap rounded-md px-2 py-1 font-sans text-xs font-semibold tracking-normal", PHASE_TONE[phase])}>
                {PHASE_LABEL[phase]}
              </span>
              {project.isDemo && (
                <span className="rounded-md bg-amber-50 px-2 py-1 font-sans text-xs font-semibold tracking-normal text-amber-700">Demo</span>
              )}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[var(--muted-fg)]">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {project.site}
              </span>
              {project.customerName && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" aria-hidden />
                  {project.customerName}
                </span>
              )}
              {revision && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  Plan rev {revision.revisionNumber} {"\u00b7"} published {revision.publishedAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button href={`/app/projects/${projectId}/handover`} size="sm" variant="secondary">
              Handover
            </Button>
          </div>
        </div>
        <ProjectSubnav projectId={projectId} />
        {body}
      </div>
    </div>
  );
}
