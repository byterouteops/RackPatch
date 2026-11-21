import { describe, expect, it } from "vitest";
import { computeCapacitySummary } from "@/lib/capacity";

describe("computeCapacitySummary", () => {
  it("aggregates racks, devices, and types", () => {
    const summary = computeCapacitySummary([
      {
        aRack: "R1",
        zRack: "R2",
        aDevice: "sw1",
        zDevice: "srv1",
        aPort: "Eth1",
        zPort: "NIC1",
        cableType: "cat6",
        installStatus: "INSTALLED",
        retiredAt: null,
      },
      {
        aRack: "R1",
        zRack: "R1",
        aDevice: "sw1",
        zDevice: "sw2",
        aPort: "Eth2",
        zPort: "Eth1",
        cableType: "DAC",
        installStatus: "PLANNED",
        retiredAt: null,
      },
    ]);

    expect(summary.totalLinks).toBe(2);
    expect(summary.byInstallStatus.INSTALLED).toBe(1);
    expect(summary.byInstallStatus.PLANNED).toBe(1);
    expect(summary.byCableType.find((t) => t.type === "Cat6")?.count).toBe(1);
    expect(summary.byRack.find((r) => r.rack === "R1")?.links).toBe(2);
    expect(summary.byDevice.find((d) => d.device === "sw1")?.portsUsed).toBe(2);
  });

  it("counts retired separately", () => {
    const summary = computeCapacitySummary([
      {
        aRack: "R1",
        zRack: "R2",
        aDevice: "a",
        zDevice: "b",
        aPort: "1",
        zPort: "1",
        cableType: null,
        installStatus: "INSTALLED",
        retiredAt: new Date("2026-01-01"),
      },
    ]);
    expect(summary.retiredLinks).toBe(1);
    expect(summary.activeLinks).toBe(0);
  });
});
