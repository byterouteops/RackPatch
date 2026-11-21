import { AlertTriangle, Cable, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { cableTypeLabel } from "@/lib/cable-type";
import {
  CableListClient,
  type CableHistoryEvent,
  type CableRow,
} from "@/components/cable-list-client";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Button, EmptyState, StatCard } from "@/components/ui";

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : "0%";
}

export default async function CablesPage({
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
  const rows: CableRow[] = [];
  const racks = new Set<string>();
  const cableTypes = new Set<string>();

  if (project.activeRevisionId) {
    const links = await prisma.plannedLink.findMany({
      where: { revisionId: project.activeRevisionId },
      include: {
        runtime: true,
        findings: { where: { revisionId: project.activeRevisionId }, take: 1 },
      },
      orderBy: [{ aRack: "asc" }, { cableId: "asc" }],
    });

    for (const l of links) {
      racks.add(l.aRack);
      racks.add(l.zRack);
      const type = cableTypeLabel(l.cableType);
      cableTypes.add(type);
      rows.push({
        id: l.id,
        cableId: l.cableId,
        aRack: l.aRack,
        aDevice: l.aDevice,
        aPort: l.aPort,
        zRack: l.zRack,
        zDevice: l.zDevice,
        zPort: l.zPort,
        cableType: type,
        installStatus: l.runtime?.installStatus ?? "PLANNED",
        verificationState: l.findings[0]?.state ?? "AWAITING",
        retired: !!l.runtime?.retiredAt,
        lengthMeters: l.runtime?.lengthMeters ?? null,
        notes: l.notes,
        blockedReason: l.runtime?.blockedReason ?? null,
        expected: l.findings[0]?.expectedSummary ?? null,
        observed: l.findings[0]?.observedSummary ?? null,
        nextAction: l.findings[0]?.nextAction ?? null,
        evidenceSource: l.findings[0]?.evidenceSource ?? null,
      });
    }
  }

  const historyEvents = await prisma.auditEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      summary: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  });
  const history: CableHistoryEvent[] = historyEvents.map((e) => ({
    id: e.id,
    action: e.action,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
    actor: e.actor?.name || e.actor?.email || null,
  }));

  const installed = rows.filter((r) => r.installStatus === "INSTALLED").length;
  const blocked = rows.filter((r) => r.installStatus === "BLOCKED").length;
  const verified = rows.filter(
    (r) =>
      r.verificationState === "VERIFIED_LLDP" ||
      r.verificationState === "VERIFIED_PHYSICAL",
  ).length;
  const mismatch = rows.filter((r) => r.verificationState === "MISMATCH").length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Cable Plan"
        title="Cable Plans"
        description="Plan and manage cable connections, import from CSV, validate, and track end-to-end."
        actions={
          <>
            <Button href={`/app/projects/${projectId}/labels`} variant="secondary" size="sm">
              Print labels
            </Button>
            {access.canPublishPlan && (
              <Button href={`/app/projects/${projectId}/plan`} size="sm">
                Import plan
              </Button>
            )}
          </>
        }
        kpis={
          project.activeRevisionId ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Planned Cables" value={rows.length} icon={<Cable aria-hidden />} tone="info" />
              <StatCard
                label="Installed"
                value={installed}
                hint={pct(installed, rows.length)}
                icon={<CheckCircle2 aria-hidden />}
                tone="success"
              />
              <StatCard
                label="Verified"
                value={verified}
                hint={pct(verified, rows.length)}
                icon={<ShieldCheck aria-hidden />}
                tone="success"
              />
              <StatCard
                label="Remaining"
                value={rows.length - installed}
                hint={pct(rows.length - installed, rows.length)}
                icon={<Clock aria-hidden />}
                tone="warning"
              />
              <StatCard
                label="Blocked / Mismatch"
                value={blocked + mismatch}
                hint={pct(blocked + mismatch, rows.length)}
                icon={<AlertTriangle aria-hidden />}
                tone={blocked + mismatch > 0 ? "danger" : "neutral"}
              />
            </div>
          ) : undefined
        }
      />
      {!project.activeRevisionId ? (
        <EmptyState
          title="No plan"
          description="Publish a cable plan first."
          action={
            access.canPublishPlan ? (
              <Button href={`/app/projects/${projectId}/plan`} size="sm">
                Import cable plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <CableListClient
          projectId={projectId}
          rows={rows}
          racks={Array.from(racks).sort()}
          cableTypes={Array.from(cableTypes).sort()}
          history={history}
        />
      )}
    </div>
  );
}
