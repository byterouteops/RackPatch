"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InstallStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";

const updateSchema = z.object({
  projectId: z.string(),
  linkId: z.string(),
  status: z.nativeEnum(InstallStatus),
  blockedReason: z.string().max(500).optional(),
  expectedVersion: z.number().int().positive(),
});

export async function updateInstallStatus(raw: z.infer<typeof updateSchema>) {
  const user = await requireSessionUser();
  const data = updateSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canUpdateInstall");
  await assertPaidOrThrow(data.projectId);

  if (data.status === InstallStatus.BLOCKED && !data.blockedReason?.trim()) {
    throw new Error("A short reason is required when setting Blocked");
  }

  const link = await prisma.plannedLink.findFirst({
    where: { id: data.linkId, revision: { projectId: data.projectId } },
    include: { runtime: true },
  });
  if (!link?.runtime) throw new Error("Cable not found");

  if (link.runtime.version !== data.expectedVersion) {
    return {
      conflict: true as const,
      current: link.runtime,
      message: "This cable was updated elsewhere. Reload and try again.",
    };
  }

  const updated = await prisma.linkRuntime.update({
    where: { id: link.runtime.id },
    data: {
      installStatus: data.status,
      blockedReason:
        data.status === InstallStatus.BLOCKED ? data.blockedReason!.trim() : null,
      installerId:
        data.status === InstallStatus.INSTALLED
          ? user.id
          : link.runtime.installerId,
      installedAt:
        data.status === InstallStatus.INSTALLED
          ? new Date()
          : link.runtime.installedAt,
      statusChangedAt: new Date(),
      statusChangedBy: user.id,
      version: { increment: 1 },
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "install.update",
    summary: `${link.cableId} → ${data.status}${
      data.status === InstallStatus.BLOCKED ? ` (${data.blockedReason})` : ""
    }`,
  });

  revalidatePath(`/app/projects/${data.projectId}/cables`);
  revalidatePath(`/app/projects/${data.projectId}/cables/${link.id}`);
  return { conflict: false as const, current: updated };
}

export async function setInstaller(raw: {
  projectId: string;
  linkId: string;
  installerId: string;
}) {
  const user = await requireSessionUser();
  const access = await requireProjectAccess(user, raw.projectId, "canResolveExceptions");
  await assertPaidOrThrow(raw.projectId);
  if (!access.isLead) throw new Error("Permission denied");

  const link = await prisma.plannedLink.findFirst({
    where: { id: raw.linkId, revision: { projectId: raw.projectId } },
    include: { runtime: true },
  });
  if (!link?.runtime) throw new Error("Cable not found");

  await prisma.linkRuntime.update({
    where: { id: link.runtime.id },
    data: { installerId: raw.installerId },
  });

  await recordAudit({
    projectId: raw.projectId,
    actorId: user.id,
    action: "install.set_installer",
    summary: `Recorded installer for ${link.cableId}`,
  });

  revalidatePath(`/app/projects/${raw.projectId}/cables/${link.id}`);
}
