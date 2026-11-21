import { describe, expect, it } from "vitest";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";

describe("computeEvidenceStaleness", () => {
  const now = new Date("2026-11-21T12:00:00Z");

  it("flags imports older than maxAgeDays", () => {
    const report = computeEvidenceStaleness({
      now,
      maxAgeDays: 7,
      imports: [
        {
          sourceDevice: "sw-old",
          sourceDeviceNorm: "sw-old",
          uploadedAt: new Date("2026-11-01T12:00:00Z"),
          captureTime: null,
          parseFailed: false,
        },
        {
          sourceDevice: "sw-new",
          sourceDeviceNorm: "sw-new",
          uploadedAt: new Date("2026-11-20T12:00:00Z"),
          captureTime: null,
          parseFailed: false,
        },
      ],
      plannedDevices: ["sw-old", "sw-new", "sw-missing"],
    });

    expect(report.stale.map((s) => s.sourceDevice)).toEqual(["sw-old"]);
    expect(report.fresh.map((s) => s.sourceDevice)).toEqual(["sw-new"]);
    expect(report.neverImported).toEqual(["sw-missing"]);
  });

  it("treats parse failures as stale", () => {
    const report = computeEvidenceStaleness({
      now,
      maxAgeDays: 30,
      imports: [
        {
          sourceDevice: "sw1",
          sourceDeviceNorm: "sw1",
          uploadedAt: new Date("2026-11-20T12:00:00Z"),
          captureTime: null,
          parseFailed: true,
        },
      ],
    });
    expect(report.stale).toHaveLength(1);
  });
});
