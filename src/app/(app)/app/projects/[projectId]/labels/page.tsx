import QRCode from "qrcode";
import { Lock, QrCode, ScanLine } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { requireSessionUser } from "@/lib/session";
import { parseLabelConfig } from "@/lib/labels/template";
import { LabelDesigner } from "@/components/label-designer";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Button, EmptyState } from "@/components/ui";

const LABEL_LIMIT = 200;

export default async function LabelsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title="Permission denied" description="You do not have access to this project." />;
  }

  const project = access.project;
  const header = (
    <div className="no-print">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Labels"
        title="Cable Label Designer & Print Management"
        description="Choose a template, customize fields, preview, and print QR cable labels for installation and verification."
        actions={
          <Button href={`/app/projects/${projectId}/scan`} variant="secondary" size="sm">
            <ScanLine className="h-4 w-4" aria-hidden />
            Open scanner
          </Button>
        }
      />
    </div>
  );

  if (!project.activeRevisionId) {
    return (
      <div>
        {header}
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

  const [totalLinks, links, templates, prints] = await Promise.all([
    prisma.plannedLink.count({ where: { revisionId: project.activeRevisionId } }),
    prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      orderBy: { cableId: "asc" },
      take: LABEL_LIMIT,
    }),
    prisma.labelTemplate.findMany({ where: { projectId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 6 }),
    prisma.auditEvent.findMany({
      where: { projectId, action: { startsWith: "labels." } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, summary: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
  ]);

  const def = templates.find((t) => t.isDefault);
  const config = parseLabelConfig(def?.configJson);
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
      cableType: l.cableType,
      qr: await QRCode.toDataURL(`${base}/app/projects/${projectId}/cables/${l.id}?action=install`, { margin: 1, width: 240 }),
    })),
  );

  return (
    <div>
      {header}
      {items.length === 0 ? (
        <EmptyState title="No links" description="The active revision has no cables to label." />
      ) : (
        <LabelDesigner
          projectId={projectId}
          initial={config}
          items={items}
          totalLinks={totalLinks}
          templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault, config: parseLabelConfig(t.configJson) }))}
          history={prints.map((p) => ({
            id: p.id,
            summary: p.summary,
            at: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
            actor: p.actor ? p.actor.name || p.actor.email : "System",
          }))}
          canSave={access.canManageProject}
        />
      )}
    </div>
  );
}
