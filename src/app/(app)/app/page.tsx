import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cable,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderKanban,
  FolderOpen,
  LayoutGrid,
  Layers,
  Link2,
  List,
  MapPin,
  Server,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { listVisibleProjects } from "@/lib/authz";
import { loadProjectDashStats, PHASE_LABEL, projectPhase } from "@/lib/dashboard-stats";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createProject, createWorkspace } from "@/app/actions/workspace";
import { buildRackLayout } from "@/lib/twin/rack-layout";
import { RackViewPanel, type RackUnitInfo } from "@/components/rack-view-panel";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatCard,
} from "@/components/ui";

const pct1 = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function activityIcon(action: string): { Icon: LucideIcon; cls: string } {
  if (action.startsWith("install.")) return { Icon: CheckCircle2, cls: "bg-[var(--success)] text-white" };
  if (action.startsWith("evidence.") || action.startsWith("lldp.") || action.startsWith("import"))
    return { Icon: Upload, cls: "bg-[var(--accent)] text-white" };
  if (action.includes("share")) return { Icon: Link2, cls: "bg-[var(--accent)] text-white" };
  if (action.startsWith("handover.")) return { Icon: FileText, cls: "bg-[var(--accent)] text-white" };
  if (action.startsWith("exception.") || action.startsWith("verify."))
    return { Icon: ShieldCheck, cls: "bg-[#e07b00] text-white" };
  return { Icon: Activity, cls: "bg-[#5b708b] text-white" };
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ rackView?: string }>;
}) {
  const sp = await searchParams;
  const rackView = sp.rackView === "list" ? "list" : "grid";
  const user = await requireSessionUser();
  const [workspaces, projects, siteCount, recentAudit] = await Promise.all([
    prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      include: {
        workspace: { include: { _count: { select: { projects: true, sites: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    listVisibleProjects(user),
    prisma.site.count({
      where: { workspace: { memberships: { some: { userId: user.id } } } },
    }),
    prisma.auditEvent.findMany({
      where: {
        OR: [
          { actorId: user.id },
          {
            project: {
              OR: [
                { memberships: { some: { userId: user.id } } },
                { workspace: { memberships: { some: { userId: user.id } } } },
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, summary: true, createdAt: true, projectId: true },
    }),
  ]);

  const projectStats = await loadProjectDashStats(
    projects.slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      site: p.site,
      activeRevisionId: p.activeRevisionId,
    })),
  );

  const totals = projectStats.reduce(
    (acc, p) => {
      acc.cables += p.cables;
      acc.installed += p.installed;
      acc.verified += p.verified;
      acc.lldpMatched += p.lldpMatched;
      acc.exceptions += p.exceptions;
      acc.mismatch += p.mismatch;
      acc.needsReview += p.needsReview;
      return acc;
    },
    { cables: 0, installed: 0, verified: 0, lldpMatched: 0, exceptions: 0, mismatch: 0, needsReview: 0 },
  );

  const installPct = pct1(totals.installed, totals.cables);
  const verifyPct = pct1(totals.verified, totals.cables);
  const exceptionPct = pct1(totals.exceptions, totals.cables);
  const firstProject = projectStats[0];
  const firstRevisionId = projects[0]?.activeRevisionId ?? null;
  const scopeLabel = projectStats.length === 1 ? projectStats[0].name : `All projects (${projectStats.length})`;

  const rackLinks = firstRevisionId
    ? await prisma.plannedLink.findMany({
        where: { revisionId: firstRevisionId },
        select: {
          aRack: true,
          zRack: true,
          aDevice: true,
          zDevice: true,
          runtime: { select: { installStatus: true, retiredAt: true } },
          findings: { where: { revisionId: firstRevisionId }, select: { state: true }, take: 1 },
        },
        take: 5000,
      })
    : [];
  const rackLayout = buildRackLayout(
    rackLinks.map((l) => ({
      aRack: l.aRack,
      zRack: l.zRack,
      aDevice: l.aDevice,
      zDevice: l.zDevice,
      installStatus: l.runtime?.installStatus ?? null,
      retiredAt: l.runtime?.retiredAt ?? null,
    })),
  );
  const busiestRack =
    [...rackLayout.racks].sort((a, b) => b.devices.length - a.devices.length || b.links - a.links)[0] ??
    null;
  const verifiedInRack = busiestRack
    ? rackLinks.filter(
        (l) =>
          (l.aRack.trim() === busiestRack.rack || l.zRack.trim() === busiestRack.rack) &&
          (l.findings[0]?.state === "VERIFIED_LLDP" || l.findings[0]?.state === "VERIFIED_PHYSICAL"),
      ).length
    : 0;
  const rackUnits = new Map<string, RackUnitInfo>();
  if (firstProject && busiestRack) {
    const inv = await prisma.deviceInventory.findMany({
      where: { projectId: firstProject.id, rack: busiestRack.rack },
      select: { name: true, rackUnit: true, uHeight: true, model: true },
    });
    for (const d of inv) rackUnits.set(d.name.toLowerCase(), { rackUnit: d.rackUnit, uHeight: d.uHeight, model: d.model });
  }

  const legend = [
    ["Installed", totals.installed, "bg-[var(--success)]"],
    ["Verified", totals.verified, "bg-[var(--accent)]"],
    ["Exceptions", totals.exceptions, "bg-[var(--warning)]"],
    ["Remaining", Math.max(totals.cables - totals.installed, 0), "bg-[#c3d0de]"],
  ] as const;

  const lldpTiles = [
    { label: "Matched", value: totals.lldpMatched, Icon: CheckCircle2, tile: "bg-[var(--success-soft)] border-[#cde9d6]", ink: "text-[var(--success-ink)]", dot: "bg-[var(--success)]" },
    { label: "Mismatch", value: totals.mismatch, Icon: XCircle, tile: "bg-[var(--danger-soft)] border-[#f4cccc]", ink: "text-[#b91c1c]", dot: "bg-[var(--danger)]" },
    { label: "Needs Review", value: totals.needsReview, Icon: Clock3, tile: "bg-[var(--warning-soft)] border-[#f6dfb2]", ink: "text-[var(--warning-ink)]", dot: "bg-[var(--warning)]" },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-gradient-to-r from-white via-[#f3f9fe] to-[#e3f1fc] px-5 py-5 sm:px-6">
        <svg
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[60%] max-w-[720px]"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 95 C 150 40, 300 130, 600 50 L600 120 L0 120 Z" fill="#0076d5" opacity="0.05" />
          <path d="M0 80 C 180 120, 360 20, 600 70" fill="none" stroke="#00bceb" strokeOpacity="0.28" strokeWidth="1.5" />
          <path d="M0 100 C 200 60, 380 120, 600 85" fill="none" stroke="#0076d5" strokeOpacity="0.16" strokeWidth="1.5" />
        </svg>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3.5">
            <span className="mt-1 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[var(--cyan)] to-[var(--accent)]" aria-hidden />
            <div>
              <h1 className="rp-h1 text-[26px] sm:text-[30px]">Welcome to RackPatch</h1>
              <p className="mt-1 text-[14px] text-[var(--body)]">
                Plan. Install. Verify. Handover — Live counts from your database.
              </p>
            </div>
          </div>
          {firstProject ? (
            <Button href={`/app/projects/${firstProject.id}`} size="lg" className="self-start sm:self-auto">
              <FolderOpen className="h-[18px] w-[18px]" aria-hidden />
              Open Project
            </Button>
          ) : (
            <Button href="#create" size="lg" className="self-start sm:self-auto">
              Create a project
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label="Cables (Total)"
          value={totals.cables}
          hint={`${installPct}%`}
          sub={`Planned: ${totals.cables.toLocaleString("en-US")} | Installed: ${totals.installed.toLocaleString("en-US")}`}
          progress={installPct}
          icon={<Cable aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Installed"
          value={totals.installed}
          hint={`${installPct}%`}
          progress={installPct}
          icon={<CheckCircle2 aria-hidden />}
          tone="success"
        />
        <StatCard
          label="Verified"
          value={totals.verified}
          hint={`${verifyPct}%`}
          progress={verifyPct}
          icon={<ShieldCheck aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Exceptions"
          value={totals.exceptions}
          hint={totals.cables > 0 ? `${exceptionPct}%` : undefined}
          progress={totals.cables > 0 ? exceptionPct : undefined}
          icon={<AlertTriangle aria-hidden />}
          tone={totals.exceptions > 0 ? "warning" : "neutral"}
        />
        <Link
          href="/app/projects"
          className="rp-focus group block h-full rounded-[var(--radius)] sm:col-span-2 lg:col-span-1"
          aria-label={`Projects: ${projects.length}. View all projects`}
        >
          <div className="rp-card flex h-full min-h-[96px] items-center gap-3.5 px-4 py-3.5 transition-shadow group-hover:shadow-[var(--shadow-md)]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]">
              <Layers className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight text-[var(--foreground)]">Projects</p>
              <p className="rp-kpi mt-1">{projects.length.toLocaleString("en-US")}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--muted-fg)] transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card
          title={busiestRack ? `Rack View — ${busiestRack.rack}` : "Rack View"}
          description={firstProject ? firstProject.name : undefined}
          icon={<Server aria-hidden />}
          action={
            firstProject && busiestRack ? (
              <>
                <div className="inline-flex rounded-full border border-[var(--border)] bg-white p-0.5 text-[13px] font-semibold" role="group" aria-label="Rack view mode">
                  {(
                    [
                      ["grid", "Grid", LayoutGrid],
                      ["list", "List", List],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <Link
                      key={id}
                      href={id === "grid" ? "/app" : "/app?rackView=list"}
                      scroll={false}
                      aria-current={rackView === id ? "true" : undefined}
                      className={cn(
                        "rp-focus inline-flex h-8 items-center gap-1.5 rounded-full px-3",
                        rackView === id ? "bg-[var(--accent)] text-white" : "text-[var(--body)] hover:text-[var(--accent-ink)]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
                <Button href={`/app/projects/${firstProject.id}/racks`} size="sm" variant="outline" className="hidden sm:inline-flex">
                  All Racks
                </Button>
              </>
            ) : undefined
          }
        >
          {firstProject && busiestRack ? (
            <RackViewPanel
              projectId={firstProject.id}
              site={firstProject.site}
              rack={busiestRack}
              verifiedInRack={verifiedInRack}
              units={rackUnits}
              view={rackView}
            />
          ) : (
            <EmptyState
              title="No racks yet"
              description="Publish a cable plan to see rack elevations here."
            />
          )}
        </Card>

        <div className="space-y-5">
          <Card
            title="Project Progress"
            description={scopeLabel}
            icon={<BarChart3 aria-hidden />}
            action={
              <p className="text-right">
                <span className="rp-display text-[22px] font-bold text-[var(--accent-ink)]">{installPct}%</span>{" "}
                <span className="text-[13px] font-semibold text-[var(--body)]">
                  ({totals.installed.toLocaleString("en-US")}/{totals.cables.toLocaleString("en-US")})
                </span>
              </p>
            }
          >
            <div
              className="h-2.5 overflow-hidden rounded-full bg-[var(--muted)]"
              role="progressbar"
              aria-label="Installed"
              aria-valuenow={totals.installed}
              aria-valuemin={0}
              aria-valuemax={Math.max(totals.cables, 1)}
            >
              <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)]" style={{ width: `${installPct}%` }} />
            </div>
            <ul className="mt-4 space-y-2 text-[14px]">
              {legend.map(([label, n, dot]) => (
                <li key={label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-[var(--body)]">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
                    {label}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">
                    {n.toLocaleString("en-US")} / {totals.cables.toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-[var(--muted-fg)]">Counts overlap: a verified cable is also installed.</p>
          </Card>

          <Card
            title="Verification Results (LLDP / CDP)"
            icon={<ShieldCheck aria-hidden />}
            action={
              firstProject ? (
                <Button href={`/app/projects/${firstProject.id}/exceptions`} size="sm" variant="outline">
                  View Details
                </Button>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-3">
              {lldpTiles.map((t) => (
                <div key={t.label} className={cn("rounded-xl border p-3", t.tile)}>
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white", t.dot)}>
                      <t.Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className={cn("text-[13px] font-semibold leading-tight", t.ink)}>{t.label}</p>
                  </div>
                  <p className="rp-kpi mt-2 text-[28px]">{t.value.toLocaleString("en-US")}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-[var(--muted-fg)]">
              Matched counts LLDP/CDP-observed cables only · {siteCount} site{siteCount === 1 ? "" : "s"} in your workspaces
            </p>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card
          title="Projects"
          description="Install / verify progress"
          icon={<FolderKanban aria-hidden />}
          flush
          action={
            <Button href="/app/projects" size="sm" variant="outline">
              View All <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          }
        >
          {projectStats.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No projects yet" description="Create a workspace and project below." />
            </div>
          ) : (
            <div className="overflow-x-auto px-5 pb-5 pt-2">
              <table className="rp-table w-full min-w-[620px] overflow-hidden rounded-lg">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Site</th>
                    <th className="text-right">Cables</th>
                    <th className="text-right">Installed</th>
                    <th className="text-right">Verified</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map((p) => {
                    const pct = p.cables > 0 ? Math.round((p.installed / p.cables) * 100) : 0;
                    const phase = projectPhase(p);
                    const tone = phase === "completed" ? "success" : phase === "no-plan" ? "neutral" : "info";
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/app/projects/${p.id}`} className="rp-focus font-semibold text-[#005fb0] hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td>{p.site}</td>
                        <td className="text-right tabular-nums">{p.cables}</td>
                        <td className="text-right tabular-nums">{p.installed}</td>
                        <td className="text-right tabular-nums">{p.verified}</td>
                        <td className="min-w-[120px]">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                            <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[12px] tabular-nums text-[var(--muted-fg)]">{pct}%</span>
                        </td>
                        <td className="whitespace-nowrap">
                          <Badge tone={tone}>{PHASE_LABEL[phase]}</Badge>
                          {p.exceptions > 0 && (
                            <Badge tone="warning" className="ml-1">
                              {p.exceptions} open
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Recent Activity"
          description="Audit log"
          icon={<Clock3 aria-hidden />}
          action={
            <Button href="/app/notifications" size="sm" variant="outline">
              View All <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          }
        >
          {recentAudit.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No recent events.</p>
          ) : (
            <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-[var(--border)]">
              {recentAudit.map((e) => {
                const { Icon, cls } = activityIcon(e.action);
                return (
                  <li key={e.id} className="relative flex gap-3">
                    <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white", cls)}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 break-words text-[13.5px] font-semibold leading-snug text-[var(--foreground)]" title={e.summary}>
                        {e.summary}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--muted-fg)]">
                        <span className="rp-mono">{e.action}</span> ·{" "}
                        <time dateTime={e.createdAt.toISOString()}>
                          {e.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        </time>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div id="create" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="New workspace">
          <form
            action={async (fd) => {
              "use server";
              await createWorkspace({ name: String(fd.get("name") || "") });
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input name="name" required placeholder="Workspace name" aria-label="Workspace name" className="flex-1" />
            <Button type="submit" variant="secondary">
              Create
            </Button>
          </form>
        </Card>

        {workspaces.length > 0 && (
          <Card title="New project" description="Site label creates/reuses a Site record.">
            <form
              action={async (fd) => {
                "use server";
                await createProject({
                  workspaceId: String(fd.get("workspaceId")),
                  name: String(fd.get("name") || ""),
                  site: String(fd.get("site") || ""),
                  timeZone: "UTC",
                  customerName: String(fd.get("customerName") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <Select name="workspaceId" required defaultValue={workspaces[0]?.workspaceId} aria-label="Workspace">
                {workspaces.map((m) => (
                  <option key={m.workspaceId} value={m.workspaceId}>
                    {m.workspace.name}
                  </option>
                ))}
              </Select>
              <Input name="name" required placeholder="Project name" aria-label="Project name" />
              <Input name="site" required placeholder="Site / location" aria-label="Site / location" />
              <Input name="customerName" placeholder="Customer (optional)" aria-label="Customer (optional)" />
              <Button type="submit">Create project</Button>
            </form>
          </Card>
        )}
      </div>

      {workspaces.length > 0 && (
        <Card title="Workspaces">
          <ul className="divide-y divide-[var(--border)]">
            {workspaces.map((m) => (
              <li key={m.workspaceId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--foreground)]">{m.workspace.name}</span>
                  <p className="text-xs text-[var(--muted-fg)]">
                    {m.workspace._count.projects} projects · {m.workspace._count.sites} sites
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button href={`/app/workspaces/${m.workspaceId}/sites`} variant="ghost" size="sm">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    Sites
                  </Button>
                  <Button href={`/app/workspaces/${m.workspaceId}/team`} variant="ghost" size="sm">
                    Team
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
