import fs from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { geometryReport } from "@/lib/topology/geometry";
import { buildTopologyGraph, checkGraphIntegrity, clusterCandidates, clusterGraph, type TopoGraph } from "@/lib/topology/graph";
import { computeLayout } from "@/lib/topology/layout";
import { scaleFabric, scalePlan } from "./fixtures/topology-scale";

const SIZES = [20, 50, 100, 500] as const;
const results: Record<string, unknown> = {};

async function measure(graph: TopoGraph, expected: string[]) {
  expect(checkGraphIntegrity(graph, expected)).toEqual([]);
  const layout = await computeLayout(new ELK(), graph);
  const paths = graph.bundles.map((b) => ({ id: b.id, ends: [b.a, b.z] as [string, string], pts: layout.routes[b.id] }));
  expect(paths.every((p) => p.pts && p.pts.length >= 2)).toBe(true);
  const geo = geometryReport(layout.nodes, paths);
  expect(geo.nodeOverlaps).toBe(0);
  expect(geo.segmentsThroughNodes).toBe(0);
  const again = await computeLayout(new ELK(), graph);
  expect(again.nodes).toEqual(layout.nodes);
  return {
    nodes: graph.nodes.length,
    bundles: graph.bundles.length,
    layoutMs: Math.round(layout.ms),
    size: `${Math.round(layout.width)}x${Math.round(layout.height)}`,
    forcedOrder: layout.forcedOrder,
    ...geo,
  };
}

describe("topology at scale (generated spine/leaf plans)", () => {
  for (const size of SIZES) {
    it(`${size} devices: every cable drawn once, no overlaps, no cable through a device, deterministic`, async () => {
      const plan = scalePlan(size);
      const { devices, links } = scaleFabric(plan);
      expect(devices.length).toBe(size);
      const expected = links.map((l) => l.id);

      const t0 = performance.now();
      const full = buildTopologyGraph({ view: "full", devices, links });
      const graphMs = performance.now() - t0;
      expect(full.nodes.length).toBe(size);

      const groups = clusterCandidates(full);
      const initial = clusterGraph(full, new Set());
      const r: Record<string, unknown> = {
        devices: size,
        cables: full.cables.length,
        graphMs: Math.round(graphMs),
        hostGroups: groups.size,
        initial: await measure(initial, expected),
      };
      // The fully expanded drawing (every host individually) is what "Expand all" renders.
      if (groups.size) r.expanded = await measure(full, expected);
      results[size] = r;
      console.log(`[scale] ${JSON.stringify(r)}`);
    }, 300_000);
  }

  it("small fabrics are never grouped", () => {
    const { devices, links } = scaleFabric(scalePlan(20));
    const g = buildTopologyGraph({ view: "full", devices, links });
    expect(clusterGraph(g, new Set())).toBe(g);
  });

  it("expanding one group restores exactly its devices and cables", () => {
    const { devices, links } = scaleFabric(scalePlan(100));
    const full = buildTopologyGraph({ view: "full", devices, links });
    const [first, members] = [...clusterCandidates(full)][0];
    const collapsed = clusterGraph(full, new Set());
    const one = clusterGraph(full, new Set([first]));
    expect(one.nodes.length).toBe(collapsed.nodes.length - 1 + members.length);
    expect(checkGraphIntegrity(one, links.map((l) => l.id))).toEqual([]);
    expect(one.structureKey).not.toBe(collapsed.structureKey);
  });

  it("writes the measured results", () => {
    fs.mkdirSync("docs/qa/raw", { recursive: true });
    fs.writeFileSync("docs/qa/raw/topology-scale-node.json", JSON.stringify(results, null, 2));
  });
});
