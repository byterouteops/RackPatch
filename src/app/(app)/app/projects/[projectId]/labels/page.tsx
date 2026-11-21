import QRCode from "qrcode";
import { Lock, QrCode } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { parseLabelConfig } from "@/lib/labels/template";
import { LabelDesigner } from "@/components/label-designer";
import { PrintButton } from "@/components/print-button";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Button, EmptyState, StatCard } from "@/components/ui";

const LABEL_LIMIT = 200;

export default async function LabelsPage({
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

  const project = access.project;
  if (!project.activeRevisionId) {
    return (
      <div>
        <ProjectPageHeader
          projectId={projectId}
          projectName={project.name}
          section="Labels"
          title="Label designer"
          description="Design and print QR labels that open the cable field page."
        />
        <EmptyState
          icon={<QrCode className="h-5 w-5" aria-hidden />}
          title="No plan"
          description="Publish a plan to generate labels."
          action={
            access.canPublishPlan ? (
              <Button href={`/app/projects/${projectId}/plan`} size="sm">
                Import cable plan
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const [totalLinks, links, template] = await Promise.all([
    prisma.plannedLink.count({ where: { revisionId: project.activeRevisionId } }),
    prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      orderBy: { cableId: "asc" },
      take: LABEL_LIMIT,
    }),
    prisma.labelTemplate.findFirst({
      where: { projectId, isDefault: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const config = parseLabelConfig(template?.configJson);
  const base = getAppUrl();
  const items = await Promise.all(
    links.map(async (l) => ({
      id: l.id,
      cableId: l.cableId,
      aDevice: l.aDevice,
      aPort: l.aPort,
      aRack: l.aRack,
      zDevice: l.zDevice,
      zPort: l.zPort,
      zRack: l.zRack,
      qr: await QRCode.toDataURL(
        `${base}/app/projects/${projectId}/cables/${l.id}?action=install`,
        {
          margin: 1,
          width: config.qrSize,
        },
      ),
    })),
  );

  return (
    <div>
      <div className="no-print">
        <ProjectPageHeader
          projectId={projectId}
          projectName={project.name}
          section="Labels"
          title="Label designer"
          description="Choose fields, preview the sheet, save a project template, then print."
          actions={
            <>
              <Button href={`/app/projects/${projectId}/scan`} variant="secondary" size="sm">
                Open scanner
              </Button>
              <PrintButton label="Print labels" />
            </>
          }
        />

        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Labels on this sheet"
            value={items.length}
            icon={<QrCode className="h-5 w-5" aria-hidden />}
            tone="info"
          />
          <StatCard label="Links in active plan" value={totalLinks} tone="neutral" />
        </div>

        <div className="mb-6">
          <LabelDesigner
            projectId={projectId}
            initial={config}
            previewItems={items}
            canSave={access.canManageProject}
          />
        </div>

        <p className="mb-4 text-sm text-[var(--muted-fg)]">
          Printable sheet below. Browser print · Avery-style grid.
          {totalLinks > items.length &&
            ` Showing the first ${items.length} of ${totalLinks} links (sheet limit).`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No links" description="The active revision has no cables to label." />
      ) : (
        <div
          className="grid gap-3 print:grid-cols-2"
          style={{
            gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="rp-card flex break-inside-avoid items-center gap-3 p-3"
            >
              {config.showQr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.qr}
                  alt=""
                  width={Math.round(config.qrSize / 2)}
                  height={Math.round(config.qrSize / 2)}
                  className="shrink-0"
                />
              )}
              <div
                className="min-w-0 text-xs"
                style={{ fontSize: `${0.75 * config.fontScale}rem` }}
              >
                {config.showCableId && (
                  <p className="rp-mono text-sm font-bold text-[var(--foreground)]">
                    {item.cableId}
                  </p>
                )}
                {config.showEnds && (
                  <>
                    <p className="mt-1 truncate text-[var(--muted-fg)]">
                      <span className="font-semibold text-[var(--accent)]">A</span>{" "}
                      {config.showRack ? `${item.aRack}/` : ""}
                      {item.aDevice}/<span className="rp-mono">{item.aPort}</span>
                    </p>
                    <p className="truncate text-[var(--muted-fg)]">
                      <span className="font-semibold text-[var(--z-end)]">Z</span>{" "}
                      {config.showRack ? `${item.zRack}/` : ""}
                      {item.zDevice}/<span className="rp-mono">{item.zPort}</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
