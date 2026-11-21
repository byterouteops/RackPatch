"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import {
  DEFAULT_LABEL_CONFIG,
  labelConfigSchema,
  serializeLabelConfig,
} from "@/lib/labels/template";

const saveSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(80),
  config: labelConfigSchema,
  makeDefault: z.boolean().default(true),
});

export async function saveLabelTemplate(raw: z.input<typeof saveSchema>) {
  const user = await requireSessionUser();
  const data = saveSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  if (data.makeDefault) {
    await prisma.labelTemplate.updateMany({
      where: { projectId: data.projectId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const tpl = await prisma.labelTemplate.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      configJson: serializeLabelConfig(data.config),
      isDefault: data.makeDefault,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "labels.template.save",
    summary: `Saved label template “${data.name}”`,
    metadata: { templateId: tpl.id },
  });

  revalidatePath(`/app/projects/${data.projectId}/labels`);
  return { id: tpl.id };
}

export async function getDefaultLabelConfig(projectId: string) {
  const user = await requireSessionUser();
  await requireProjectAccess(user, projectId);
  const tpl = await prisma.labelTemplate.findFirst({
    where: { projectId, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!tpl) return DEFAULT_LABEL_CONFIG;
  try {
    return labelConfigSchema.parse(JSON.parse(tpl.configJson));
  } catch {
    return DEFAULT_LABEL_CONFIG;
  }
}
