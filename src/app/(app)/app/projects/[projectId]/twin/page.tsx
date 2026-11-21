import { Boxes, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { buildRackLayout } from "@/lib/twin/rack-layout";
import { ProjectPageHeader } from "@/components/project-page-header";
import { RackTwinSvg, TwinLegend } from "@/components/rack-twin-svg";
import { AlertBanner, Card, EmptyState, StatCard } from "@/components/ui";

export default async function TwinPage({
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

  const header = (
    <ProjectPageHeader
      projectId={projectId}
      projectName={access.project.name}
      section="Twin"
      title="Rack twin"
      description="Schematic rack elevation derived from the active cable plan."
    />
  );

  if (!access.project.activeRevisionId) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Boxes className="h-5 w-5" aria-hidden />}
          title="No active plan"
          description="Publish a plan to see the rack twin."
        />
      </div>
    );
  }

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: access.project.activeRevisionId },
    include: { runtime: true },
  });

  const layout = buildRackLayout(
    links.map((l) => ({
      aRack: l.aRack,
      zRack: l.zRack,
      aDevice: l.aDevice,
      zDevice: l.zDevice,
      installStatus: l.runtime?.installStatus ?? null,
      retiredAt: l.runtime?.retiredAt ?? null,
    })),
  );

  return (
    <div>
      {header}

      <div className="mb-4">
        <AlertBanner tone="info" title="Schematic twin — not a survey">
          Built only from rack and device names in the active plan. Devices are shown in
          alphabetical schematic slots, not real rack units; there is no measured geometry, room
          layout, or LIDAR data.
        </AlertBanner>
      </div>

      {layout.racks.length === 0 ? (
        <EmptyState title="No active links" description="All plan links are retired or absent." />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Racks" value={layout.racks.length} tone="info" />
            <StatCard label="Devices" value={layout.totalDevices} tone="info" />
            <StatCard label="Active links" value={layout.activeLinks} tone="success" />
          </div>

          <Card
            title="Rack elevation"
            description="Hover a block for endpoint counts. “Np” is the number of planned endpoints on that device."
            className="mb-6"
          >
            <RackTwinSvg layout={layout} />
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <TwinLegend />
            </div>
          </Card>

          <Card title="Rack-to-rack links" description="Active plan links grouped by rack pair." flush>
            <table className="rp-table rp-table-auto">
              <thead>
                <tr>
                  <th>Racks</th>
                  <th className="text-right">Links</th>
                </tr>
              </thead>
              <tbody>
                {layout.connections.map((c) => (
                  <tr key={c.racks.join("→")}>
                    <td className="rp-mono font-medium">
                      {c.racks[0] === c.racks[1]
                        ? `${c.racks[0]} (within rack)`
                        : `${c.racks[0]} ↔ ${c.racks[1]}`}
                    </td>
                    <td className="rp-mono text-right font-semibold">{c.links}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {layout.retiredLinksSkipped > 0 && (
              <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted-fg)]">
                {layout.retiredLinksSkipped} retired link
                {layout.retiredLinksSkipped === 1 ? "" : "s"} excluded.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
