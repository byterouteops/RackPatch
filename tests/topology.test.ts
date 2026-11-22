import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { buildTopology } from "@/lib/demo/ai-hpc/topology";
import type { FabricDevice, FabricLink, LinkStatus } from "@/lib/fabric/load";
import { geometryReport } from "@/lib/topology/geometry";
import { buildTopologyGraph, checkGraphIntegrity, type TopoGraph, type TopoViewKind } from "@/lib/topology/graph";
import { cableOffset, computeLayout, offsetPolyline, type TopoLayout } from "@/lib/topology/layout";

/** The real AI/HPC demo topology (devices + cable plan) as the fabric loader shapes it. */
function demoFabric(states: Record<string, LinkStatus> = {}) {
  const t = buildTopology();
  const links: FabricLink[] = t.cables.map((c) => ({
    id: c.cableId, cableId: c.cableId, fabric: c.fabric, rail: c.rail, speed: c.speed, media: c.media, lengthM: c.lengthM,
    aRack: c.a.rack, aDevice: c.a.device, aPort: c.a.port, zRack: c.z.rack, zDevice: c.z.device, zPort: c.z.port,
    installStatus: "INSTALLED", state: states[c.cableId] ?? "AWAITING", findingType: null, observedSummary: null, nextAction: null,
    observability: null, relatedCableId: null, cableType: c.cableType, expectedSummary: null, evidenceSource: null, captureTime: null,
    observedSides: null, physical: null,
  }));
  const devices: FabricDevice[] = t.devices.map((d) => ({
    id: d.name, name: d.name, rack: d.rack, rackUnit: d.rackUnit, uHeight: d.uHeight, role: d.role, vendor: d.vendor, model: d.model,
    attributes: { design: d.design }, portCount: d.ports.length, usedPorts: 0, status: "NONE", links: [],
  }));
  return { devices, links };
}

const SCOPE: Record<Exclude<TopoViewKind, "trace">, (l: FabricLink, role: (n: string) => string) => boolean> = {
  full: (l) => l.fabric !== "OOB" && l.fabric !== "PATCH",
  fe: (l, role) => (l.fabric === "FE" || l.fabric === "STORAGE") && [l.aDevice, l.zDevice].every((d) => ["fe-spine", "fe-leaf", "border-leaf", "controller", "cpu", "gpu", "storage"].includes(role(d))),
  be: (l, role) => l.fabric === "BE" && [l.aDevice, l.zDevice].every((d) => ["be-spine", "be-leaf", "gpu"].includes(role(d))),
};

const elk = new ELK();
const layouts = new Map<string, Promise<{ graph: TopoGraph; layout: TopoLayout }>>();
function laidOut(view: Exclude<TopoViewKind, "trace">) {
  if (!layouts.has(view)) {
    const { devices, links } = demoFabric();
    const graph = buildTopologyGraph({ view, devices, links });
    layouts.set(view, computeLayout(elk, graph).then((layout) => ({ graph, layout })));
  }
  return layouts.get(view)!;
}

function expandedPaths(graph: TopoGraph, layout: TopoLayout) {
  return graph.bundles.flatMap((b) =>
    b.cableIds.map((id, i) => ({ id, ends: [b.a, b.z] as [string, string], pts: offsetPolyline(layout.routes[b.id], cableOffset(i, b.cableIds.length)) })),
  );
}

describe("topology graph (real AI/HPC plan)", () => {
  for (const view of ["full", "fe", "be"] as const) {
    it(`${view}: every in-scope cable is drawn exactly once, none invented or merged`, () => {
      const { devices, links } = demoFabric();
      const role = (n: string) => devices.find((d) => d.name === n)?.role ?? "";
      const expected = links.filter((l) => SCOPE[view](l, role)).map((l) => l.id);
      const graph = buildTopologyGraph({ view, devices, links });
      expect(expected.length).toBeGreaterThan(0);
      expect(graph.undrawn).toEqual([]);
      expect(checkGraphIntegrity(graph, expected)).toEqual([]);
      expect(graph.cables.length).toBe(expected.length);
    });
  }

  it("device status is counted per interface, never 'verified' from one cable", () => {
    const { devices, links } = demoFabric({ "CBL-FE-0001": "VERIFIED_LLDP", "CBL-FE-0002": "MISMATCH" });
    const graph = buildTopologyGraph({ view: "fe", devices, links });
    const spine = graph.nodes.find((n) => n.name === "FE-SPINE-01")!;
    expect(spine.counts.VERIFIED_LLDP).toBe(1);
    expect(spine.counts.MISMATCH).toBe(1);
    expect(spine.counts.AWAITING).toBe(spine.cableIds.length - 2);
    expect(spine.status).toBe("MISMATCH");
    const leaf = graph.nodes.find((n) => n.name === "FE-LEAF-03")!;
    expect(leaf.status).toBe("AWAITING");
  });

  it("structure key ignores statuses but changes with cabling", () => {
    const a = demoFabric();
    const b = demoFabric({ "CBL-FE-0001": "MISMATCH" });
    const ka = buildTopologyGraph({ view: "full", ...a }).structureKey;
    expect(buildTopologyGraph({ view: "full", ...b }).structureKey).toBe(ka);
    const c = demoFabric();
    c.links = c.links.filter((l) => l.cableId !== "CBL-FE-0001");
    expect(buildTopologyGraph({ view: "full", ...c }).structureKey).not.toBe(ka);
  });

  it("trace view adds the traced cables even when they are off the data fabrics", () => {
    const { devices, links } = demoFabric();
    const oob = links.find((l) => l.fabric === "OOB")!;
    const graph = buildTopologyGraph({ view: "trace", devices, links, traceCableIds: [oob.id] });
    expect(graph.cables.some((c) => c.id === oob.id)).toBe(true);
  });
});

describe("topology layout (ELK, real AI/HPC plan)", () => {
  for (const view of ["full", "fe", "be"] as const) {
    it(`${view}: no overlapping devices, no cable through a device, level rows`, async () => {
      const { graph, layout } = await laidOut(view);
      const report = geometryReport(layout.nodes, expandedPaths(graph, layout));
      const collapsed = geometryReport(layout.nodes, graph.bundles.map((b) => ({ id: b.id, ends: [b.a, b.z] as [string, string], pts: layout.routes[b.id] })));
      console.log(`[layout] ${view}: ${graph.nodes.length} devices, ${graph.cables.length} cables, ${graph.bundles.length} bundles, ${layout.ms} ms, ${Math.round(layout.width)}x${Math.round(layout.height)}, forcedOrder=${layout.forcedOrder}`, { expanded: report, collapsed });
      expect(collapsed.segmentsThroughNodes).toBe(0);
      expect(report.nodeOverlaps).toBe(0);
      expect(report.segmentsThroughNodes).toBe(0);
      for (const n of graph.nodes) expect(layout.nodes[n.id].y).toBe(layout.rows.find((r) => r.row === n.row)!.y);
      for (const b of graph.bundles) expect(layout.routes[b.id]?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it(`${view}: group frames never cover another group's device`, async () => {
      const { graph, layout } = await laidOut(view);
      const groupOf = new Map(graph.nodes.map((n) => [n.id, n.group]));
      for (const f of layout.frames) {
        for (const n of graph.nodes) {
          if (groupOf.get(n.id) === f.group) continue;
          const b = layout.nodes[n.id];
          const hit = b.x < f.box.x + f.box.w && b.x + b.w > f.box.x && b.y < f.box.y + f.box.h && b.y + b.h > f.box.y;
          expect(hit, `${n.id} inside frame ${f.label}`).toBe(false);
        }
      }
    });
  }

  it("layout is deterministic across runs", async () => {
    const { devices, links } = demoFabric();
    const graph = buildTopologyGraph({ view: "full", devices, links });
    const [x, y] = await Promise.all([computeLayout(new ELK(), graph), computeLayout(new ELK(), graph)]);
    expect(y.nodes).toEqual(x.nodes);
    expect(y.routes).toEqual(x.routes);
  });
});
