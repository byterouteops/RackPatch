"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { toCsv } from "@/lib/csv/safe-export";
import { recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { enqueueOutboundWebhook } from "@/lib/webhook-dispatch";
import { trackEvent } from "@/lib/analytics";
import { HANDOVER_STAGES, STAGE_META, approvalBlocker } from "@/lib/handover/approval";
import { countBlockingExceptions } from "@/lib/handover/blocking";

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

  enqueueOutboundWebhook(data.projectId, "handover.create", {
    snapshotId: snapshot.id,
    revisionNumber: payload.revision.number,
    links: payload.counts.links,
    unresolvedExceptions: payload.counts.unresolvedExceptions,
  });

  await trackEvent({
    name: "handover.create",
    projectId: data.projectId,
    actorId: user.id,
    props: {
      links: payload.counts.links,
      unresolvedExceptions: payload.counts.unresolvedExceptions,
    },
  });

  revalidatePath(`/app/projects/${data.projectId}/handover`);
  return snapshot;
}

const approveSchema = z.object({
  projectId: z.string(),
  snapshotId: z.string(),
  stage: z.enum(HANDOVER_STAGES),
  note: z.string().trim().max(500).optional(),
});

/** Sign one staged handover approval. Order, independence and the owner exception gate are enforced here. */
export async function approveHandoverStage(raw: z.infer<typeof approveSchema>) {
  const user = await requireSessionUser();
  const data = approveSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId);

  const snap = await prisma.handoverSnapshot.findFirst({
    where: { id: data.snapshotId, projectId: data.projectId },
    include: { approvals: { select: { stage: true, approverId: true } } },
  });
  if (!snap) return { ok: false as const, error: "Snapshot not found" };
  const revisionId = access.project.activeRevisionId ?? snap.revisionId;
  const blocker = approvalBlocker(
    data.stage,
    { userId: user.id, projectRole: access.projectRole, contractor: access.isContractor, workspaceOwner: access.isOwner },
    { approvals: snap.approvals, blockingExceptions: data.stage === "OWNER" ? await countBlockingExceptions(revisionId) : 0 },
  );
  if (blocker) return { ok: false as const, error: blocker };

  try {
    await prisma.handoverApproval.create({
      data: { projectId: data.projectId, snapshotId: snap.id, stage: data.stage, approverId: user.id, note: data.note || null },
    });
  } catch {
    return { ok: false as const, error: "This stage was signed by someone else just now. Refresh to see it." };
  }
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "handover.approve",
    summary: `Signed ${STAGE_META[data.stage].label} on ${snap.title}`,
    metadata: { snapshotId: snap.id, stage: data.stage },
  });
  revalidatePath(`/app/projects/${data.projectId}/handover`);
  return { ok: true as const };
}

const shareSchema = z.object({
  projectId: z.string(),
  snapshotId: z.string(),
  /** Days until the share link expires (default 14). */
  daysValid: z.number().int().min(1).max(90).optional(),
});

/**
 * Create or refresh a time-boxed public customer link for a handover snapshot.
 */
export async function createHandoverShareLink(raw: z.infer<typeof shareSchema>) {
  const user = await requireSessionUser();
  const data = shareSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canExport");
  await assertPaidOrThrow(data.projectId);

  const snap = await prisma.handoverSnapshot.findFirst({
    where: { id: data.snapshotId, projectId: data.projectId },
  });
  if (!snap) throw new Error("Snapshot not found");

  const days = data.daysValid ?? 14;
  const shareToken = snap.shareToken ?? nanoid(24);
  const shareExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await prisma.handoverSnapshot.update({
    where: { id: snap.id },
    data: { shareToken, shareExpiresAt },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "handover.share_link",
    summary: `Created customer handover share link (expires ${shareExpiresAt.toISOString()})`,
    metadata: { snapshotId: snap.id, days },
  });

  revalidatePath(`/app/projects/${data.projectId}/handover`);
  const url = `${getAppUrl()}/share/handover/${shareToken}`;
  return { url, shareExpiresAt: shareExpiresAt.toISOString() };
}
