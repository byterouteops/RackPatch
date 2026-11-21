import { describe, expect, it } from "vitest";
import {
  calculateImpact,
  countPortStatuses,
  derivePortsFromLinks,
  planPortSync,
  type InventoryLink,
} from "@/lib/port-inventory";

const links: InventoryLink[] = [
  {
    cableId: "C1",
    aRack: "R1",
    aDevice: "sw1",
    aPort: "Eth1/1",
    zRack: "R2",
    zDevice: "srv1",
    zPort: "NIC1",
    installStatus: "INSTALLED",
  },
  {
    cableId: "C2",
    aRack: "R1",
    aDevice: "SW1",
    aPort: "Ethernet1/2",
    zRack: "R3",
    zDevice: "srv2",
    zPort: "NIC1",
    installStatus: "PLANNED",
  },
  {
    cableId: "C3",
    aRack: "R1",
    aDevice: "sw1",
    aPort: "Eth1/3",
    zRack: "R3",
    zDevice: "srv3",
    zPort: "NIC1",
    installStatus: "INSTALLED",
    retiredAt: new Date("2026-01-01"),
  },
];

describe("derivePortsFromLinks", () => {
  it("collects unique endpoints, normalizes devices, skips retired links", () => {
    const { ports, conflicts } = derivePortsFromLinks(links);
    expect(conflicts).toEqual([]);
    expect(ports).toHaveLength(4);
    expect(ports.filter((p) => p.deviceNorm === "sw1")).toHaveLength(2);
    expect(ports.find((p) => p.cableId === "C3")).toBeUndefined();
  });

  it("reports a port claimed by two cables", () => {
    const { ports, conflicts } = derivePortsFromLinks([
      links[0],
      { ...links[1], cableId: "C9", aDevice: "sw1", aPort: "Ethernet1/1" },
    ]);
    expect(conflicts).toEqual([
      { deviceNorm: "sw1", portNorm: "ethernet1/1", cableIds: ["C1", "C9"] },
    ]);
    expect(ports.find((p) => p.portNorm === "ethernet1/1")?.cableId).toBe("C1");
  });
});

describe("planPortSync", () => {
  it("releases previously-synced ports that left the plan and flags reserved conflicts", () => {
    const { ports } = derivePortsFromLinks(links);
    const plan = planPortSync(
      [
        { deviceNorm: "sw1", portNorm: "ethernet1/9", status: "USED", plannedCableId: "OLD" },
        { deviceNorm: "sw1", portNorm: "ethernet1/10", status: "RESERVED", plannedCableId: null },
        { deviceNorm: "sw1", portNorm: "ethernet1/1", status: "RESERVED", plannedCableId: null },
        { deviceNorm: "sw1", portNorm: "ethernet1/11", status: "USED", plannedCableId: null },
      ],
      ports,
    );
    expect(plan.markUsed).toHaveLength(4);
    expect(plan.release).toEqual([{ deviceNorm: "sw1", portNorm: "ethernet1/9" }]);
    expect(plan.reservedConflicts).toEqual([
      { deviceNorm: "sw1", portNorm: "ethernet1/1", cableId: "C1" },
    ]);
  });
});

describe("calculateImpact", () => {
  it("lists all links on a device (case/alias-insensitive), ignoring retired", () => {
    const r = calculateImpact(links, { device: "Sw1" });
    expect(r.affectedLinks.map((a) => a.cableId)).toEqual(["C1", "C2"]);
    expect(r.localPortsAffected).toBe(2);
    expect(r.byInstallStatus).toEqual({ INSTALLED: 1, PLANNED: 1 });
    expect(r.peerDevices.map((p) => p.device).sort()).toEqual(["srv1", "srv2"]);
  });

  it("narrows to a single port using normalized matching", () => {
    const r = calculateImpact(links, { device: "sw1", port: "Ethernet1/1" });
    expect(r.affectedLinks).toHaveLength(1);
    expect(r.affectedLinks[0]).toMatchObject({ cableId: "C1", role: "A", peerDevice: "srv1" });
    expect(r.localPortsAffected).toBe(1);
  });

  it("matches the Z end and swaps local/peer", () => {
    const r = calculateImpact(links, { device: "srv2", port: "nic1" });
    expect(r.affectedLinks[0]).toMatchObject({
      cableId: "C2",
      role: "Z",
      localDevice: "srv2",
      peerDevice: "SW1",
    });
  });

  it("returns no impact for unknown targets", () => {
    const r = calculateImpact(links, { device: "nope" });
    expect(r.affectedLinks).toEqual([]);
    expect(r.localPortsAffected).toBe(0);
  });
});

describe("countPortStatuses", () => {
  it("counts by status", () => {
    expect(
      countPortStatuses([{ status: "FREE" }, { status: "USED" }, { status: "USED" }, { status: "RESERVED" }]),
    ).toEqual({ FREE: 1, USED: 2, RESERVED: 1, total: 4 });
  });
});
