"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Expand, Layers, Maximize, Minimize, Minus, Plus, RotateCcw, Scan, Search } from "lucide-react";
import { STATUS_STYLE } from "@/lib/fabric/load";
import { STATUS_KEYS, TIER_LABEL, clusterCandidates, clusterGraph, statusKey, type StatusKey, type TopoBundle, type TopoCable, type TopoGraph, type TopoNode } from "@/lib/topology/graph";
import { GUTTER, cableOffset, offsetPolyline, type Box, type Pt, type TopoLayout } from "@/lib/topology/layout";
import { cachedLayout, forgetLayout, requestLayout } from "@/components/topology/layout-client";
import { BundlePanel, DevicePanel, GroupPanel } from "@/components/topology/details-panel";
import { STATUS_DASH, STATUS_ICON, styleOf } from "@/components/topology/status";

type Selection = { kind: "node" | "bundle"; id: string } | null;
type View = { k: number; tx: number; ty: number };

const CULL_THRESHOLD = 250;
const CHUNK = 400;
const MIN_K = 0.04;
const MAX_K = 3;

const toPath = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
const toAttr = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

function longestMid(pts: Pt[]): Pt {
  let best = 0;
  let mid: Pt = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len > best) {
      best = len;
      mid = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2];
    }
  }
  return mid;
}

const intersects = (b: Box, r: Box) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
function ptsBox(pts: Pt[]): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
}

const FRAME_FILL: Record<string, string> = { FE: "#eef6ff", BE: "#fff7ec", OOB: "#f5f3ff" };

const NodeBox = memo(function NodeBox({
  node,
  box,
  dim,
  selected,
  detail,
  onSelect,
}: {
  node: TopoNode;
  box: Box;
  dim: boolean;
  selected: boolean;
  detail: boolean;
  onSelect: (id: string) => void;
}) {
  const st = styleOf(node.status);
  const k = statusKey(node.status);
  const Icon = STATUS_ICON[k];
  const total = node.cableIds.length;
  const verified = node.counts.VERIFIED_LLDP + node.counts.VERIFIED_PHYSICAL;
  const group = node.members?.length;
  const max = group ? 19 : 16;
  const name = node.name.length > max ? `${node.name.slice(0, max - 1)}\u2026` : node.name;
  let x = box.x + 10;
  const barW = box.w - 20;
  return (
    <g
      data-topo-node
      data-name={node.name}
      data-status={node.status}
      data-group-size={group}
      role="button"
      tabIndex={0}
      aria-label={
        group
          ? `${node.name}, group of ${group} devices, ${verified} of ${total} cables verified, worst state ${st.label}`
          : `${node.name}, ${node.role ?? "device"}, ${verified} of ${total} interfaces verified, worst state ${st.label}`
      }
      aria-pressed={selected}
      className={`tp-node cursor-pointer outline-none ${dim ? "tp-dim" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      <title>{group ? `${node.name}: ${group} devices \u00b7 ${verified}/${total} cables verified \u00b7 worst: ${st.label} \u00b7 click to list or expand` : `${node.name} (${node.role ?? "no role"}) \u00b7 ${verified}/${total} verified \u00b7 worst: ${st.label}`}</title>
      {group && <rect x={box.x + 4} y={box.y + 4} width={box.w} height={box.h} rx={7} fill="#fff" stroke={st.stroke} strokeWidth={1} />}
      <rect data-topo-box x={box.x} y={box.y} width={box.w} height={box.h} rx={7} fill={st.fill} stroke={selected ? "#0f172a" : st.stroke} strokeWidth={selected ? 2.6 : 1.4} />
      {detail && (
        <>
          <text x={box.x + 10} y={box.y + 18} className={group ? undefined : "tp-mono"} fontSize={group ? 11 : 11.5} fontWeight={700} fill={st.text}>
            {name}
          </text>
          <Icon x={box.x + box.w - 22} y={box.y + 6} width={14} height={14} color={st.stroke} aria-hidden />
          <text x={box.x + 10} y={box.y + 32} fontSize={10} fill="#475569">
            {group ? `${group} devices \u00b7 ${verified}/${total} verified` : `${verified}/${total} verified`}
          </text>
          {STATUS_KEYS.map((s) => {
            const w = total ? (node.counts[s] / total) * barW : 0;
            if (!w) return null;
            const r = <rect key={s} x={x} y={box.y + box.h - 8} width={w} height={3.5} fill={STATUS_STYLE[s].stroke} />;
            x += w;
            return r;
          })}
        </>
      )}
    </g>
  );
});

const BundleEdge = memo(function BundleEdge({
  bundle,
  route,
  cables,
  expanded,
  dimBundle,
  dimCable,
  hot,
  portLabels,
  onSelect,
  onToggle,
  display,
  names,
}: {
  display: (deviceId: string) => string;
  names: [string, string];
  bundle: TopoBundle;
  route: Pt[];
  cables: TopoCable[];
  expanded: boolean;
  dimBundle: boolean;
  dimCable: (c: TopoCable) => boolean;
  hot: (c: TopoCable) => boolean;
  portLabels: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const n = cables.length;
  const select = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(bundle.id);
  };
  if (!expanded) {
    const k = statusKey(bundle.status);
    const st = STATUS_STYLE[k];
    const mid = longestMid(route);
    const problem = k === "MISMATCH" || k === "NEEDS_REVIEW";
    return (
      <g className={`tp-edge ${dimBundle ? "tp-dim" : ""}`} data-bundle={bundle.id} data-status={bundle.status} onClick={select}>
        <title>{`${names[0]} \u2194 ${names[1]} \u00b7 ${n} cable${n === 1 ? "" : "s"} \u00b7 ${st.label}`}</title>
        <path d={toPath(route)} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" />
        <path
          data-topo-seg
          data-points={toAttr(route)}
          className="tp-line"
          d={toPath(route)}
          fill="none"
          stroke={st.stroke}
          strokeWidth={(n === 1 ? 1.6 : Math.min(1.6 + (n - 1) * 1.3, 6)) + (problem ? 0.8 : 0)}
          strokeDasharray={STATUS_DASH[k]}
          strokeLinejoin="round"
        />
        {k === "MISMATCH" && <path d={`M${mid[0] - 4} ${mid[1] - 4} L${mid[0] + 4} ${mid[1] + 4} M${mid[0] + 4} ${mid[1] - 4} L${mid[0] - 4} ${mid[1] + 4}`} stroke={st.stroke} strokeWidth={2.2} />}
        {n > 1 && (
          <g
            className="cursor-pointer"
            data-bundle-toggle={bundle.id}
            role="button"
            aria-label={`Expand ${n} cables between ${names[0]} and ${names[1]}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(bundle.id);
            }}
          >
            <rect x={mid[0] + (k === "MISMATCH" ? 7 : -12)} y={mid[1] - 8} width={24} height={16} rx={8} fill="#fff" stroke={st.stroke} />
            <text x={mid[0] + (k === "MISMATCH" ? 19 : 0)} y={mid[1] + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={st.text}>
              {`\u00d7${n}`}
            </text>
          </g>
        )}
      </g>
    );
  }
  return (
    <g data-bundle={bundle.id} data-expanded="true">
      {cables.map((c, i) => {
        const pts = offsetPolyline(route, cableOffset(i, n));
        const k = statusKey(c.state);
        const st = STATUS_STYLE[k];
        const isHot = hot(c);
        const mid = longestMid(pts);
        return (
          <g key={c.id} className={`tp-edge ${dimCable(c) ? "tp-dim" : ""}`} data-cable={c.cableId} data-status={c.state} onClick={select}>
            <title>{`${c.cableId}: ${c.a} ${c.aPort} \u2194 ${c.z} ${c.zPort} \u00b7 ${[c.cableType, c.speed].filter(Boolean).join(" ")} \u00b7 ${st.label}`}</title>
            <path d={toPath(pts)} fill="none" stroke="transparent" strokeWidth={8} className="cursor-pointer" />
            <path data-topo-seg data-points={toAttr(pts)} className="tp-line" d={toPath(pts)} fill="none" stroke={st.stroke} strokeWidth={isHot ? 3.2 : 1.5} strokeDasharray={STATUS_DASH[k]} strokeLinejoin="round" />
            {k === "MISMATCH" && <path d={`M${mid[0] - 3.5} ${mid[1] - 3.5} L${mid[0] + 3.5} ${mid[1] + 3.5} M${mid[0] + 3.5} ${mid[1] - 3.5} L${mid[0] - 3.5} ${mid[1] + 3.5}`} stroke={st.stroke} strokeWidth={2} />}
            {portLabels && isHot && (
              <>
                <text x={pts[0][0] + 4} y={pts[0][1] + 11} fontSize={9.5} className="tp-mono tp-halo" fill="#0f172a">
                  {display(c.a) === bundle.a ? c.aPort : c.zPort}
                </text>
                <text x={pts[pts.length - 1][0] + 4} y={pts[pts.length - 1][1] - 4} fontSize={9.5} className="tp-mono tp-halo" fill="#0f172a">
                  {display(c.a) === bundle.a ? c.zPort : c.aPort}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
});

export function TopologyView({
  graph: source,
  base,
  highlightCableIds,
  ariaLabel,
}: {
  graph: TopoGraph;
  base: string;
  /** Trace: these cables (and their devices) stay lit, everything else is dimmed. */
  highlightCableIds?: string[];
  ariaLabel?: string;
}) {
  const candidates = useMemo(() => clusterCandidates(source), [source]);
  /** Host groups that start expanded: any group holding a device on the traced path. */
  const initialOpen = useMemo(() => {
    const ends = new Set(source.cables.filter((c) => highlightCableIds?.includes(c.id)).flatMap((c) => [c.a, c.z]));
    return new Set([...candidates].filter(([, ms]) => ms.some((m) => ends.has(m.id))).map(([id]) => id));
  }, [candidates, source.cables, highlightCableIds]);
  const [groupsOpen, setGroupsOpen] = useState<Set<string>>(initialOpen);
  const graph = useMemo(() => clusterGraph(source, groupsOpen), [source, groupsOpen]);
  const display = useCallback((id: string) => graph.displayOf?.[id] ?? id, [graph]);
  const sourceNodeById = useMemo(() => new Map(source.nodes.map((n) => [n.id, n])), [source.nodes]);
  const pendingCenter = useRef<string | null>(null);
  const key = graph.structureKey;
  const [layout, setLayout] = useState<TopoLayout | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [filters, setFilters] = useState<Set<StatusKey>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [zoomK, setZoomK] = useState(1);
  const [viewRect, setViewRect] = useState<Box | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(CHUNK);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const view = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const fittedKey = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportWaiter = useRef<(() => void) | null>(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const cableById = useMemo(() => new Map(graph.cables.map((c) => [c.id, c])), [graph.cables]);
  const bundleById = useMemo(() => new Map(graph.bundles.map((b) => [b.id, b])), [graph.bundles]);
  const bundleCables = useMemo(() => new Map(graph.bundles.map((b) => [b.id, b.cableIds.map((id) => cableById.get(id)!).filter(Boolean)])), [graph.bundles, cableById]);
  const highlight = useMemo(() => new Set(highlightCableIds ?? []), [highlightCableIds]);

  // Layout: cache hit (memory / localStorage) when the structure is unchanged, else ELK in a worker.
  useEffect(() => {
    let alive = true;
    const hit = cachedLayout(key);
    if (hit) {
      setLayout(hit);
      setFromCache(true);
      return;
    }
    setLayout((l) => (l?.key === key ? l : null));
    setFromCache(false);
    requestLayout({ structureKey: key, nodes: graph.nodes, bundles: graph.bundles, groups: graph.groups })
      .then((l) => alive && setLayout(l))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // Statuses never change the structure key, so status refreshes reuse the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const apply = useCallback(() => {
    const v = view.current;
    gRef.current?.setAttribute("transform", `translate(${v.tx.toFixed(2)} ${v.ty.toFixed(2)}) scale(${v.k.toFixed(4)})`);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setZoomK(v.k);
      const svg = svgRef.current;
      if (svg) setViewRect({ x: -v.tx / v.k, y: -v.ty / v.k, w: svg.clientWidth / v.k, h: svg.clientHeight / v.k });
    }, 90);
  }, []);

  const fitBox = useCallback(
    (b: Box, maxK: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      const k = Math.max(MIN_K, Math.min(maxK, Math.min(w / b.w, h / b.h) * 0.97));
      view.current = { k, tx: (w - b.w * k) / 2 - b.x * k, ty: Math.max(4, (h - b.h * k) / 2) - b.y * k };
      apply();
    },
    [apply],
  );

  const fit = useCallback(() => {
    if (layout) fitBox({ x: 0, y: 0, w: layout.width, h: layout.height }, 1.4);
  }, [layout, fitBox]);

  /** Devices on the traced path, so a trace opens framed on the path rather than the whole fabric. */
  const focusBox = useMemo(() => {
    if (!layout || !highlight.size) return null;
    const boxes = graph.cables.filter((c) => highlight.has(c.id)).flatMap((c) => [layout.nodes[display(c.a)], layout.nodes[display(c.z)]]).filter(Boolean);
    if (!boxes.length) return null;
    const pad = 70;
    const x = Math.min(...boxes.map((b) => b.x)) - pad - GUTTER;
    const y = Math.min(...boxes.map((b) => b.y)) - pad;
    return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) + pad - x, h: Math.max(...boxes.map((b) => b.y + b.h)) + pad - y };
  }, [layout, highlight, graph.cables, display]);

  // Fit once; later re-layouts (expanding a host group) keep the user's zoom and pan.
  useEffect(() => {
    if (layout && fittedKey.current === null) {
      fittedKey.current = layout.key;
      if (focusBox) fitBox(focusBox, 1.1);
      else fit();
    }
  }, [layout, fit, fitBox, focusBox]);

  // Progressive rendering for large topologies.
  useEffect(() => {
    if (!layout || limit >= graph.bundles.length) return;
    const id = requestAnimationFrame(() => setLimit((l) => l + CHUNK));
    return () => cancelAnimationFrame(id);
  }, [layout, limit, graph.bundles.length]);

  const zoomBy = useCallback(
    (f: number, cx?: number, cy?: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const v = view.current;
      const px = cx ?? svg.clientWidth / 2;
      const py = cy ?? svg.clientHeight / 2;
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * f));
      view.current = { k, tx: px - ((px - v.tx) * k) / v.k, ty: py - ((py - v.ty) * k) / v.k };
      apply();
    },
    [apply],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomBy, layout]);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    d.moved = true;
    view.current = { ...view.current, tx: d.tx + dx, ty: d.ty + dy };
    apply();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };
  const suppressClickAfterDrag = useRef(false);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(document.fullscreenElement === containerRef.current);
      setTimeout(fit, 60);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [fit]);

  const centerOn = useCallback(
    (id: string) => {
      const b = layout?.nodes[id];
      const svg = svgRef.current;
      if (!b || !svg) return;
      const k = Math.max(view.current.k, 0.9);
      view.current = { k, tx: svg.clientWidth / 2 - (b.x + b.w / 2) * k, ty: svg.clientHeight / 2 - (b.y + b.h / 2) * k };
      apply();
    },
    [layout, apply],
  );

  useEffect(() => {
    const id = pendingCenter.current;
    if (id && layout?.nodes[id]) {
      pendingCenter.current = null;
      centerOn(id);
    }
  }, [layout, centerOn]);

  /** Selects a device, expanding its host group first if it is collapsed. */
  const revealDevice = useCallback(
    (id: string) => {
      setSelection({ kind: "node", id });
      const shown = display(id);
      if (shown !== id) {
        pendingCenter.current = id;
        setGroupsOpen((g) => new Set(g).add(shown));
      } else centerOn(id);
    },
    [display, centerOn],
  );

  const selectNode = useCallback((id: string) => setSelection((s) => (s?.kind === "node" && s.id === id ? null : { kind: "node", id })), []);
  const selectBundle = useCallback((id: string) => {
    setSelection({ kind: "bundle", id });
    setExpanded((e) => new Set(e).add(id));
  }, []);
  const toggleBundle = useCallback((id: string) => setExpanded((e) => {
    const n = new Set(e);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  // Focus set: selected device + neighbours, selected bundle, or the traced path.
  const focus = useMemo(() => {
    if (selection?.kind === "node") {
      const shown = display(selection.id);
      const nodes = new Set([shown]);
      const bundles = new Set<string>();
      for (const b of graph.bundles) if (b.a === shown || b.z === shown) {
        bundles.add(b.id);
        nodes.add(b.a);
        nodes.add(b.z);
      }
      return { nodes, bundles, cables: null as Set<string> | null };
    }
    if (selection?.kind === "bundle") {
      const b = bundleById.get(selection.id);
      return b ? { nodes: new Set([b.a, b.z]), bundles: new Set([b.id]), cables: null } : null;
    }
    if (highlight.size) {
      const nodes = new Set<string>();
      const bundles = new Set<string>();
      for (const id of highlight) {
        const c = cableById.get(id);
        if (!c) continue;
        nodes.add(display(c.a));
        nodes.add(display(c.z));
      }
      for (const b of graph.bundles) if (b.cableIds.some((id) => highlight.has(id))) bundles.add(b.id);
      return { nodes, bundles, cables: highlight };
    }
    return null;
  }, [selection, highlight, graph.bundles, bundleById, cableById, display]);

  const matches = useCallback((c: TopoCable) => filters.size === 0 || filters.has(statusKey(c.state)), [filters]);
  const nodeMatches = useMemo(() => {
    if (!filters.size) return null;
    const s = new Set<string>();
    for (const c of graph.cables) if (matches(c)) {
      s.add(display(c.a));
      s.add(display(c.z));
    }
    return s;
  }, [filters, graph.cables, matches, display]);

  const legendCounts = useMemo(() => {
    const m: Record<StatusKey, number> = { VERIFIED_LLDP: 0, VERIFIED_PHYSICAL: 0, AWAITING: 0, NEEDS_REVIEW: 0, MISMATCH: 0 };
    for (const c of graph.cables) m[statusKey(c.state)]++;
    return m;
  }, [graph.cables]);

  const culling = graph.nodes.length > CULL_THRESHOLD && !exporting && viewRect;
  const pad = viewRect ? 240 / Math.max(zoomK, 0.1) : 0;
  const visRect = viewRect ? { x: viewRect.x - pad, y: viewRect.y - pad, w: viewRect.w + 2 * pad, h: viewRect.h + 2 * pad } : null;
  const detail = exporting || zoomK >= 0.3;

  const runExport = async (kind: "svg" | "png") => {
    if (!layout || !svgRef.current) return;
    setExporting(true);
    await new Promise<void>((r) => {
      exportWaiter.current = r;
    });
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    setExporting(false);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(Math.ceil(layout.width)));
    clone.setAttribute("height", String(Math.ceil(layout.height)));
    clone.setAttribute("viewBox", `0 0 ${Math.ceil(layout.width)} ${Math.ceil(layout.height)}`);
    clone.querySelector("[data-viewport]")?.removeAttribute("transform");
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const text = new XMLSerializer().serializeToString(clone);
    const name = `rackpatch-${graph.view}-topology`;
    const save = (blob: Blob, ext: string) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    if (kind === "svg") {
      save(new Blob([text], { type: "image/svg+xml" }), "svg");
      setNotice("SVG exported");
      return;
    }
    const scale = Math.min(2, 16000 / Math.max(layout.width, layout.height));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(layout.width * scale);
      canvas.height = Math.ceil(layout.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) save(b, "png");
        setNotice(b ? "PNG exported" : "PNG export failed");
      }, "image/png");
    };
    img.onerror = () => setNotice("PNG export failed");
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  };

  useEffect(() => {
    if (exporting && exportWaiter.current) {
      const done = exportWaiter.current;
      exportWaiter.current = null;
      requestAnimationFrame(() => done());
    }
  });

  const resetLayout = () => {
    forgetLayout(key);
    fittedKey.current = null;
    setSelection(null);
    setFilters(new Set());
    setExpanded(new Set());
    setExpandAll(false);
    setLayout(null);
    setFromCache(false);
    if (groupsOpen.size !== initialOpen.size || [...groupsOpen].some((g) => !initialOpen.has(g))) {
      setGroupsOpen(initialOpen);
      return;
    }
    requestLayout({ structureKey: key, nodes: graph.nodes, bundles: graph.bundles, groups: graph.groups }).then(setLayout, (e: Error) => setError(e.message));
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = source.nodes.find((n) => n.name.toLowerCase() === q) ?? source.nodes.find((n) => n.name.toLowerCase().includes(q));
    if (!hit) {
      setNotice(`No device matching "${query.trim()}" in this view`);
      return;
    }
    setNotice(null);
    revealDevice(hit.id);
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const tierBands = useMemo(() => {
    if (!layout) return [];
    const bands = new Map<string, { y0: number; y1: number }>();
    for (const n of graph.nodes) {
      const b = layout.nodes[n.id];
      if (!b) continue;
      const cur = bands.get(n.tier);
      bands.set(n.tier, cur ? { y0: Math.min(cur.y0, b.y), y1: Math.max(cur.y1, b.y + b.h) } : { y0: b.y, y1: b.y + b.h });
    }
    return [...bands.entries()];
  }, [layout, graph.nodes]);

  const selNode = selection?.kind === "node" ? (nodeById.get(selection.id) ?? sourceNodeById.get(selection.id)) : undefined;
  const selBundle = selection?.kind === "bundle" ? bundleById.get(selection.id) : undefined;
  const visibleBundles = graph.bundles.slice(0, exporting ? graph.bundles.length : limit);

  const toolBtn = "inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50";

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-white ${fullscreen ? "flex h-screen flex-col" : ""}`}
      data-testid="topology"
      data-ready={layout?.key === key ? "true" : "false"}
      data-layout-ms={layout?.ms ?? ""}
      data-layout-cached={fromCache ? "true" : "false"}
      data-structure-key={key}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <form onSubmit={onSearch} className="flex items-center gap-1" role="search">
          <label className="relative">
            <span className="sr-only">Search device</span>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              list={`topo-devices-${graph.view}`}
              placeholder="Search device"
              aria-label="Search device"
              className="h-8 w-44 rounded-md border border-[var(--border)] pl-7 pr-2 text-xs outline-none focus:border-[var(--accent)]"
            />
          </label>
          <datalist id={`topo-devices-${graph.view}`}>
            {source.nodes.map((n) => (
              <option key={n.id} value={n.name} />
            ))}
          </datalist>
          <button type="submit" className={toolBtn}>
            Find
          </button>
        </form>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={toolBtn} onClick={fit} disabled={!layout} aria-label="Fit to screen" title="Fit to screen">
            <Scan className="h-3.5 w-3.5" aria-hidden /> Fit
          </button>
          <button type="button" className={toolBtn} onClick={() => zoomBy(1 / 1.25)} disabled={!layout} aria-label="Zoom out" title="Zoom out">
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-11 text-center text-xs tabular-nums text-[var(--muted-fg)]" data-testid="topo-zoom">
            {Math.round(zoomK * 100)}%
          </span>
          <button type="button" className={toolBtn} onClick={() => zoomBy(1.25)} disabled={!layout} aria-label="Zoom in" title="Zoom in">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <button type="button" className={toolBtn} onClick={resetLayout} disabled={!layout} title="Recompute the layout and clear selection and filters">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset layout
        </button>
        <button type="button" className={toolBtn} onClick={() => setExpandAll((v) => !v)} aria-pressed={expandAll} title="Draw every physical cable instead of bundles">
          <Layers className="h-3.5 w-3.5" aria-hidden /> {expandAll ? "Bundle cables" : "Show every cable"}
        </button>
        {candidates.size > 0 && (
          <button
            type="button"
            className={toolBtn}
            onClick={() => setGroupsOpen((g) => (g.size === candidates.size ? initialOpen : new Set(candidates.keys())))}
            aria-pressed={groupsOpen.size === candidates.size}
            title={`${candidates.size} host groups (same class, same rack) are collapsed to keep large fabrics readable`}
          >
            <Expand className="h-3.5 w-3.5" aria-hidden /> {groupsOpen.size === candidates.size ? "Group hosts" : `Expand ${candidates.size - groupsOpen.size} host groups`}
          </button>
        )}
        <button type="button" className={toolBtn} onClick={() => (fullscreen ? document.exitFullscreen() : containerRef.current?.requestFullscreen())} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <Minimize className="h-3.5 w-3.5" aria-hidden /> : <Maximize className="h-3.5 w-3.5" aria-hidden />} {fullscreen ? "Exit" : "Full screen"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={toolBtn} onClick={() => runExport("svg")} disabled={!layout}>
            <Download className="h-3.5 w-3.5" aria-hidden /> SVG
          </button>
          <button type="button" className={toolBtn} onClick={() => runExport("png")} disabled={!layout}>
            <Download className="h-3.5 w-3.5" aria-hidden /> PNG
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-3 py-1.5" role="group" aria-label="Filter cables by status">
        {STATUS_KEYS.map((s) => {
          const st = STATUS_STYLE[s];
          const Icon = STATUS_ICON[s];
          const on = filters.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setFilters((f) => {
                const n = new Set(f);
                if (n.has(s)) n.delete(s);
                else n.add(s);
                return n;
              })}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-shadow"
              style={{ background: on ? st.stroke : st.fill, borderColor: st.stroke, color: on ? "#fff" : st.text }}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {st.label}
              <span className="tabular-nums">{legendCounts[s]}</span>
            </button>
          );
        })}
        {filters.size > 0 && (
          <button type="button" onClick={() => setFilters(new Set())} className="text-[11px] font-semibold text-[var(--accent-ink)] hover:underline">
            Clear filter
          </button>
        )}
        <span className="ml-auto text-[11px] text-[var(--muted-fg)]" data-testid="topo-summary">
          {source.nodes.length} devices{graph.nodes.length !== source.nodes.length ? ` (${graph.nodes.length} shown)` : ""} {"\u00b7"} {graph.cables.length} cables {"\u00b7"} {graph.bundles.length} links
          {layout ? ` \u00b7 layout ${layout.ms} ms${fromCache ? " (cached)" : ""}` : ""}
        </span>
      </div>

      {graph.undrawn.length > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          {graph.undrawn.length} cable(s) start and end on the same device and cannot be drawn: {graph.undrawn.join(", ")}.
        </p>
      )}

      <div className={`flex min-h-0 flex-col lg:flex-row ${fullscreen ? "flex-1" : ""}`}>
        <div className={`relative min-w-0 flex-1 bg-[#fbfdff] ${fullscreen ? "h-full" : "h-[min(76vh,860px)] min-h-[480px]"}`}>
          {!layout && !error && (
            <div className="absolute inset-0 grid place-items-center text-sm text-[var(--muted-fg)]" role="status">
              Laying out {graph.nodes.length} devices and {graph.cables.length} cables{"\u2026"}
            </div>
          )}
          {error && <div className="absolute inset-0 grid place-items-center text-sm text-[var(--danger-ink)]">Layout failed: {error}</div>}
          {notice && (
            <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-1 text-xs text-white" role="status">
              {notice}
            </div>
          )}
          <svg
            ref={svgRef}
            className={`h-full w-full touch-none select-none ${layout ? "" : "invisible"}`}
            role="group"
            aria-label={ariaLabel ?? `Topology of ${graph.label}`}
            fontFamily="Poppins, 'Segoe UI', system-ui, sans-serif"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => {
              suppressClickAfterDrag.current = Boolean(drag.current?.moved);
              onPointerUp(e);
            }}
            onClickCapture={(e) => {
              if (suppressClickAfterDrag.current) {
                suppressClickAfterDrag.current = false;
                e.stopPropagation();
              }
            }}
            onClick={() => setSelection(null)}
            onKeyDown={(e) => e.key === "Escape" && setSelection(null)}
          >
            <style>{`
              .tp-mono{font-family:'JetBrains Mono',Consolas,ui-monospace,monospace}
              .tp-dim{opacity:.13}
              .tp-edge:hover .tp-line{stroke-width:3.4px;stroke-opacity:1}
              .tp-edge:hover{opacity:1}
              .tp-node:focus-visible rect[data-topo-box]{stroke:#0f172a;stroke-width:2.6px}
              .tp-halo{paint-order:stroke;stroke:#fff;stroke-width:3px}
            `}</style>
            {layout && (
              <g ref={gRef} data-viewport>
                {layout.frames.map((f, i) => (
                  <g key={`${f.group}-${i}`} data-topo-frame={f.group}>
                    <rect x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} rx={10} fill={FRAME_FILL[f.group] ?? "#f6f8fb"} stroke="#cbd5e1" strokeDasharray="4 3" />
                    {detail && (
                      <text x={f.box.x + 8} y={f.box.y + 13} fontSize={10.5} fontWeight={600} fill="#475569">
                        {f.label}
                      </text>
                    )}
                  </g>
                ))}
                {tierBands.map(([tier, b]) => (
                  <g key={tier}>
                    <text x={14} y={(b.y0 + b.y1) / 2 + 4} fontSize={11} fontWeight={700} fill="#64748b" letterSpacing={1.2}>
                      {TIER_LABEL[tier as keyof typeof TIER_LABEL].toUpperCase()}
                    </text>
                    <line x1={GUTTER - 4} x2={GUTTER - 4} y1={b.y0} y2={b.y1} stroke="#cbd5e1" strokeWidth={2} />
                  </g>
                ))}
                {visibleBundles.map((b) => {
                  const route = layout.routes[b.id];
                  if (!route) return null;
                  if (culling && visRect && !intersects(ptsBox(route), visRect)) return null;
                  const cables = bundleCables.get(b.id) ?? [];
                  const isExpanded = expandAll || filters.size > 0 || expanded.has(b.id) || (focus?.cables != null && focus.bundles.has(b.id));
                  const dimBundle = Boolean((focus && !focus.bundles.has(b.id)) || (filters.size && !cables.some(matches)));
                  return (
                    <BundleEdge
                      key={b.id}
                      bundle={b}
                      route={route}
                      cables={cables}
                      expanded={isExpanded}
                      dimBundle={dimBundle}
                      dimCable={(c) => Boolean((focus && (!focus.bundles.has(b.id) || (focus.cables && !focus.cables.has(c.id)))) || !matches(c))}
                      hot={(c) => Boolean(focus?.cables?.has(c.id))}
                      portLabels={detail}
                      onSelect={selectBundle}
                      onToggle={toggleBundle}
                      display={display}
                      names={[nodeById.get(b.a)?.name ?? b.a, nodeById.get(b.z)?.name ?? b.z]}
                    />
                  );
                })}
                {graph.nodes.map((n) => {
                  const box = layout.nodes[n.id];
                  if (!box) return null;
                  if (culling && visRect && !intersects(box, visRect)) return null;
                  const dim = Boolean((focus && !focus.nodes.has(n.id)) || (nodeMatches && !nodeMatches.has(n.id)));
                  return <NodeBox key={n.id} node={n} box={box} dim={dim} selected={selection?.kind === "node" && selection.id === n.id} detail={detail} onSelect={selectNode} />;
                })}
              </g>
            )}
          </svg>
          {layout && limit < graph.bundles.length && (
            <p className="absolute bottom-2 left-3 text-[11px] text-[var(--muted-fg)]" role="status">
              Drawing links {limit}/{graph.bundles.length}{"\u2026"}
            </p>
          )}
          <p className="pointer-events-none absolute bottom-2 right-3 hidden text-[10.5px] text-[var(--muted-fg)] sm:block">
            <Expand className="mr-1 inline h-3 w-3" aria-hidden />
            Drag to pan {"\u00b7"} wheel to zoom {"\u00b7"} click a device or link for details
          </p>
        </div>
        {(selNode || selBundle) && (
          <aside className={`w-full shrink-0 border-t border-[var(--border)] bg-[var(--muted)]/30 lg:w-[380px] lg:border-l lg:border-t-0 ${fullscreen ? "lg:h-full" : "h-[min(76vh,860px)] min-h-[480px]"}`}>
            {selNode?.members && (
              <GroupPanel
                node={selNode}
                members={selNode.members.map((id) => sourceNodeById.get(id)!).filter(Boolean)}
                onClose={() => setSelection(null)}
                onSelectDevice={revealDevice}
                onExpand={() => {
                  setGroupsOpen((g) => new Set(g).add(selNode.id));
                  setSelection(null);
                }}
              />
            )}
            {selNode && !selNode.members && (
              <DevicePanel
                node={selNode}
                cables={selNode.cableIds.map((id) => cableById.get(id)!).filter(Boolean)}
                base={base}
                onClose={() => setSelection(null)}
                onSelectDevice={(id) => {
                  if (sourceNodeById.has(id)) revealDevice(id);
                }}
              />
            )}
            {selBundle && <BundlePanel bundle={selBundle} cables={bundleCables.get(selBundle.id) ?? []} base={base} onClose={() => setSelection(null)} nameOf={(id) => nodeById.get(id)?.name ?? id} />}
          </aside>
        )}
      </div>
    </div>
  );
}
