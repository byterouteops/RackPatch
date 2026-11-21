import Link from "next/link";
import { Boxes, CircleDot, Lock, Network, Unplug } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { addInventoryPort, updateInventoryPort } from "@/app/actions/inventory";
import { calculateImpact, countPortStatuses } from "@/lib/port-inventory";
import { InventorySyncButton } from "@/components/inventory-sync-button";
import { ProjectPageHeader } from "@/components/project-page-header";
import { InstallStatusBadge } from "@/components/status-badges";
import { Badge, Button, Card, EmptyState, Input, Select, StatCard } from "@/components/ui";

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ device?: string; port?: string }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

  const revisionId = access.project.activeRevisionId;
  const [devices, links] = await Promise.all([
    prisma.deviceInventory.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: { ports: { orderBy: { portNorm: "asc" } } },
    }),
    revisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId },
          include: { runtime: true },
        })
      : Promise.resolve([]),
  ]);

  const linkIdByCable = new Map(links.map((l) => [l.cableId, l.id]));
  const allPorts = devices.flatMap((d) => d.ports);
  const counts = countPortStatuses(allPorts);

  const deviceNames = Array.from(
    new Set([...devices.map((d) => d.name), ...links.flatMap((l) => [l.aDevice, l.zDevice])]),
  ).sort((a, b) => a.localeCompare(b));

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

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Inventory"
        title="Port inventory"
        description="Ports derived from the active plan plus manually added spares. Impact simulation lists planned links affected by a device or port."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Devices"
            value={devices.length}
            icon={<Network className="h-5 w-5" aria-hidden />}
            tone="info"
          />
          <StatCard
            label="Used"
            value={counts.USED}
            icon={<CircleDot className="h-5 w-5" aria-hidden />}
            tone="success"
          />
          <StatCard
            label="Reserved"
            value={counts.RESERVED}
            icon={<Boxes className="h-5 w-5" aria-hidden />}
            tone="warning"
          />
          <StatCard
            label="Free"
            value={counts.FREE}
            icon={<Unplug className="h-5 w-5" aria-hidden />}
            tone="neutral"
          />
        </div>

        <Card title="Impact simulation" description="What breaks if this device or port is removed?">
          <form method="get" className="grid gap-3 sm:grid-cols-3">
            <Select name="device" defaultValue={sp.device ?? ""} required>
              <option value="">Select device...</option>
              {deviceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Input name="port" defaultValue={sp.port ?? ""} placeholder="Port (optional, whole device if empty)" />
            <Button type="submit">Simulate</Button>
          </form>

          {impact && (
            <div className="mt-4 space-y-3">
              <p className="text-sm">
                <span className="font-semibold">
                  {impact.target.device}
                  {impact.target.port ? ` ${impact.target.port}` : ""}
                </span>{" "}
                affects {impact.affectedLinks.length} link(s), {impact.localPortsAffected} local port(s),
                {" "}
                {impact.peerDevices.length} peer device(s).
              </p>
              {impact.affectedLinks.length === 0 ? (
                <p className="text-sm text-[var(--muted-fg)]">No active planned links match.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(impact.byInstallStatus).map(([k, v]) => (
                      <Badge key={k} tone="neutral">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                  <ul className="divide-y divide-[var(--border)] text-sm">
                    {impact.affectedLinks.map((a) => {
                      const linkId = linkIdByCable.get(a.cableId);
                      return (
                        <li key={a.cableId} className="flex flex-wrap justify-between gap-2 py-2">
                          <span>
                            {linkId ? (
                              <Link
                                href={`/app/projects/${projectId}/cables/${linkId}`}
                                className="font-semibold text-[var(--accent)] hover:underline"
                              >
                                {a.cableId}
                              </Link>
                            ) : (
                              <span className="font-semibold">{a.cableId}</span>
                            )}{" "}
                            {a.localDevice} {a.localPort} to {a.peerDevice} {a.peerPort}
                            {a.peerRack ? ` (${a.peerRack})` : ""}
                          </span>
                          {a.installStatus && (
                            <InstallStatusBadge status={a.installStatus as "PLANNED" | "INSTALLED" | "BLOCKED"} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </Card>

        {access.canManageProject && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="Sync"
              description="Upsert device ports from the active plan (retired cables ignored). Ports no longer in the plan are freed."
            >
              {revisionId ? (
                <InventorySyncButton projectId={projectId} />
              ) : (
                <p className="text-sm text-[var(--muted-fg)]">Publish a plan first.</p>
              )}
            </Card>
            <Card title="Add free port">
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
                className="grid gap-3 sm:grid-cols-3"
              >
                <Input name="device" required placeholder="Device" />
                <Input name="port" required placeholder="Port" />
                <Input name="speed" placeholder="Speed (optional)" />
                <Button type="submit" variant="secondary" className="sm:col-span-3">
                  Add port
                </Button>
              </form>
            </Card>
          </div>
        )}

        <Card title="Devices and ports" description="Expand a device to see port status and edit spares.">
          {devices.length === 0 ? (
            <EmptyState
              title="No inventory yet"
              description="Sync from the active plan or add ports manually."
            />
          ) : (
            <div className="space-y-3">
              {devices.map((d) => {
                const c = countPortStatuses(d.ports);
                return (
                  <details key={d.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white open:shadow-sm">
                    <summary className="cursor-pointer bg-[var(--muted)]/60 px-3 py-2.5 text-sm font-semibold hover:bg-[var(--muted)]">
                      <span className="rp-mono">{d.name}</span>
                      {d.rack ? ` (${d.rack})` : ""}{" "}
                      <span className="font-normal text-[var(--muted-fg)]">
                        {c.USED} used, {c.RESERVED} reserved, {c.FREE} free
                      </span>
                    </summary>
                    <ul className="divide-y divide-[var(--border)] text-sm">
                      {d.ports.map((p) => {
                        const linkId = p.plannedCableId ? linkIdByCable.get(p.plannedCableId) : null;
                        return (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span>
                              <span className="rp-mono font-medium">{p.portLabel}</span>
                              {p.speed ? ` - ${p.speed}` : ""}
                              {p.plannedCableId && (
                                <>
                                  {" "}
                                  -{" "}
                                  {linkId ? (
                                    <Link
                                      href={`/app/projects/${projectId}/cables/${linkId}`}
                                      className="text-[var(--accent)] hover:underline"
                                    >
                                      {p.plannedCableId}
                                    </Link>
                                  ) : (
                                    p.plannedCableId
                                  )}
                                </>
                              )}
                            </span>
                            <span className="flex items-center gap-2">
                              <Badge
                                tone={
                                  p.status === "USED"
                                    ? "info"
                                    : p.status === "RESERVED"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {p.status}
                              </Badge>
                              {access.canManageProject && p.status !== "USED" && (
                                <form
                                  action={async (fd) => {
                                    "use server";
                                    await updateInventoryPort({
                                      projectId,
                                      portId: p.id,
                                      status: String(fd.get("status")) as "FREE" | "RESERVED",
                                      speed: String(fd.get("speed") || "") || null,
                                    });
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Select name="status" defaultValue={p.status} className="h-8 w-28">
                                    <option value="FREE">Free</option>
                                    <option value="RESERVED">Reserved</option>
                                  </Select>
                                  <Input
                                    name="speed"
                                    defaultValue={p.speed ?? ""}
                                    placeholder="Speed"
                                    className="h-8 w-24"
                                  />
                                  <Button type="submit" size="sm" variant="secondary">
                                    Save
                                  </Button>
                                </form>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
