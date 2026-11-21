import Link from "next/link";
import {
  BarChart3,
  Cable,
  CheckCircle2,
  CircleDashed,
  Gauge,
  Lightbulb,
  Lock,
  Network,
  PieChart,
  Rocket,
  Server,
  TrendingUp,
  Zap,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeCapacitySummary } from "@/lib/capacity";
import { DonutWithLegend, MeterRow, Panel, pct } from "@/components/charts";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Button, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const TYPE_COLORS = ["#2563eb", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444", "#64748b", "#22c55e"];
const GROWTH = [25, 50, 100];

export default async function CapacityPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ growth?: string }>;
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
      section="Capacity"
      title="Cable Capacity Planning & Port Utilization"
      description="Port usage from the device inventory, cable capacity from the active plan, and growth what-ifs."
    />
  );
  const rev = access.project.activeRevisionId;
  if (!rev) {
    return (
      <div>
        {header}
        <EmptyState icon={<BarChart3 className="h-5 w-5" aria-hidden />} title="No active plan" description="Publish a plan to see capacity." />
      </div>
    );
  }

  const [links, devices, panelPorts] = await Promise.all([
    prisma.plannedLink.findMany({ where: { revisionId: rev }, include: { runtime: true } }),
    prisma.deviceInventory.findMany({ where: { projectId }, orderBy: { name: "asc" }, include: { ports: { select: { status: true } } } }),
    prisma.panelPort.findMany({ where: { panel: { projectId } }, select: { plannedLinkId: true } }),
  ]);
  const summary = computeCapacitySummary(
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

  const ports = devices.flatMap((d) => d.ports);
  const used = ports.filter((p) => p.status === "USED").length;
  const reserved = ports.filter((p) => p.status === "RESERVED").length;
  const free = ports.filter((p) => p.status === "FREE").length;
  const totalPorts = ports.length;
  const util = pct(used + reserved, totalPorts);

  const deviceRows = devices
    .map((d) => ({ name: d.name, rack: d.rack, total: d.ports.length, used: d.ports.filter((p) => p.status !== "FREE").length }))
    .sort((a, b) => pct(b.used, b.total) - pct(a.used, a.total) || b.total - a.total);
  const rackRows = summary.byRack
    .map((r) => {
      const rackDevices = devices.filter((d) => d.rack === r.rack);
      const rp = rackDevices.flatMap((d) => d.ports);
      return { ...r, devices: rackDevices.length, ports: rp.length, usedPorts: rp.filter((p) => p.status !== "FREE").length };
    })
    .sort((a, b) => b.links - a.links);

  const pairs = new Map<string, { links: number; installed: number; types: Set<string> }>();
  for (const l of links) {
    if (l.runtime?.retiredAt) continue;
    const key = l.aRack === l.zRack ? `${l.aRack} (intra-rack)` : [l.aRack, l.zRack].sort().join(" \u2194 ");
    const cur = pairs.get(key) ?? { links: 0, installed: 0, types: new Set<string>() };
    cur.links += 1;
    if (l.runtime?.installStatus === "INSTALLED") cur.installed += 1;
    if (l.cableType) cur.types.add(l.cableType);
    pairs.set(key, cur);
  }

  const days = new Map<string, number>();
  for (const l of links) {
    const at = l.runtime?.installedAt;
    if (at) days.set(at.toISOString().slice(0, 10), (days.get(at.toISOString().slice(0, 10)) ?? 0) + 1);
  }
  let running = 0;
  const trend = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, n]) => {
      running += n;
      return { day: day.slice(5), value: running };
    })
    .slice(-12);

  const growth = GROWTH.includes(Number(sp.growth)) ? Number(sp.growth) : 50;
  const projectedLinks = Math.ceil(summary.activeLinks * (1 + growth / 100));
  const projectedPorts = Math.ceil((used + reserved) * (1 + growth / 100));
  const fits = totalPorts > 0 && projectedPorts <= totalPorts;
  const panelMapped = panelPorts.filter((p) => p.plannedLinkId).length;

  const hot = deviceRows.filter((d) => d.total > 0 && pct(d.used, d.total) >= 80);
  const untyped = links.filter((l) => !l.cableType).length;
  const blocked = summary.byInstallStatus.BLOCKED ?? 0;
  const recs = [
    totalPorts === 0 ? "Sync the port inventory from the active plan to measure utilization." : null,
    totalPorts > 0 && free === 0 ? "No FREE ports are recorded \u2014 add spare ports to the inventory to model headroom." : null,
    hot.length ? `${hot.length} device(s) are at or above 80% port usage (${hot.slice(0, 3).map((d) => d.name).join(", ")}).` : null,
    !fits && totalPorts > 0 ? `A +${growth}% expansion needs ${projectedPorts} ports; only ${totalPorts} are in inventory.` : null,
    blocked ? `${blocked} cable(s) are blocked in the field and hold planned capacity.` : null,
    untyped ? `${untyped} plan link(s) have no cable type \u2014 set types for accurate media planning.` : null,
    reserved ? `${reserved} port(s) are reserved; confirm they are still needed.` : null,
  ].filter((x): x is string => Boolean(x));

  const typeSegments = summary.byCableType.slice(0, 7).map((t, i) => ({ label: t.type, value: t.count, color: TYPE_COLORS[i % TYPE_COLORS.length] }));

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-3 sm:grid-cols-4 min-[1800px]:grid-cols-8">
        <StatCard label="Port Utilization" value={`${util.toFixed(1)}%`} icon={<Gauge aria-hidden />} tone={util >= 80 ? "warning" : "success"} />
        <StatCard label="Total Ports" value={totalPorts} icon={<Network aria-hidden />} tone="info" />
        <StatCard label="Used Ports" value={used} icon={<CheckCircle2 aria-hidden />} tone="neutral" />
        <StatCard label="Available Ports" value={free} icon={<CircleDashed aria-hidden />} tone="neutral" />
        <StatCard label="Devices" value={devices.length} icon={<Server aria-hidden />} tone="neutral" href={`/app/projects/${projectId}/inventory`} />
        <StatCard label="Racks" value={summary.byRack.length} icon={<BarChart3 aria-hidden />} tone="neutral" />
        <StatCard label="Active Links" value={summary.activeLinks} icon={<Cable aria-hidden />} tone="info" />
        <StatCard label="Panel Ports Mapped" value={panelMapped} icon={<Zap aria-hidden />} tone="neutral" href={`/app/projects/${projectId}/panels`} />
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Port Utilization by Device" icon={Server}>
          {deviceRows.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">
              No device inventory yet.{" "}
              <Link href={`/app/projects/${projectId}/inventory`} className="font-semibold text-[var(--accent)]">
                Sync from the plan
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {deviceRows.slice(0, 8).map((d) => (
                <MeterRow
                  key={d.name}
                  label={`${d.name} (${d.used}/${d.total})`}
                  value={d.used}
                  total={d.total}
                  color={pct(d.used, d.total) >= 90 ? "bg-red-500" : pct(d.used, d.total) >= 70 ? "bg-amber-400" : "bg-[var(--success)]"}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Overall Port Capacity" icon={PieChart}>
          <DonutWithLegend
            total={totalPorts}
            label="ports"
            segments={[
              { label: "Used", value: used, color: "#16a34a" },
              { label: "Reserved", value: reserved, color: "#f59e0b" },
              { label: "Available", value: free, color: "#2563eb" },
            ]}
          />
        </Panel>

        <Panel title="Rack Utilization" icon={BarChart3} flush>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                <th className="px-4 py-2">Rack</th>
                <th className="px-2 py-2 text-right">Links</th>
                <th className="px-2 py-2 text-right">Devices</th>
                <th className="px-4 py-2">Installed</th>
              </tr>
            </thead>
            <tbody>
              {rackRows.slice(0, 6).map((r) => (
                <tr key={r.rack} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 font-semibold">{r.rack}</td>
                  <td className="rp-mono px-2 py-2 text-right">{r.links}</td>
                  <td className="rp-mono px-2 py-2 text-right">{r.devices}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                        <span className="block h-full rounded-full bg-[var(--success)]" style={{ width: `${pct(r.installed, r.links)}%` }} />
                      </span>
                      <span className="w-10 text-right text-xs font-semibold">{Math.round(pct(r.installed, r.links))}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Cable Capacity by Type" icon={Cable}>
          {typeSegments.length === 0 ? <p className="text-sm text-[var(--muted-fg)]">No links in the plan.</p> : <DonutWithLegend total={summary.totalLinks} label="cables" segments={typeSegments} />}
        </Panel>

        <Panel title="Inter-Rack Links" icon={Network} flush>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                <th className="px-4 py-2">Rack pair</th>
                <th className="px-2 py-2 text-right">Links</th>
                <th className="px-2 py-2">Media</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...pairs].slice(0, 6).map(([pair, v]) => (
                <tr key={pair} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 font-medium">{pair}</td>
                  <td className="rp-mono px-2 py-2 text-right">{v.links}</td>
                  <td className="max-w-[120px] truncate px-2 py-2 text-xs">{[...v.types].join(", ") || "\u2014"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={v.installed === v.links ? "success" : v.installed ? "warning" : "neutral"}>
                      {v.installed}/{v.links} installed
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Expansion Planning (What-if)" icon={Rocket}>
          <div className="mb-3 flex gap-1.5">
            {GROWTH.map((g) => (
              <Link
                key={g}
                href={`/app/projects/${projectId}/capacity?growth=${g}`}
                scroll={false}
                className={cn("flex-1 rounded-md border px-2 py-1.5 text-center text-xs font-semibold", g === growth ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] hover:bg-[var(--muted)]")}
              >
                +{g}%
              </Link>
            ))}
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
            <dt className="text-[var(--muted-fg)]">Links today {"\u2192"} projected</dt>
            <dd className="font-semibold">
              {summary.activeLinks} {"\u2192"} {projectedLinks}
            </dd>
            <dt className="text-[var(--muted-fg)]">Ports in use {"\u2192"} projected</dt>
            <dd className="font-semibold">
              {used + reserved} {"\u2192"} {projectedPorts}
            </dd>
            <dt className="text-[var(--muted-fg)]">Ports in inventory</dt>
            <dd className="font-semibold">{totalPorts}</dd>
            <dt className="text-[var(--muted-fg)]">Readiness</dt>
            <dd>{totalPorts === 0 ? <Badge tone="neutral">No inventory</Badge> : fits ? <Badge tone="success">Within capacity</Badge> : <Badge tone="danger">Short {projectedPorts - totalPorts} ports</Badge>}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-[var(--muted-fg)]">Linear projection from current usage; not a forecast.</p>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Installed Cables Over Time" icon={TrendingUp}>
          {trend.length === 0 ? <p className="text-sm text-[var(--muted-fg)]">No installs recorded yet.</p> : <LineChart data={trend} max={summary.activeLinks} />}
        </Panel>

        <Panel title="Capacity Planning Recommendations" icon={Lightbulb}>
          {recs.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No capacity risks detected.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {recs.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Quick Actions" icon={Zap}>
          <div className="grid grid-cols-2 gap-2">
            <Button href={`/app/projects/${projectId}/inventory`} size="sm">
              Port inventory
            </Button>
            <Button href={`/app/projects/${projectId}/plan`} size="sm" variant="secondary">
              Import plan
            </Button>
            <Button href={`/app/projects/${projectId}/panels`} size="sm" variant="secondary">
              Patch panels
            </Button>
            <Button href={`/app/projects/${projectId}/spares`} size="sm" variant="secondary">
              Spare stock
            </Button>
            <Button href={`/app/projects/${projectId}/reports`} size="sm" variant="secondary">
              Reports
            </Button>
            <Button href={`/app/projects/${projectId}/work-orders`} size="sm" variant="secondary">
              Create task
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LineChart({ data, max }: { data: Array<{ day: string; value: number }>; max: number }) {
  const top = Math.max(1, max, ...data.map((d) => d.value));
  const w = 300;
  const h = 120;
  const x = (i: number) => (data.length === 1 ? w / 2 : (i / (data.length - 1)) * (w - 20) + 10);
  const y = (v: number) => h - 10 - (v / top) * (h - 20);
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label="Cumulative installed cables">
        <line x1="10" x2={w - 10} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeDasharray="4 3" />
        <polygon points={`${x(0)},${h - 10} ${points} ${x(data.length - 1)},${h - 10}`} fill="var(--accent-soft)" />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {data.map((d, i) => (
          <circle key={d.day} cx={x(i)} cy={y(d.value)} r="3" fill="var(--accent)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--muted-fg)]">
        <span>{data[0]?.day}</span>
        <span>Dashed line = {max} planned</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}
