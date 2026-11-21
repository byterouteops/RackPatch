import { describe, expect, it } from "vitest";
import { buildSwapFixPlaybooks } from "@/lib/verify/fix-playbook";

describe("buildSwapFixPlaybooks", () => {
  it("pairs mutual WRONG_ENDPOINT findings into ordered steps", () => {
    const playbooks = buildSwapFixPlaybooks([
      {
        cableId: "C-201",
        relatedCableId: "C-202",
        findingType: "WRONG_ENDPOINT",
        state: "MISMATCH",
        expectedSummary: "GPU-05 NIC1 ↔ Leaf-02 Ethernet1/1",
        observedSummary: "Leaf-02 Eth1/1 → GPU-06 NIC1",
        aRack: "R01",
        zRack: "R01",
        aDevice: "GPU-05",
        aPort: "NIC1",
        zDevice: "Leaf-02",
        zPort: "Ethernet1/1",
        plannedLinkId: "link-201",
      },
      {
        cableId: "C-202",
        relatedCableId: "C-201",
        findingType: "WRONG_ENDPOINT",
        state: "MISMATCH",
        expectedSummary: "GPU-06 NIC1 ↔ Leaf-02 Ethernet1/2",
        observedSummary: "Leaf-02 Eth1/2 → GPU-05 NIC1",
        aRack: "R01",
        zRack: "R01",
        aDevice: "GPU-06",
        aPort: "NIC1",
        zDevice: "Leaf-02",
        zPort: "Ethernet1/2",
        plannedLinkId: "link-202",
      },
    ]);

    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].cableIds).toEqual(["C-201", "C-202"]);
    expect(playbooks[0].steps).toHaveLength(5);
    expect(playbooks[0].steps[0].title).toContain("Uncable C-201");
    expect(playbooks[0].steps[4].title).toMatch(/Re-import/i);
    expect(playbooks[0].racks).toEqual(["R01"]);
  });

  it("dedupes so each cable appears in at most one playbook", () => {
    const playbooks = buildSwapFixPlaybooks([
      {
        cableId: "A",
        relatedCableId: "B",
        findingType: "WRONG_ENDPOINT",
        state: "MISMATCH",
        expectedSummary: "A expect",
        observedSummary: "A obs",
        aRack: "R1",
        zRack: "R2",
        aDevice: "a",
        aPort: "1",
        zDevice: "z",
        zPort: "1",
        plannedLinkId: "1",
      },
      {
        cableId: "B",
        relatedCableId: "A",
        findingType: "WRONG_ENDPOINT",
        state: "MISMATCH",
        expectedSummary: "B expect",
        observedSummary: "B obs",
        aRack: "R1",
        zRack: "R2",
        aDevice: "b",
        aPort: "1",
        zDevice: "z",
        zPort: "2",
        plannedLinkId: "2",
      },
    ]);
    expect(playbooks).toHaveLength(1);
  });

  it("ignores awaiting findings without partners", () => {
    expect(
      buildSwapFixPlaybooks([
        {
          cableId: "C-203",
          relatedCableId: null,
          findingType: "NO_OBSERVATION",
          state: "AWAITING",
          expectedSummary: "x",
          observedSummary: null,
          aRack: "R01",
          zRack: "R01",
          aDevice: "a",
          aPort: "1",
          zDevice: "z",
          zPort: "1",
          plannedLinkId: "3",
        },
      ]),
    ).toHaveLength(0);
  });
});
