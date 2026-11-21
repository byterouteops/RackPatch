import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  buildWebhookEnvelope,
  buildWebhookHeaders,
  generateWebhookSecret,
  normalizeWebhookEvents,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/webhooks";

describe("webhook signing", () => {
  const secret = "whsec_test_secret";
  const body = '{"hello":"world"}';

  it("signs `${timestamp}.${body}` with HMAC-SHA256", () => {
    const expected = createHmac("sha256", secret).update(`1700000000.${body}`).digest("hex");
    expect(signWebhookPayload(secret, "1700000000", body)).toBe(`sha256=${expected}`);
  });

  it("is deterministic and sensitive to secret, timestamp and body", () => {
    const sig = signWebhookPayload(secret, "1", body);
    expect(signWebhookPayload(secret, "1", body)).toBe(sig);
    expect(signWebhookPayload("other", "1", body)).not.toBe(sig);
    expect(signWebhookPayload(secret, "2", body)).not.toBe(sig);
    expect(signWebhookPayload(secret, "1", body + " ")).not.toBe(sig);
  });

  it("verifies good signatures and rejects tampering", () => {
    const sig = signWebhookPayload(secret, "1700000000", body);
    expect(verifyWebhookSignature(secret, "1700000000", body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, "1700000001", body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, "1700000000", '{"hello":"x"}', sig)).toBe(false);
    expect(verifyWebhookSignature("wrong", "1700000000", body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, "1700000000", body, "sha256=abc")).toBe(false);
    expect(verifyWebhookSignature(secret, "1700000000", body, "")).toBe(false);
  });

  it("builds headers that verify against the body", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    const headers = buildWebhookHeaders({
      secret,
      event: "install.update",
      deliveryId: "d-1",
      body,
      now,
    });
    expect(headers[TIMESTAMP_HEADER]).toBe(String(Math.floor(now.getTime() / 1000)));
    expect(headers[EVENT_HEADER]).toBe("install.update");
    expect(headers[DELIVERY_HEADER]).toBe("d-1");
    expect(
      verifyWebhookSignature(secret, headers[TIMESTAMP_HEADER], body, headers[SIGNATURE_HEADER]),
    ).toBe(true);
  });

  it("generates unique prefixed secrets", () => {
    const a = generateWebhookSecret();
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a.length).toBeGreaterThan(20);
    expect(generateWebhookSecret()).not.toBe(a);
  });

  it("builds envelopes", () => {
    const env = buildWebhookEnvelope({
      id: "x",
      event: "handover.create",
      projectId: "p1",
      data: { a: 1 },
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(env).toEqual({
      id: "x",
      event: "handover.create",
      projectId: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      data: { a: 1 },
    });
  });

  it("validates event selection", () => {
    expect(normalizeWebhookEvents(["evidence.import", "evidence.import", " install.update "])).toEqual([
      "evidence.import",
      "install.update",
    ]);
    expect(() => normalizeWebhookEvents([])).toThrow();
    expect(() => normalizeWebhookEvents(["nope"])).toThrow(/Unknown event/);
  });
});
