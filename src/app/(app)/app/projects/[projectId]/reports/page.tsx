import Link from "next/link";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeCapacitySummary } from "@/lib/capacity";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui";

/** Executive-style report from live project data only. */
export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState title="Permission denied" />;
  }

  const project = access.project;
  if (!project.activeRevisionId) {
    return (
      <div>
        <ProjectPageHeader
          projectId={projectId}
          projectName={project.name}
          section="Reports"
          title="Reports"
          description="Publish a cable plan to generate live statistics."
        />
        <EmptyState title="No active plan" description="Import and publish a plan first." />
      </div>
    );
  }

  const [links, findings, photos, jobs, handovers] = await Promise.all([
    prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      include: { runtime: true },
    }),
    prisma.verificationFinding.findMany({
      where: { revisionId: project.activeRevisionId },
    }),
    prisma.fieldPhoto.count({ where: { projectId } }),
    prisma.collectionJob.count({ where: { projectId } }),
    prisma.handoverSnapshot.count({ where: { projectId } }),
  ]);

  const capacity = computeCapacitySummary(
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

  const verified = findings.filter(
    (f) => f.state === "VERIFIED_LLDP" || f.state === "VERIFIED_PHYSICAL",
  ).length;
  const mismatches = findings.filter(
    (f) => f.state === "MISMATCH" || f.state === "NEEDS_REVIEW",
  ).length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Reports"
        title="Reports & analytics"
        description="Live aggregates for this project. No invented KPIs."
        actions={
          <Link
            href={`/app/projects/${projectId}/handover`}
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Handover →
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Planned links" value={capacity.totalLinks} tone="info" />
        <StatCard label="Installed" value={capacity.byInstallStatus.INSTALLED ?? 0} tone="success" />
        <StatCard label="Verified" value={verified} tone="success" />
        <StatCard
          label="Open mismatches"
          value={mismatches}
          tone={mismatches > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Field photos" value={photos} tone="neutral" />
        <StatCard label="Collection jobs" value={jobs} tone="neutral" />
        <StatCard label="Handover snapshots" value={handovers} tone="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By cable type">
          {capacity.byCableType.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No cable types set.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {capacity.byCableType.map((t) => (
                <li key={t.type} className="flex justify-between py-2">
                  <span>{t.type}</span>
                  <Badge tone="info">{t.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="By rack">
          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto text-sm">
            {capacity.byRack.map((r) => (
              <li key={r.rack} className="flex justify-between py-2">
                <span className="font-medium">{r.rack}</span>
                <span className="text-[var(--muted-fg)]">
                  {r.installed}/{r.links} installed
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
