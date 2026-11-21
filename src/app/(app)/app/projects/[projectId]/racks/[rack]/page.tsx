import Link from "next/link";
import { Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { loadFabric, peerOf, STATUS_STYLE, type FabricLink } from "@/lib/fabric/load";
import { ProjectPageHeader } from "@/components/project-page-header";
import { RackElevation, StatusLegend } from "@/components/rack-elevation";
import { VerificationBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

const GROUPS = [
  { id: "fabric", label: "Fabric" },
  { id: "rack", label: "Destination rack" },
  { id: "status", label: "Status" },
] as const;

export default async function RackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; rack: string }>;
  searchParams: Promise<{ device?: string; group?: string; face?: string }>;
}) {
  const { projectId, rack: rackParam } = await params;
  const sp = await searchParams;
  const rackName = decodeURIComponent(rackParam);
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  const project = access.project;
  const data = await loadFabric(projectId, project.activeRevisionId);
  const rack = data.racks.find((r) => r.name === rackName) ?? { name: rackName, heightU: 42, purpose: null, position: null };
  const devices = data.devices.filter((d) => d.rack === rackName);
  const base = `/app/projects/${projectId}/racks/${encodeURIComponent(rackName)}`;
  const face = sp.face === "rear" ? "rear" : "front";
  const group = GROUPS.find((g) => g.id === sp.group)?.id ?? "fabric";
  const selected = devices.find((d) => d.name.toLowerCase() === (sp.device ?? "").toLowerCase()) ?? null;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { device: sp.device, group: sp.group, face: sp.face, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const rackCables = new Map<string, FabricLink>();
  for (const d of devices) for (const l of d.links) rackCables.set(l.cableId, l);
  const leaving = [...rackCables.values()];
  const groupKey = (l: FabricLink) => {
    if (group === "rack") return l.aRack === rackName ? l.zRack : l.aRack;
    if (group === "status") return STATUS_STYLE[l.state].label;
    return l.fabric ?? "Unassigned";
  };
  const grouped = new Map<string, FabricLink[]>();
  for (const l of leaving) grouped.set(groupKey(l), [...(grouped.get(groupKey(l)) ?? []), l]);

  const ports = selected
    ? (await prisma.devicePort.findMany({ where: { deviceId: selected.id }, select: { portLabel: true, speed: true, status: true, plannedCableId: true } })).sort((a, b) =>
        a.portLabel.localeCompare(b.portLabel, undefined, { numeric: true }),
      )
    : [];
  const linkByCable = new Map(data.links.map((l) => [l.cableId, l]));

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section={`Racks / ${rackName}`}
        title={`Rack ${rackName}`}
        description={`${rack.purpose ?? "Rack"} \u00b7 ${rack.heightU}U \u00b7 ${devices.length} devices \u00b7 ${leaving.length} cables`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-[var(--border)] bg-white p-0.5 text-xs font-semibold">
          {(["front", "rear"] as const).map((f) => (
            <Link key={f} href={qs({ face: f === "front" ? undefined : f })} className={cn("rounded px-3 py-1 capitalize", face === f ? "bg-[var(--accent)] text-white" : "text-[var(--muted-fg)]")}>
              {f}
            </Link>
          ))}
        </div>
        <StatusLegend />
      </div>

      {devices.length === 0 ? (
        <EmptyState title="No devices in this rack" description="Set rack and rack unit on devices in Inventory to place them here." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div>
            <RackElevation name={rackName} heightU={rack.heightU} devices={devices} face={face} selected={selected?.name} hrefFor={(d) => qs({ device: d.name })} />
            <p className="mt-2 max-w-[360px] text-xs text-[var(--muted-fg)]">Click a device to list its ports and cables. Rear view shows port utilisation.</p>
          </div>

          <div className="min-w-0 space-y-6">
            {selected && (
              <section className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm" aria-label={`${selected.name} ports`}>
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <span className="text-xs text-[var(--muted-fg)]">
                    {[selected.vendor, selected.model, selected.role, selected.rackUnit ? `U${selected.rackUnit}` : null].filter(Boolean).join(" \u00b7 ")}
                  </span>
                  <Link href={`/app/projects/${projectId}/trace?from=${encodeURIComponent(selected.name)}`} className="ml-auto text-xs font-semibold text-[var(--accent-ink)]">
                    Trace from this device
                  </Link>
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white text-[var(--muted-fg)]">
                      <tr>
                        <th className="py-1 pr-2">Port</th>
                        <th className="py-1 pr-2">Speed</th>
                        <th className="py-1 pr-2">Cable</th>
                        <th className="py-1 pr-2">Far end</th>
                        <th className="py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ports.map((p) => {
                        const l = p.plannedCableId ? linkByCable.get(p.plannedCableId) : undefined;
                        const peer = l ? peerOf(l, selected.name) : null;
                        return (
                          <tr key={p.portLabel} className="border-t border-[var(--border)]">
                            <td className="py-1 pr-2 font-mono">{p.portLabel}</td>
                            <td className="py-1 pr-2">{p.speed ?? "\u2014"}</td>
                            <td className="py-1 pr-2 font-mono">
                              {l ? <Link className="text-[var(--accent-ink)]" href={`/app/projects/${projectId}/cables/${l.id}`}>{l.cableId}</Link> : <span className="text-[var(--muted-fg)]">free</span>}
                            </td>
                            <td className="py-1 pr-2">{peer ? `${peer.peer} ${peer.peerPort}` : ""}</td>
                            <td className="py-1">{l ? (l.state === "NONE" ? null : <VerificationBadge state={l.state} />) : null}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section aria-label="Cables in this rack">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold">Cables</h2>
                <span className="text-xs text-[var(--muted-fg)]">Group by</span>
                {GROUPS.map((g) => (
                  <Link key={g.id} href={qs({ group: g.id === "fabric" ? undefined : g.id })} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", group === g.id ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white text-[var(--muted-fg)]")}>
                    {g.label}
                  </Link>
                ))}
              </div>
              <div className="space-y-3">
                {[...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, ls]) => (
                  <details key={k} open={grouped.size <= 3} className="rounded-lg border border-[var(--border)] bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      {k} <span className="font-normal text-[var(--muted-fg)]">({ls.length})</span>
                    </summary>
                    <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] text-xs">
                      {ls.map((l) => (
                        <li key={l.cableId} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                          <Link className="font-mono font-semibold text-[var(--accent-ink)]" href={`/app/projects/${projectId}/cables/${l.id}`}>{l.cableId}</Link>
                          <span className="font-mono">{l.aDevice} {l.aPort}</span>
                          <span aria-hidden>{"\u2192"}</span>
                          <span className="font-mono">{l.zDevice} {l.zPort}</span>
                          <span className="text-[var(--muted-fg)]">{[l.speed, l.media].filter(Boolean).join(" \u00b7 ")}</span>
                          <span className="ml-auto">{l.state !== "NONE" && <VerificationBadge state={l.state} />}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
