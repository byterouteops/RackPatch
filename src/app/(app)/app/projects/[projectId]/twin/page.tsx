import Link from "next/link";
import { Boxes, Cable, CheckCircle2, Gauge, Info, Layers, ListTree, Lock, Network, Route, Server, SlidersHorizontal } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { buildRackLayout } from "@/lib/twin/rack-layout";
import { Panel, pct } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Badge, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type LinkState = "verified" | "mismatch" | "installed" | "planned";
const STATE_COLOR: Record<LinkState, string> = { verified: "#16a34a", mismatch: "#ef4444", installed: "#2563eb", planned: "#94a3b8" };
const ROW = 34;

export default async function TwinPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ rack?: string; dev?: string; cable?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={access.project.name}
      section="Twin"
      title="Rack Elevation & Physical Cabling Visualization"
      description="Schematic rack layout, device endpoints and cabling paths derived from the active cable plan."
    />
  );
  const rev = access.project.activeRevisionId;
  if (!rev) {
    return (
      <div>
        {header}
        <EmptyState icon={<Boxes className="h-5 w-5" aria-hidden />} title="No active plan" description="Publish a plan to see the rack twin." />
      </div>
    );
  }

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: rev },
    orderBy: { cableId: "asc" },
    include: { runtime: true, findings: { take: 1, select: { state: true } } },
  });
  const layout = buildRackLayout(
    links.map((l) => ({ aRack: l.aRack, zRack: l.zRack, aDevice: l.aDevice, zDevice: l.zDevice, installStatus: l.runtime?.installStatus ?? null, retiredAt: l.runtime?.retiredAt ?? null })),
  );
  if (layout.racks.length === 0) {
    return (
      <div>
        {header}
        <EmptyState title="No active links" description="All plan links are retired or absent." />
      </div>
    );
  }

  const stateOf = (l: (typeof links)[number]): LinkState => {
    const s = l.findings[0]?.state;
    if (s === "VERIFIED_LLDP" || s === "VERIFIED_PHYSICAL") return "verified";
    if (s === "MISMATCH" || s === "NEEDS_REVIEW") return "mismatch";
    if (l.runtime?.installStatus === "INSTALLED") return "installed";
    return "planned";
  };
  const rack = layout.racks.find((r) => r.rack === sp.rack) ?? layout.racks[0];
  const active = links.filter((l) => !l.runtime?.retiredAt);
  const rackLinks = active.filter((l) => l.aRack === rack.rack || l.zRack === rack.rack);
  const device = rack.devices.find((d) => d.device === sp.dev);
  const deviceLinks = device ? rackLinks.filter((l) => (l.aRack === rack.rack && l.aDevice === device.device) || (l.zRack === rack.rack && l.zDevice === device.device)) : rackLinks;
  const cable = rackLinks.find((l) => l.id === sp.cable) ?? deviceLinks[0];
  const endpoints = rack.devices.reduce((n, d) => n + d.portsUsed, 0);
  const installedEnds = rack.devices.reduce((n, d) => n + d.installed, 0);
  const verified = rackLinks.filter((l) => stateOf(l) === "verified").length;
  const types = new Map<string, number>();
  for (const l of rackLinks) types.set(l.cableType ?? "Unspecified", (types.get(l.cableType ?? "Unspecified") ?? 0) + 1);

  const slotOf = new Map(rack.devices.map((d) => [d.device, d.slot]));
  const svgH = rack.devices.length * ROW + 16;
  const y = (slot: number) => 8 + (slot - 1) * ROW + ROW / 2;
  const exitLabels = new Map<number, { firstId: string; racks: Set<string>; count: number }>();
  for (const l of rackLinks) {
    const ay = l.aRack === rack.rack ? slotOf.get(l.aDevice) : undefined;
    const zy = l.zRack === rack.rack ? slotOf.get(l.zDevice) : undefined;
    if ((ay && zy) || !(ay ?? zy)) continue;
    const yy = y((ay ?? zy)!);
    const entry = exitLabels.get(yy) ?? { firstId: l.id, racks: new Set<string>(), count: 0 };
    entry.racks.add(l.aRack === rack.rack ? l.zRack : l.aRack);
    entry.count += 1;
    exitLabels.set(yy, entry);
  }
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ rack: sp.rack, dev: sp.dev, cable: sp.cable, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/projects/${projectId}/twin${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-3 sm:grid-cols-4 min-[1800px]:grid-cols-7">
        <StatCard label="Rack Selected" value={rack.rack} icon={<Server aria-hidden />} tone="info" />
        <StatCard label="Racks" value={layout.racks.length} icon={<Layers aria-hidden />} tone="neutral" />
        <StatCard label="Devices" value={rack.devices.length} icon={<Boxes aria-hidden />} tone="neutral" />
        <StatCard label="Cable Endpoints" value={endpoints} icon={<Network aria-hidden />} tone="neutral" />
        <StatCard label="Installed Ends" value={`${pct(installedEnds, endpoints).toFixed(0)}%`} icon={<Gauge aria-hidden />} tone="success" />
        <StatCard label="Links in Rack" value={rackLinks.length} icon={<Cable aria-hidden />} tone="info" />
        <StatCard label="Verified Links" value={verified} icon={<CheckCircle2 aria-hidden />} tone="success" />
      </div>

      {layout.racks.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {layout.racks.map((r) => (
            <Link
              key={r.rack}
              href={href({ rack: r.rack, dev: undefined, cable: undefined })}
              scroll={false}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", r.rack === rack.rack ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white hover:bg-[var(--muted)]")}
            >
              {r.rack} ({r.devices.length})
            </Link>
          ))}
        </div>
      )}

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="Front Elevation (schematic)" icon={Server}>
          <div className="rounded-xl bg-gradient-to-b from-[#1e293b] to-[#0f172a] p-3 shadow-inner">
            <div className="mb-2 rounded-md bg-black/40 py-1.5 text-center text-sm font-bold tracking-wide text-white">{rack.rack} (front)</div>
            <div className="space-y-1 rounded-md border border-slate-700 bg-[#0b1220] p-2">
              {rack.devices.map((d) => (
                <Link
                  key={d.device}
                  href={href({ dev: d.device === device?.device ? undefined : d.device, cable: undefined })}
                  scroll={false}
                  className={cn(
                    "flex h-[30px] items-center gap-2 rounded-sm border px-2 text-[11px] font-semibold text-slate-100",
                    d.status === "installed" ? "border-emerald-500/60 bg-emerald-900/40" : d.status === "blocked" ? "border-red-500/60 bg-red-900/40" : d.status === "partial" ? "border-sky-500/60 bg-sky-900/40" : "border-slate-600 bg-slate-800",
                    device?.device === d.device && "ring-2 ring-white",
                  )}
                >
                  <span className="w-5 text-right text-[10px] text-slate-400">{d.slot}</span>
                  <span className="flex-1 truncate">{d.device}</span>
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: Math.min(8, d.portsUsed) }).map((_, i) => (
                      <span key={i} className={cn("h-2 w-1.5 rounded-[1px]", i < d.installed ? "bg-emerald-400" : "bg-slate-500")} />
                    ))}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted-fg)]">Slots are alphabetical, not measured rack units. Click a device to filter.</p>
        </Panel>

        <Panel title="Cabling View (rear, schematic)" icon={Route}>
          <svg viewBox={`0 0 420 ${svgH}`} className="w-full" role="img" aria-label={`Cabling paths in ${rack.rack}`}>
            <rect x="0" y="0" width="420" height={svgH} rx="10" fill="#0f172a" />
            {rack.devices.map((d) => (
              <g key={d.device}>
                <rect x="12" y={y(d.slot) - 12} width="150" height="24" rx="3" fill={device?.device === d.device ? "#1e3a8a" : "#1e293b"} stroke="#334155" />
                <text x="20" y={y(d.slot) + 4} className="fill-slate-100 text-[11px] font-semibold">
                  {d.device.length > 20 ? `${d.device.slice(0, 19)}\u2026` : d.device}
                </text>
              </g>
            ))}
            {rackLinks.map((l, i) => {
              const st = stateOf(l);
              const dim = device && !deviceLinks.includes(l);
              const ay = l.aRack === rack.rack ? slotOf.get(l.aDevice) : undefined;
              const zy = l.zRack === rack.rack ? slotOf.get(l.zDevice) : undefined;
              const lane = 175 + (i % 12) * 18;
              const sel = cable?.id === l.id;
              const stroke = STATE_COLOR[st];
              if (ay && zy) {
                const y1 = y(ay);
                const y2 = y(zy);
                return (
                  <path
                    key={l.id}
                    d={`M162 ${y1} C ${lane} ${y1}, ${lane} ${y2}, 162 ${y2}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sel ? 4 : 2.5}
                    strokeDasharray={st === "planned" ? "5 4" : undefined}
                    opacity={dim ? 0.15 : 1}
                  />
                );
              }
              const yy = y((ay ?? zy)!);
              const label = exitLabels.get(yy);
              return (
                <g key={l.id} opacity={dim ? 0.15 : 1}>
                  <path d={`M162 ${yy} L 400 ${yy}`} stroke={stroke} strokeWidth={sel ? 4 : 2.5} strokeDasharray={st === "planned" ? "5 4" : undefined} />
                  {label?.firstId === l.id && (
                    <text x="398" y={yy - 4} textAnchor="end" className="fill-slate-300 text-[9px]">
                      {"\u2192"} {[...label.racks].sort().join(", ")}
                      {label.count > 1 ? ` (\u00d7${label.count})` : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--muted-fg)]">
            {(Object.keys(STATE_COLOR) as LinkState[]).map((s) => (
              <span key={s} className="flex items-center gap-1 capitalize">
                <span className="h-0.5 w-4" style={{ background: STATE_COLOR[s] }} aria-hidden />
                {s}
              </span>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title={`Rack Details \u2014 ${rack.rack}`} icon={Info}>
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-[var(--muted-fg)]">Site</dt>
              <dd>{access.project.site}</dd>
              <dt className="text-[var(--muted-fg)]">Devices</dt>
              <dd>{rack.devices.length}</dd>
              <dt className="text-[var(--muted-fg)]">Endpoints</dt>
              <dd>
                {installedEnds} / {endpoints} installed
              </dd>
              <dt className="text-[var(--muted-fg)]">Links</dt>
              <dd>
                {rackLinks.length} ({verified} verified)
              </dd>
              <dt className="text-[var(--muted-fg)]">Status</dt>
              <dd>{verified === rackLinks.length ? <Badge tone="success">Verified</Badge> : rackLinks.some((l) => stateOf(l) === "mismatch") ? <Badge tone="danger">Has mismatches</Badge> : <Badge tone="warning">In progress</Badge>}</dd>
            </dl>
          </Panel>
          <Panel title="Legend & Cable Types" icon={SlidersHorizontal}>
            <ul className="space-y-1.5 text-[13px]">
              {[...types].map(([t, n]) => (
                <li key={t} className="flex items-center justify-between">
                  <span>{t}</span>
                  <Badge tone="info">{n}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-[var(--muted-fg)]">Front blocks: green installed, blue partial, red blocked, grey planned.</p>
          </Panel>
        </div>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel title="Rack Layout (top to bottom)" icon={ListTree} flush>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                <th className="px-4 py-2">Slot</th>
                <th className="px-2 py-2">Device</th>
                <th className="px-2 py-2 text-right">Endpoints</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rack.devices.map((d) => (
                <tr key={d.device} className={cn("border-b border-[var(--border)] last:border-0", device?.device === d.device ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                  <td className="px-4 py-2 text-xs">{d.slot}</td>
                  <td className="px-2 py-2">
                    <Link href={href({ dev: d.device, cable: undefined })} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                      {d.device}
                    </Link>
                  </td>
                  <td className="rp-mono px-2 py-2 text-right">{d.portsUsed}</td>
                  <td className="px-4 py-2">
                    <Badge tone={d.status === "installed" ? "success" : d.status === "blocked" ? "danger" : d.status === "partial" ? "info" : "neutral"}>{d.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={device ? `Port-to-Cable Mapping \u2014 ${device.device}` : "Port-to-Cable Mapping"} icon={Cable} flush action={device && <Link href={href({ dev: undefined, cable: undefined })} className="text-xs font-semibold text-[var(--accent-ink)]">Whole rack</Link>}>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                  <th className="px-4 py-2">Device / Port</th>
                  <th className="px-2 py-2">Cable</th>
                  <th className="px-2 py-2">Connected to</th>
                  <th className="px-2 py-2">Install</th>
                  <th className="px-4 py-2">Verification</th>
                </tr>
              </thead>
              <tbody>
                {deviceLinks.map((l) => {
                  const here = l.aRack === rack.rack && (!device || l.aDevice === device.device);
                  return (
                    <tr key={l.id} className={cn("border-b border-[var(--border)] last:border-0", cable?.id === l.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2 text-xs">{here ? `${l.aDevice} ${l.aPort}` : `${l.zDevice} ${l.zPort}`}</td>
                      <td className="px-2 py-2">
                        <Link href={href({ cable: l.id })} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                          {l.cableId}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">{here ? `${l.zDevice} ${l.zPort}` : `${l.aDevice} ${l.aPort}`}</td>
                      <td className="px-2 py-2">
                        <InstallStatusBadge status={l.runtime?.installStatus ?? "PLANNED"} />
                      </td>
                      <td className="px-4 py-2">
                        <VerificationBadge state={l.findings[0]?.state ?? "AWAITING"} compact />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title={cable ? `Cable Path (logical) \u2014 ${cable.cableId}` : "Cable Path (logical)"} icon={Route}>
          {cable ? (
            <div className="flex items-center gap-2 text-center text-xs">
              <span className="rounded-lg border border-[var(--border)] px-3 py-2">
                <Server className="mx-auto h-4 w-4" aria-hidden />
                <span className="block font-semibold">{cable.aDevice}</span>
                <span className="rp-mono block">{cable.aPort}</span>
                <span className="block text-[var(--muted-fg)]">{cable.aRack}</span>
              </span>
              <span className="h-0.5 flex-1" style={{ background: STATE_COLOR[stateOf(cable)] }} aria-hidden />
              <Link href={`/app/projects/${projectId}/cables/${cable.id}`} className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 font-semibold">
                {cable.cableId}
                <span className="block font-normal">
                  {cable.cableType ?? "type n/a"}
                  {cable.runtime?.lengthMeters ? `, ${cable.runtime.lengthMeters} m` : ""}
                </span>
              </Link>
              <span className="h-0.5 flex-1" style={{ background: STATE_COLOR[stateOf(cable)] }} aria-hidden />
              <span className="rounded-lg border border-[var(--border)] px-3 py-2">
                <Server className="mx-auto h-4 w-4" aria-hidden />
                <span className="block font-semibold">{cable.zDevice}</span>
                <span className="rp-mono block">{cable.zPort}</span>
                <span className="block text-[var(--muted-fg)]">{cable.zRack}</span>
              </span>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">Select a cable.</p>
          )}
        </Panel>

        <AlertBanner tone="info" title={"Schematic twin \u2014 not a survey"}>
          Built only from rack and device names in the active plan. Devices are shown in alphabetical schematic slots, not real rack units; there is no measured geometry, photo-realistic 3D, room layout or LIDAR data.
        </AlertBanner>
      </div>
    </div>
  );
}
