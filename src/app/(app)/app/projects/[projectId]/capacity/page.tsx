import { BarChart3, Cable, CheckCircle2, Lock, Archive } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeCapacitySummary } from "@/lib/capacity";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Card, EmptyState, ProgressBar, StatCard } from "@/components/ui";

export default async function CapacityPage({
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

  if (!access.project.activeRevisionId) {
    return (
      <div>
        <ProjectPageHeader
          projectId={projectId}
          projectName={access.project.name}
          section="Capacity"
          title="Capacity"
          description="Plan-link usage by rack and device."
        />
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden />}
          title="No active plan"
          description="Publish a plan to see capacity."
        />
      </div>
    );
  }

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: access.project.activeRevisionId },
    include: { runtime: true },
  });
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

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Capacity"
        title="Capacity"
        description="Counts from the active cable plan — not a full port inventory."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total links"
          value={summary.totalLinks}
          icon={<Cable className="h-5 w-5" aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Active"
          value={summary.activeLinks}
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          tone="success"
        />
        <StatCard
          label="Retired"
          value={summary.retiredLinks}
          icon={<Archive className="h-5 w-5" aria-hidden />}
          tone="neutral"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Install status" description="Links by install state." flush>
          <table className="rp-table rp-table-auto">
            <thead>
              <tr>
                <th>Status</th>
                <th className="text-right">Links</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.byInstallStatus).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="rp-mono text-right font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Cable types" description="Media types set on plan links." flush>
          {summary.byCableType.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-fg)]">No types set</p>
          ) : (
            <table className="rp-table rp-table-auto">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="text-right">Links</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCableType.map((t) => (
                  <tr key={t.type}>
                    <td>{t.type}</td>
                    <td className="rp-mono text-right font-semibold">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By rack" description="Installed vs planned links per rack.">
          {summary.byRack.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No racks in the active plan.</p>
          ) : (
            <div className="space-y-4">
              {summary.byRack.map((r) => (
                <ProgressBar
                  key={r.rack}
                  label={r.rack}
                  value={r.installed}
                  max={r.links}
                />
              ))}
            </div>
          )}
        </Card>
        <Card title="By device (ports used in plan)" flush>
          {summary.byDevice.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-fg)]">No devices in the active plan.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="rp-table rp-table-auto">
                <thead className="sticky top-0">
                  <tr>
                    <th>Device</th>
                    <th className="text-right">Ports</th>
                    <th className="text-right">Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDevice.map((d) => (
                    <tr key={d.device}>
                      <td className="rp-mono font-medium">{d.device}</td>
                      <td className="rp-mono text-right">{d.portsUsed}</td>
                      <td className="rp-mono text-right">{d.installed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
