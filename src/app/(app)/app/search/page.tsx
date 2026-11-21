import Link from "next/link";
import type { InstallStatus, Prisma, VerificationState } from "@prisma/client";
import { Cable, Camera, Filter, FolderKanban, Layers, Network, Search, Server, ShieldCheck, Zap } from "lucide-react";
import { listVisibleProjects } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const PAGE = 50;
const INSTALL: InstallStatus[] = ["PLANNED", "INSTALLED", "BLOCKED"];
const VERIFY: Array<{ id: string; label: string; states: VerificationState[] }> = [
  { id: "pass", label: "Verified", states: ["VERIFIED_LLDP", "VERIFIED_PHYSICAL"] },
  { id: "fail", label: "Mismatch / review", states: ["MISMATCH", "NEEDS_REVIEW"] },
  { id: "pending", label: "Awaiting", states: ["AWAITING"] },
];

type Sp = { q?: string; project?: string; type?: string; install?: string; verify?: string; rack?: string; sel?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const user = await requireSessionUser();
  const projects = await listVisibleProjects(user);
  const q = (sp.q ?? "").trim().slice(0, 120);
  const scoped = sp.project ? projects.filter((p) => p.id === sp.project) : projects;
  const revIds = scoped.map((p) => p.activeRevisionId).filter((x): x is string => Boolean(x));
  const allRevIds = projects.map((p) => p.activeRevisionId).filter((x): x is string => Boolean(x));
  const projectIds = scoped.map((p) => p.id);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const types = new Set((sp.type ?? "cable,device,project").split(",").filter(Boolean));
  const install = INSTALL.find((s) => s === sp.install);
  const verify = VERIFY.find((v) => v.id === sp.verify);
  const rack = (sp.rack ?? "").trim();
  const hasFilter = Boolean(q || install || verify || rack || sp.project);

  const cableAnd: Prisma.PlannedLinkWhereInput[] = [];
  if (q)
    cableAnd.push({
      OR: [
        { cableId: { contains: q, mode: "insensitive" } },
        { aDevice: { contains: q, mode: "insensitive" } },
        { zDevice: { contains: q, mode: "insensitive" } },
        { aPort: { contains: q, mode: "insensitive" } },
        { zPort: { contains: q, mode: "insensitive" } },
        { aRack: { contains: q, mode: "insensitive" } },
        { zRack: { contains: q, mode: "insensitive" } },
      ],
    });
  if (rack) cableAnd.push({ OR: [{ aRack: { equals: rack, mode: "insensitive" } }, { zRack: { equals: rack, mode: "insensitive" } }] });
  if (install) cableAnd.push(install === "PLANNED" ? { OR: [{ runtime: null }, { runtime: { installStatus: "PLANNED" } }] } : { runtime: { installStatus: install } });
  if (verify)
    cableAnd.push(
      verify.id === "pending" ? { NOT: { findings: { some: { state: { not: "AWAITING" } } } } } : { findings: { some: { state: { in: verify.states } } } },
    );
  const cableWhere: Prisma.PlannedLinkWhereInput = { revisionId: { in: revIds }, AND: cableAnd };

  const [totals, cables, cableCount, devices, deviceCount] = await Promise.all([
    Promise.all([
      allRevIds.length ? prisma.plannedLink.count({ where: { revisionId: { in: allRevIds } } }) : 0,
      prisma.deviceInventory.count({ where: { projectId: { in: projects.map((p) => p.id) } } }),
      prisma.devicePort.count({ where: { device: { projectId: { in: projects.map((p) => p.id) } } } }),
      prisma.fieldPhoto.count({ where: { projectId: { in: projects.map((p) => p.id) } } }),
      prisma.evidenceImport.count({ where: { projectId: { in: projects.map((p) => p.id) } } }),
    ]),
    hasFilter && types.has("cable") && revIds.length
      ? prisma.plannedLink.findMany({
          where: cableWhere,
          orderBy: { cableId: "asc" },
          take: PAGE,
          select: {
            id: true,
            cableId: true,
            aRack: true,
            aDevice: true,
            aPort: true,
            zRack: true,
            zDevice: true,
            zPort: true,
            cableType: true,
            revision: { select: { projectId: true } },
            runtime: { select: { installStatus: true, lengthMeters: true } },
            findings: { take: 1, select: { state: true, observedSummary: true, evidenceSource: true } },
            _count: { select: { fieldPhotos: true, physicalChecks: true } },
          },
        })
      : Promise.resolve([]),
    hasFilter && types.has("cable") && revIds.length ? prisma.plannedLink.count({ where: cableWhere }) : Promise.resolve(0),
    hasFilter && types.has("device") && !install && !verify
      ? prisma.deviceInventory.findMany({
          where: {
            projectId: { in: projectIds },
            ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
            ...(rack ? { rack: { equals: rack, mode: "insensitive" } } : {}),
          },
          take: 20,
          orderBy: { name: "asc" },
          include: { _count: { select: { ports: true } } },
        })
      : Promise.resolve([]),
    hasFilter && types.has("device") && !install && !verify
      ? prisma.deviceInventory.count({
          where: { projectId: { in: projectIds }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}), ...(rack ? { rack: { equals: rack, mode: "insensitive" } } : {}) },
        })
      : Promise.resolve(0),
  ]);
  const [totalCables, totalDevices, totalPorts, totalPhotos, totalImports] = totals;
  const matchedProjects =
    hasFilter && types.has("project") && !install && !verify && !rack
      ? scoped.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.site.toLowerCase().includes(q.toLowerCase()))
      : [];

  type Row = { key: string; kind: "cable" | "device" | "project"; id: string; title: string; src: string; dst: string; rack: string; projectId: string };
  const rows: Row[] = [
    ...cables.map<Row>((c) => ({
      key: `cable:${c.id}`,
      kind: "cable",
      id: c.id,
      title: c.cableId,
      src: `${c.aDevice} ${c.aPort}`,
      dst: `${c.zDevice} ${c.zPort}`,
      rack: c.aRack === c.zRack ? c.aRack : `${c.aRack}/${c.zRack}`,
      projectId: c.revision.projectId,
    })),
    ...devices.map<Row>((d) => ({ key: `device:${d.id}`, kind: "device", id: d.id, title: d.name, src: `${d._count.ports} ports`, dst: "\u2014", rack: d.rack ?? "\u2014", projectId: d.projectId })),
    ...matchedProjects.map<Row>((p) => ({ key: `project:${p.id}`, kind: "project", id: p.id, title: p.name, src: p.site, dst: "\u2014", rack: "\u2014", projectId: p.id })),
  ];
  const total = cableCount + deviceCount + matchedProjects.length;
  const selected = rows.find((r) => r.key === sp.sel) ?? rows[0] ?? null;
  const selCable = selected?.kind === "cable" ? cables.find((c) => c.id === selected.id) : undefined;
  const selState = selCable?.findings[0]?.state ?? "AWAITING";
  const traceTone =
    selState === "MISMATCH" ? "bg-[var(--danger)]" : selState === "NEEDS_REVIEW" ? "bg-[var(--warning)]" : selState === "AWAITING" ? "bg-[var(--border)]" : "bg-[var(--success)]";

  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, project: sp.project, type: sp.type, install: sp.install, verify: sp.verify, rack, ...extra })) if (v) p.set(k, v);
    return `/app/search?${p.toString()}`;
  };
  const KIND_ICON = { cable: Cable, device: Server, project: FolderKanban };

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <Search className="mt-1 h-7 w-7" aria-hidden />
        <div>
          <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">Global Search &amp; Advanced Filtering</h1>
          <p className="text-sm text-[var(--muted-fg)]">Find cables, devices and projects across everything you can access. Press Ctrl+K anywhere for quick search.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 min-[1600px]:grid-cols-6">
        <StatCard label="Cables" value={totalCables} icon={<Cable aria-hidden />} tone="info" />
        <StatCard label="Devices" value={totalDevices} icon={<Server aria-hidden />} tone="neutral" />
        <StatCard label="Ports" value={totalPorts} icon={<Network aria-hidden />} tone="neutral" />
        <StatCard label="Projects" value={projects.length} icon={<FolderKanban aria-hidden />} tone="info" />
        <StatCard label="Photos" value={totalPhotos} icon={<Camera aria-hidden />} tone="neutral" />
        <StatCard label="Evidence Imports" value={totalImports} icon={<ShieldCheck aria-hidden />} tone="success" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <section className="rp-card p-4" aria-label="Advanced filters">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="rp-display flex items-center gap-2 text-[15px] font-bold">
              <Filter className="h-4 w-4" aria-hidden />
              Advanced Filters
            </h2>
            <Link href="/app/search" className="text-xs font-semibold text-[var(--accent-ink)]">
              Reset all
            </Link>
          </div>
          <form action="/app/search" className="space-y-3 text-[13px]">
            <Field label="Search">
              <input name="q" defaultValue={q} placeholder="Cable ID, device, port" className="h-9 w-full rounded-md border border-[var(--border)] px-2.5 outline-none focus:border-[var(--accent)]" />
            </Field>
            <Field label="Project">
              <select name="project" defaultValue={sp.project ?? ""} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Object type">
              <select name="type" defaultValue={sp.type ?? ""} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
                <option value="">All types</option>
                <option value="cable">Cables</option>
                <option value="device">Devices</option>
                <option value="project">Projects</option>
              </select>
            </Field>
            <Field label="Install status">
              <select name="install" defaultValue={sp.install ?? ""} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
                <option value="">All</option>
                {INSTALL.map((s) => (
                  <option key={s} value={s}>
                    {s[0] + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Verification">
              <select name="verify" defaultValue={sp.verify ?? ""} className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
                <option value="">All</option>
                {VERIFY.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rack">
              <input name="rack" defaultValue={rack} placeholder="e.g. R01" className="h-9 w-full rounded-md border border-[var(--border)] px-2.5 outline-none focus:border-[var(--accent)]" />
            </Field>
            <Button type="submit" className="w-full">
              <Search className="h-4 w-4" aria-hidden />
              Apply Filters
            </Button>
          </form>
        </section>

        <div className="min-w-0 space-y-4">
          <section className="rp-card overflow-hidden" aria-label="Search results">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="rp-display text-[15px] font-bold">Search Results {hasFilter && `(${total.toLocaleString("en-US")})`}</h2>
            </div>
            {!hasFilter ? (
              <div className="p-4">
                <EmptyState icon={<Search className="h-5 w-5" aria-hidden />} title="Search or filter" description="Type a cable ID, device or port, or pick filters on the left." />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Search className="h-5 w-5" aria-hidden />} title="No results" description="Nothing matched these filters." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Type</th>
                      <th className="px-2 py-2">Identifier / Name</th>
                      <th className="px-2 py-2">Source</th>
                      <th className="px-2 py-2">Destination</th>
                      <th className="px-2 py-2">Rack</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Verification</th>
                      <th className="px-4 py-2">Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const Icon = KIND_ICON[r.kind];
                      const c = r.kind === "cable" ? cables.find((x) => x.id === r.id) : undefined;
                      const active = r.key === selected?.key;
                      return (
                        <tr key={r.key} className={cn("border-b border-[var(--border)] last:border-0", active ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                          <td className="px-4 py-2">
                            <span className="flex items-center gap-1.5 text-xs capitalize">
                              <Icon className="h-3.5 w-3.5 text-[var(--accent-ink)]" aria-hidden />
                              {r.kind}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <Link href={keep({ sel: r.key })} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                              {r.title}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-xs">{r.src}</td>
                          <td className="px-2 py-2 text-xs">{r.dst}</td>
                          <td className="px-2 py-2 text-xs">{r.rack}</td>
                          <td className="px-2 py-2">{c ? <InstallStatusBadge status={c.runtime?.installStatus ?? "PLANNED"} /> : <Badge tone="neutral">{r.kind === "project" ? "Project" : "Inventory"}</Badge>}</td>
                          <td className="px-2 py-2">{c ? <VerificationBadge state={c.findings[0]?.state ?? "AWAITING"} compact /> : "\u2014"}</td>
                          <td className="max-w-[140px] truncate px-4 py-2 text-xs">{projectName.get(r.projectId)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {hasFilter && total > rows.length && (
              <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-fg)]">
                Showing first {rows.length} of {total.toLocaleString("en-US")}. Narrow the filters to see more.
              </p>
            )}
          </section>

          {selected && (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <section className="rp-card p-4" aria-label="Selected item details">
                <h2 className="rp-display mb-3 text-[15px] font-bold">Selected Item Details</h2>
                <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-[var(--muted-fg)]">Type</dt>
                  <dd className="capitalize">{selected.kind}</dd>
                  <dt className="text-[var(--muted-fg)]">Identifier</dt>
                  <dd className="rp-mono font-semibold">{selected.title}</dd>
                  <dt className="text-[var(--muted-fg)]">Project</dt>
                  <dd>{projectName.get(selected.projectId)}</dd>
                  {selCable && (
                    <>
                      <dt className="text-[var(--muted-fg)]">Source</dt>
                      <dd>
                        {selCable.aRack} {"\u00b7"} {selCable.aDevice} {selCable.aPort}
                      </dd>
                      <dt className="text-[var(--muted-fg)]">Destination</dt>
                      <dd>
                        {selCable.zRack} {"\u00b7"} {selCable.zDevice} {selCable.zPort}
                      </dd>
                      <dt className="text-[var(--muted-fg)]">Cable type</dt>
                      <dd>{selCable.cableType ?? "\u2014"}</dd>
                      <dt className="text-[var(--muted-fg)]">Length</dt>
                      <dd>{selCable.runtime?.lengthMeters ? `${selCable.runtime.lengthMeters} m` : "\u2014"}</dd>
                    </>
                  )}
                </dl>
              </section>

              <section className="rp-card p-4" aria-label="Related and trace">
                <h2 className="rp-display mb-3 text-[15px] font-bold">Related &amp; Trace</h2>
                {selCable ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2 text-center text-xs">
                      <span className="rounded-lg border border-[var(--border)] px-2 py-1.5">
                        <Server className="mx-auto h-4 w-4" aria-hidden />
                        <span className="block font-semibold">{selCable.aDevice}</span>
                        <span className="rp-mono">{selCable.aPort}</span>
                      </span>
                      <span className={cn("h-0.5 flex-1", traceTone)} aria-hidden />
                      <span className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1.5 font-semibold">{selCable.cableId}</span>
                      <span className={cn("h-0.5 flex-1", traceTone)} aria-hidden />
                      <span className="rounded-lg border border-[var(--border)] px-2 py-1.5">
                        <Server className="mx-auto h-4 w-4" aria-hidden />
                        <span className="block font-semibold">{selCable.zDevice}</span>
                        <span className="rp-mono">{selCable.zPort}</span>
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-[13px]">
                      <li>
                        <span className="text-[var(--muted-fg)]">LLDP/CDP:</span> {selCable.findings[0]?.observedSummary ?? "No neighbor evidence"}
                      </li>
                      <li>
                        <span className="text-[var(--muted-fg)]">Evidence:</span> {selCable._count.fieldPhotos} photo(s), {selCable._count.physicalChecks} physical check(s)
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted-fg)]">Trace is available for cables.</p>
                )}
              </section>

              <section className="rp-card p-4" aria-label="Quick actions">
                <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
                  <Zap className="h-4 w-4" aria-hidden />
                  Quick Actions
                </h2>
                <div className="grid gap-2">
                  {selected.kind === "cable" && (
                    <>
                      <Button href={`/app/projects/${selected.projectId}/cables/${selected.id}`} size="sm">
                        Open cable record
                      </Button>
                      <Button href={`/app/projects/${selected.projectId}/verify?cable=${selected.id}`} size="sm" variant="secondary">
                        Compare evidence
                      </Button>
                    </>
                  )}
                  {selected.kind === "device" && (
                    <Button href={`/app/projects/${selected.projectId}/inventory?dev=${selected.id}`} size="sm">
                      Open interfaces
                    </Button>
                  )}
                  {selected.kind === "project" && (
                    <Button href={`/app/projects/${selected.projectId}`} size="sm">
                      Open project
                    </Button>
                  )}
                  <Button href={`/app/projects/${selected.projectId}/twin`} size="sm" variant="secondary">
                    <Layers className="h-4 w-4" aria-hidden />
                    Rack twin
                  </Button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">{label}</span>
      {children}
    </label>
  );
}
