import type { InstallStatus, Prisma } from "@prisma/client";
import { AlertTriangle, Cable, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { cableTypeLabel } from "@/lib/cable-type";
import { CableListClient, type CableHistoryEvent } from "@/components/cable-list-client";
import { FIRST_PAGE, encodeCableList, type CableListRow } from "@/lib/cable-list-codec";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Button, EmptyState, StatCard } from "@/components/ui";

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : "0%";
}

export default async function CablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; fabric?: string }>;
}) {
  const { projectId } = await params;
  const { status, fabric } = await searchParams;
  const initialInstall = status && ["PLANNED", "INSTALLED", "BLOCKED"].includes(status) ? status : "";
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return <EmptyState title="Permission denied" />;
  }

  const project = access.project;
  const revisionId = project.activeRevisionId;
  const headerActions = (
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
  );
  if (!revisionId) {
    return (
      <div>
        <ProjectPageHeader
          projectId={projectId}
          projectName={project.name}
          section="Cable Plan"
          title="Cable Plans"
          description="Plan and manage cable connections, import from CSV, validate, and track end-to-end."
          actions={headerActions}
        />
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
      </div>
    );
  }

  const select = {
    id: true,
    cableId: true,
    aRack: true,
    aDevice: true,
    aPort: true,
    zRack: true,
    zDevice: true,
    zPort: true,
    cableType: true,
    fabric: true,
    speed: true,
    lengthM: true,
    runtime: { select: { installStatus: true, retiredAt: true, lengthMeters: true } },
    findings: { where: { revisionId }, take: 1, select: { state: true } },
  } satisfies Prisma.PlannedLinkSelect;
  const orderBy: Prisma.PlannedLinkOrderByWithRelationInput[] = [{ aRack: "asc" }, { cableId: "asc" }];
  const toRow = (l: Prisma.PlannedLinkGetPayload<{ select: typeof select }>): CableListRow => ({
    id: l.id,
    cableId: l.cableId,
    aRack: l.aRack,
    aDevice: l.aDevice,
    aPort: l.aPort,
    zRack: l.zRack,
    zDevice: l.zDevice,
    zPort: l.zPort,
    cableType: cableTypeLabel(l.cableType),
    fabric: l.fabric,
    speed: l.speed,
    installStatus: l.runtime?.installStatus ?? "PLANNED",
    verificationState: l.findings[0]?.state ?? "AWAITING",
    retired: !!l.runtime?.retiredAt,
    lengthMeters: l.runtime?.lengthMeters ?? l.lengthM ?? null,
  });

  // The full list is streamed after the first page so the table paints before thousands of rows arrive.
  const data = prisma.plannedLink
    .findMany({ where: { revisionId }, select, orderBy })
    .then((links) => encodeCableList(links.map(toRow)));

  const inRevision = { plannedLink: { revisionId } };
  const [total, installCounts, verified, mismatch, issues, options, historyEvents] = await Promise.all([
    prisma.plannedLink.count({ where: { revisionId } }),
    prisma.linkRuntime.groupBy({ by: ["installStatus"], where: inRevision, _count: { _all: true } }),
    prisma.verificationFinding.count({
      where: { revisionId, ...inRevision, state: { in: ["VERIFIED_LLDP", "VERIFIED_PHYSICAL"] } },
    }),
    prisma.verificationFinding.count({ where: { revisionId, ...inRevision, state: "MISMATCH" } }),
    prisma.plannedLink.count({
      where: {
        revisionId,
        OR: [
          { runtime: { installStatus: "BLOCKED" } },
          { findings: { some: { revisionId, state: { in: ["MISMATCH", "NEEDS_REVIEW"] } } } },
        ],
      },
    }),
    prisma.plannedLink.groupBy({ by: ["aRack", "zRack", "cableType", "fabric"], where: { revisionId } }),
    prisma.auditEvent.findMany({
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
    }),
  ]);

  const racks = new Set<string>();
  const cableTypes = new Set<string>();
  const fabrics = new Set<string>();
  for (const o of options) {
    racks.add(o.aRack);
    racks.add(o.zRack);
    cableTypes.add(cableTypeLabel(o.cableType));
    if (o.fabric) fabrics.add(o.fabric);
  }
  const initialFabric = fabric && fabrics.has(fabric) ? fabric : "";

  const firstPageWhere: Prisma.PlannedLinkWhereInput = {
    revisionId,
    ...(initialFabric ? { fabric: initialFabric } : {}),
    ...(initialInstall === "PLANNED"
      ? { OR: [{ runtime: { is: null } }, { runtime: { installStatus: "PLANNED" } }] }
      : initialInstall
        ? { runtime: { installStatus: initialInstall as InstallStatus } }
        : {}),
  };
  const [firstPage, matching] = await Promise.all([
    prisma.plannedLink.findMany({ where: firstPageWhere, select, orderBy, take: FIRST_PAGE }),
    initialFabric || initialInstall ? prisma.plannedLink.count({ where: firstPageWhere }) : Promise.resolve(total),
  ]);
  const history: CableHistoryEvent[] = historyEvents.map((e) => ({
    id: e.id,
    action: e.action,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
    actor: e.actor?.name || e.actor?.email || null,
  }));

  const installCount = (s: InstallStatus) => installCounts.find((c) => c.installStatus === s)?._count._all ?? 0;
  const installed = installCount("INSTALLED");
  const blocked = installCount("BLOCKED");

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Cable Plan"
        title="Cable Plans"
        description="Plan and manage cable connections, import from CSV, validate, and track end-to-end."
        actions={headerActions}
        kpis={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1600px]:grid-cols-5">
            <StatCard label="Planned Cables" value={total} icon={<Cable aria-hidden />} tone="info" />
            <StatCard
              label="Installed"
              value={installed}
              hint={pct(installed, total)}
              icon={<CheckCircle2 aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Verified"
              value={verified}
              hint={pct(verified, total)}
              icon={<ShieldCheck aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Remaining"
              value={total - installed}
              hint={pct(total - installed, total)}
              icon={<Clock aria-hidden />}
              tone="warning"
            />
            <StatCard
              label="Blocked / Mismatch"
              value={blocked + mismatch}
              hint={pct(blocked + mismatch, total)}
              icon={<AlertTriangle aria-hidden />}
              tone={blocked + mismatch > 0 ? "danger" : "neutral"}
            />
          </div>
        }
      />
      <CableListClient
        projectId={projectId}
        initialInstall={initialInstall}
        initialFabric={initialFabric}
        fabrics={Array.from(fabrics).sort()}
        firstPage={encodeCableList(firstPage.map(toRow))}
        data={data}
        counts={{ total, issues, matching }}
        racks={Array.from(racks).sort()}
        cableTypes={Array.from(cableTypes).sort()}
        history={history}
      />
    </div>
  );
}
