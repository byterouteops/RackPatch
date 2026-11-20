import { describe, expect, it } from "vitest";
import { diffRevisions, shouldCarryForward, type LinkSnapshot } from "@/lib/csv/diff-revisions";
import { commercialAllowsMutations } from "@/lib/authz";
import { CommercialStatus } from "@prisma/client";

function snap(partial: Partial<LinkSnapshot> & { cableId: string }): LinkSnapshot {
  return {
    aRack: "R01",
    aDevice: "GPU-01",
    aPort: "NIC1",
    zRack: "R01",
    zDevice: "Leaf-01",
    zPort: "Ethernet1/1",
    aDeviceNorm: "gpu-01",
    aPortNorm: "nic1",
    zDeviceNorm: "leaf-01",
    zPortNorm: "ethernet1/1",
    endpointKey: "gpu-01|nic1::leaf-01|ethernet1/1",
    ...partial,
  };
}

describe("revision diff and carry-forward", () => {
  it("detects added/removed/modified and requires fresh verify on endpoint change", () => {
    const prev = [
      snap({ cableId: "C-1" }),
      snap({
        cableId: "C-2",
        aDevice: "GPU-02",
        aDeviceNorm: "gpu-02",
        zPort: "Ethernet1/2",
        zPortNorm: "ethernet1/2",
      }),
    ];
    const next = [
      snap({ cableId: "C-1" }),
      snap({
        cableId: "C-2",
        aDevice: "GPU-02",
        aDeviceNorm: "gpu-02",
        zPort: "Ethernet1/9",
        zPortNorm: "ethernet1/9",
      }),
      snap({ cableId: "C-3", aDevice: "GPU-03", aDeviceNorm: "gpu-03" }),
    ];
    const diff = diffRevisions(prev, next);
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.modified[0].endpointsChanged).toBe(true);
    expect(diff.added[0].cableId).toBe("C-3");
    expect(shouldCarryForward(prev[1], next[1])).toBe(false);
    expect(shouldCarryForward(prev[0], next[0])).toBe(true);
  });
});

describe("commercial gating", () => {
  it("allows Community Edition mutations without paid status", () => {
    delete process.env.HOSTED_SAAS;
    expect(commercialAllowsMutations(CommercialStatus.NONE)).toBe(true);
    expect(commercialAllowsMutations(CommercialStatus.PILOT)).toBe(true);
    expect(commercialAllowsMutations(CommercialStatus.PAID)).toBe(true);
  });

  it("allows only pilot and paid mutations on hosted SaaS", () => {
    process.env.HOSTED_SAAS = "true";
    expect(commercialAllowsMutations(CommercialStatus.NONE)).toBe(false);
    expect(commercialAllowsMutations(CommercialStatus.PILOT)).toBe(true);
    expect(commercialAllowsMutations(CommercialStatus.PAID)).toBe(true);
    delete process.env.HOSTED_SAAS;
  });
});
