import type { Box, Pt } from "@/lib/topology/layout";

const EPS = 0.5;

const inside = (p: Pt, r: Box) => p[0] > r.x + EPS && p[0] < r.x + r.w - EPS && p[1] > r.y + EPS && p[1] < r.y + r.h - EPS;

function properCross(p: Pt, q: Pt, r: Pt, s: Pt) {
  const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
  const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
  return t > 1e-3 && t < 1 - 1e-3 && u > 1e-3 && u < 1 - 1e-3;
}

/** A segment enters a box's interior (touching its border, where ports sit, is allowed). */
export function segmentHitsBox(p: Pt, q: Pt, r: Box) {
  if (inside(p, r) || inside(q, r)) return true;
  const steps = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
  for (let i = 1; i < steps; i++) {
    const m: Pt = [p[0] + ((q[0] - p[0]) * i) / steps, p[1] + ((q[1] - p[1]) * i) / steps];
    if (inside(m, r)) return true;
  }
  return false;
}

export function boxesOverlap(a: Box, b: Box) {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

export type GeometryReport = { nodeOverlaps: number; segmentsThroughNodes: number; crossings: number; segments: number };

/** `paths` are polylines, each with the ids of its two end devices (excluded from the box test). */
export function geometryReport(nodes: Record<string, Box>, paths: Array<{ id: string; ends: [string, string]; pts: Pt[] }>): GeometryReport {
  const ids = Object.keys(nodes);
  let nodeOverlaps = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (boxesOverlap(nodes[ids[i]], nodes[ids[j]])) nodeOverlaps++;
  const segs: Array<{ p: Pt; q: Pt; path: string; ends: [string, string] }> = [];
  for (const path of paths) for (let i = 1; i < path.pts.length; i++) segs.push({ p: path.pts[i - 1], q: path.pts[i], path: path.id, ends: path.ends });
  let segmentsThroughNodes = 0;
  for (const s of segs) for (const id of ids) if (!s.ends.includes(id) && segmentHitsBox(s.p, s.q, nodes[id])) segmentsThroughNodes++;
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (segs[i].path !== segs[j].path && properCross(segs[i].p, segs[i].q, segs[j].p, segs[j].q)) crossings++;
  return { nodeOverlaps, segmentsThroughNodes, crossings, segments: segs.length };
}
