import { describe, expect, it } from "vitest";
import {
  buildNetBoxPreview,
  parseNetBoxCables,
  parseNetBoxDevices,
  parseNetBoxFixture,
  summarizePreview,
  type NetBoxPreviewContext,
} from "@/lib/netbox";
import { importPlanCsv } from "@/lib/csv/plan-import";

const iface = (device: string, name: string) => ({
  object_type: "dcim.interface",
  object_id: 1,
  object: { name, device: { name: device } },
});

const fixture = {
  devices: {
    results: [
      { id: 1, name: "GPU-07", rack: { name: "R01" }, site: { name: "DC1" }, status: { value: "active" } },
      { id: 2, name: "Leaf-02", rack: { name: "R01" } },
      { id: 3, name: "Spine-01", rack: null },
      { id: 4 },
    ],
  },
  cables: {
    results: [
      {
        id: 10,
        label: "fab-1",
        type: "dac-passive",
        a_terminations: [iface("GPU-07", "NIC 2")],
        b_terminations: [iface("Leaf-02", "Ethernet17")],
      },
      {
        id: 11,
        type: { value: "smf" },
        a_terminations: [iface("Leaf-02", "Ethernet18")],
        b_terminations: [iface("Spine-01", "Ethernet1/1")],
      },
      {
        id: 12,
        a_terminations: [{ object_type: "circuits.circuittermination", object: {} }],
        b_terminations: [iface("Leaf-02", "Ethernet30")],
      },
      {
        id: 13,
        a_terminations: [iface("Leaf-02", "Ethernet31"), iface("Leaf-02", "Ethernet32")],
        b_terminations: [iface("GPU-07", "NIC 3")],
      },
      // legacy NetBox < 3.3 shape
      {
        id: 14,
        termination_a: { device: { name: "GPU-07" }, name: "NIC 4" },
        termination_b: { device: { name: "Leaf-02" }, name: "Ethernet19" },
      },
    ],
  },
};

const ctx = (over: Partial<NetBoxPreviewContext> = {}): NetBoxPreviewContext => ({
  planDeviceNorms: new Set(["gpu-07"]),
  aliasNorms: new Map([["leaf-02", "leaf-02a"]]),
  planEndpointKeys: new Set(),
  ...over,
});

describe("netbox parsing", () => {
  it("parses devices from list payloads and arrays, skipping unnamed", () => {
    const devs = parseNetBoxDevices(fixture.devices);
    expect(devs.map((d) => d.name)).toEqual(["GPU-07", "Leaf-02", "Spine-01"]);
    expect(devs[0]).toMatchObject({ rack: "R01", site: "DC1", status: "active" });
    expect(parseNetBoxDevices([{ name: "x" }])).toHaveLength(1);
    expect(parseNetBoxDevices("nope")).toEqual([]);
  });

  it("parses modern and legacy terminations", () => {
    const cables = parseNetBoxCables(fixture.cables);
    expect(cables).toHaveLength(5);
    expect(cables[0].a).toEqual([{ device: "GPU-07", port: "NIC 2" }]);
    expect(cables[0].type).toBe("dac-passive");
    expect(cables[1].type).toBe("smf");
    expect(cables[2].unsupportedTerminations).toBe(1);
    expect(cables[4].a).toEqual([{ device: "GPU-07", port: "NIC 4" }]);
  });

  it("parses fixtures and rejects bad JSON", () => {
    expect(parseNetBoxFixture(JSON.stringify(fixture)).cables).toHaveLength(5);
    expect(parseNetBoxFixture(JSON.stringify([{ name: "a" }])).devices).toHaveLength(1);
    expect(() => parseNetBoxFixture("{nope")).toThrow(/valid JSON/);
  });
});

describe("netbox preview (dry-run mapping)", () => {
  const data = parseNetBoxFixture(JSON.stringify(fixture));

  it("maps devices to plan/alias/none and cables to planned endpoints", () => {
    const p = buildNetBoxPreview(data, ctx());
    expect(p.devices).toMatchObject({ total: 3, matchedPlan: 1, matchedAlias: 1, unmatched: 1 });
    expect(p.cables).toMatchObject({ total: 5, mappable: 3, skipped: 2, alreadyInPlan: 0, newToPlan: 3 });
    expect(p.errors).toEqual([]);
    const first = p.cables.rows.find((r) => r.cableId === "NB-10")!;
    expect(first).toMatchObject({ aRack: "R01", aDevice: "GPU-07", aPort: "NIC 2", zDevice: "Leaf-02" });
    expect(first.cableType).toBe("DAC");
    expect(first.notes).toBe("NetBox label: fab-1");
  });

  it("warns about skipped cables and unknown racks", () => {
    const p = buildNetBoxPreview(data, ctx());
    expect(p.warnings.some((w) => w.includes("Cable 12") && w.includes("non-device-port"))).toBe(true);
    expect(p.warnings.some((w) => w.includes("Cable 13"))).toBe(true);
    expect(p.warnings.some((w) => w.includes("Spine-01") && w.includes("UNASSIGNED"))).toBe(true);
  });

  it("detects cables already in the plan by endpoint key (either direction)", () => {
    const base = buildNetBoxPreview(data, ctx());
    const key = base.cables.rows.find((r) => r.cableId === "NB-10")!.endpointKey;
    const p = buildNetBoxPreview(data, ctx({ planEndpointKeys: new Set([key]) }));
    expect(p.cables.alreadyInPlan).toBe(1);
    expect(p.cables.newToPlan).toBe(2);
  });

  it("emits plan-import CSV that the existing importer accepts", () => {
    const p = buildNetBoxPreview(data, ctx());
    const res = importPlanCsv(p.planCsv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(3);
  });

  it("reports port conflicts via plan-import validation", () => {
    const dup = {
      devices: [{ name: "A", rack: { name: "R1" } }, { name: "B", rack: { name: "R1" } }],
      cables: [
        { id: 1, a_terminations: [iface("A", "e1")], b_terminations: [iface("B", "e1")] },
        { id: 2, a_terminations: [iface("A", "e1")], b_terminations: [iface("B", "e2")] },
      ],
    };
    const p = buildNetBoxPreview(parseNetBoxFixture(JSON.stringify(dup)), ctx());
    expect(p.errors.some((e) => /Port conflict/.test(e.message))).toBe(true);
  });

  it("summary has counts only (no tokens or payloads)", () => {
    const s = summarizePreview(buildNetBoxPreview(data, ctx()));
    expect(Object.values(s).every((v) => typeof v === "number")).toBe(true);
    expect(s.cablesMappable).toBe(3);
  });
});
