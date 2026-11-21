"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExceptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import { recomputeFindings } from "@/lib/verify/recompute";

const physicalSchema = z.object({
  projectId: z.string(),
  linkId: z.string(),
  note: z.string().max(500).optional(),
  aConfirmed: z.boolean(),
  zConfirmed: z.boolean(),
});

export async function recordPhysicalVerification(raw: z.infer<typeof physicalSchema>) {
  const user = await requireSessionUser();
  const data = physicalSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canPhysicalVerify");
  await assertPaidOrThrow(data.projectId);

  const rejected = !data.aConfirmed || !data.zConfirmed;
  if (rejected && (data.note ?? "").trim().length < 5) {
    return {
      ok: false as const,
      error: "A rejection needs a note (at least 5 characters) explaining what is wrong.",
    };
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: data.projectId },
  });
  if (!project.activeRevisionId) throw new Error("No active plan revision");

  const link = await prisma.plannedLink.findFirst({
    where: {
      id: data.linkId,
      revisionId: project.activeRevisionId,
    },
    include: { runtime: true },
  });
  if (!link) throw new Error("Cable not found on active revision");

  if (!link.runtime?.installerId) {
    return {
      ok: false as const,
      error:
        "No installer recorded for this link. A lead must record the installer before independent verification.",
    };
  }
  if (link.runtime.installerId === user.id) {
    return {
      ok: false as const,
      error:
        "Independent physical verification requires a different person from the recorded installer.",
    };
  }

  await prisma.physicalVerification.create({
    data: {
      plannedLinkId: link.id,
      revisionId: project.activeRevisionId,
      verifierId: user.id,
      note: data.note,
      aConfirmed: data.aConfirmed,
      zConfirmed: data.zConfirmed,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: rejected ? "verify.physical_reject" : "verify.physical",
    summary: rejected
      ? `QC rejected ${link.cableId}: ${data.note?.trim()}`
      : `Physically verified ${link.cableId}`,
  });

  await recomputeFindings(data.projectId);
  revalidatePath(`/app/projects/${data.projectId}/cables/${link.id}`);
  return { ok: true as const };
}

const ackSchema = z.object({
  projectId: z.string(),
  findingId: z.string(),
  note: z.string().min(1).max(500),
});

export async function acknowledgeException(raw: z.infer<typeof ackSchema>) {
  const user = await requireSessionUser();
  const data = ackSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canResolveExceptions");
  await assertPaidOrThrow(data.projectId);

  const finding = await prisma.verificationFinding.findFirst({
    where: { id: data.findingId, revision: { projectId: data.projectId } },
  });
  if (!finding) throw new Error("Finding not found");

  await prisma.verificationFinding.update({
    where: { id: finding.id },
    data: {
      exceptionStatus: ExceptionStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
      acknowledgedById: user.id,
      acknowledgeNote: data.note,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "exception.acknowledge",
    summary: `Acknowledged exception on finding ${finding.id} (discrepancy remains visible)`,
  });

  revalidatePath(`/app/projects/${data.projectId}/exceptions`);
}

const assignSchema = z.object({
  projectId: z.string(),
  findingId: z.string(),
  assigneeId: z.string().nullable(),
  dueAt: z.string().nullable(),
});

/** Lead sets an owner and target date on an exception. */
export async function assignException(raw: z.infer<typeof assignSchema>) {
  const user = await requireSessionUser();
  const data = assignSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canResolveExceptions");
  await assertPaidOrThrow(data.projectId);

  const finding = await prisma.verificationFinding.findFirst({
    where: { id: data.findingId, revision: { projectId: data.projectId } },
    include: { plannedLink: { select: { cableId: true } } },
  });
  if (!finding) return { ok: false as const, error: "Finding not found" };
  if (data.assigneeId) {
    const member = await prisma.projectMembership.findFirst({
      where: { projectId: data.projectId, userId: data.assigneeId, role: { not: "VIEWER" } },
    });
    const owner = member
      ? null
      : await prisma.workspaceMembership.findFirst({
          where: { userId: data.assigneeId, workspace: { projects: { some: { id: data.projectId } } } },
        });
    if (!member && !owner) return { ok: false as const, error: "Assignee must be a project member who can act on cables." };
  }
  const due = data.dueAt ? new Date(data.dueAt) : null;
  if (due && Number.isNaN(due.getTime())) return { ok: false as const, error: "Invalid due date" };

  await prisma.verificationFinding.update({
    where: { id: finding.id },
    data: { assigneeId: data.assigneeId, dueAt: due },
  });
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "exception.assign",
    summary: `Assigned exception on ${finding.plannedLink.cableId}${due ? ` (due ${due.toISOString().slice(0, 10)})` : ""}`,
    metadata: { findingId: finding.id, assigneeId: data.assigneeId },
  });
  revalidatePath(`/app/projects/${data.projectId}/exceptions`);
  return { ok: true as const };
}

const waiverSchema = z.object({
  projectId: z.string(),
  findingId: z.string(),
  reason: z.string().trim().min(10).max(500).nullable(),
});

/**
 * Authorized waiver for handover: only a lead/owner, only with a reason. The discrepancy stays
 * visible; the waiver only lets the OWNER handover stage proceed. Pass reason=null to revoke.
 */
export async function waiveException(raw: z.infer<typeof waiverSchema>) {
  const user = await requireSessionUser();
  const data = waiverSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canResolveExceptions");
  await assertPaidOrThrow(data.projectId);

  const finding = await prisma.verificationFinding.findFirst({
    where: { id: data.findingId, revision: { projectId: data.projectId } },
    include: { plannedLink: { select: { cableId: true } } },
  });
  if (!finding) return { ok: false as const, error: "Finding not found" };

  await prisma.verificationFinding.update({
    where: { id: finding.id },
    data: data.reason
      ? { waivedAt: new Date(), waivedById: user.id, waiverReason: data.reason }
      : { waivedAt: null, waivedById: null, waiverReason: null },
  });
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: data.reason ? "exception.waive" : "exception.unwaive",
    summary: data.reason
      ? `Waived ${finding.plannedLink.cableId} for handover: ${data.reason}`
      : `Revoked waiver on ${finding.plannedLink.cableId}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/exceptions`);
  revalidatePath(`/app/projects/${data.projectId}/handover`);
  return { ok: true as const };
}
