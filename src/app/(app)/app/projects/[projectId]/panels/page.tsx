import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Gauge,
  GitBranch,
  History,
  Info,
  Link2,
  ListChecks,
  Lock,
  Network,
  PanelTop,
  Plus,
  Route,
  Server,
} from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { CABLE_TYPE_TAXONOMY } from "@/lib/cable-type";
import { DonutWithLegend, Panel, pct } from "@/components/charts";
import { CircuitForm, DeleteCircuitButton, PanelCreateForm, PortMapForm, UnmapPortButton } from "@/components/panel-forms";
import { ProjectPageHeader } from "@/components/project-page-header";
import { VerificationBadge } from "@/components/status-badges";
import { Badge, EmptyState, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

const BAD = new Set(["MISMATCH", "NEEDS_REVIEW"]);
const GOOD = new Set(["VERIFIED_LLDP", "VERIFIED_PHYSICAL"]);

export default async function PanelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ panel?: string; port?: string; circuit?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }
  const activeRevisionId = access.project.activeRevisionId;

  const [panels, circuits, links, findings, audit] = await Promise.all([
    prisma.patchPanel.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: {
        ports: {
          orderBy: { portIndex: "asc" },
          include: {
            plannedLink: { select: { id: true, cableId: true, revisionId: true, aDevice: true, aPort: true, zDevice: true, zPort: true, cableType: true } },
            circuitA: { select: { id: true, name: true } },
            circuitZ: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.circuit.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: {
        portA: { include: { panel: { select: { id: true, name: true, rack: true } }, plannedLink: { select: { id: true, cableId: true } } } },
        portZ: { include: { panel: { select: { id: true, name: true, rack: true } }, plannedLink: { select: { id: true, cableId: true } } } },
      },
    }),
    activeRevisionId
      ? prisma.plannedLink.findMany({ where: { revisionId: activeRevisionId }, orderBy: { cableId: "asc" }, select: { id: true, cableId: true, aDevice: true, zDevice: true } })
      : Promise.resolve([]),
    activeRevisionId ? prisma.verificationFinding.findMany({ where: { revisionId: activeRevisionId }, select: { plannedLinkId: true, state: true } }) : Promise.resolve([]),
    prisma.auditEvent.findMany({
      where: { projectId, OR: [{ action: { startsWith: "panel." } }, { action: { startsWith: "circuit." } }] },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
  ]);

  const stateByLink = new Map(findings.map((f) => [f.plannedLinkId, f.state]));
  const allPorts = panels.flatMap((p) => p.ports.map((port) => ({ panel: p, port })));
  const isStale = (port: (typeof allPorts)[number]["port"]) => Boolean(port.plannedLink && port.plannedLink.revisionId !== activeRevisionId);
  const isFault = (port: (typeof allPorts)[number]["port"]) => isStale(port) || BAD.has(stateByLink.get(port.plannedLinkId ?? "") ?? "");
  const isUsed = (port: (typeof allPorts)[number]["port"]) => Boolean(port.plannedLinkId || port.circuitA || port.circuitZ);

  const totalPorts = allPorts.length;
  const faulty = allPorts.filter(({ port }) => isFault(port)).length;
  const connected = allPorts.filter(({ port }) => isUsed(port) && !isFault(port)).length;
  const available = totalPorts - connected - faulty;
  const openZ = circuits.filter((c) => !c.portZ).length;

  const panel = panels.find((p) => p.id === sp.panel) ?? panels[0];
  const selPort = panel?.ports.find((p) => p.id === sp.port);
  const circuit = circuits.find((c) => c.id === sp.circuit) ?? circuits[0];

  const label = (panelName: string, idx: number) => `${panelName} #${idx}`;
  const freeForMap = allPorts.filter(({ port }) => !port.plannedLinkId).map(({ panel: p, port }) => ({ id: port.id, label: label(p.name, port.portIndex) }));
  const freeForCircuit = allPorts.filter(({ port }) => !port.circuitA && !port.circuitZ).map(({ panel: p, port }) => ({ id: port.id, label: label(p.name, port.portIndex) }));

  const rackPairs = new Map<string, number>();
  for (const c of circuits) {
    const key = c.portZ ? [c.portA.panel.rack, c.portZ.panel.rack].sort().join(" \u2194 ") : `${c.portA.panel.rack} \u2194 (open)`;
    rackPairs.set(key, (rackPairs.get(key) ?? 0) + 1);
  }

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ panel: sp.panel, circuit: sp.circuit, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/projects/${projectId}/panels${s ? `?${s}` : ""}`;
  };
  const portTone = (port: (typeof allPorts)[number]["port"]) =>
    isFault(port)
      ? "border-red-400 bg-red-500 text-white"
      : port.circuitA || port.circuitZ
        ? "border-blue-400 bg-[var(--accent)] text-white"
        : port.plannedLinkId
          ? GOOD.has(stateByLink.get(port.plannedLinkId) ?? "")
            ? "border-emerald-600 bg-emerald-700 text-white"
            : "border-amber-300 bg-amber-400 text-slate-900"
          : "border-slate-600 bg-slate-800 text-slate-400";

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Panels"
        title="Fiber Patch Panels & Circuit Management"
        description="Patch panels, port assignments against the active plan, and panel-to-panel circuits."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-7">
        <StatCard label="Patch Panels" value={panels.length} icon={<PanelTop aria-hidden />} tone="info" />
        <StatCard label="Total Ports" value={totalPorts} icon={<Network aria-hidden />} tone="neutral" />
        <StatCard label="Connected" value={connected} icon={<Link2 aria-hidden />} tone="success" />
        <StatCard label="Available" value={available} icon={<CircleDashed aria-hidden />} tone="neutral" />
        <StatCard label="Exceptions" value={faulty} icon={<AlertTriangle aria-hidden />} tone={faulty ? "danger" : "neutral"} />
        <StatCard label="Port Utilization" value={`${pct(connected + faulty, totalPorts).toFixed(1)}%`} icon={<Gauge aria-hidden />} tone="info" />
        <StatCard label="Circuits" value={circuits.length} icon={<GitBranch aria-hidden />} tone="neutral" />
      </div>

      {panels.length === 0 ? (
        <div className="mb-4">
          <EmptyState icon={<PanelTop className="h-5 w-5" aria-hidden />} title="No patch panels" description="A lead can create the first panel below. Ports 1..N are created automatically." />
        </div>
      ) : (
        panel && (
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Panel
              title={`Patch Panel \u2014 ${panel.name}`}
              icon={PanelTop}
            >
              {panels.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {panels.map((p) => (
                    <Link
                      key={p.id}
                      href={href({ panel: p.id, port: undefined })}
                      scroll={false}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", p.id === panel.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]")}
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              )}
              <div className="rounded-lg bg-slate-900 p-3 shadow-inner">
                <div className="mb-2 flex justify-between text-[11px] font-semibold text-slate-300">
                  <span className="rp-mono">{panel.name}</span>
                  <span>
                    {panel.rack}
                    {panel.rackUnit ? ` \u00b7 U${panel.rackUnit}` : ""} {"\u00b7"} {panel.portCount} ports
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-1.5">
                  {panel.ports.map((port) => (
                    <Link
                      key={port.id}
                      href={href({ panel: panel.id, port: port.id })}
                      scroll={false}
                      title={port.plannedLink ? `${port.plannedLink.cableId} end ${port.side}` : port.circuitA || port.circuitZ ? `Circuit ${(port.circuitA ?? port.circuitZ)?.name}` : "Free"}
                      className={cn("flex h-8 items-center justify-center rounded border text-[10px] font-bold", portTone(port), selPort?.id === port.id && "ring-2 ring-white ring-offset-2 ring-offset-slate-900")}
                    >
                      {port.portIndex}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--muted-fg)]">
                {[
                  ["Verified cable", "bg-emerald-700"],
                  ["Mapped cable", "bg-amber-400"],
                  ["Circuit", "bg-[var(--accent)]"],
                  ["Exception", "bg-red-500"],
                  ["Free", "bg-slate-800"],
                ].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={cn("h-2.5 w-2.5 rounded-sm", c)} aria-hidden />
                    {l}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title={selPort ? `Port #${selPort.portIndex}` : "Patch Panel Details"} icon={Info}>
              <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Panel</dt>
                <dd className="rp-mono font-semibold">{panel.name}</dd>
                <dt className="text-[var(--muted-fg)]">Rack / RU</dt>
                <dd>
                  {panel.rack}
                  {panel.rackUnit ? ` / U${panel.rackUnit}` : ""}
                </dd>
                <dt className="text-[var(--muted-fg)]">Ports used</dt>
                <dd>
                  {panel.ports.filter(isUsed).length} / {panel.portCount} ({pct(panel.ports.filter(isUsed).length, panel.portCount).toFixed(1)}%)
                </dd>
                {selPort && (
                  <>
                    <dt className="text-[var(--muted-fg)]">Cable</dt>
                    <dd>
                      {selPort.plannedLink ? (
                        <>
                          <Link href={`/app/projects/${projectId}/cables/${selPort.plannedLink.id}`} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                            {selPort.plannedLink.cableId}
                          </Link>{" "}
                          end {selPort.side}
                          {isStale(selPort) && (
                            <>
                              {" "}
                              <Badge tone="warning">Not in active plan</Badge>
                            </>
                          )}
                        </>
                      ) : (
                        "Free"
                      )}
                    </dd>
                    {selPort.plannedLink && (
                      <>
                        <dt className="text-[var(--muted-fg)]">Endpoint</dt>
                        <dd className="text-xs">
                          {selPort.side === "A" ? `${selPort.plannedLink.aDevice} ${selPort.plannedLink.aPort}` : `${selPort.plannedLink.zDevice} ${selPort.plannedLink.zPort}`}
                        </dd>
                        <dt className="text-[var(--muted-fg)]">Verification</dt>
                        <dd>
                          <VerificationBadge state={stateByLink.get(selPort.plannedLink.id) ?? "AWAITING"} compact />
                        </dd>
                      </>
                    )}
                    <dt className="text-[var(--muted-fg)]">Circuit</dt>
                    <dd>{(selPort.circuitA ?? selPort.circuitZ)?.name ?? "\u2014"}</dd>
                  </>
                )}
              </dl>
              {selPort?.plannedLink && access.canManageProject && (
                <div className="mt-3">
                  <UnmapPortButton projectId={projectId} portId={selPort.id} />
                </div>
              )}
              {!selPort && <p className="mt-3 text-xs text-[var(--muted-fg)]">Click a port on the panel to see its assignment.</p>}
            </Panel>

            <Panel title="Port Utilization" icon={Gauge}>
              <DonutWithLegend
                total={totalPorts}
                label="ports"
                segments={[
                  { label: "Connected", value: connected, color: "#2563eb" },
                  { label: "Available", value: available, color: "#16a34a" },
                  { label: "Exception", value: faulty, color: "#ef4444" },
                ]}
              />
            </Panel>
          </div>
        )
      )}

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title={`Circuit List (${circuits.length})`} icon={ListChecks} flush>
          {circuits.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No circuits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                    <th className="px-4 py-2">Circuit</th>
                    <th className="px-2 py-2">A-End</th>
                    <th className="px-2 py-2">Z-End</th>
                    <th className="px-2 py-2">Media</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {circuits.map((c) => (
                    <tr key={c.id} className={cn("border-b border-[var(--border)] last:border-0", circuit?.id === c.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                      <td className="px-4 py-2">
                        <Link href={href({ circuit: c.id })} scroll={false} className="rp-mono font-semibold text-[var(--accent-ink)] hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-xs">{label(c.portA.panel.name, c.portA.portIndex)}</td>
                      <td className="px-2 py-2 text-xs">{c.portZ ? label(c.portZ.panel.name, c.portZ.portIndex) : "\u2014"}</td>
                      <td className="px-2 py-2">
                        <Badge tone="info">{c.mediaType}</Badge>
                      </td>
                      <td className="px-4 py-2">{c.portZ ? <Badge tone="success">Terminated</Badge> : <Badge tone="warning">Z open</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={circuit ? `Circuit Trace \u2014 ${circuit.name}` : "Circuit Trace"} icon={Route}>
          {circuit ? (
            <>
              <div className="mb-3 flex items-center gap-2 text-center text-xs">
                <TraceEnd rack={circuit.portA.panel.rack} panel={circuit.portA.panel.name} port={circuit.portA.portIndex} />
                <span className="h-0.5 flex-1 bg-[var(--accent)]" aria-hidden />
                <span className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1.5 font-semibold">{circuit.mediaType}</span>
                <span className={cn("h-0.5 flex-1", circuit.portZ ? "bg-[var(--accent)]" : "border-t-2 border-dashed border-[var(--warning)]")} aria-hidden />
                {circuit.portZ ? <TraceEnd rack={circuit.portZ.panel.rack} panel={circuit.portZ.panel.name} port={circuit.portZ.portIndex} /> : <span className="rounded-lg border border-dashed border-[var(--warning)] px-2 py-3 text-[var(--warning-ink)]">Z open</span>}
              </div>
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-[var(--muted-fg)]">Status</dt>
                <dd>{circuit.portZ ? "Terminated both ends" : "A-end only"}</dd>
                <dt className="text-[var(--muted-fg)]">A-end cable</dt>
                <dd className="rp-mono">{circuit.portA.plannedLink?.cableId ?? "\u2014"}</dd>
                <dt className="text-[var(--muted-fg)]">Z-end cable</dt>
                <dd className="rp-mono">{circuit.portZ?.plannedLink?.cableId ?? "\u2014"}</dd>
                <dt className="text-[var(--muted-fg)]">Note</dt>
                <dd>{circuit.note || "\u2014"}</dd>
                <dt className="text-[var(--muted-fg)]">Created</dt>
                <dd>{circuit.createdAt.toLocaleDateString("en-US")}</dd>
              </dl>
              {access.canManageProject && (
                <div className="mt-3">
                  <DeleteCircuitButton projectId={projectId} circuitId={circuit.id} />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">Create a circuit to trace it end to end.</p>
          )}
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
        <Panel title="Rack Connectivity" icon={Network}>
          {rackPairs.size === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No circuits between racks yet.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {[...rackPairs].map(([pair, n]) => (
                <li key={pair} className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
                  <span className="flex-1 font-medium">{pair}</span>
                  <Badge tone="info">
                    {n} circuit{n === 1 ? "" : "s"}
                  </Badge>
                </li>
              ))}
              {openZ > 0 && <li className="text-xs text-[var(--warning-ink)]">{openZ} circuit(s) with an open Z-end.</li>}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Patching & Changes" icon={History}>
          {audit.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No panel activity yet.</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {audit.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{a.summary}</span>
                    <span className="block text-xs text-[var(--muted-fg)]">
                      {a.actor ? a.actor.name || a.actor.email : "System"} {"\u00b7"} {a.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {access.canManageProject ? (
          <Panel title="Add Patch Panel" icon={Plus}>
            <PanelCreateForm projectId={projectId} />
          </Panel>
        ) : (
          <Panel title="Access" icon={Lock}>
            <p className="text-sm text-[var(--muted-fg)]">Panel and circuit changes require a project lead.</p>
          </Panel>
        )}
      </div>

      {access.canManageProject && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="Map Port to Cable" icon={Link2}>
            <PortMapForm projectId={projectId} freePorts={freeForMap} links={links.map((l) => ({ id: l.id, label: `${l.cableId} (${l.aDevice} to ${l.zDevice})` }))} />
          </Panel>
          <Panel title="Create Circuit" icon={GitBranch}>
            <CircuitForm projectId={projectId} ports={freeForCircuit} mediaTypes={[...CABLE_TYPE_TAXONOMY]} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function TraceEnd({ rack, panel, port }: { rack: string; panel: string; port: number }) {
  return (
    <span className="rounded-lg border border-[var(--border)] px-2 py-1.5">
      <Server className="mx-auto h-4 w-4" aria-hidden />
      <span className="block font-semibold">{rack}</span>
      <span className="rp-mono block">{panel}</span>
      <span className="block">Port {port}</span>
    </span>
  );
}
