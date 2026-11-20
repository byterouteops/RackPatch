import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseNxosLldpNeighborsDetail } from "@/lib/lldp/nxos-neighbors-detail";
import { matchObservationsToPlan, type PlannedEndpoint } from "@/lib/verify/match";
import { importPlanCsv } from "@/lib/csv/plan-import";
import { normalizeDevice } from "@/lib/csv/normalize";
import { escapeCsvCell, toCsv } from "@/lib/csv/safe-export";

describe("NX-OS LLDP parser", () => {
  it("parses demo Leaf-02 fixture", () => {
    const text = readFileSync(join(__dirname, "../fixtures/demo-lldp-leaf02.txt"), "utf8");
    const parsed = parseNxosLldpNeighborsDetail(text);
    expect(parsed.failed).toBe(false);
    expect(parsed.observations.length).toBeGreaterThanOrEqual(2);
    expect(parsed.observations[0].localInterfaceNorm).toContain("ethernet");
  });

  it("fails visibly on unsupported input", () => {
    const parsed = parseNxosLldpNeighborsDetail("not lldp at all");
    expect(parsed.failed).toBe(true);
    expect(parsed.error).toBeTruthy();
  });
});

describe("endpoint matching", () => {
  const demo = importPlanCsv(
    readFileSync(join(__dirname, "../fixtures/demo-cables.csv"), "utf8"),
  );
  const links: PlannedEndpoint[] = demo.rows.map((r) => ({
    cableId: r.cableId,
    aDeviceNorm: r.aDeviceNorm,
    aPortNorm: r.aPortNorm,
    zDeviceNorm: r.zDeviceNorm,
    zPortNorm: r.zPortNorm,
    aDevice: r.aDevice,
    aPort: r.aPort,
    zDevice: r.zDevice,
    zPort: r.zPort,
  }));

  it("detects swapped pair on Leaf-02 and awaiting for missing LLDP", () => {
    const text = readFileSync(join(__dirname, "../fixtures/demo-lldp-leaf02.txt"), "utf8");
    const parsed = parseNxosLldpNeighborsDetail(text);
    const observations = parsed.observations.map((o) => ({
      localDeviceNorm: normalizeDevice("Leaf-02"),
      localPortNorm: o.localInterfaceNorm,
      remoteDeviceNorm: o.remoteSystemNorm,
      remotePortNorm: o.remotePortNorm,
      localDevice: "Leaf-02",
      localPort: o.localInterface,
      remoteDevice: o.remoteSystemName,
      remotePort: o.remotePortId,
      evidenceSource: "LLDP:Leaf-02",
      captureTime: new Date(),
    }));

    const results = matchObservationsToPlan(links, observations);
    const byId = Object.fromEntries(results.map((r) => [r.cableId, r]));

    expect(byId["C-201"].kind).toBe("wrong_endpoint");
    expect(byId["C-202"].kind).toBe("wrong_endpoint");
    expect(byId["C-201"].relatedCableId).toBe("C-202");
    expect(byId["C-202"].relatedCableId).toBe("C-201");
    expect(byId["C-203"].kind).toBe("no_observation");
  });

  it("treats reversed A/Z as exact match", () => {
    const link = links.find((l) => l.cableId === "C-101")!;
    const results = matchObservationsToPlan(
      [link],
      [
        {
          localDeviceNorm: link.zDeviceNorm,
          localPortNorm: link.zPortNorm,
          remoteDeviceNorm: link.aDeviceNorm,
          remotePortNorm: link.aPortNorm,
          localDevice: link.zDevice,
          localPort: link.zPort,
          remoteDevice: link.aDevice,
          remotePort: link.aPort,
        },
      ],
    );
    expect(results[0].kind).toBe("exact");
  });

  it("flags conflicting observations without picking a winner", () => {
    const link = links.find((l) => l.cableId === "C-101")!;
    const results = matchObservationsToPlan(
      [link],
      [
        {
          localDeviceNorm: link.zDeviceNorm,
          localPortNorm: link.zPortNorm,
          remoteDeviceNorm: "gpu-01",
          remotePortNorm: "nic1",
          localDevice: link.zDevice,
          localPort: link.zPort,
          remoteDevice: "GPU-01",
          remotePort: "NIC1",
        },
        {
          localDeviceNorm: link.zDeviceNorm,
          localPortNorm: link.zPortNorm,
          remoteDeviceNorm: "gpu-99",
          remotePortNorm: "nic1",
          localDevice: link.zDevice,
          localPort: link.zPort,
          remoteDevice: "GPU-99",
          remotePort: "NIC1",
        },
      ],
    );
    expect(results[0].kind).toBe("conflicting");
  });
});

describe("safe CSV export", () => {
  it("neutralizes formula injection", () => {
    expect(escapeCsvCell("=CMD()")).toBe("'=CMD()");
    expect(toCsv([["a", "b"], ["1", "=2+2"]])).toContain("'=2+2");
  });
});
