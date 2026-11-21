import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { productEvent: { create: (...args: unknown[]) => create(...args) } },
}));

import {
  buildProductEventData,
  sanitizeEventName,
  sanitizeProps,
  trackEvent,
} from "@/lib/analytics";

describe("sanitizeEventName", () => {
  it("accepts dotted lowercase names", () => {
    expect(sanitizeEventName("evidence.import")).toBe("evidence.import");
    expect(sanitizeEventName(" offline.sync ")).toBe("offline.sync");
  });

  it("rejects invalid names", () => {
    expect(sanitizeEventName("")).toBeNull();
    expect(sanitizeEventName("NoDots")).toBeNull();
    expect(sanitizeEventName("Has.Upper")).toBeNull();
    expect(sanitizeEventName("user@example.com")).toBeNull();
    expect(sanitizeEventName(`a.${"b".repeat(80)}`)).toBeNull();
    expect(sanitizeEventName(42)).toBeNull();
  });
});

describe("sanitizeProps", () => {
  it("keeps counts, flags and id-like strings", () => {
    expect(sanitizeProps({ links: 12, dryRun: false, revisionId: "clx123_ab-9" })).toEqual({
      links: 12,
      dryRun: false,
      revisionId: "clx123_ab-9",
    });
  });

  it("drops PII-looking keys and free-text/email/url values", () => {
    const out = sanitizeProps({
      count: 3,
      email: "a@b.com",
      userName: "Alice",
      note: "hello",
      label: "john@example.com",
      other: "has spaces",
      link: "https://x.test/a",
      nested: { a: 1 },
      list: [1, 2],
      nan: Number.NaN,
    });
    expect(out).toEqual({ count: 3 });
  });

  it("returns null for empty/non-object input and caps key count", () => {
    expect(sanitizeProps(undefined)).toBeNull();
    expect(sanitizeProps([1])).toBeNull();
    expect(sanitizeProps({ email: "a@b.com" })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`c${i}`, i]));
    expect(Object.keys(sanitizeProps(many) ?? {})).toHaveLength(10);
  });
});

describe("buildProductEventData", () => {
  it("builds a row with sanitized props", () => {
    expect(
      buildProductEventData({
        name: "handover.create",
        projectId: "p1",
        actorId: "u1",
        props: { links: 4, email: "x@y.z" },
      }),
    ).toEqual({
      name: "handover.create",
      projectId: "p1",
      workspaceId: null,
      actorId: "u1",
      propsJson: JSON.stringify({ links: 4 }),
    });
  });

  it("returns null for invalid names", () => {
    expect(buildProductEventData({ name: "bad" })).toBeNull();
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("writes a sanitized row and resolves true", async () => {
    create.mockResolvedValue({});
    const ok = await trackEvent({
      name: "project.create",
      projectId: "p1",
      workspaceId: "w1",
      actorId: "u1",
      props: { name: "Secret Project" },
    });
    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        name: "project.create",
        projectId: "p1",
        workspaceId: "w1",
        actorId: "u1",
        propsJson: null,
      },
    });
  });

  it("does not write for invalid names", async () => {
    expect(await trackEvent({ name: "nope" })).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("never throws when the DB write fails", async () => {
    create.mockImplementation(async () => {
      throw new Error("db down");
    });
    await expect(trackEvent({ name: "offline.sync", projectId: "p1" })).resolves.toBe(false);
  });
});
