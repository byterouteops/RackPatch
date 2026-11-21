import { describe, expect, it } from "vitest";
import { buildRackLayout, type TwinLinkInput } from "@/lib/twin/rack-layout";

function link(p: Partial<TwinLinkInput> & Pick<TwinLinkInput, "aRack" | "zRack" | "aDevice" | "zDevice">): TwinLinkInput {
  return { installStatus: null, retiredAt: null, ...p };
}

describe("buildRackLayout", () => {
  it("groups devices by rack and counts endpoints", () => {
    const layout = buildRackLayout([
      link({ aRack: "R1", zRack: "R2", aDevice: "leaf1", zDevice: "srv1", installStatus: "INSTALLED" }),
      link({ aRack: "R1", zRack: "R2", aDevice: "leaf1", zDevice: "srv2" }),
      link({ aRack: "R1", zRack: "R1", aDevice: "leaf1", zDevice: "spine1" }),
    ]);
    expect(layout.racks.map((r) => r.rack)).toEqual(["R1", "R2"]);
    const r1 = layout.racks[0];
    expect(r1.devices.map((d) => d.device)).toEqual(["leaf1", "spine1"]);
    expect(r1.devices[0]).toMatchObject({ slot: 1, portsUsed: 3, installed: 1, planned: 2 });
    expect(r1.devices[1].slot).toBe(2);
    expect(layout.racks[1].devices.map((d) => d.device)).toEqual(["srv1", "srv2"]);
    expect(layout.totalDevices).toBe(4);
    expect(layout.activeLinks).toBe(3);
  });

  it("skips retired links", () => {
    const layout = buildRackLayout([
      link({ aRack: "R1", zRack: "R2", aDevice: "a", zDevice: "b", retiredAt: new Date() }),
      link({ aRack: "R1", zRack: "R2", aDevice: "a", zDevice: "c" }),
    ]);
    expect(layout.activeLinks).toBe(1);
    expect(layout.retiredLinksSkipped).toBe(1);
    expect(layout.racks[1].devices.map((d) => d.device)).toEqual(["c"]);
  });

  it("merges case-insensitive rack and device names, keeping first spelling", () => {
    const layout = buildRackLayout([
      link({ aRack: "R1", zRack: "r2", aDevice: "Leaf1", zDevice: "srv" }),
      link({ aRack: "r1", zRack: "R2", aDevice: "LEAF1", zDevice: "srv" }),
    ]);
    expect(layout.racks).toHaveLength(2);
    expect(layout.racks[0].rack).toBe("R1");
    expect(layout.racks[0].devices).toHaveLength(1);
    expect(layout.racks[0].devices[0]).toMatchObject({ device: "Leaf1", portsUsed: 2 });
  });

  it("derives device status", () => {
    const layout = buildRackLayout([
      link({ aRack: "R1", zRack: "R2", aDevice: "done", zDevice: "x", installStatus: "INSTALLED" }),
      link({ aRack: "R1", zRack: "R2", aDevice: "part", zDevice: "x", installStatus: "INSTALLED" }),
      link({ aRack: "R1", zRack: "R2", aDevice: "part", zDevice: "y" }),
      link({ aRack: "R1", zRack: "R2", aDevice: "blk", zDevice: "y", installStatus: "BLOCKED" }),
    ]);
    const byName = Object.fromEntries(layout.racks[0].devices.map((d) => [d.device, d.status]));
    expect(byName).toEqual({ blk: "blocked", done: "installed", part: "partial" });
    const r2 = Object.fromEntries(layout.racks[1].devices.map((d) => [d.device, d.status]));
    expect(r2.y).toBe("blocked");
    expect(r2.x).toBe("installed");
  });

  it("summarises rack connections including intra-rack links", () => {
    const layout = buildRackLayout([
      link({ aRack: "R2", zRack: "R1", aDevice: "a", zDevice: "b" }),
      link({ aRack: "R1", zRack: "R2", aDevice: "c", zDevice: "d" }),
      link({ aRack: "R1", zRack: "R1", aDevice: "e", zDevice: "f" }),
    ]);
    expect(layout.connections).toEqual([
      { racks: ["R1", "R2"], links: 2 },
      { racks: ["R1", "R1"], links: 1 },
    ]);
    expect(layout.racks[0].links).toBe(3);
  });

  it("returns empty layout for no links", () => {
    expect(buildRackLayout([])).toEqual({
      racks: [],
      connections: [],
      totalDevices: 0,
      activeLinks: 0,
      retiredLinksSkipped: 0,
    });
  });
});
