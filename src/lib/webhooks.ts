import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const WEBHOOK_EVENTS = ["evidence.import", "install.update", "handover.create"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const SIGNATURE_HEADER = "X-RackPatch-Signature";
export const TIMESTAMP_HEADER = "X-RackPatch-Timestamp";
export const EVENT_HEADER = "X-RackPatch-Event";
export const DELIVERY_HEADER = "X-RackPatch-Delivery";

const SECRET_PREFIX = "whsec_";

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(24).toString("base64url")}`;
}

/**
 * Signature = "sha256=" + hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
 * Binding the timestamp lets receivers reject replays.
 */
export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `sha256=${mac}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhookPayload(secret, timestamp, body), "utf8");
  const given = Buffer.from(signature.trim(), "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export type WebhookEnvelope = {
  id: string;
  event: WebhookEvent;
  projectId: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export function buildWebhookEnvelope(input: {
  id: string;
  event: WebhookEvent;
  projectId: string;
  data: Record<string, unknown>;
  now?: Date;
}): WebhookEnvelope {
  return {
    id: input.id,
    event: input.event,
    projectId: input.projectId,
    createdAt: (input.now ?? new Date()).toISOString(),
    data: input.data,
  };
}

export function buildWebhookHeaders(input: {
  secret: string;
  event: WebhookEvent;
  deliveryId: string;
  body: string;
  now?: Date;
}): Record<string, string> {
  const timestamp = String(Math.floor((input.now ?? new Date()).getTime() / 1000));
  return {
    "Content-Type": "application/json",
    [SIGNATURE_HEADER]: signWebhookPayload(input.secret, timestamp, input.body),
    [TIMESTAMP_HEADER]: timestamp,
    [EVENT_HEADER]: input.event,
    [DELIVERY_HEADER]: input.deliveryId,
  };
}

/** Parse + validate an events selection; throws on unknown event names. */
export function normalizeWebhookEvents(events: string[]): WebhookEvent[] {
  const unique = Array.from(new Set(events.map((e) => e.trim()).filter(Boolean)));
  if (unique.length === 0) throw new Error("Select at least one event");
  for (const e of unique) {
    if (!isWebhookEvent(e)) throw new Error(`Unknown event: ${e}`);
  }
  return unique as WebhookEvent[];
}

/** Consecutive failures before an endpoint is auto-disabled (no retry storm). */
export const MAX_CONSECUTIVE_FAILURES = 10;
