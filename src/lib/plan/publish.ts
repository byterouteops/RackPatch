import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  diffRevisions,
  shouldCarryForward,
  toSnapshot,
  type LinkSnapshot,
} from "@/lib/csv/diff-revisions";
import type { ParsedPlanRow } from "@/lib/csv/plan-import";
import { InstallStatus, VerificationState } from "@prisma/client";
import { recomputeFindings } from "@/lib/verify/recompute";

export async function publishPlanRevision(input: {
  projectId: string;
  actorId: string;
  rows: ParsedPlanRow[];
  note?: string;
  importKey: string;
  sourceCsv: string;
}) {
  const csvHash = createHash("sha256").update(input.sourceCsv).digest("hex");

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.planRevision.findUnique({
        where: {
          projectId_importKey: {
            projectId: input.projectId,
            importKey: input.importKey,
          },
        },
      });
      if (existing) {
        return { revision: existing, deduplicated: true as const, diff: null };
      }

      const project = await tx.project.findUniqueOrThrow({
        where: { id: input.projectId },
      });

      const last = await tx.planRevision.findFirst({
        where: { projectId: input.projectId },
        orderBy: { revisionNumber: "desc" },
      });
      const revisionNumber = (last?.revisionNumber ?? 0) + 1;

      let previousLinks: LinkSnapshot[] = [];
      const prevRuntimeByCable = new Map<
        string,
        {
          installStatus: InstallStatus;
          blockedReason: string | null;
          installerId: string | null;
          installedAt: Date | null;
          statusChangedAt: Date | null;
          statusChangedBy: string | null;
          linkId: string;
          endpoints: LinkSnapshot;
        }
      >();

      if (project.activeRevisionId) {
        const prevFull = await tx.plannedLink.findMany({
          where: { revisionId: project.activeRevisionId },
          include: { runtime: true },
        });
        previousLinks = prevFull.map((l) => ({
          cableId: l.cableId,
          aRack: l.aRack,
          aDevice: l.aDevice,
          aPort: l.aPort,
          zRack: l.zRack,
          zDevice: l.zDevice,
          zPort: l.zPort,
          aDeviceNorm: l.aDeviceNorm,
          aPortNorm: l.aPortNorm,
          zDeviceNorm: l.zDeviceNorm,
          zPortNorm: l.zPortNorm,
          cableType: l.cableType,
          notes: l.notes,
          endpointKey: l.endpointKey,
        }));
        for (const l of prevFull) {
          if (!l.runtime) continue;
          prevRuntimeByCable.set(l.cableId, {
            installStatus: l.runtime.installStatus,
            blockedReason: l.runtime.blockedReason,
            installerId: l.runtime.installerId,
            installedAt: l.runtime.installedAt,
            statusChangedAt: l.runtime.statusChangedAt,
            statusChangedBy: l.runtime.statusChangedBy,
            linkId: l.id,
            endpoints: previousLinks.find((p) => p.cableId === l.cableId)!,
          });
        }
      }

      const nextSnaps = input.rows.map(toSnapshot);
      const diff = diffRevisions(previousLinks, nextSnaps);

      const revision = await tx.planRevision.create({
        data: {
          projectId: input.projectId,
          revisionNumber,
          publishedById: input.actorId,
          note: input.note,
          importKey: input.importKey,
          sourceCsvHash: csvHash,
        },
      });

      await tx.plannedLink.createMany({
        data: input.rows.map((row) => ({
          revisionId: revision.id,
          cableId: row.cableId,
          aRack: row.aRack,
          aDevice: row.aDevice,
          aPort: row.aPort,
          aDeviceNorm: row.aDeviceNorm,
          aPortNorm: row.aPortNorm,
          zRack: row.zRack,
          zDevice: row.zDevice,
          zPort: row.zPort,
          zDeviceNorm: row.zDeviceNorm,
          zPortNorm: row.zPortNorm,
          cableType: row.cableType,
          notes: row.notes,
          endpointKey: row.endpointKey,
        })),
      });

      const createdLinks = await tx.plannedLink.findMany({
        where: { revisionId: revision.id },
      });

      await tx.linkRuntime.createMany({
        data: createdLinks.map((link) => {
          const row = input.rows.find((r) => r.cableId === link.cableId)!;
          const snap = toSnapshot(row);
          const prev = prevRuntimeByCable.get(link.cableId);
          const carry =
            prev && shouldCarryForward(prev.endpoints, snap) ? prev : null;
          return {
            plannedLinkId: link.id,
            installStatus: carry?.installStatus ?? InstallStatus.PLANNED,
            blockedReason: carry?.blockedReason ?? null,
            installerId: carry?.installerId ?? null,
            installedAt: carry?.installedAt ?? null,
            statusChangedAt: carry?.statusChangedAt ?? null,
            statusChangedBy: carry?.statusChangedBy ?? null,
            carriedFromLinkId: carry?.linkId ?? null,
            version: 1,
          };
        }),
      });

      await tx.verificationFinding.createMany({
        data: createdLinks.map((link) => {
          const row = input.rows.find((r) => r.cableId === link.cableId)!;
          const snap = toSnapshot(row);
          const prev = prevRuntimeByCable.get(link.cableId);
          const carry =
            prev && shouldCarryForward(prev.endpoints, snap) ? prev : null;
          return {
            plannedLinkId: link.id,
            revisionId: revision.id,
            state: VerificationState.AWAITING,
            findingType: "AWAITING" as const,
            severity: "INFO" as const,
            expectedSummary: `${row.aDevice} ${row.aPort} ↔ ${row.zDevice} ${row.zPort}`,
            nextAction: carry
              ? "Re-verify after plan publish (endpoints unchanged — awaiting recompute)"
              : "Await verification for new or modified link",
          };
        }),
      });

      await tx.project.update({
        where: { id: input.projectId },
        data: { activeRevisionId: revision.id },
      });

      return { revision, deduplicated: false as const, diff, revisionNumber };
    },
    { timeout: 60_000 },
  );

  if (!result.deduplicated) {
    await recordAudit({
      projectId: input.projectId,
      actorId: input.actorId,
      action: "plan.publish",
      summary: `Published plan revision ${result.revisionNumber} (${input.rows.length} links)`,
      metadata: {
        revisionId: result.revision.id,
        added: result.diff?.added.length,
        removed: result.diff?.removed.length,
        modified: result.diff?.modified.length,
      },
    });
    await recomputeFindings(input.projectId);
  }

  return result;
}
