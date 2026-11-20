"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { toCsv } from "@/lib/csv/safe-export";
import { recordAudit } from "@/lib/audit";

export async function buildHandoverPayload(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      activeRevision: true,
    },
  });
  if (!project.activeRevisionId) throw new Error("No active revision");

  const links = await prisma.plannedLink.findMany({
    where: { revisionId: project.activeRevisionId },
    include: {
      runtime: { include: { installer: true } },
      findings: { where: { revisionId: project.activeRevisionId } },
      physicalChecks: { orderBy: { verifiedAt: "desc" }, take: 1, include: { verifier: true } },
    },
    orderBy: [{ aRack: "asc" }, { cableId: "asc" }],
  });

  const findings = links.map((l) => l.findings[0]).filter(Boolean);
  const unresolved = findings.filter(
    (f) =>
      (f.state === "MISMATCH" || f.state === "NEEDS_REVIEW") &&
      f.exceptionStatus !== "CLOSED",
  );
  const awaiting = findings.filter((f) => f.state === "AWAITING");

  return {
    project: {
      id: project.id,
      name: project.name,
      customerName: project.customerName,
      site: project.site,
      timeZone: project.timeZone,
    },
    revision: {
      id: project.activeRevision!.id,
      number: project.activeRevision!.revisionNumber,
      publishedAt: project.activeRevision!.publishedAt.toISOString(),
    },
    counts: {
      links: links.length,
      installed: links.filter((l) => l.runtime?.installStatus === "INSTALLED").length,
      blocked: links.filter((l) => l.runtime?.installStatus === "BLOCKED").length,
      verifiedLldp: findings.filter((f) => f.state === "VERIFIED_LLDP").length,
      verifiedPhysical: findings.filter((f) => f.state === "VERIFIED_PHYSICAL").length,
      mismatch: findings.filter((f) => f.state === "MISMATCH").length,
      needsReview: findings.filter((f) => f.state === "NEEDS_REVIEW").length,
      awaiting: awaiting.length,
      unresolvedExceptions: unresolved.length,
    },
    links: links.map((l) => {
      const f = l.findings[0];
      return {
        cableId: l.cableId,
        aRack: l.aRack,
        aDevice: l.aDevice,
        aPort: l.aPort,
        zRack: l.zRack,
        zDevice: l.zDevice,
        zPort: l.zPort,
        cableType: l.cableType,
        installStatus: l.runtime?.installStatus ?? "PLANNED",
        blockedReason: l.runtime?.blockedReason,
        installerEmail: l.runtime?.installer?.email ?? null,
        verificationState: f?.state ?? "AWAITING",
        expected: f?.expectedSummary ?? null,
        observed: f?.observedSummary ?? null,
        evidenceSource: f?.evidenceSource ?? null,
        captureTime: f?.captureTime?.toISOString() ?? null,
        exceptionStatus: f?.exceptionStatus ?? null,
        physicalVerifier: l.physicalChecks[0]?.verifier.email ?? null,
      };
    }),
    unresolvedExceptions: unresolved.map((f) => ({
      expected: f.expectedSummary,
      observed: f.observedSummary,
      state: f.state,
      nextAction: f.nextAction,
      relatedCableId: f.relatedCableId,
      evidenceSource: f.evidenceSource,
      captureTime: f.captureTime?.toISOString() ?? null,
      acknowledgeNote: f.acknowledgeNote,
    })),
    awaitingVerification: awaiting.map((f) => f.expectedSummary),
  };
}

export async function exportProjectCsv(projectId: string) {
  const user = await requireSessionUser();
  await requireProjectAccess(user, projectId, "canExport");
  await assertPaidOrThrow(projectId);

  const payload = await buildHandoverPayload(projectId);
  const header = [
    "cable_id",
    "a_rack",
    "a_device",
    "a_port",
    "z_rack",
    "z_device",
    "z_port",
    "cable_type",
    "install_status",
    "verification_result",
    "expected",
    "observed",
    "evidence_ref",
    "capture_time",
  ];
  const rows = [
    header,
    ...payload.links.map((l) => [
      l.cableId,
      l.aRack,
      l.aDevice,
      l.aPort,
      l.zRack,
      l.zDevice,
      l.zPort,
      l.cableType,
      l.installStatus,
      l.verificationState,
      l.expected,
      l.observed,
      l.evidenceSource,
      l.captureTime,
    ]),
  ];

  await recordAudit({
    projectId,
    actorId: user.id,
    action: "handover.csv_export",
    summary: `Exported CSV for ${payload.links.length} links`,
  });

  return toCsv(rows);
}

const snapshotSchema = z.object({
  projectId: z.string(),
  title: z.string().max(120).optional(),
});

export async function createHandoverSnapshot(raw: z.infer<typeof snapshotSchema>) {
  const user = await requireSessionUser();
  const data = snapshotSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canExport");
  await assertPaidOrThrow(data.projectId);

  const payload = await buildHandoverPayload(data.projectId);
  const snapshot = await prisma.handoverSnapshot.create({
    data: {
      projectId: data.projectId,
      createdById: user.id,
      revisionId: payload.revision.id,
      title: data.title || `Handover r${payload.revision.number}`,
      payloadJson: JSON.stringify(payload),
      hasUnresolvedExceptions: payload.counts.unresolvedExceptions > 0,
      awaitingCount: payload.counts.awaiting,
      mismatchCount: payload.counts.mismatch + payload.counts.needsReview,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "handover.snapshot",
    summary: `Created handover snapshot ${snapshot.id}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/handover`);
  return snapshot;
}
