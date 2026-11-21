"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/secrets";
import { assertOutboundUrl } from "@/lib/net/ssrf";
import { generateWebhookSecret, normalizeWebhookEvents } from "@/lib/webhooks";

const MAX_ENDPOINTS_PER_PROJECT = 10;

const createSchema = z.object({
  projectId: z.string(),
  url: z.string().min(1).max(2048),
  events: z.array(z.string()).min(1).max(10),
});

/** Add a webhook endpoint. The signing secret is returned once; only ciphertext is stored. */
export async function createWebhookEndpoint(raw: z.infer<typeof createSchema>) {
  const user = await requireSessionUser();
  const data = createSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const url = assertOutboundUrl(data.url);
  const events = normalizeWebhookEvents(data.events);

  const active = await prisma.webhookEndpoint.count({
    where: { projectId: data.projectId, revokedAt: null },
  });
  if (active >= MAX_ENDPOINTS_PER_PROJECT) {
    throw new Error(`At most ${MAX_ENDPOINTS_PER_PROJECT} active webhook endpoints per project`);
  }

  const secret = generateWebhookSecret();
  const row = await prisma.webhookEndpoint.create({
    data: {
      projectId: data.projectId,
      url: url.toString(),
      secretCiphertext: encryptSecret(secret),
      events,
      createdById: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "webhook.create",
    summary: `Added webhook endpoint ${url.host} (${events.join(", ")})`,
  });

  revalidatePath(`/app/projects/${data.projectId}/integrations`);
  return { id: row.id, secret };
}

const revokeSchema = z.object({ projectId: z.string(), endpointId: z.string() });

export async function revokeWebhookEndpoint(raw: z.infer<typeof revokeSchema>) {
  const user = await requireSessionUser();
  const data = revokeSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const row = await prisma.webhookEndpoint.findFirst({
    where: { id: data.endpointId, projectId: data.projectId, revokedAt: null },
  });
  if (!row) throw new Error("Endpoint not found");

  await prisma.webhookEndpoint.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), enabled: false },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "webhook.revoke",
    summary: `Revoked webhook endpoint ${new URL(row.url).host}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/integrations`);
  return { ok: true as const };
}
