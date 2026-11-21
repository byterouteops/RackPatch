import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secrets";
import { safeHttpsRequest } from "@/lib/net/safe-fetch";
import {
  MAX_CONSECUTIVE_FAILURES,
  buildWebhookEnvelope,
  buildWebhookHeaders,
  type WebhookEvent,
} from "@/lib/webhooks";

const DELIVERY_TIMEOUT_MS = 5_000;

async function deliverOne(
  endpoint: { id: string; url: string; secretCiphertext: string; consecutiveFailures: number },
  event: WebhookEvent,
  projectId: string,
  data: Record<string, unknown>,
) {
  let status = "error";
  let ok = false;
  try {
    const deliveryId = randomUUID();
    const body = JSON.stringify(
      buildWebhookEnvelope({ id: deliveryId, event, projectId, data }),
    );
    const headers = buildWebhookHeaders({
      secret: decryptSecret(endpoint.secretCiphertext),
      event,
      deliveryId,
      body,
    });
    const res = await safeHttpsRequest({
      url: endpoint.url,
      method: "POST",
      headers,
      body,
      timeoutMs: DELIVERY_TIMEOUT_MS,
      maxBytes: 64 * 1024,
    });
    ok = res.status >= 200 && res.status < 300;
    status = `http_${res.status}`;
  } catch (e) {
    status = `error: ${e instanceof Error ? e.message : "unknown"}`.slice(0, 120);
  }

  const failures = ok ? 0 : endpoint.consecutiveFailures + 1;
  await prisma.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: {
      lastDeliveryAt: new Date(),
      lastStatus: status,
      consecutiveFailures: failures,
      ...(failures >= MAX_CONSECUTIVE_FAILURES ? { enabled: false } : {}),
    },
  });
}

async function dispatch(projectId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { projectId, enabled: true, revokedAt: null, events: { has: event } },
    take: 20,
  });
  // Single attempt per endpoint; no retries.
  await Promise.allSettled(endpoints.map((ep) => deliverOne(ep, event, projectId, data)));
}

/**
 * Fire-and-forget outbound webhook. Never throws and never blocks the caller.
 * Best-effort only: one attempt, 5s timeout, endpoints auto-disable after repeated failures.
 * Payloads carry ids/counts only (no secrets, no raw evidence text).
 */
export function enqueueOutboundWebhook(
  projectId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void dispatch(projectId, event, data).catch(() => {
    /* best-effort */
  });
}
