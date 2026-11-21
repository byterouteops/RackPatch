import Link from "next/link";
import { Activity, BarChart3, CheckCircle2, CircleDashed, FlaskConical, Layers, Lock, PieChart, Radio, Rocket, ShieldCheck, Users } from "lucide-react";
import { getProjectAccess, userHasPlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { DonutWithLegend, MeterRow, Panel } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const AREAS: Array<{ id: string; label: string; color: string; match: RegExp }> = [
  { id: "plan", label: "Plan", color: "#2563eb", match: /^(plan|project|gitops|revision)/ },
  { id: "install", label: "Install", color: "#16a34a", match: /^(install|work_?order|labels|spares|panel|circuit|lifecycle|cable)/ },
  { id: "verify", label: "Verify", color: "#8b5cf6", match: /^(evidence|verify|finding|exception|qc|collection|compliance|lldp)/ },
  { id: "evidence", label: "Field evidence", color: "#14b8a6", match: /^(field|photo|offline)/ },
  { id: "handover", label: "Handover", color: "#f59e0b", match: /^handover/ },
];
const areaOf = (action: string) => AREAS.find((a) => a.match.test(action))?.id ?? "other";
const WINDOW_DAYS = 30;

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ area?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const [access, platformAdmin] = await Promise.all([getProjectAccess(user, projectId), userHasPlatformAdmin(user)]);
  if (!(access?.isLead || platformAdmin)) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="Project leads and platform admins only." />;
  }
  const project = access?.project ?? (await prisma.project.findUnique({ where: { id: projectId } }));
  if (!project) return <EmptyState title="Project not found" />;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const [productEvents, audit, failedImports, failingHooks, lastCompliance] = await Promise.all([
    prisma.productEvent.findMany({ where: { projectId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, actorId: true, createdAt: true, propsJson: true } }),
    prisma.auditEvent.findMany({
      where: { projectId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, summary: true, actorId: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
    prisma.evidenceImport.count({ where: { projectId, parseFailed: true } }),
    prisma.webhookEndpoint.count({ where: { projectId, revokedAt: null, OR: [{ enabled: false }, { consecutiveFailures: { gt: 0 } }] } }),
    prisma.complianceRun.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
  ]);

  const events = [
    ...audit.map((a) => ({ id: `a:${a.id}`, name: a.action, at: a.createdAt, actorId: a.actorId, who: a.actor ? a.actor.name || a.actor.email : "System", detail: a.summary, source: "Audit" as const })),
    ...productEvents.map((p) => ({ id: `p:${p.id}`, name: p.name, at: p.createdAt, actorId: p.actorId, who: "\u2014", detail: p.propsJson ?? "", source: "Product" as const })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const total = events.length;
  const activeUsers = new Set(events.map((e) => e.actorId).filter(Boolean)).size;
  const activeDays = new Set(events.map((e) => e.at.toISOString().slice(0, 10))).size;

  const byArea = new Map<string, number>();
  for (const e of events) byArea.set(areaOf(e.name), (byArea.get(areaOf(e.name)) ?? 0) + 1);
  const areaSegments = [...AREAS.map((a) => ({ label: a.label, value: byArea.get(a.id) ?? 0, color: a.color })), { label: "Other", value: byArea.get("other") ?? 0, color: "#94a3b8" }];
  const usedAreas = areaSegments.filter((s) => s.value > 0 && s.label !== "Other").length;

  const byAction = new Map<string, number>();
  for (const e of events) byAction.set(e.name, (byAction.get(e.name) ?? 0) + 1);
  const topActions = [...byAction].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const days: Array<{ day: string; n: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    days.push({ day: d.slice(5), n: events.filter((e) => e.at.toISOString().slice(0, 10) === d).length });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  const area = AREAS.find((a) => a.id === sp.area);
  const stream = (area ? events.filter((e) => areaOf(e.name) === area.id) : events).slice(0, 10);

  const gates = [
    { label: "Active plan published", ok: Boolean(project.activeRevisionId) },
    { label: "No failed evidence parses", ok: failedImports === 0, detail: failedImports ? `${failedImports} failed` : undefined },
    { label: "No failing webhook endpoints", ok: failingHooks === 0 },
    { label: "Last compliance check passed", ok: lastCompliance?.status === "OK", detail: lastCompliance ? lastCompliance.status : "never run" },
    { label: "Activity in the last 7 days", ok: events.some((e) => e.at.getTime() > Date.now() - 7 * 24 * 3600 * 1000) },
  ];

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access?.project.name}
        section="Analytics"
        title="Product Analytics & Quality Assurance"
        description={`First-party usage for this project over the last ${WINDOW_DAYS} days \u2014 no third-party trackers.`}
        hideSubnav={!access}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label={`Events (${WINDOW_DAYS}d)`} value={total} icon={<BarChart3 aria-hidden />} tone="info" />
        <StatCard label="Product Events" value={productEvents.length} icon={<Radio aria-hidden />} tone="neutral" />
        <StatCard label="Active Users" value={activeUsers} icon={<Users aria-hidden />} tone="neutral" />
        <StatCard label="Active Days" value={activeDays} icon={<Activity aria-hidden />} tone="neutral" />
        <StatCard label="Feature Areas Used" value={`${usedAreas} / ${AREAS.length}`} icon={<Layers aria-hidden />} tone="success" />
        <StatCard label="Current Release" value="v0.2.0" icon={<Rocket aria-hidden />} tone="neutral" />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Event Trend (14 days)" icon={Activity}>
          <div className="flex h-40 items-end gap-1">
            {days.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full flex-col justify-end">
                  <div className="rounded-t bg-[var(--accent)]" style={{ height: `${(d.n / maxDay) * 100}%` }} title={`${d.n} events`} />
                </div>
                <span className="text-[9px] text-[var(--muted-fg)]">{d.day.slice(3)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top Actions" icon={BarChart3}>
          {topActions.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No activity in this window.</p>
          ) : (
            <ul className="space-y-2">
              {topActions.map(([name, n]) => (
                <MeterRow key={name} label={<span className="rp-mono text-xs">{name}</span>} value={n} total={total} suffix={String(n)} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Event Categories" icon={PieChart}>
          <DonutWithLegend total={total} label="events" segments={areaSegments.filter((s) => s.value > 0)} />
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Test Automation" icon={FlaskConical}>
          <ul className="space-y-2 text-[13px]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
              <span>
                Unit suite (Vitest) {"\u2014"} <code className="rp-mono text-xs">npm test</code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
              <span>
                Smoke E2E (Playwright) {"\u2014"} <code className="rp-mono text-xs">npx playwright test e2e/smoke.spec.ts</code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
              <span>
                UI audit across every page {"\u2014"} <code className="rp-mono text-xs">UI_AUDIT=1</code>
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-[var(--muted-fg)]">Tests run in CI or locally; results are not stored in this instance.</p>
        </Panel>

        <Panel title="Project Quality Gates" icon={ShieldCheck} action={<Badge tone={gates.every((g) => g.ok) ? "success" : "warning"}>{gates.filter((g) => g.ok).length}/{gates.length}</Badge>}>
          <ul className="space-y-2 text-[13px]">
            {gates.map((g) => (
              <li key={g.label} className="flex items-center gap-2">
                {g.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden /> : <CircleDashed className="h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden />}
                <span className="flex-1">{g.label}</span>
                {g.detail && <span className="text-xs text-[var(--muted-fg)]">{g.detail}</span>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Privacy & Data Use" icon={Lock}>
          <ul className="space-y-1.5 text-[13px]">
            {[
              "First-party events only, stored in this RackPatch database",
              "No third-party trackers or ads",
              "Props are counts and ids \u2014 no emails or free text",
              "Activity also comes from the project audit log",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Recent Events"
        icon={Radio}
        flush
        action={
          <div className="flex flex-wrap gap-1">
            {[{ id: "", label: "All" }, ...AREAS].map((a) => (
              <Link
                key={a.id || "all"}
                href={`/app/projects/${projectId}/analytics${a.id ? `?area=${a.id}` : ""}`}
                scroll={false}
                className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", (sp.area ?? "") === a.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]")}
              >
                {a.label}
              </Link>
            ))}
          </div>
        }
      >
        {stream.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted-fg)]">No events in this view.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                <th className="px-4 py-2">Time</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">User</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {stream.map((e) => (
                <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-xs">{e.at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-2 py-2">
                    <code className="rp-mono rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs text-[var(--accent)]">{e.name}</code>
                  </td>
                  <td className="px-2 py-2 text-xs">{e.source}</td>
                  <td className="max-w-[120px] truncate px-2 py-2 text-xs">{e.who}</td>
                  <td className="max-w-[360px] truncate px-4 py-2 text-xs text-[var(--muted-fg)]">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
