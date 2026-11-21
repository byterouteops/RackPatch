"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import { parseNotifyEmails } from "@/lib/compliance";
import { runComplianceCheck } from "@/lib/compliance-run";

const policySchema = z.object({
  projectId: z.string(),
  enabled: z.boolean(),
  maxEvidenceAgeDays: z.coerce.number().int().min(1).max(365),
  notifyEmails: z.string().max(2000).default(""),
  recomputeFindings: z.boolean().default(false),
});

export async function saveCompliancePolicy(raw: z.input<typeof policySchema>) {
  const user = await requireSessionUser();
  const data = policySchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const { emails, invalid } = parseNotifyEmails(data.notifyEmails);
  if (invalid.length > 0) {
    throw new Error(`Invalid email address: ${invalid[0]}`);
  }

  const policy = await prisma.compliancePolicy.upsert({
    where: { projectId: data.projectId },
    create: {
      projectId: data.projectId,
      enabled: data.enabled,
      maxEvidenceAgeDays: data.maxEvidenceAgeDays,
      notifyEmails: emails,
      recomputeFindings: data.recomputeFindings,
    },
    update: {
      enabled: data.enabled,
      maxEvidenceAgeDays: data.maxEvidenceAgeDays,
      notifyEmails: emails,
      recomputeFindings: data.recomputeFindings,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "compliance.policy.save",
    summary: `Compliance policy ${policy.enabled ? "enabled" : "disabled"} (max age ${policy.maxEvidenceAgeDays}d)`,
  });

  revalidatePath(`/app/projects/${data.projectId}/compliance`);
  return { id: policy.id };
}

export async function runComplianceNow(projectId: string) {
  const user = await requireSessionUser();
  await requireProjectAccess(user, projectId, "canManageProject");
  await assertPaidOrThrow(projectId);

  const result = await runComplianceCheck(projectId, "manual");
  if (!result) throw new Error("Save a compliance policy first");

  revalidatePath(`/app/projects/${projectId}/compliance`);
  return result;
}
