import { Lock } from "lucide-react";
import { getProjectAccess, userHasPlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { ANALYTICS_WINDOWS_DAYS, countProjectEventsByName } from "@/lib/analytics";
import { ProjectPageHeader } from "@/components/project-page-header";
import { AlertBanner, Card, EmptyState, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const [access, platformAdmin] = await Promise.all([
    getProjectAccess(user, projectId),
    userHasPlatformAdmin(user),
  ]);

  // Project leads (incl. workspace owners) or platform admins only.
  if (!(access?.isLead || platformAdmin)) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="Project leads and platform admins only."
      />
    );
  }

  const project =
    access?.project ??
    (await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
  if (!project) return <EmptyState title="Project not found" />;
  const projectName = access?.project.name;

  const windows = await Promise.all(
    ANALYTICS_WINDOWS_DAYS.map(async (days) => {
      const counts = await countProjectEventsByName(projectId, days);
      return { days, counts, total: counts.reduce((sum, c) => sum + c.count, 0) };
    }),
  );

  return (
    <div>
      {access ? (
        <ProjectPageHeader
          projectId={projectId}
          projectName={projectName}
          section="Analytics"
          title="Analytics"
          description="First-party event counts for this project — no third-party trackers."
        />
      ) : (
        <ProjectPageHeader
          projectId={projectId}
          title="Analytics"
          description="First-party event counts for this project — no third-party trackers."
          hideSubnav
        />
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {windows.map((w) => (
          <StatCard
            key={w.days}
            label={`Events · last ${w.days} days`}
            value={w.total}
            tone="info"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {windows.map((w) => (
          <Card
            key={w.days}
            title={`Last ${w.days} days`}
            description={`${w.total} event${w.total === 1 ? "" : "s"} recorded`}
            flush
          >
            {w.counts.length === 0 ? (
              <p className="p-5 text-sm text-[var(--muted-fg)]">No events recorded in this window.</p>
            ) : (
              <table className="rp-table rp-table-auto">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th className="text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {w.counts.map((c) => (
                    <tr key={c.name}>
                      <td className="rp-mono text-xs">{c.name}</td>
                      <td className="rp-mono text-right font-semibold">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <AlertBanner tone="info" title="What is counted">
          Only these actions are instrumented: project.create, evidence.import, handover.create,
          offline.sync. Events are stored in this instance&apos;s database (counts, ids, actor id —
          no emails or free text) and are only counted from when this feature was deployed.
        </AlertBanner>
      </div>
    </div>
  );
}
