import Link from "next/link";
import { Boxes, CheckCircle2, CircleDot, Layers, Lock, Network, Server, Unplug, Zap } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { addInventoryPort, updateInventoryPort } from "@/app/actions/inventory";
import { calculateImpact, countPortStatuses } from "@/lib/port-inventory";
import { InventorySyncButton } from "@/components/inventory-sync-button";
import { ProjectPageHeader } from "@/components/project-page-header";
import { InstallStatusBadge } from "@/components/status-badges";
import { Badge, Button, EmptyState, Input, Select, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mapping = { label: string; tone: "success" | "danger" | "info" | "warning" | "neutral" };

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ device?: string; port?: string; dev?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }

  const revisionId = access.project.activeRevisionId;
  const [devices, links, observations] = await Promise.all([
    prisma.deviceInventory.findMany({ where: { projectId }, orderBy: { name: "asc" }, include: { ports: { orderBy: { portNorm: "asc" } } } }),
    revisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId },
          include: { runtime: true, findings: { where: { revisionId }, take: 1, select: { state: true } } },
        })
      : Promise.resolve([]),
    prisma.observation.findMany({
      where: { evidenceImport: { projectId, parseFailed: false } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        id: true,
        localInterface: true,
        localInterfaceNorm: true,
        remoteSystemName: true,
        remoteSystemNorm: true,
        remotePortId: true,
        evidenceImport: { select: { sourceDevice: true, sourceDeviceNorm: true } },
      },
    }),
  ]);

  const linkByCable = new Map(links.map((l) => [l.cableId, l]));
  const obsByPort = new Map<string, (typeof observations)[number]>();
  for (const o of observations) {
    const k = `${o.evidenceImport.sourceDeviceNorm}|${o.localInterfaceNorm}`;
    if (!obsByPort.has(k)) obsByPort.set(k, o);
  }
  const allPorts = devices.flatMap((d) => d.ports);
  const counts = countPortStatuses(allPorts);
  const racks = new Set(devices.map((d) => d.rack).filter(Boolean)).size;
  const observedPorts = devices.reduce((n, d) => n + d.ports.filter((p) => obsByPort.has(`${d.nameNorm}|${p.portNorm}`)).length, 0);
  const mappedPct = allPorts.length ? ((counts.USED / allPorts.length) * 100).toFixed(1) : "0";

  const selected = devices.find((d) => d.id === sp.dev) ?? devices[0] ?? null;
  const portRows =
    selected?.ports.map((p) => {
      const obs = obsByPort.get(`${selected.nameNorm}|${p.portNorm}`);
      const link = p.plannedCableId ? linkByCable.get(p.plannedCableId) : undefined;
      const peerNorm = link ? (link.aDeviceNorm === selected.nameNorm ? link.zDeviceNorm : link.aDeviceNorm) : null;
      const peer = link ? (link.aDeviceNorm === selected.nameNorm ? `${link.zDevice} ${link.zPort}` : `${link.aDevice} ${link.aPort}`) : null;
      let mapping: Mapping;
      if (p.status === "RESERVED") mapping = { label: "Reserved", tone: "warning" };
      else if (p.status === "FREE") mapping = { label: "Unmapped", tone: "neutral" };
      else if (obs && peerNorm && obs.remoteSystemNorm && obs.remoteSystemNorm !== peerNorm) mapping = { label: "Mismatch", tone: "danger" };
      else if (obs) mapping = { label: "Verified", tone: "success" };
      else mapping = { label: "Mapped", tone: "info" };
      return { port: p, obs, link, peer, mapping };
    }) ?? [];

  const deviceNames = Array.from(new Set([...devices.map((d) => d.name), ...links.flatMap((l) => [l.aDevice, l.zDevice])])).sort((a, b) => a.localeCompare(b));
  const impact =
    sp.device && sp.device.trim()
      ? calculateImpact(
          links.map((l) => ({
            cableId: l.cableId,
            aRack: l.aRack,
            aDevice: l.aDevice,
            aPort: l.aPort,
            zRack: l.zRack,
            zDevice: l.zDevice,
            zPort: l.zPort,
            installStatus: l.runtime?.installStatus ?? null,
            retiredAt: l.runtime?.retiredAt ?? null,
          })),
          { device: sp.device, port: sp.port },
        )
      : null;
  const portMap = links
    .filter((l) => l.findings[0]?.state === "VERIFIED_LLDP" || l.findings[0]?.state === "VERIFIED_PHYSICAL" || l.runtime?.installStatus === "INSTALLED")
    .slice(0, 6);
  const base = `/app/projects/${projectId}/inventory`;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Inventory"
        title="Network Device Inventory & Interface Mapping"
        description="Devices and interfaces from the active plan plus spares, mapped to cables and observed LLDP/CDP neighbors."
        actions={
          <>
            <Button href={`/app/projects/${projectId}/lldp`} size="sm" variant="secondary">
              <Network className="h-4 w-4" aria-hidden />
              Discover (LLDP/CDP)
            </Button>
            <Button href={`/app/projects/${projectId}/integrations`} size="sm" variant="secondary">
              NetBox
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total Devices" value={devices.length} icon={<Server aria-hidden />} tone="info" />
        <StatCard label="Racks" value={racks} icon={<Layers aria-hidden />} tone="neutral" />
        <StatCard label="Total Interfaces" value={allPorts.length} icon={<Network aria-hidden />} tone="info" />
        <StatCard label="Mapped" value={counts.USED} hint={`${mappedPct}%`} icon={<CircleDot aria-hidden />} tone="success" />
        <StatCard label="Reserved" value={counts.RESERVED} icon={<Boxes aria-hidden />} tone="warning" />
        <StatCard label="Free" value={counts.FREE} icon={<Unplug aria-hidden />} tone="neutral" />
        <StatCard label="LLDP Observed" value={observedPorts} icon={<CheckCircle2 aria-hidden />} tone="success" />
      </div>

      {devices.length === 0 ? (
        <section className="rp-card mb-4 p-6 text-center">
          <Server className="mx-auto mb-2 h-8 w-8 text-[var(--muted-fg)]" aria-hidden />
          <p className="rp-display text-[16px] font-bold">No inventory yet</p>
          <p className="mb-4 text-sm text-[var(--muted-fg)]">Sync devices and ports from the active cable plan, or add spare ports manually.</p>
          {access.canManageProject && revisionId ? <InventorySyncButton projectId={projectId} /> : null}
        </section>
      ) : (
        <>
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_280px]">
            <section className="rp-card overflow-hidden" aria-label="Device list">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">Device List ({devices.length})</h2>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-[var(--muted)]">
                    <tr className="text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Hostname</th>
                      <th className="px-2 py-2">Rack</th>
                      <th className="px-4 py-2 text-right">Ports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => {
                      const c = countPortStatuses(d.ports);
                      const active = d.id === selected?.id;
                      return (
                        <tr key={d.id} className={cn("border-b border-[var(--border)] last:border-0", active ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                          <td className="px-4 py-2">
                            <Link href={`${base}?dev=${d.id}`} scroll={false} className="flex items-center gap-2 font-semibold text-[var(--accent)] hover:underline">
                              <Server className="h-3.5 w-3.5 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-xs">{d.rack ?? "\u2014"}</td>
                          <td className="px-4 py-2 text-right text-xs">
                            {c.USED}/{d.ports.length}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rp-card overflow-hidden" aria-label="Interface mapping">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">
                  Interface Mapping {"\u2014"} {selected?.name}
                </h2>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[560px] text-[13px]">
                  <thead className="sticky top-0 bg-[var(--muted)]">
                    <tr className="text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Interface</th>
                      <th className="px-2 py-2">Planned peer</th>
                      <th className="px-2 py-2">Neighbor (LLDP/CDP)</th>
                      <th className="px-2 py-2">Cable ID</th>
                      <th className="px-4 py-2">Mapping</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portRows.map((r) => (
                      <tr key={r.port.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="rp-mono px-4 py-2 font-medium">
                          {r.port.portLabel}
                          {r.port.speed && <span className="ml-1 text-[11px] text-[var(--muted-fg)]">{r.port.speed}</span>}
                        </td>
                        <td className="px-2 py-2 text-xs">{r.peer ?? "\u2014"}</td>
                        <td className={cn("px-2 py-2 text-xs", r.mapping.label === "Mismatch" && "font-medium text-[var(--danger)]")}>
                          {r.obs ? `${r.obs.remoteSystemName ?? "?"} ${r.obs.remotePortId ?? ""}` : "\u2014"}
                        </td>
                        <td className="px-2 py-2">
                          {r.link ? (
                            <Link href={`/app/projects/${projectId}/cables/${r.link.id}`} className="rp-mono text-xs font-semibold text-[var(--accent)] hover:underline">
                              {r.link.cableId}
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--muted-fg)]">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {access.canManageProject && r.port.status !== "USED" ? (
                            <form
                              action={async (fd) => {
                                "use server";
                                await updateInventoryPort({
                                  projectId,
                                  portId: r.port.id,
                                  status: String(fd.get("status")) as "FREE" | "RESERVED",
                                  speed: String(fd.get("speed") || "") || null,
                                });
                              }}
                              className="flex items-center gap-1"
                            >
                              <Select name="status" defaultValue={r.port.status} className="h-7 w-24 text-xs" aria-label={`Status for ${r.port.portLabel}`}>
                                <option value="FREE">Unmapped</option>
                                <option value="RESERVED">Reserved</option>
                              </Select>
                              <input type="hidden" name="speed" value={r.port.speed ?? ""} />
                              <Button type="submit" size="sm" variant="secondary">
                                Save
                              </Button>
                            </form>
                          ) : (
                            <Badge tone={r.mapping.tone}>{r.mapping.label}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rp-card p-4" aria-label="Interface summary">
              <h2 className="rp-display mb-3 text-[15px] font-bold">Interface Summary</h2>
              {[
                { label: "Total interfaces", value: allPorts.length },
                { label: "Mapped (to cable)", value: counts.USED },
                { label: "Unmapped", value: counts.FREE },
                { label: "Reserved", value: counts.RESERVED },
                { label: "LLDP/CDP observed", value: observedPorts },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between border-b border-[var(--border)] py-2 text-[13px] last:border-0">
                  <span className="text-[var(--muted-fg)]">{r.label}</span>
                  <span className="font-bold">
                    {r.value}
                    {allPorts.length > 0 && r.label !== "Total interfaces" && (
                      <span className="ml-1 text-[11px] font-normal text-[var(--muted-fg)]">({((r.value / allPorts.length) * 100).toFixed(1)}%)</span>
                    )}
                  </span>
                </div>
              ))}
            </section>
          </div>

          <div className="mb-4 grid items-start gap-4 xl:grid-cols-2">
            <section className="rp-card overflow-hidden" aria-label="LLDP CDP neighbor details">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">LLDP / CDP Neighbor Details</h2>
                <Link href={`/app/projects/${projectId}/evidence?type=lldp`} className="text-xs font-semibold text-[var(--accent)]">
                  View all {"\u2192"}
                </Link>
              </div>
              {observations.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted-fg)]">No neighbor evidence imported yet.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Local device / port</th>
                      <th className="px-2 py-2">Neighbor device / port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.slice(0, 6).map((o) => (
                      <tr key={o.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-2">
                          <span className="font-semibold">{o.evidenceImport.sourceDevice}</span> <span className="rp-mono text-xs">{o.localInterface}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-semibold">{o.remoteSystemName ?? "\u2014"}</span> <span className="rp-mono text-xs">{o.remotePortId ?? ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rp-card overflow-hidden" aria-label="Port to cable map">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h2 className="rp-display text-[15px] font-bold">Port-to-Cable Map</h2>
                <Link href={`/app/projects/${projectId}/cables`} className="text-xs font-semibold text-[var(--accent)]">
                  View all {"\u2192"}
                </Link>
              </div>
              {portMap.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted-fg)]">No installed or verified cables yet.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-xs font-semibold text-[var(--muted-fg)]">
                      <th className="px-4 py-2">Cable ID</th>
                      <th className="px-2 py-2">A-End</th>
                      <th className="px-2 py-2">Z-End</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portMap.map((l) => {
                      const v = l.findings[0]?.state === "VERIFIED_LLDP" || l.findings[0]?.state === "VERIFIED_PHYSICAL";
                      return (
                        <tr key={l.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2">
                            <Link href={`/app/projects/${projectId}/cables/${l.id}`} className="rp-mono font-semibold text-[var(--accent)]">
                              {l.cableId}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {l.aDevice} {l.aPort}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {l.zDevice} {l.zPort}
                          </td>
                          <td className="px-4 py-2">{v ? <Badge tone="success">Verified</Badge> : <InstallStatusBadge status="INSTALLED" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="rp-card p-4 xl:col-span-2" aria-label="Impact simulation">
          <h2 className="rp-display mb-1 text-[15px] font-bold">Impact Simulation</h2>
          <p className="mb-3 text-xs text-[var(--muted-fg)]">What breaks if this device or port is removed?</p>
          <form method="get" className="grid gap-3 sm:grid-cols-3">
            {selected && <input type="hidden" name="dev" value={selected.id} />}
            <Select name="device" defaultValue={sp.device ?? ""} required aria-label="Device">
              <option value="">Select device...</option>
              {deviceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Input name="port" defaultValue={sp.port ?? ""} placeholder="Port (optional)" aria-label="Port" />
            <Button type="submit">Simulate</Button>
          </form>
          {impact && (
            <div className="mt-4 space-y-2">
              <p className="text-sm">
                <span className="font-semibold">
                  {impact.target.device}
                  {impact.target.port ? ` ${impact.target.port}` : ""}
                </span>{" "}
                affects {impact.affectedLinks.length} link(s), {impact.localPortsAffected} local port(s), {impact.peerDevices.length} peer device(s).
              </p>
              {impact.affectedLinks.length > 0 && (
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {impact.affectedLinks.map((a) => {
                    const l = linkByCable.get(a.cableId);
                    return (
                      <li key={a.cableId} className="flex flex-wrap justify-between gap-2 py-1.5">
                        <span>
                          {l ? (
                            <Link href={`/app/projects/${projectId}/cables/${l.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                              {a.cableId}
                            </Link>
                          ) : (
                            <span className="font-semibold">{a.cableId}</span>
                          )}{" "}
                          {a.localDevice} {a.localPort} to {a.peerDevice} {a.peerPort}
                          {a.peerRack ? ` (${a.peerRack})` : ""}
                        </span>
                        {a.installStatus && <InstallStatusBadge status={a.installStatus as "PLANNED" | "INSTALLED" | "BLOCKED"} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="rp-card p-4" aria-label="Quick actions">
          <h2 className="rp-display mb-3 flex items-center gap-2 text-[15px] font-bold">
            <Zap className="h-4 w-4" aria-hidden />
            Quick Actions
          </h2>
          {access.canManageProject ? (
            <div className="space-y-3">
              {revisionId && devices.length > 0 && <InventorySyncButton projectId={projectId} />}
              <form
                action={async (fd) => {
                  "use server";
                  await addInventoryPort({
                    projectId,
                    device: String(fd.get("device") || ""),
                    port: String(fd.get("port") || ""),
                    speed: String(fd.get("speed") || "") || null,
                  });
                }}
                className="grid gap-2"
              >
                <p className="text-xs font-semibold text-[var(--muted-fg)]">Add spare port</p>
                <div className="grid grid-cols-3 gap-2">
                  <Input name="device" required placeholder="Device" className="h-9" />
                  <Input name="port" required placeholder="Port" className="h-9" />
                  <Input name="speed" placeholder="Speed" className="h-9" />
                </div>
                <Button type="submit" size="sm" variant="secondary">
                  Add port
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">Inventory changes require the lead role.</p>
          )}
        </section>
      </div>
    </div>
  );
}
