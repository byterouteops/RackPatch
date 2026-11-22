import type { ElkNode, ElkPort } from "elkjs/lib/elk-api";
import type { TopoGraph } from "@/lib/topology/graph";

export const NODE_W = 140;
export const NODE_H = 46;
/** Spacing between the individual cables of an expanded bundle. */
export const CABLE_GAP = 5;
export const GUTTER = 92;
const MARGIN = 24;

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

export type TopoLayout = {
  key: string;
  width: number;
  height: number;
  nodes: Record<string, Box>;
  /** Centre line of each bundle; expanded cables are offsets of it. */
  routes: Record<string, Pt[]>;
  rows: Array<{ row: number; y: number; h: number }>;
  frames: Array<{ group: string; label: string; box: Box }>;
  ms: number;
  forcedOrder: boolean;
};

export type LayoutInput = Pick<TopoGraph, "structureKey" | "nodes" | "bundles" | "groups">;

/** Minimal surface of elkjs used here (bundled in Node tests, Web Worker in the browser). */
export type ElkLike = { layout: (g: ElkNode) => Promise<ElkNode> };
type ElkGraph = ElkNode;

export const bundleThickness = (count: number) => 2 + (count - 1) * CABLE_GAP;

function elkGraph(input: LayoutInput, order: string[] | null): ElkGraph {
  const rowOf = new Map(input.nodes.map((n) => [n.id, n.row]));
  const ports = new Map<string, ElkPort[]>();
  const edges: NonNullable<ElkGraph["edges"]> = [];
  for (const b of input.bundles) {
    if (b.sameRow) continue;
    const t = bundleThickness(b.cableIds.length);
    const pa = { id: `${b.id}::a`, width: t, height: 1, layoutOptions: { "elk.port.side": "SOUTH" } };
    const pz = { id: `${b.id}::z`, width: t, height: 1, layoutOptions: { "elk.port.side": "NORTH" } };
    ports.set(b.a, [...(ports.get(b.a) ?? []), pa]);
    ports.set(b.z, [...(ports.get(b.z) ?? []), pz]);
    edges.push({ id: b.id, sources: [pa.id], targets: [pz.id], layoutOptions: { "elk.edge.thickness": String(t) } });
  }
  const ids = order ?? input.nodes.map((n) => n.id);
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "7",
      "elk.partitioning.activate": "true",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": order ? "true" : "false",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.thoroughness": "12",
      "elk.spacing.nodeNode": "30",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.spacing.edgeEdge": "7",
      "elk.spacing.edgeNode": "16",
      "elk.layered.spacing.edgeNodeBetweenLayers": "22",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "7",
      "elk.spacing.portPort": "6",
      "elk.layered.unnecessaryBendpoints": "false",
      "elk.layered.mergeEdges": "false",
    },
    children: ids.map((id) => ({
      id,
      width: NODE_W,
      height: NODE_H,
      ports: ports.get(id) ?? [],
      layoutOptions: {
        "elk.partitioning.partition": String(rowOf.get(id) ?? 0),
        "elk.portConstraints": "FIXED_SIDE",
      },
    })),
    edges,
  };
}

function rowOrders(out: ElkGraph, rowOf: Map<string, number>) {
  const rows = new Map<number, Array<{ id: string; x: number }>>();
  for (const c of out.children ?? []) {
    const r = rowOf.get(c.id)!;
    rows.set(r, [...(rows.get(r) ?? []), { id: c.id, x: c.x ?? 0 }]);
  }
  for (const r of rows.values()) r.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return rows;
}

/** True when every group occupies one contiguous run within each row. */
function groupsContiguous(rows: Map<number, Array<{ id: string }>>, groupOf: Map<string, string>) {
  for (const r of rows.values()) {
    const done = new Set<string>();
    let cur: string | null = null;
    for (const n of r) {
      const g = groupOf.get(n.id)!;
      if (g !== cur) {
        if (done.has(g)) return false;
        if (cur) done.add(cur);
        cur = g;
      }
    }
  }
  return true;
}

export async function computeLayout(elk: ElkLike, input: LayoutInput): Promise<TopoLayout> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const rowOf = new Map(input.nodes.map((n) => [n.id, n.row]));
  const groupOf = new Map(input.nodes.map((n) => [n.id, n.group]));
  let out = await elk.layout(elkGraph(input, null));
  let forcedOrder = false;
  const rows = rowOrders(out, rowOf);
  if (!groupsContiguous(rows, groupOf)) {
    // Keep ELK's crossing-minimised order inside each group, but make every group contiguous.
    const order: string[] = [];
    for (const [, r] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const mean = new Map<string, number>();
      const cnt = new Map<string, number>();
      for (const n of r) {
        const g = groupOf.get(n.id)!;
        mean.set(g, (mean.get(g) ?? 0) + n.x);
        cnt.set(g, (cnt.get(g) ?? 0) + 1);
      }
      const rank = (id: string) => mean.get(groupOf.get(id)!)! / cnt.get(groupOf.get(id)!)!;
      order.push(...[...r].sort((a, b) => rank(a.id) - rank(b.id) || a.x - b.x).map((n) => n.id));
    }
    out = await elk.layout(elkGraph(input, order));
    forcedOrder = true;
  }
  return finish(input, out, (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0, forcedOrder);
}

function finish(input: LayoutInput, out: ElkGraph, ms: number, forcedOrder: boolean): TopoLayout {
  const dx = GUTTER + MARGIN;
  const dy = MARGIN + 14;
  const nodes: Record<string, Box> = {};
  for (const c of out.children ?? []) nodes[c.id] = { x: (c.x ?? 0) + dx, y: (c.y ?? 0) + dy, w: c.width ?? NODE_W, h: c.height ?? NODE_H };

  const routes: Record<string, Pt[]> = {};
  for (const e of out.edges ?? []) {
    const s = e.sections?.[0];
    if (!s) continue;
    const pts: Pt[] = [[s.startPoint.x + dx, s.startPoint.y + dy], ...(s.bendPoints ?? []).map((p) => [p.x + dx, p.y + dy] as Pt), [s.endPoint.x + dx, s.endPoint.y + dy]];
    routes[e.id] = simplify(pts);
  }

  const rowMap = new Map<number, { y: number; h: number }>();
  for (const n of input.nodes) {
    const b = nodes[n.id];
    const r = rowMap.get(n.row);
    rowMap.set(n.row, r ? { y: Math.min(r.y, b.y), h: Math.max(r.y + r.h, b.y + b.h) - Math.min(r.y, b.y) } : { y: b.y, h: b.h });
  }

  // Same-row bundles: straight between neighbours, otherwise through a channel just under the row.
  const channelUse = new Map<number, number>();
  for (const b of input.bundles) {
    if (!b.sameRow) continue;
    const row = input.nodes.find((n) => n.id === b.a)!.row;
    const [l, r] = [nodes[b.a], nodes[b.z]].sort((p, q) => p.x - q.x);
    const between = input.nodes.some((n) => n.row === row && n.id !== b.a && n.id !== b.z && nodes[n.id].x > l.x && nodes[n.id].x < r.x);
    if (!between) {
      const y = l.y + l.h / 2;
      routes[b.id] = [[l.x + l.w, y], [r.x, y]];
    } else {
      const k = channelUse.get(row) ?? 0;
      channelUse.set(row, k + 1);
      const y = l.y + l.h + 9 + k * (bundleThickness(b.cableIds.length) + 4);
      const lx = l.x + l.w - 12;
      const rx = r.x + 12;
      routes[b.id] = [[lx, l.y + l.h], [lx, y], [rx, y], [rx, r.y + r.h]];
    }
  }

  const width = Math.max(...Object.values(nodes).map((b) => b.x + b.w), 0) + MARGIN;
  const height = Math.max(...Object.values(nodes).map((b) => b.y + b.h), ...Object.values(routes).flat().map((p) => p[1]), 0) + MARGIN;
  return {
    key: input.structureKey,
    width,
    height,
    nodes,
    routes,
    rows: [...rowMap.entries()].sort((a, b) => a[0] - b[0]).map(([row, v]) => ({ row, ...v })),
    frames: frames(input, nodes),
    ms: Math.round(ms),
    forcedOrder,
  };
}

const FRAME_PAD = 10;
const FRAME_TOP = 20;

function bbox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)) - FRAME_PAD;
  const y = Math.min(...boxes.map((b) => b.y)) - FRAME_TOP;
  const r = Math.max(...boxes.map((b) => b.x + b.w)) + FRAME_PAD;
  const bt = Math.max(...boxes.map((b) => b.y + b.h)) + FRAME_PAD;
  return { x, y, w: r - x, h: bt - y };
}

const contains = (f: Box, b: Box) => b.x < f.x + f.w && b.x + b.w > f.x && b.y < f.y + f.h && b.y + b.h > f.y;

/** One frame per group; split per row whenever a frame would cover another group's device. */
function frames(input: LayoutInput, nodes: Record<string, Box>) {
  const out: TopoLayout["frames"] = [];
  for (const g of input.groups) {
    if (g.members.length < 2 && g.id !== "gpu" && !g.id.startsWith("gpu-rack")) continue;
    const members = new Set(g.members);
    const others = input.nodes.filter((n) => !members.has(n.id)).map((n) => nodes[n.id]);
    const whole = bbox(g.members.map((id) => nodes[id]));
    if (!others.some((o) => contains(whole, o))) {
      out.push({ group: g.id, label: g.label, box: whole });
      continue;
    }
    const byRow = new Map<number, Box[]>();
    for (const id of g.members) {
      const row = input.nodes.find((n) => n.id === id)!.row;
      byRow.set(row, [...(byRow.get(row) ?? []), nodes[id]]);
    }
    for (const boxes of byRow.values()) out.push({ group: g.id, label: g.label, box: bbox(boxes) });
  }
  return out;
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 0.01 && Math.abs(prev[1] - p[1]) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = prev!;
      const collinear = (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - p[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - p[1]) < 0.01);
      if (collinear) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Offsets an orthogonal polyline by `d` along its left normal (cable `i` of an expanded bundle). */
export function offsetPolyline(pts: Pt[], d: number): Pt[] {
  if (d === 0 || pts.length < 2) return pts;
  const seg = (i: number) => {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    return { nx: -(y2 - y1) / len, ny: (x2 - x1) / len };
  };
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0 || i === pts.length - 1) {
      const n = seg(i === 0 ? 0 : i - 1);
      out.push([x + n.nx * d, y + n.ny * d]);
    } else {
      const a = seg(i - 1);
      const b = seg(i);
      out.push([x + (a.nx + b.nx) * d, y + (a.ny + b.ny) * d]);
    }
  }
  return out;
}

export const cableOffset = (index: number, count: number) => (index - (count - 1) / 2) * CABLE_GAP;
