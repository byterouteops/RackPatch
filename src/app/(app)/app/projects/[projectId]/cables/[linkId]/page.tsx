import Link from "next/link";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { InstallControls } from "@/components/install-controls";
import { ProjectSubnav } from "@/components/project-subnav";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export default async function CableDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; linkId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { projectId, linkId } = await params;
  const { action } = await searchParams;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) return <EmptyState title="Permission denied" />;

  const project = access.project;
  if (!project.activeRevisionId) {
    return <EmptyState title="No active plan" />;
  }

  const link = await prisma.plannedLink.findFirst({
    where: { id: linkId, revisionId: project.activeRevisionId },
    include: {
      runtime: { include: { installer: true } },
      findings: { where: { revisionId: project.activeRevisionId }, take: 1 },
    },
  });

  if (!link) return <EmptyState title="Cable not found" />;

  const finding = link.findings[0];
  const mismatch = finding?.state === "MISMATCH" || finding?.state === "NEEDS_REVIEW";

  // Partner finding for playbook (if related)
  let playbooks: ReturnType<typeof buildSwapFixPlaybooks> = [];
  if (finding?.relatedCableId) {
    const related = await prisma.plannedLink.findFirst({
      where: {
        revisionId: project.activeRevisionId,
        cableId: finding.relatedCableId,
      },
      include: {
        findings: { where: { revisionId: project.activeRevisionId }, take: 1 },
      },
    });
    if (related?.findings[0]) {
      playbooks = buildSwapFixPlaybooks([
        {
          cableId: link.cableId,
          relatedCableId: finding.relatedCableId,
          findingType: finding.findingType,
          state: finding.state,
          expectedSummary: finding.expectedSummary,
          observedSummary: finding.observedSummary,
          aRack: link.aRack,
          zRack: link.zRack,
          aDevice: link.aDevice,
          aPort: link.aPort,
          zDevice: link.zDevice,
          zPort: link.zPort,
          plannedLinkId: link.id,
        },
        {
          cableId: related.cableId,
          relatedCableId: related.findings[0].relatedCableId,
          findingType: related.findings[0].findingType,
          state: related.findings[0].state,
          expectedSummary: related.findings[0].expectedSummary,
          observedSummary: related.findings[0].observedSummary,
          aRack: related.aRack,
          zRack: related.zRack,
          aDevice: related.aDevice,
          aPort: related.aPort,
          zDevice: related.zDevice,
          zPort: related.zPort,
          plannedLinkId: related.id,
        },
      ]);
    }
  }

  const fieldHint =
    action === "install"
      ? "Field QR: mark this cable installed below."
      : action === "verify"
        ? "Field QR: complete physical verification below (must be a different person than the installer)."
        : action === "fix"
          ? "Field QR: follow the swap fix playbook, then re-import evidence."
          : null;

  return (
    <div>
      <PageHeader
        title={link.cableId}
        description={project.name}
        actions={
          <Link
            href={`/app/projects/${projectId}/cables`}
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            ← All cables
          </Link>
        }
      />
      <ProjectSubnav projectId={projectId} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <InstallStatusBadge
          status={link.runtime?.installStatus ?? "PLANNED"}
          className="px-3 py-1 text-sm"
        />
        <VerificationBadge
          state={finding?.state ?? "AWAITING"}
          className="px-3 py-1 text-sm"
        />
      </div>

      {fieldHint && (
        <div className="mb-5">
          <AlertBanner tone="info" title="Phone field action">
            {fieldHint}
          </AlertBanner>
        </div>
      )}

      {mismatch && (
        <div className="mb-5">
          <AlertBanner tone="danger" title="Verification issue">
            Expected {finding?.expectedSummary}. Observed: {finding?.observedSummary ?? "n/a"}.
          </AlertBanner>
        </div>
      )}

      {playbooks.length > 0 && (
        <div className="mb-5">
          <SwapFixPlaybookList projectId={projectId} playbooks={playbooks} />
        </div>
      )}

      <Card title="Field actions" className="mb-5">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={`/app/projects/${projectId}/cables/${linkId}?action=install`}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Mark installed
          </Link>
          <Link
            href={`/app/projects/${projectId}/cables/${linkId}?action=verify`}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Physical verify
          </Link>
          {mismatch && (
            <Link
              href={`/app/projects/${projectId}/cables/${linkId}?action=fix`}
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Open fix playbook
            </Link>
          )}
          <Link
            href={`/app/projects/${projectId}/lldp`}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Re-import evidence
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <EndpointCard side="A" rack={link.aRack} device={link.aDevice} port={link.aPort} />
        <EndpointCard side="Z" rack={link.zRack} device={link.zDevice} port={link.zPort} />
      </div>

      {link.runtime?.blockedReason && (
        <div className="mt-4">
          <AlertBanner tone="warning" title="Blocked">
            {link.runtime.blockedReason}
          </AlertBanner>
        </div>
      )}

      {finding && (finding.observedSummary || finding.evidenceSource) && (
        <Card title="Verification detail" className="mt-5">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                Expected
              </dt>
              <dd className="mt-1 font-medium">{finding.expectedSummary}</dd>
            </div>
            {finding.observedSummary && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
                  Observed
                </dt>
                <dd className="mt-1 font-medium">{finding.observedSummary}</dd>
              </div>
            )}
            {finding.nextAction && (
              <p className="text-[var(--muted-fg)]">{finding.nextAction}</p>
            )}
          </dl>
        </Card>
      )}

      <Card title="Install & verify" className="mt-5">
        <InstallControls
          projectId={projectId}
          linkId={link.id}
          version={link.runtime?.version ?? 1}
          installStatus={link.runtime?.installStatus ?? "PLANNED"}
          blockedReason={link.runtime?.blockedReason ?? null}
          canUpdateInstall={access.canUpdateInstall}
          canPhysicalVerify={access.canPhysicalVerify}
        />
        {link.runtime?.installer && (
          <p className="mt-4 text-xs text-[var(--muted-fg)]">
            Installer: {link.runtime.installer.email}
          </p>
        )}
      </Card>
    </div>
  );
}

function EndpointCard({
  side,
  rack,
  device,
  port,
}: {
  side: "A" | "Z";
  rack: string;
  device: string;
  port: string;
}) {
  const isA = side === "A";
  return (
    <div className="rp-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-slate-50/80 px-5 py-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white",
            isA ? "bg-[var(--accent)]" : "bg-[var(--z-end)]",
          )}
          aria-hidden
        >
          {side}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
            {side}-end
          </p>
          <p className="text-sm text-[var(--muted-fg)]">Rack {rack}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{device}</p>
        <p
          className={cn(
            "mt-2 text-xl font-semibold sm:text-2xl",
            isA ? "text-[var(--accent)]" : "text-[var(--z-end)]",
          )}
        >
          {port}
        </p>
      </div>
    </div>
  );
}
