import Link from "next/link";
import { AlertTriangle, Building2, Cable, CheckCircle2, Clock, Lock, MapPin, Plus, Server } from "lucide-react";
import { requireWorkspaceOwner } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createSite } from "@/app/actions/workspace";
import { buildRackLayout, type TwinRack } from "@/lib/twin/rack-layout";
import { RackViewPanel } from "@/components/rack-view-panel";
import { Button, EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type LinkRow = {
  projectId: string;
  aRack: string;
  zRack: string;
  aDevice: string;
  zDevice: string;
  installStatus: "PLANNED" | "INSTALLED" | "BLOCKED" | null;
  retiredAt: Date | null;
  state: string | undefined;
  open: boolean;
};

export default async function WorkspaceSitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ site?: string; rack?: string; q?: string }>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  try {
    await requireWorkspaceOwner(user, workspaceId);
  } catch {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="Workspace owners only." />;
  }

  const [workspace, sites, projects] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.site.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { workspaceId },
      select: { id: true, name: true, site: true, siteId: true, activeRevisionId: true },
    }),
  ]);
  const revIds = projects.map((p) => p.activeRevisionId).filter((x): x is string => Boolean(x));
  const rawLinks = revIds.length
    ? await prisma.plannedLink.findMany({
        where: { revisionId: { in: revIds } },
        take: 20000,
        select: {
          aRack: true,
          zRack: true,
          aDevice: true,
          zDevice: true,
          revision: { select: { projectId: true } },
          runtime: { select: { installStatus: true, retiredAt: true } },
          findings: { take: 1, select: { state: true, exceptionStatus: true } },
        },
      })
    : [];
  const links: LinkRow[] = rawLinks.map((l) => ({
    projectId: l.revision.projectId,
    aRack: l.aRack.trim(),
    zRack: l.zRack.trim(),
    aDevice: l.aDevice,
    zDevice: l.zDevice,
    installStatus: l.runtime?.installStatus ?? null,
    retiredAt: l.runtime?.retiredAt ?? null,
    state: l.findings[0]?.state,
    open: Boolean(l.findings[0] && (l.findings[0].state === "MISMATCH" || l.findings[0].state === "NEEDS_REVIEW") && l.findings[0].exceptionStatus !== "CLOSED"),
  }));

  const siteOfProject = (p: (typeof projects)[number]) => p.siteId ?? sites.find((s) => s.name === p.site)?.id ?? null;
  const siteStats = sites.map((s) => {
    const pids = new Set(projects.filter((p) => siteOfProject(p) === s.id).map((p) => p.id));
    const siteLinks = links.filter((l) => pids.has(l.projectId));
    const layout = buildRackLayout(siteLinks);
    return { site: s, projects: pids.size, racks: layout.racks.length, devices: layout.totalDevices, cables: layout.activeLinks, links: siteLinks, layout };
  });

  const q = (sp.q ?? "").trim().toLowerCase();
  const visibleSites = siteStats.filter((s) => !q || s.site.name.toLowerCase().includes(q));
  const selectedSite = siteStats.find((s) => s.site.id === sp.site) ?? siteStats.find((s) => s.cables > 0) ?? siteStats[0] ?? null;
  const racks = selectedSite ? [...selectedSite.layout.racks].sort((a, b) => a.rack.localeCompare(b.rack, undefined, { numeric: true })) : [];
  const rackStats = (r: TwinRack) => {
    const rl = selectedSite!.links.filter((l) => !l.retiredAt && (l.aRack === r.rack || l.zRack === r.rack));
    const installed = rl.filter((l) => l.installStatus === "INSTALLED").length;
    const verified = rl.filter((l) => l.state === "VERIFIED_LLDP" || l.state === "VERIFIED_PHYSICAL").length;
    const exceptions = rl.filter((l) => l.open).length;
    const byProject = new Map<string, number>();
    for (const l of rl) byProject.set(l.projectId, (byProject.get(l.projectId) ?? 0) + 1);
    const projectId = [...byProject].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { total: rl.length, installed, verified, exceptions, pending: rl.length - verified, projectId };
  };
  const selectedRack = racks.find((r) => r.rack === sp.rack) ?? racks[0] ?? null;
  const rs = selectedRack ? rackStats(selectedRack) : null;
  const rackProject = rs?.projectId ? projects.find((p) => p.id === rs.projectId) : null;
  const base = `/app/workspaces/${workspaceId}/sites`;
  const href = (site: string, rack?: string) => `${base}?site=${site}${rack ? `&rack=${encodeURIComponent(rack)}` : ""}`;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-xs font-medium text-[var(--muted-fg)]">
            <Link href="/app" className="hover:text-[var(--accent)]">
              Workspaces
            </Link>{" "}
            / <span className="text-[var(--foreground)]">{workspace.name}</span>
          </nav>
          <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">Sites &amp; Racks</h1>
          <p className="text-sm text-[var(--muted-fg)]">Data center sites, racks and devices derived from your published cable plans.</p>
        </div>
        <Button href={`/app/workspaces/${workspaceId}/team`} size="sm" variant="secondary">
          Team
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rp-card overflow-hidden" aria-label="Sites">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <Building2 className="h-4 w-4" aria-hidden />
                Sites ({sites.length})
              </h2>
            </div>
            <form action={base} className="border-b border-[var(--border)] p-3">
              <Input name="q" defaultValue={sp.q} placeholder={"Search sites\u2026"} aria-label="Search sites" className="h-9" />
            </form>
            {visibleSites.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">No sites yet. Sites are created with projects, or add one below.</p>
            ) : (
              <ul className="space-y-2 p-3">
                {visibleSites.map((s) => {
                  const active = s.site.id === selectedSite?.site.id;
                  return (
                    <li key={s.site.id}>
                      <Link
                        href={href(s.site.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex gap-3 rounded-xl border p-3 transition-colors",
                          active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]",
                        )}
                      >
                        <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="rp-display truncate text-[14px] font-bold">{s.site.name}</span>
                            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", s.cables ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--muted)] text-[var(--muted-fg)]")}>
                              {s.cables ? "Active" : "Empty"}
                            </span>
                          </span>
                          <span className="block text-[11px] text-[var(--muted-fg)]">
                            {s.projects} project(s) {"\u00b7"} {s.racks} racks {"\u00b7"} {s.devices} devices {"\u00b7"} {s.cables} cables
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rp-card overflow-hidden" aria-label="Racks">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
                <Server className="h-4 w-4" aria-hidden />
                Racks in {selectedSite?.site.name ?? "site"} ({racks.length})
              </h2>
            </div>
            {racks.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted-fg)]">Publish a cable plan for a project at this site to see racks.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Rack</th>
                    <th className="px-2 py-2 text-right">Devices</th>
                    <th className="px-2 py-2 text-right">Cables</th>
                    <th className="px-4 py-2 text-right">Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {racks.map((r) => {
                    const st = rackStats(r);
                    const active = r.rack === selectedRack?.rack;
                    return (
                      <tr key={r.rack} className={cn("border-b border-[var(--border)] last:border-0", active ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                        <td className="px-4 py-2">
                          <Link href={href(selectedSite!.site.id, r.rack)} scroll={false} className="font-bold text-[var(--accent)] hover:underline">
                            {r.rack}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right">{r.devices.length}</td>
                        <td className="px-2 py-2 text-right">{st.total}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold">{st.total ? Math.round((st.installed / st.total) * 100) : 0}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="rp-card p-4" aria-label="Add site">
            <h2 className="rp-display mb-2 flex items-center gap-2 text-[15px] font-bold">
              <Plus className="h-4 w-4" aria-hidden />
              Add Site
            </h2>
            <form
              action={async (fd) => {
                "use server";
                await createSite({ workspaceId, name: String(fd.get("name") || "") });
              }}
              className="flex gap-2"
            >
              <Input name="name" required placeholder="Site / location name" className="h-9 flex-1" />
              <Button type="submit" size="sm" variant="secondary">
                Add
              </Button>
            </form>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {!selectedRack || !rs || !rackProject ? (
            <EmptyState icon={<MapPin className="h-5 w-5" aria-hidden />} title="No racks yet" description="Racks appear once a project at this site has a published cable plan." />
          ) : (
            <>
              <section className="rp-card p-4" aria-label={`Rack ${selectedRack.rack}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="rp-display flex items-center gap-2 text-[20px] font-extrabold">
                      <Server className="h-5 w-5" aria-hidden />
                      Rack {selectedRack.rack}
                    </h2>
                    <p className="text-xs text-[var(--muted-fg)]">
                      {selectedSite?.site.name} {"\u203a"} {rackProject.name}
                    </p>
                  </div>
                  <Button href={`/app/projects/${rackProject.id}/twin`} size="sm" variant="secondary">
                    Rack twin
                  </Button>
                </div>
                <RackViewPanel projectId={rackProject.id} site={rackProject.site} rack={selectedRack} verifiedInRack={rs.verified} />
              </section>

              <div className="grid items-start gap-4 lg:grid-cols-2">
                <section className="rp-card overflow-hidden" aria-label="Devices in rack">
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <h2 className="rp-display text-[15px] font-bold">
                      Devices in Rack {selectedRack.rack} ({selectedRack.devices.length})
                    </h2>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                        <th className="px-4 py-2">Slot</th>
                        <th className="px-2 py-2">Device</th>
                        <th className="px-2 py-2 text-right">Ports used</th>
                        <th className="px-4 py-2 text-right">Installed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRack.devices.slice(0, 12).map((d) => (
                        <tr key={d.device} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-1.5 text-xs text-[var(--muted-fg)]">{d.slot}</td>
                          <td className="px-2 py-1.5 font-semibold">{d.device}</td>
                          <td className="px-2 py-1.5 text-right">{d.portsUsed}</td>
                          <td className="px-4 py-1.5 text-right">
                            {d.installed}/{d.portsUsed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="rp-card p-4" aria-label="Cabling summary">
                  <h2 className="rp-display mb-3 text-[15px] font-bold">Cabling Summary (Rack {selectedRack.rack})</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: "Total Cables", value: rs.total, icon: Cable, cls: "text-[var(--accent)]" },
                      { label: "Verified", value: rs.verified, icon: CheckCircle2, cls: "text-[var(--success)]" },
                      { label: "Pending", value: rs.pending, icon: Clock, cls: "text-amber-500" },
                      { label: "Exceptions", value: rs.exceptions, icon: AlertTriangle, cls: "text-[var(--danger)]" },
                    ].map((k) => (
                      <div key={k.label} className="rounded-lg border border-[var(--border)] p-3 text-center">
                        <k.icon className={cn("mx-auto h-6 w-6", k.cls)} aria-hidden />
                        <p className="rp-display mt-1 text-xl font-extrabold">{k.value}</p>
                        <p className="text-[11px] text-[var(--muted-fg)]">{k.label}</p>
                      </div>
                    ))}
                  </div>
                  <Link href={`/app/projects/${rackProject.id}/cables`} className="mt-3 inline-block text-xs font-semibold text-[var(--accent)]">
                    Open cable plans {"\u2192"}
                  </Link>
                </section>
              </div>

              <section className="rp-card p-4" aria-label="Rack layout">
                <h2 className="rp-display mb-3 text-[15px] font-bold">Rack Layout {"\u2014"} {selectedSite?.site.name}</h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {racks.map((r) => {
                    const st = rackStats(r);
                    const p = st.total ? Math.round((st.installed / st.total) * 100) : 0;
                    const active = r.rack === selectedRack.rack;
                    return (
                      <Link
                        key={r.rack}
                        href={href(selectedSite!.site.id, r.rack)}
                        scroll={false}
                        className={cn(
                          "w-24 shrink-0 rounded-lg border p-2 text-center transition-colors",
                          active ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]",
                        )}
                      >
                        <p className="text-sm font-bold">{r.rack}</p>
                        <p className="text-[10px] text-[var(--muted-fg)]">{r.devices.length} devices</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${p}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] font-semibold">{p}%</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
