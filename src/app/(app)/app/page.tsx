import Link from "next/link";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  FolderKanban,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { listVisibleProjects } from "@/lib/authz";
import { loadProjectDashStats, PHASE_LABEL, projectPhase } from "@/lib/dashboard-stats";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createProject, createWorkspace } from "@/app/actions/workspace";
import { buildRackLayout } from "@/lib/twin/rack-layout";
import { RackViewPanel } from "@/components/rack-view-panel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  ProgressBar,
  Select,
  StatCard,
} from "@/components/ui";

export default async function AppHomePage() {
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
      take: 8,
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
      acc.exceptions += p.exceptions;
      acc.mismatch += p.mismatch;
      acc.needsReview += p.needsReview;
      return acc;
    },
    { cables: 0, installed: 0, verified: 0, exceptions: 0, mismatch: 0, needsReview: 0 },
  );

  const installPct =
    totals.cables > 0 ? Math.round((totals.installed / totals.cables) * 1000) / 10 : 0;
  const verifyPct =
    totals.cables > 0 ? Math.round((totals.verified / totals.cables) * 1000) / 10 : 0;
  const firstProject = projectStats[0];
  const firstRevisionId = projects[0]?.activeRevisionId ?? null;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="rp-display text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-[28px]">
            Welcome to RackPatch
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-fg)]">
            Plan. Install. Verify. Handover. — Live counts from your database.
          </p>
        </div>
        {firstProject ? (
          <Button href={`/app/projects/${firstProject.id}`} size="sm">
            Open project
          </Button>
        ) : (
          <Button href="#create" size="sm" variant="secondary">
            Create a project
          </Button>
        )}
      </div>

      {/* KPI strip — matches Welcome dashboard mockup */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Cables (Total)"
          value={totals.cables}
          icon={<Cable aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Installed"
          value={totals.installed}
          hint={`${installPct}%`}
          icon={<CheckCircle2 aria-hidden />}
          tone="success"
        />
        <StatCard
          label="Verified"
          value={totals.verified}
          hint={`${verifyPct}%`}
          icon={<ShieldCheck aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Exceptions"
          value={totals.exceptions}
          hint={
            totals.cables > 0
              ? `${Math.round((totals.exceptions / totals.cables) * 1000) / 10}%`
              : undefined
          }
          icon={<AlertTriangle aria-hidden />}
          tone={totals.exceptions > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Projects"
          value={projects.length}
          href="/app/projects"
          icon={<FolderKanban aria-hidden />}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title={busiestRack ? `Rack View — ${busiestRack.rack}` : "Rack View"}
          description={firstProject ? firstProject.name : undefined}
          className="xl:col-span-2"
          action={
            firstProject ? (
              <Button href={`/app/projects/${firstProject.id}/twin`} size="sm" variant="secondary">
                All racks
              </Button>
            ) : undefined
          }
        >
          {firstProject && busiestRack ? (
            <RackViewPanel
              projectId={firstProject.id}
              site={firstProject.site}
              rack={busiestRack}
              verifiedInRack={verifiedInRack}
            />
          ) : (
            <EmptyState
              title="No racks yet"
              description="Publish a cable plan to see rack elevations here."
            />
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Project Progress" description={firstProject?.name ?? "All projects"}>
            <ProgressBar
              label={`${installPct}% installed`}
              value={totals.installed}
              max={Math.max(totals.cables, 1)}
            />
            <ul className="mt-4 space-y-2 text-[13px]">
              {(
                [
                  ["Installed", totals.installed, "bg-[var(--success)]"],
                  ["Verified", totals.verified, "bg-[var(--accent)]"],
                  ["Exceptions", totals.exceptions, "bg-[var(--warning)]"],
                  ["Remaining", Math.max(totals.cables - totals.installed, 0), "bg-slate-300"],
                ] as const
              ).map(([label, n, dot]) => (
                <li key={label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
                    {label}
                  </span>
                  <span className="rp-mono font-semibold">
                    {n.toLocaleString("en-US")} / {totals.cables.toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Verification Results (LLDP / CDP)"
            action={
              firstProject ? (
                <Button href={`/app/projects/${firstProject.id}/exceptions`} size="sm" variant="secondary">
                  View details
                </Button>
              ) : undefined
            }
          >
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--success-soft)] p-3 text-center">
                <p className="text-[11px] font-semibold text-[var(--success-ink)]">Matched</p>
                <p className="rp-display mt-1 text-xl font-extrabold">{totals.verified}</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--danger-soft)] p-3 text-center">
                <p className="text-[11px] font-semibold text-[var(--danger)]">Mismatch</p>
                <p className="rp-display mt-1 text-xl font-extrabold">{totals.mismatch}</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--warning-soft)] p-3 text-center">
                <p className="text-[11px] font-semibold text-[var(--warning-ink)]">Needs review</p>
                <p className="rp-display mt-1 text-xl font-extrabold">{totals.needsReview}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted-fg)]">
              {siteCount} site{siteCount === 1 ? "" : "s"} in your workspaces
            </p>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card
          title="Projects"
          description="Install / verify progress"
          className="xl:col-span-3"
          action={
            <Button href="/app/projects" size="sm" variant="secondary">
              View all
            </Button>
          }
        >
          {projectStats.length === 0 ? (
            <EmptyState title="No projects yet" description="Create a workspace and project below." />
          ) : (
            <div className="overflow-x-auto">
              <table className="rp-table w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Site</th>
                    <th>Cables</th>
                    <th>Installed</th>
                    <th>Verified</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map((p) => {
                    const pct = p.cables > 0 ? Math.round((p.installed / p.cables) * 100) : 0;
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link
                            href={`/app/projects/${p.id}`}
                            className="font-semibold text-[var(--accent)] hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="text-[var(--muted-fg)]">{p.site}</td>
                        <td className="rp-mono">{p.cables}</td>
                        <td className="rp-mono">{p.installed}</td>
                        <td className="rp-mono">{p.verified}</td>
                        <td className="min-w-[120px]">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                            <div
                              className="h-full bg-[var(--success)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="rp-mono text-[11px] text-[var(--muted-fg)]">{pct}%</span>
                        </td>
                        <td>
                          {(() => {
                            const phase = projectPhase(p);
                            const tone =
                              phase === "completed"
                                ? "success"
                                : phase === "verifying"
                                  ? "info"
                                  : phase === "no-plan"
                                    ? "neutral"
                                    : "info";
                            return <Badge tone={tone}>{PHASE_LABEL[phase]}</Badge>;
                          })()}
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

        <Card title="Recent activity" description="Audit log" className="xl:col-span-2">
          {recentAudit.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No recent events.</p>
          ) : (
            <ul className="space-y-3">
              {recentAudit.map((e) => (
                <li key={e.id} className="border-l-2 border-[var(--accent)] pl-3">
                  <p className="text-sm font-medium leading-snug">{e.summary}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-fg)]">
                    {e.action} · {e.createdAt.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div id="create" className="grid gap-4 lg:grid-cols-2">
        <Card title="New workspace">
          <form
            action={async (fd) => {
              "use server";
              await createWorkspace({ name: String(fd.get("name") || "") });
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input name="name" required placeholder="Workspace name" className="flex-1" />
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
              <Select name="workspaceId" required defaultValue={workspaces[0]?.workspaceId}>
                {workspaces.map((m) => (
                  <option key={m.workspaceId} value={m.workspaceId}>
                    {m.workspace.name}
                  </option>
                ))}
              </Select>
              <Input name="name" required placeholder="Project name" />
              <Input name="site" required placeholder="Site / location" />
              <Input name="customerName" placeholder="Customer (optional)" />
              <Button type="submit">Create project</Button>
            </form>
          </Card>
        )}
      </div>

      {workspaces.length > 0 && (
        <Card title="Workspaces">
          <ul className="space-y-3">
            {workspaces.map((m) => (
              <li key={m.workspaceId} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{m.workspace.name}</span>
                  <p className="text-xs text-[var(--muted-fg)]">
                    {m.workspace._count.projects} projects · {m.workspace._count.sites} sites
                  </p>
                </div>
                <div className="flex gap-2">
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
