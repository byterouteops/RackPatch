import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { importPlanCsv } from "@/lib/csv/plan-import";
import { parseNxosLldpNeighborsDetail } from "@/lib/lldp/nxos-neighbors-detail";
import { matchObservationsToPlan } from "@/lib/verify/match";
import { normalizeDevice } from "@/lib/csv/normalize";

/**
 * End-to-end (library-level) demo: CSV plan + Leaf-02 LLDP → swapped pair.
 */
describe("demo e2e swap story", () => {
  it("identifies both swapped cables with expected and observed ports", () => {
    const csv = readFileSync(join(__dirname, "../fixtures/demo-cables.csv"), "utf8");
    const lldp = readFileSync(join(__dirname, "../fixtures/demo-lldp-leaf02.txt"), "utf8");
    const plan = importPlanCsv(csv);
    expect(plan.errors).toHaveLength(0);

    const parsed = parseNxosLldpNeighborsDetail(lldp);
    expect(parsed.failed).toBe(false);

    const links = plan.rows.map((r) => ({
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

    const observations = parsed.observations.map((o) => ({
      localDeviceNorm: normalizeDevice("Leaf-02"),
      localPortNorm: o.localInterfaceNorm,
      remoteDeviceNorm: o.remoteSystemNorm,
      remotePortNorm: o.remotePortNorm,
      localDevice: "Leaf-02",
      localPort: o.localInterface,
      remoteDevice: o.remoteSystemName,
      remotePort: o.remotePortId,
    }));

    const results = matchObservationsToPlan(links, observations);
    const byId = Object.fromEntries(results.map((r) => [r.cableId, r]));

    expect(byId["C-201"].kind).toBe("wrong_endpoint");
    expect(byId["C-202"].kind).toBe("wrong_endpoint");
    expect(byId["C-201"].observedSummary).toContain("GPU-06");
    expect(byId["C-202"].observedSummary).toContain("GPU-05");
    expect(byId["C-203"].kind).toBe("no_observation");
  });
});
