import QRCode from "qrcode";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { ProjectSubnav } from "@/components/project-subnav";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function LabelsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  const project = access.project;
  if (!project.activeRevisionId) {
    return <EmptyState title="No plan" description="Publish a plan to generate labels." />;
  }

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    orderBy: { cableId: "asc" },
    take: 200,
  });

  const base = getAppUrl();
  const items = await Promise.all(
    links.map(async (l) => ({
      cableId: l.cableId,
      aDevice: l.aDevice,
      aPort: l.aPort,
      zDevice: l.zDevice,
      zPort: l.zPort,
      qr: await QRCode.toDataURL(
        `${base}/app/projects/${projectId}/cables/${l.id}?action=install`,
        {
          margin: 1,
          width: 160,
        },
      ),
    })),
  );

  return (
    <div>
      <PageHeader
        title="Label sheet"
        description="Print-friendly QR labels opening the cable field page (install action)."
      />
      <ProjectSubnav projectId={projectId} />
      <p className="mb-4 text-sm text-[var(--muted-fg)] no-print">
        Scan opens the cable on a phone with install highlighted. Use browser print — Avery-style
        2×4 grids.
      </p>
      <div className="grid gap-2 print:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.cableId}
            className="flex break-inside-avoid items-center gap-3 rounded border border-[var(--border)] bg-white p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.qr} alt="" width={80} height={80} className="shrink-0" />
            <div className="min-w-0 text-xs">
              <p className="text-sm font-bold">{item.cableId}</p>
              <p className="truncate">
                A: {item.aDevice}/{item.aPort}
              </p>
              <p className="truncate">
                Z: {item.zDevice}/{item.zPort}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}