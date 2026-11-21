"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";

const assetSchema = z.object({
  projectId: z.string(),
  linkId: z.string(),
  assetSerial: z.string().max(120).optional().nullable(),
  lengthMeters: z.coerce.number().positive().max(10000).optional().nullable(),
  expectedVersion: z.number().int().positive(),
});

export async function updateCableAsset(raw: z.infer<typeof assetSchema>) {
  const user = await requireSessionUser();
  const data = assetSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canUpdateInstall");
  await assertPaidOrThrow(data.projectId);

  const link = await prisma.plannedLink.findFirst({
    where: { id: data.linkId, revision: { projectId: data.projectId } },
    include: { runtime: true },
  });
  if (!link?.runtime) throw new Error("Cable not found");
  if (link.runtime.version !== data.expectedVersion) {
    return { conflict: true as const, message: "Cable was updated elsewhere. Reload and try again." };
  }

  const updated = await prisma.linkRuntime.update({
    where: { id: link.runtime.id },
    data: {
      assetSerial: data.assetSerial?.trim() || null,
      lengthMeters: data.lengthMeters ?? null,
      version: { increment: 1 },
      statusChangedAt: new Date(),
      statusChangedBy: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "cable.asset.update",
    summary: `Updated asset fields on ${link.cableId}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/cables/${link.id}`);
  return { conflict: false as const, current: updated };
}

const retireSchema = z.object({
  projectId: z.string(),
  linkId: z.string(),
  retireNote: z.string().max(500).optional().nullable(),
  expectedVersion: z.number().int().positive(),
});

export async function retireCable(raw: z.infer<typeof retireSchema>) {
  const user = await requireSessionUser();
  const data = retireSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canUpdateInstall");
  await assertPaidOrThrow(data.projectId);

  const link = await prisma.plannedLink.findFirst({
    where: { id: data.linkId, revision: { projectId: data.projectId } },
    include: { runtime: true },
  });
  if (!link?.runtime) throw new Error("Cable not found");
  if (link.runtime.version !== data.expectedVersion) {
    return { conflict: true as const, message: "Cable was updated elsewhere. Reload and try again." };
  }
  if (link.runtime.retiredAt) {
    return { conflict: false as const, current: link.runtime };
  }

  const updated = await prisma.linkRuntime.update({
    where: { id: link.runtime.id },
    data: {
      retiredAt: new Date(),
      retireNote: data.retireNote?.trim() || null,
      version: { increment: 1 },
      statusChangedAt: new Date(),
      statusChangedBy: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "cable.retire",
    summary: `Retired ${link.cableId}${data.retireNote ? `: ${data.retireNote}` : ""}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/cables`);
  revalidatePath(`/app/projects/${data.projectId}/cables/${link.id}`);
  return { conflict: false as const, current: updated };
}
