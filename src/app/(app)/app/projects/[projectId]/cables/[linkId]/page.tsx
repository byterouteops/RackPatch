import Link from "next/link";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { InstallControls } from "@/components/install-controls";
import { ProjectSubnav } from "@/components/project-subnav";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export default async function CableDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; linkId: string }>;
}) {
  const { projectId, linkId } = await params;
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

      {mismatch && (
        <div className="mb-5">
          <AlertBanner tone="danger" title="Verification issue">
            Expected {finding?.expectedSummary}. Observed: {finding?.observedSummary ?? "n/a"}.
          </AlertBanner>
        </div>
      )}

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
