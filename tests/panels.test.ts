import { describe, expect, it } from "vitest";
import {
  buildPanelPortIndexes,
  findDuplicatePortIndexes,
  MAX_PANEL_PORTS,
  validateCircuitInput,
  validateCircuitPorts,
  validatePanelInput,
  validatePortMapping,
  type PortState,
} from "@/lib/panels";

const ports: PortState[] = [
  { id: "p1", panelId: "pnl1", portIndex: 1, side: "A", plannedLinkId: "L1" },
  { id: "p2", panelId: "pnl1", portIndex: 2, side: null, plannedLinkId: null },
  { id: "p3", panelId: "pnl2", portIndex: 1, side: null, plannedLinkId: null },
];

describe("validatePanelInput", () => {
  it("accepts and trims valid input", () => {
    expect(validatePanelInput({ name: " ODF-1 ", rack: " R1 ", portCount: 24, rackUnit: 2 })).toEqual({
      ok: true,
      value: { name: "ODF-1", rack: "R1", portCount: 24, rackUnit: 2 },
    });
    const noU = validatePanelInput({ name: "P", rack: "R", portCount: 12 });
    expect(noU.ok && noU.value.rackUnit).toBeNull();
  });

  it("rejects bad names, racks, counts and units", () => {
    expect(validatePanelInput({ name: " ", rack: "R", portCount: 12 }).ok).toBe(false);
    expect(validatePanelInput({ name: "P", rack: "", portCount: 12 }).ok).toBe(false);
    expect(validatePanelInput({ name: "P", rack: "R", portCount: 0 }).ok).toBe(false);
    expect(validatePanelInput({ name: "P", rack: "R", portCount: MAX_PANEL_PORTS + 1 }).ok).toBe(false);
    expect(validatePanelInput({ name: "P", rack: "R", portCount: 1.5 }).ok).toBe(false);
    expect(validatePanelInput({ name: "P", rack: "R", portCount: 4, rackUnit: 0 }).ok).toBe(false);
  });
});

describe("panel port uniqueness", () => {
  it("builds unique 1..N indexes", () => {
    const idx = buildPanelPortIndexes(24);
    expect(idx).toHaveLength(24);
    expect(idx[0]).toBe(1);
    expect(idx[23]).toBe(24);
    expect(findDuplicatePortIndexes(idx.map((portIndex) => ({ portIndex })))).toEqual([]);
  });

  it("detects duplicate indexes within a panel", () => {
    expect(
      findDuplicatePortIndexes([{ portIndex: 1 }, { portIndex: 2 }, { portIndex: 2 }, { portIndex: 1 }]),
    ).toEqual([1, 2]);
  });
});

describe("validatePortMapping", () => {
  it("maps a free port to a link end", () => {
    expect(validatePortMapping({ ports, portId: "p2", plannedLinkId: "L2", side: "A" })).toEqual({
      ok: true,
    });
  });

  it("requires a side", () => {
    const r = validatePortMapping({ ports, portId: "p2", plannedLinkId: "L2", side: null });
    expect(r.ok).toBe(false);
  });

  it("rejects mapping an already-mapped port to something else", () => {
    const r = validatePortMapping({ ports, portId: "p1", plannedLinkId: "L2", side: "A" });
    expect(r.ok).toBe(false);
  });

  it("rejects mapping the same cable end to a second port (even on another panel)", () => {
    const r = validatePortMapping({ ports, portId: "p3", plannedLinkId: "L1", side: "A" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("already mapped to panel port 1");
  });

  it("allows the other end of the same cable on another port", () => {
    expect(validatePortMapping({ ports, portId: "p3", plannedLinkId: "L1", side: "Z" }).ok).toBe(true);
  });

  it("rejects unknown ports", () => {
    expect(validatePortMapping({ ports, portId: "nope", plannedLinkId: "L1", side: "A" }).ok).toBe(false);
  });
});

describe("circuits", () => {
  it("normalizes media type to the taxonomy and requires a name", () => {
    expect(validateCircuitInput({ name: " C1 ", mediaType: "om4" })).toEqual({
      ok: true,
      name: "C1",
      mediaType: "MMF",
    });
    expect(validateCircuitInput({ name: "", mediaType: "SMF" }).ok).toBe(false);
    expect(validateCircuitInput({ name: "C", mediaType: "  " }).ok).toBe(false);
  });

  it("requires distinct A/Z ports and no reuse across circuits", () => {
    const existing = [{ circuitId: "c1", portAId: "p1", portZId: "p2" }];
    expect(validateCircuitPorts({ portAId: "p3", portZId: "p3", existing }).ok).toBe(false);
    expect(validateCircuitPorts({ portAId: "p1", existing }).ok).toBe(false);
    expect(validateCircuitPorts({ portAId: "p3", portZId: "p2", existing }).ok).toBe(false);
    expect(validateCircuitPorts({ portAId: "p3", portZId: "p4", existing }).ok).toBe(true);
    expect(validateCircuitPorts({ portAId: "p3", existing }).ok).toBe(true);
    expect(
      validateCircuitPorts({ portAId: "p1", portZId: "p2", existing, ignoreCircuitId: "c1" }).ok,
    ).toBe(true);
    expect(validateCircuitPorts({ portAId: "", existing }).ok).toBe(false);
  });
});
