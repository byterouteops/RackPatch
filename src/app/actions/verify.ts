"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExceptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
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

  if (!data.aConfirmed || !data.zConfirmed) {
    throw new Error("Both physical endpoints must be confirmed");
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
      aConfirmed: true,
      zConfirmed: true,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "verify.physical",
    summary: `Physically verified ${link.cableId}`,
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
