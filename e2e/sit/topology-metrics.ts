import type { Page } from "@playwright/test";

export type TopologyMetrics = {
  nodes: number;
  segments: number;
  nodeOverlaps: number;
  segmentsThroughNodes: number;
  crossings: number;
  labelOverflows: number;
};

/**
 * Geometry checks on the rendered topology SVG, in SVG user units.
 * Nodes: `[data-topo-node]` (falls back to `a > g > rect` for the legacy drawing).
 * Segments: `[data-topo-seg]` polylines via `data-points`, else legacy `<line>` elements.
 */
export async function measureTopology(page: Page, svgSelector = 'svg[aria-label^="Topology of"]'): Promise<TopologyMetrics> {
  return page.evaluate((sel) => {
    const svg = document.querySelector(sel) as SVGSVGElement | null;
    if (!svg) throw new Error(`no svg ${sel}`);
    type R = { x: number; y: number; w: number; h: number; label: string; textW: number };
    const rects: R[] = [];
    const nodeEls = svg.querySelectorAll("[data-topo-node]");
    const legacy = nodeEls.length === 0;
    const els = legacy ? Array.from(svg.querySelectorAll("a > g")) : Array.from(nodeEls);
    for (const el of els) {
      const r = (legacy ? el.querySelector("rect") : el.querySelector("[data-topo-box]")) as SVGRectElement | null;
      if (!r) continue;
      const t = el.querySelector("text") as SVGTextElement | null;
      const x = Number(r.getAttribute("x")) + (legacy ? 0 : Number(el.getAttribute("data-x") ?? 0));
      const y = Number(r.getAttribute("y")) + (legacy ? 0 : Number(el.getAttribute("data-y") ?? 0));
      rects.push({ x, y, w: Number(r.getAttribute("width")), h: Number(r.getAttribute("height")), label: t?.textContent ?? "", textW: t ? t.getBBox().width : 0 });
    }
    type P = { x: number; y: number };
    const segs: Array<[P, P, number]> = [];
    let edgeId = 0;
    if (legacy) {
      for (const l of Array.from(svg.querySelectorAll("line"))) {
        segs.push([{ x: Number(l.getAttribute("x1")), y: Number(l.getAttribute("y1")) }, { x: Number(l.getAttribute("x2")), y: Number(l.getAttribute("y2")) }, edgeId++]);
      }
    } else {
      for (const el of Array.from(svg.querySelectorAll("[data-topo-seg]"))) {
        const pts = (el.getAttribute("data-points") ?? "").split(" ").filter(Boolean).map((s) => {
          const [x, y] = s.split(",").map(Number);
          return { x, y };
        });
        const id = edgeId++;
        for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i], id]);
      }
    }
    const EPS = 0.5;
    const inside = (p: P, r: R, pad = -EPS) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;
    let nodeOverlaps = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) nodeOverlaps++;
      }
    const cross = (p: P, q: P, r: P, s: P) => {
      const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
      const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
      return t > 1e-3 && t < 1 - 1e-3 && u > 1e-3 && u < 1 - 1e-3;
    };
    const segHitsRect = (p: P, q: P, r: R) => {
      if (inside(p, r) || inside(q, r)) return false;
      const c = [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ];
      for (let k = 0; k < 4; k++) if (cross(p, q, c[k], c[(k + 1) % 4])) return true;
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      return inside(m, r);
    };
    let segmentsThroughNodes = 0;
    for (const [p, q] of segs) for (const r of rects) if (segHitsRect(p, q, r)) segmentsThroughNodes++;
    let crossings = 0;
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        if (segs[i][2] === segs[j][2]) continue;
        if (cross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) crossings++;
      }
    const labelOverflows = rects.filter((r) => r.textW > r.w + EPS).length;
    return { nodes: rects.length, segments: segs.length, nodeOverlaps, segmentsThroughNodes, crossings, labelOverflows };
  }, svgSelector);
}
