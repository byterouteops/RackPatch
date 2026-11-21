import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";
import { CableAssetForm } from "@/components/cable-asset-form";
import { FieldPhotoCapture } from "@/components/field-photo-capture";
import { InstallControls } from "@/components/install-controls";
import { ProjectPageHeader } from "@/components/project-page-header";
import { SwapFixPlaybookList } from "@/components/swap-fix-playbook";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { AlertBanner, Badge, Button, Card, DetailItem, EmptyState } from "@/components/ui";
import { cableTypeLabel } from "@/lib/cable-type";
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

  const photos = await prisma.fieldPhoto.findMany({
    where: { plannedLinkId: link.id },
    orderBy: { capturedAt: "desc" },
    take: 20,
    select: {
      id: true,
      note: true,
      source: true,
      capturedAt: true,
      mimeType: true,
      byteSize: true,
    },
  });

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
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        section="Cables"
        title={link.cableId}
        description={`${link.aDevice} / ${link.aPort}  →  ${link.zDevice} / ${link.zPort}`}
        actions={
          <Button href={`/app/projects/${projectId}/cables`} variant="secondary" size="sm">
            ← All cables
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <InstallStatusBadge
          status={link.runtime?.installStatus ?? "PLANNED"}
          className="px-3 py-1 text-xs"
        />
        <VerificationBadge state={finding?.state ?? "AWAITING"} className="px-3 py-1 text-xs" />
        {link.cableType && (
          <Badge tone="info" className="px-3 py-1 text-xs">
            {cableTypeLabel(link.cableType)}
          </Badge>
        )}
        {link.runtime?.retiredAt && (
          <Badge tone="danger" className="px-3 py-1 text-xs">
            Retired
          </Badge>
        )}
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

      <Card
        title="Field actions"
        description="Jump to the action you need on site."
        className="mb-5"
      >
        <div className="flex flex-wrap gap-2">
          <Button href={`/app/projects/${projectId}/cables/${linkId}?action=install`} size="sm">
            Mark installed
          </Button>
          <Button
            href={`/app/projects/${projectId}/cables/${linkId}?action=verify`}
            variant="secondary"
            size="sm"
          >
            Physical verify
          </Button>
          {mismatch && (
            <Button
              href={`/app/projects/${projectId}/cables/${linkId}?action=fix`}
              variant="secondary"
              size="sm"
            >
              Open fix playbook
            </Button>
          )}
          <Button href={`/app/projects/${projectId}/lldp`} variant="ghost" size="sm">
            Re-import evidence
          </Button>
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
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Expected">{finding.expectedSummary}</DetailItem>
            {finding.observedSummary && (
              <DetailItem label="Observed">{finding.observedSummary}</DetailItem>
            )}
          </dl>
          {finding.nextAction && (
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted-fg)]">
              {finding.nextAction}
            </p>
          )}
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

      <Card title="Asset / lifecycle" className="mt-5" description="Serial and length only — not a spare stock ledger.">
        <CableAssetForm
          projectId={projectId}
          linkId={link.id}
          version={link.runtime?.version ?? 1}
          assetSerial={link.runtime?.assetSerial ?? null}
          lengthMeters={link.runtime?.lengthMeters ?? null}
          retiredAt={link.runtime?.retiredAt ?? null}
          retireNote={link.runtime?.retireNote ?? null}
          canEdit={access.canUpdateInstall}
        />
      </Card>

      <Card title="Photo evidence" className="mt-5" description="Field photos for this cable (online or offline sync).">
        <FieldPhotoCapture
          projectId={projectId}
          linkId={link.id}
          canUpload={access.canUpdateInstall}
        />
        {photos.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/field-photos/${p.id}`}
                  alt={p.note || "Field photo"}
                  className="aspect-video w-full rounded-[calc(var(--radius)-2px)] bg-[var(--muted)] object-cover"
                />
                <p className="mt-2 text-xs text-[var(--muted-fg)]">
                  {p.capturedAt.toLocaleString()} · {p.source}
                  {p.note ? ` — ${p.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {photos.length === 0 && (
          <p className="mt-4 text-sm text-[var(--muted-fg)]">No photos attached to this cable yet.</p>
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
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)]/60 px-5 py-3">
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
          <p className="rp-panel-title">
            {side}-end
          </p>
          <p className="text-sm text-[var(--muted-fg)]">Rack {rack}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <p className="rp-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{device}</p>
        <p
          className={cn(
            "rp-mono mt-2 text-xl font-semibold sm:text-2xl",
            isA ? "text-[var(--accent-ink)]" : "text-[var(--z-end)]",
          )}
        >
          {port}
        </p>
      </div>
    </div>
  );
}
