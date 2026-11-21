import Link from "next/link";
import { Lock, PanelTop } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { CABLE_TYPE_TAXONOMY } from "@/lib/cable-type";
import {
  CircuitForm,
  DeleteCircuitButton,
  PanelCreateForm,
  PortMapForm,
  UnmapPortButton,
} from "@/components/panel-forms";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui";

export default async function PanelsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
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

  const activeRevisionId = access.project.activeRevisionId;

  const [panels, circuits, links] = await Promise.all([
    prisma.patchPanel.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: {
        ports: {
          orderBy: { portIndex: "asc" },
          include: {
            plannedLink: { select: { id: true, cableId: true, revisionId: true } },
            circuitA: { select: { name: true } },
            circuitZ: { select: { name: true } },
          },
        },
      },
    }),
    prisma.circuit.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      include: {
        portA: { include: { panel: { select: { name: true } } } },
        portZ: { include: { panel: { select: { name: true } } } },
      },
    }),
    activeRevisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId: activeRevisionId },
          orderBy: { cableId: "asc" },
          select: { id: true, cableId: true, aDevice: true, zDevice: true },
        })
      : Promise.resolve([]),
  ]);

  const allPorts = panels.flatMap((p) => p.ports.map((port) => ({ panel: p, port })));
  const label = (panelName: string, idx: number) => `${panelName} #${idx}`;
  const freeForMap = allPorts
    .filter(({ port }) => !port.plannedLinkId)
    .map(({ panel, port }) => ({ id: port.id, label: label(panel.name, port.portIndex) }));
  const freeForCircuit = allPorts
    .filter(({ port }) => !port.circuitA && !port.circuitZ)
    .map(({ panel, port }) => ({ id: port.id, label: label(panel.name, port.portIndex) }));

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Panels"
        title="Panels and circuits"
        description="Patch panels, port-to-cable mapping on the active plan, and circuits terminated on panel ports."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Panels"
            value={panels.length}
            icon={<PanelTop className="h-5 w-5" aria-hidden />}
            tone="info"
          />
          <StatCard
            label="Ports mapped to cables"
            value={allPorts.filter(({ port }) => port.plannedLinkId).length}
            tone="success"
          />
          <StatCard label="Circuits" value={circuits.length} tone="neutral" />
        </div>

        {access.canManageProject && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Create panel" description="Ports 1..N are created automatically.">
              <PanelCreateForm projectId={projectId} />
            </Card>
            <Card title="Map port to cable" description="Each cable end (A or Z) maps to one panel port.">
              <PortMapForm
                projectId={projectId}
                freePorts={freeForMap}
                links={links.map((l) => ({
                  id: l.id,
                  label: `${l.cableId} (${l.aDevice} to ${l.zDevice})`,
                }))}
              />
            </Card>
            <Card title="Create circuit" className="lg:col-span-2">
              <CircuitForm
                projectId={projectId}
                ports={freeForCircuit}
                mediaTypes={[...CABLE_TYPE_TAXONOMY]}
              />
            </Card>
          </div>
        )}

        <Card title={`Circuits (${circuits.length})`} description="Panel-port to panel-port terminations.">
          {circuits.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No circuits yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {circuits.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="rp-mono font-semibold">{c.name}</span> <Badge tone="info">{c.mediaType}</Badge>{" "}
                    {c.portA.panel.name} #{c.portA.portIndex}
                    {c.portZ ? ` to ${c.portZ.panel.name} #${c.portZ.portIndex}` : " (Z open)"}
                  </span>
                  {access.canManageProject && (
                    <DeleteCircuitButton projectId={projectId} circuitId={c.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Panels (${panels.length})`} description="Expand a panel to see port mapping.">
          {panels.length === 0 ? (
            <EmptyState title="No panels" description="A lead can create the first patch panel." />
          ) : (
            <div className="space-y-3">
              {panels.map((p) => {
                const mapped = p.ports.filter((x) => x.plannedLinkId).length;
                return (
                  <details key={p.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white open:shadow-sm">
                    <summary className="cursor-pointer bg-[var(--muted)]/60 px-3 py-2.5 text-sm font-semibold hover:bg-[var(--muted)]">
                      <span className="rp-mono">{p.name}</span>{" "}
                      <span className="font-normal text-[var(--muted-fg)]">
                        {p.rack}
                        {p.rackUnit ? ` U${p.rackUnit}` : ""} - {mapped}/{p.portCount} ports mapped
                      </span>
                    </summary>
                    <ul className="divide-y divide-[var(--border)] text-sm">
                      {p.ports.map((port) => {
                        const stale =
                          port.plannedLink && port.plannedLink.revisionId !== activeRevisionId;
                        const circuitName = port.circuitA?.name ?? port.circuitZ?.name;
                        return (
                          <li
                            key={port.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
                          >
                            <span>
                              <span className="font-medium">#{port.portIndex}</span>{" "}
                              {port.plannedLink ? (
                                <>
                                  {stale ? (
                                    <>
                                      {port.plannedLink.cableId} end {port.side}{" "}
                                      <Badge tone="warning">Not in active plan</Badge>
                                    </>
                                  ) : (
                                    <>
                                      <Link
                                        href={`/app/projects/${projectId}/cables/${port.plannedLink.id}`}
                                        className="text-[var(--accent)] hover:underline"
                                      >
                                        {port.plannedLink.cableId}
                                      </Link>{" "}
                                      end {port.side}
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className="text-[var(--muted-fg)]">free</span>
                              )}
                              {circuitName && (
                                <>
                                  {" "}
                                  <Badge tone="info">Circuit {circuitName}</Badge>
                                </>
                              )}
                            </span>
                            {access.canManageProject && port.plannedLink && (
                              <UnmapPortButton projectId={projectId} portId={port.id} />
                            )}
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
