"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExceptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { canAcknowledgeFinding } from "@/lib/authz-capabilities";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import { formatQcNote, isQcAcknowledgeable } from "@/lib/qc";

const qcAckSchema = z.object({
  projectId: z.string(),
  findingId: z.string(),
  note: z.string().min(1).max(450),
});

/**
 * QC acknowledge for contractors (and leads via the same queue).
 * Does NOT close the discrepancy: status becomes ACKNOWLEDGED and the finding stays visible
 * until evidence clears it or a lead resolves it.
 */
export async function qcAcknowledgeFinding(raw: z.infer<typeof qcAckSchema>) {
  const user = await requireSessionUser();
  const data = qcAckSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId);
  if (!canAcknowledgeFinding(access)) {
    const err = new Error("Permission denied");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  await assertPaidOrThrow(data.projectId);

  const activeRevisionId = access.project.activeRevisionId;
  if (!activeRevisionId) throw new Error("No active plan revision");

  const finding = await prisma.verificationFinding.findFirst({
    where: {
      id: data.findingId,
      revisionId: activeRevisionId,
      revision: { projectId: data.projectId },
    },
    include: { plannedLink: { select: { cableId: true } } },
  });
  if (!finding) throw new Error("Finding not found");
  if (!isQcAcknowledgeable(finding)) {
    throw new Error("Only open mismatch / needs-review findings can be acknowledged");
  }

  await prisma.verificationFinding.update({
    where: { id: finding.id },
    data: {
      exceptionStatus: ExceptionStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
      acknowledgedById: user.id,
      acknowledgeNote: formatQcNote(data.note, access.isContractor ? "contractor" : undefined),
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "qc.acknowledge",
    summary: `QC acknowledged ${finding.plannedLink.cableId}${access.isContractor ? " (contractor)" : ""}; discrepancy remains visible`,
  });

  revalidatePath(`/app/projects/${data.projectId}/qc`);
  revalidatePath(`/app/projects/${data.projectId}/exceptions`);
}
