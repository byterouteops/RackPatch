import Link from "next/link";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Link2Off,
  ShieldCheck,
} from "lucide-react";
import { CommercialStatus } from "@prisma/client";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  StatCard,
  TextLink,
} from "@/components/ui";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState title="Permission denied" description="You do not have access to this project." />
    );
  }

  const project = access.project;

  let counts = {
    cables: 0,
    installed: 0,
    verified: 0,
    openExceptions: 0,
  };
  let rackProgress: Array<{ rack: string; total: number; installed: number }> = [];
  let attention: Array<{
    id: string;
    cableId: string;
    expected: string;
    observed: string | null;
    state: string;
    linkId: string;
  }> = [];
  let playbooks: ReturnType<typeof buildSwapFixPlaybooks> = [];
  let staleCount = 0;
  let neverImportedCount = 0;

  if (project.activeRevisionId) {
    const revisionId = project.activeRevisionId;

    // Lightweight queries only — never load every link+runtime into memory.
    const [cables, installed, verified, openExceptions, openFindings, linkSlim, imports] =
      await Promise.all([
        prisma.plannedLink.count({ where: { revisionId } }),
        prisma.plannedLink.count({
          where: { revisionId, runtime: { installStatus: "INSTALLED" } },
        }),
        prisma.verificationFinding.count({
          where: {
            revisionId,
            state: { in: ["VERIFIED_LLDP", "VERIFIED_PHYSICAL"] },
          },
        }),
        prisma.verificationFinding.count({
          where: {
            revisionId,
            exceptionStatus: { not: "CLOSED" },
            state: { in: ["MISMATCH", "NEEDS_REVIEW"] },
          },
        }),
        prisma.verificationFinding.findMany({
          where: {
            revisionId,
            exceptionStatus: { not: "CLOSED" },
            state: { in: ["MISMATCH", "NEEDS_REVIEW"] },
          },
          include: {
            plannedLink: {
              select: {
                id: true,
                cableId: true,
                aRack: true,
                zRack: true,
                aDevice: true,
                aPort: true,
                zDevice: true,
                zPort: true,
              },
            },
          },
          orderBy: { computedAt: "desc" },
          take: 40,
        }),
        prisma.plannedLink.findMany({
          where: { revisionId },
          select: {
            aRack: true,
            zRack: true,
            aDevice: true,
            zDevice: true,
            runtime: { select: { installStatus: true } },
          },
        }),
        prisma.evidenceImport.findMany({
          where: { projectId },
          select: {
            sourceDevice: true,
            sourceDeviceNorm: true,
            uploadedAt: true,
            captureTime: true,
            parseFailed: true,
          },
          orderBy: { uploadedAt: "desc" },
          take: 200,
        }),
      ]);

    counts = { cables, installed, verified, openExceptions };

    const plannedDevices = Array.from(
      new Set(linkSlim.flatMap((l) => [l.aDevice, l.zDevice])),
    );
    const staleness = computeEvidenceStaleness({
      imports,
      plannedDevices,
      maxAgeDays: 7,
    });
    staleCount = staleness.stale.length;
    neverImportedCount = staleness.neverImported.length;

    const byRack = new Map<string, { total: number; installed: number }>();
    for (const l of linkSlim) {
      for (const rack of new Set([l.aRack, l.zRack])) {
        const cur = byRack.get(rack) ?? { total: 0, installed: 0 };
        cur.total += 1;
        if (l.runtime?.installStatus === "INSTALLED") cur.installed += 1;
        byRack.set(rack, cur);
      }
    }
    rackProgress = Array.from(byRack.entries())
      .map(([rack, v]) => ({ rack, ...v }))
      .sort((a, b) => a.rack.localeCompare(b.rack))
      .slice(0, 24);

    attention = openFindings.slice(0, 6).map((f) => ({
      id: f.id,
      cableId: f.plannedLink.cableId,
      expected: f.expectedSummary,
      observed: f.observedSummary,
      state: f.state,
      linkId: f.plannedLink.id,
    }));

    playbooks = buildSwapFixPlaybooks(
      openFindings.map((f) => ({
        cableId: f.plannedLink.cableId,
        relatedCableId: f.relatedCableId,
        findingType: f.findingType,
        state: f.state,
        expectedSummary: f.expectedSummary,
        observedSummary: f.observedSummary,
        aRack: f.plannedLink.aRack,
        zRack: f.plannedLink.zRack,
        aDevice: f.plannedLink.aDevice,
        aPort: f.plannedLink.aPort,
        zDevice: f.plannedLink.zDevice,
        zPort: f.plannedLink.zPort,
        plannedLinkId: f.plannedLink.id,
      })),
    );
  }

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title={project.name}
        description={`${project.site}${project.customerName ? ` · ${project.customerName}` : ""}`}
        actions={
          <>
            <Badge tone={project.commercialStatus === CommercialStatus.NONE ? "warning" : "success"}>
              {project.isDemo ? "Demo" : project.commercialStatus}
            </Badge>
            <Button href={`/app/projects/${projectId}/handover`} variant="secondary" size="sm">
              Handover
            </Button>
          </>
        }
      />

      {!project.activeRevisionId ? (
        <EmptyState
          icon={<Cable className="h-5 w-5" aria-hidden />}
          title="No active plan"
          description="Import and publish a cable plan to get started."
          action={
            access.canPublishPlan ? (
              <Button href={`/app/projects/${projectId}/plan`} size="sm">
                Import cable plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {playbooks.length > 0 && (
            <SwapFixPlaybookList projectId={projectId} playbooks={playbooks} />
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total links"
              value={counts.cables}
              href={`/app/projects/${projectId}/cables`}
              icon={<Cable className="h-5 w-5" aria-hidden />}
              tone="info"
            />
            <StatCard
              label="Installed"
              value={counts.installed}
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Verified"
              value={counts.verified}
              icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
              tone="success"
            />
            <StatCard
              label="Exceptions"
              value={counts.openExceptions}
              href={`/app/projects/${projectId}/exceptions`}
              icon={<Link2Off className="h-5 w-5" aria-hidden />}
              tone={counts.openExceptions > 0 ? "danger" : "neutral"}
            />
          </div>

          {(staleCount > 0 || neverImportedCount > 0) && (
            <AlertBanner tone="warning" title="Evidence freshness">
              {staleCount > 0 && (
                <span>
                  {staleCount} device{staleCount === 1 ? "" : "s"} with evidence older than 7 days
                  (or failed parse).{" "}
                </span>
              )}
              {neverImportedCount > 0 && (
                <span>
                  {neverImportedCount} planned device{neverImportedCount === 1 ? "" : "s"} have no
                  import yet.{" "}
                </span>
              )}
              <Link href={`/app/projects/${projectId}/lldp`} className="font-semibold underline">
                Import evidence
              </Link>
            </AlertBanner>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="Installation progress by rack"
              description="Installed links per rack from the active revision."
            >
              {rackProgress.length === 0 ? (
                <p className="text-sm text-[var(--muted-fg)]">No rack data yet.</p>
              ) : (
                <div className="space-y-4">
                  {rackProgress.map((r) => (
                    <ProgressBar
                      key={r.rack}
                      label={r.rack}
                      value={r.installed}
                      max={r.total}
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Exceptions requiring attention"
              description="Open mismatches and items needing review."
              action={<TextLink href={`/app/projects/${projectId}/exceptions`}>View all</TextLink>}
            >
              {attention.length === 0 ? (
                <AlertBanner tone="success" title="No open exceptions">
                  Verification looks clear for active mismatches and review items.
                </AlertBanner>
              ) : (
                <ul className="space-y-3">
                  {attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/app/projects/${projectId}/cables/${item.linkId}`}
                        className="rp-focus flex gap-3 rounded-[var(--radius)] border border-[var(--border)] border-l-4 border-l-[var(--warning)] bg-white p-3 transition hover:bg-[var(--accent-soft)]"
                      >
                        <AlertTriangle
                          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="rp-mono font-semibold text-[var(--foreground)]">{item.cableId}</p>
                          <p className="mt-0.5 truncate text-sm text-[var(--muted-fg)]">
                            {item.expected}
                          </p>
                          {item.observed && (
                            <p className="mt-0.5 truncate text-sm text-[var(--danger)]">
                              Observed: {item.observed}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
