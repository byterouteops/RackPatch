"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { generateApiTokenSecret } from "@/lib/api-token";
import { recordAudit } from "@/lib/audit";

const createSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(80),
});

/** Create a project-scoped read API token. Plaintext returned once. */
export async function createApiToken(raw: z.infer<typeof createSchema>) {
  const user = await requireSessionUser();
  const data = createSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const secret = generateApiTokenSecret();
  const row = await prisma.apiToken.create({
    data: {
      projectId: data.projectId,
      name: data.name.trim(),
      tokenPrefix: secret.prefix,
      tokenHash: secret.hash,
      createdById: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "api_token.create",
    summary: `Created API token ${row.name} (${row.tokenPrefix}…)`,
  });

  revalidatePath(`/app/projects/${data.projectId}/api`);
  return { id: row.id, token: secret.token, prefix: row.tokenPrefix, name: row.name };
}

const revokeSchema = z.object({
  projectId: z.string(),
  tokenId: z.string(),
});

export async function revokeApiToken(raw: z.infer<typeof revokeSchema>) {
  const user = await requireSessionUser();
  const data = revokeSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const row = await prisma.apiToken.findFirst({
    where: { id: data.tokenId, projectId: data.projectId, revokedAt: null },
  });
  if (!row) throw new Error("Token not found");

  await prisma.apiToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "api_token.revoke",
    summary: `Revoked API token ${row.name}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/api`);
  return { ok: true as const };
}
