import { describe, expect, it } from "vitest";
import {
  createOfflineItem,
  MAX_PHOTO_BYTES,
  validateOfflineSyncPayload,
} from "@/lib/offline/field-queue";

describe("offline field queue", () => {
  it("creates queue items with client ids", () => {
    const item = createOfflineItem({
      projectId: "p1",
      qrRaw: "/app/projects/p1/cables/abc?action=install",
      action: "install",
    });
    expect(item.clientId).toMatch(/^c_/);
    expect(item.projectId).toBe("p1");
    expect(item.photoBase64).toBeNull();
  });

  it("rejects oversized photos", () => {
    const huge = "a".repeat(Math.floor((MAX_PHOTO_BYTES * 4) / 3) + 20);
    expect(() =>
      createOfflineItem({
        projectId: "p1",
        qrRaw: "/app/projects/p1/cables/abc",
        photoBase64: huge,
        photoMimeType: "image/jpeg",
      }),
    ).toThrow(/exceeds/);
  });

  it("validates sync payloads", () => {
    const item = createOfflineItem({
      projectId: "p1",
      qrRaw: "/app/projects/p1/cables/abc",
      clientId: "c_fixed",
    });
    const ok = validateOfflineSyncPayload({ items: [item] }, "p1");
    expect(ok.ok).toBe(true);

    const bad = validateOfflineSyncPayload({ items: [item] }, "other");
    expect(bad.ok).toBe(false);
  });
});
