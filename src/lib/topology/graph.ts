import { STATUS_RANK, worst, type FabricDevice, type FabricLink, type LinkStatus } from "@/lib/fabric/load";

export type TopoViewKind = "full" | "fe" | "be" | "trace";

/** Status buckets used for counts, filters and the legend (NONE folds into AWAITING). */
export type StatusKey = "VERIFIED_LLDP" | "VERIFIED_PHYSICAL" | "AWAITING" | "NEEDS_REVIEW" | "MISMATCH";
export const STATUS_KEYS: StatusKey[] = ["VERIFIED_LLDP", "VERIFIED_PHYSICAL", "AWAITING", "NEEDS_REVIEW", "MISMATCH"];
export const statusKey = (s: LinkStatus): StatusKey => (s === "NONE" ? "AWAITING" : s);

export type Tier = "external" | "spine" | "leaf" | "hosts";
export const TIER_LABEL: Record<Tier, string> = { external: "External", spine: "Spine", leaf: "Leaf", hosts: "Hosts" };

type Placement = { tier: Tier; row: number; group: string; groupLabel: string };

/** Rows are ELK partitions: every device of a row lands on the same horizontal line. */
const ROLE_PLACEMENT: Record<string, Placement> = {
  demarc: { tier: "external", row: 0, group: "carrier", groupLabel: "Carrier handoff" },
  router: { tier: "external", row: 1, group: "edge", groupLabel: "Edge routers" },
  firewall: { tier: "external", row: 2, group: "security", groupLabel: "Firewalls" },
  "fe-spine": { tier: "spine", row: 3, group: "FE", groupLabel: "Front-end fabric" },
  "be-spine": { tier: "spine", row: 3, group: "BE", groupLabel: "Back-end fabric" },
  "border-leaf": { tier: "leaf", row: 4, group: "FE", groupLabel: "Front-end fabric" },
  "fe-leaf": { tier: "leaf", row: 4, group: "FE", groupLabel: "Front-end fabric" },
  "be-leaf": { tier: "leaf", row: 4, group: "BE", groupLabel: "Back-end fabric" },
  oob: { tier: "leaf", row: 4, group: "OOB", groupLabel: "Management (OOB)" },
  controller: { tier: "hosts", row: 5, group: "controller", groupLabel: "Controllers" },
  cpu: { tier: "hosts", row: 6, group: "cpu", groupLabel: "CPU servers" },
  gpu: { tier: "hosts", row: 7, group: "gpu", groupLabel: "GPU servers" },
  storage: { tier: "hosts", row: 8, group: "storage", groupLabel: "Storage" },
  console: { tier: "hosts", row: 9, group: "mgmt-hosts", groupLabel: "Management hosts" },
  jump: { tier: "hosts", row: 9, group: "mgmt-hosts", groupLabel: "Management hosts" },
  nms: { tier: "hosts", row: 9, group: "mgmt-hosts", groupLabel: "Management hosts" },
};

/** Devices without a known role are placed by name so customer plans still draw every cable. */
function placementFor(role: string | null, name: string): Placement {
  const known = role ? ROLE_PLACEMENT[role.toLowerCase()] : undefined;
  if (known) return known;
  const n = name.toLowerCase();
  if (/spine/.test(n)) return { tier: "spine", row: 3, group: "switches", groupLabel: "Switches" };
  if (/leaf|\btor\b|-tor|^tor/.test(n)) return { tier: "leaf", row: 4, group: "switches", groupLabel: "Switches" };
  if (/fw|firewall/.test(n)) return ROLE_PLACEMENT.firewall;
  if (/rtr|router/.test(n)) return ROLE_PLACEMENT.router;
  return { tier: "hosts", row: 10, group: "other", groupLabel: "Other devices" };
}

const VIEW_SCOPE: Record<Exclude<TopoViewKind, "trace">, { fabrics: (f: string | null) => boolean; roles: string[] | null; label: string }> = {
  full: { fabrics: (f) => f !== "OOB" && f !== "PATCH", roles: null, label: "Full topology" },
  fe: { fabrics: (f) => f === "FE" || f === "STORAGE", roles: ["fe-spine", "fe-leaf", "border-leaf", "controller", "cpu", "gpu", "storage"], label: "Front-end fabric" },
  be: { fabrics: (f) => f === "BE", roles: ["be-spine", "be-leaf", "gpu"], label: "Back-end fabric" },
};

const MGMT_IP_KEYS = ["mgmtIp", "managementIp", "mgmt_ip", "management_ip", "mgmtAddress"];
function mgmtIpOf(attributes: Record<string, unknown> | null): string | null {
  for (const src of [attributes, (attributes?.design as Record<string, unknown> | undefined) ?? null]) {
    if (!src) continue;
    for (const k of MGMT_IP_KEYS) if (typeof src[k] === "string" && src[k]) return src[k] as string;
  }
  return null;
}

export type TopoCable = {
  id: string;
  cableId: string;
  fabric: string | null;
  rail: string | null;
  a: string;
  aPort: string;
  z: string;
  zPort: string;
  cableType: string | null;
  speed: string | null;
  media: string | null;
  lengthM: number | null;
  installStatus: string | null;
  state: LinkStatus;
  findingType: string | null;
  expectedSummary: string | null;
  observedSummary: string | null;
  evidenceSource: string | null;
  captureTime: string | null;
  observedSides: string | null;
  observability: string | null;
  nextAction: string | null;
  relatedCableId: string | null;
  physical: FabricLink["physical"];
};

export type TopoNode = {
  id: string;
  /** Set on a collapsed host group: the device ids it stands for (each still has its own cables). */
  members?: string[];
  name: string;
  role: string | null;
  rack: string | null;
  rackUnit: number | null;
  vendor: string | null;
  model: string | null;
  mgmtIp: string | null;
  inInventory: boolean;
  tier: Tier;
  row: number;
  group: string;
  groupLabel: string;
  /** Per-status counts over this device's cables in the view (never inferred from one interface). */
  counts: Record<StatusKey, number>;
  status: LinkStatus;
  cableIds: string[];
};

/** Presentation group of all cables between one device pair; each cable stays addressable. */
export type TopoBundle = { id: string; a: string; z: string; cableIds: string[]; status: LinkStatus; sameRow: boolean };

export type TopoGroup = { id: string; label: string; kind: "fabric" | "hosts" | "external"; members: string[] };

export type TopoGraph = {
  view: TopoViewKind;
  label: string;
  nodes: TopoNode[];
  cables: TopoCable[];
  bundles: TopoBundle[];
  groups: TopoGroup[];
  /** Stable hash of devices, rows, groups and cable endpoints (not statuses): the layout cache key. */
  structureKey: string;
  /** In-scope cables that could not be drawn (should always be empty; surfaced, never hidden). */
  undrawn: string[];
  /** Device id -> drawn node id (differs only for devices inside a collapsed host group). */
  displayOf?: Record<string, string>;
};

export const LAYOUT_VERSION = 4;

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function buildTopologyGraph(input: {
  view: TopoViewKind;
  devices: FabricDevice[];
  links: FabricLink[];
  /** Trace only: cables on the traced path (always drawn, even off the data fabrics). */
  traceCableIds?: string[];
}): TopoGraph {
  const { view } = input;
  const traceIds = new Set(input.traceCableIds ?? []);
  const scope = VIEW_SCOPE[view === "trace" ? "full" : view];
  const inv = new Map(input.devices.map((d) => [d.name.toLowerCase(), d]));
  const roleOf = (name: string) => inv.get(name.toLowerCase())?.role ?? null;
  /** Devices with no role are kept (placed by name) so plans without roles still draw every cable. */
  const roleAllowed = (name: string) => {
    if (!scope.roles) return true;
    const r = roleOf(name);
    return r === null || scope.roles.includes(r);
  };

  const scoped = input.links.filter((l) => traceIds.has(l.id) || (scope.fabrics(l.fabric) && roleAllowed(l.aDevice) && roleAllowed(l.zDevice)));

  const nodes = new Map<string, TopoNode>();
  const nodeFor = (name: string) => {
    const key = name.toLowerCase();
    let n = nodes.get(key);
    if (!n) {
      const d = inv.get(key);
      const p = placementFor(d?.role ?? null, d?.name ?? name);
      n = {
        id: d?.name ?? name,
        name: d?.name ?? name,
        role: d?.role ?? null,
        rack: d?.rack ?? null,
        rackUnit: d?.rackUnit ?? null,
        vendor: d?.vendor ?? null,
        model: d?.model ?? null,
        mgmtIp: mgmtIpOf(d?.attributes ?? null),
        inInventory: Boolean(d),
        ...p,
        counts: { VERIFIED_LLDP: 0, VERIFIED_PHYSICAL: 0, AWAITING: 0, NEEDS_REVIEW: 0, MISMATCH: 0 },
        status: "NONE",
        cableIds: [],
      };
      nodes.set(key, n);
    }
    return n;
  };

  // BE view groups GPU servers by rack (rail-aligned cabling lands per rack).
  const cables: TopoCable[] = [];
  const bundles = new Map<string, TopoBundle>();
  const undrawn: string[] = [];
  for (const l of scoped) {
    if (l.aDevice.toLowerCase() === l.zDevice.toLowerCase()) {
      undrawn.push(l.cableId);
      continue;
    }
    const a = nodeFor(l.aDevice);
    const z = nodeFor(l.zDevice);
    cables.push({
      id: l.id, cableId: l.cableId, fabric: l.fabric, rail: l.rail, a: a.id, aPort: l.aPort, z: z.id, zPort: l.zPort,
      cableType: l.cableType, speed: l.speed, media: l.media, lengthM: l.lengthM, installStatus: l.installStatus, state: l.state,
      findingType: l.findingType, expectedSummary: l.expectedSummary, observedSummary: l.observedSummary, evidenceSource: l.evidenceSource,
      captureTime: l.captureTime, observedSides: l.observedSides, observability: l.observability, nextAction: l.nextAction,
      relatedCableId: l.relatedCableId, physical: l.physical,
    });
    for (const n of [a, z]) {
      n.counts[statusKey(l.state)]++;
      n.status = n.cableIds.length === 0 ? l.state : worst(n.status, l.state);
      n.cableIds.push(l.id);
    }
    const [up, down] = a.row < z.row || (a.row === z.row && byName(a.id, z.id) <= 0) ? [a, z] : [z, a];
    const key = `${up.id}|${down.id}`;
    const b = bundles.get(key) ?? { id: key, a: up.id, z: down.id, cableIds: [], status: l.state, sameRow: up.row === down.row };
    b.cableIds.push(l.id);
    b.status = b.cableIds.length === 1 ? l.state : worst(b.status, l.state);
    bundles.set(key, b);
  }

  if (view === "be") {
    for (const n of nodes.values()) {
      if (n.role === "gpu") {
        n.group = `gpu-rack-${n.rack ?? "unplaced"}`;
        n.groupLabel = n.rack ? `GPU servers · rack ${n.rack}` : "GPU servers · unplaced";
      }
    }
  }

  const nodeList = [...nodes.values()].sort((x, y) => x.row - y.row || x.group.localeCompare(y.group) || byName(x.name, y.name));
  const groupMap = new Map<string, TopoGroup>();
  for (const n of nodeList) {
    const g = groupMap.get(n.group) ?? { id: n.group, label: n.groupLabel, kind: n.tier === "hosts" ? "hosts" : n.tier === "external" ? "external" : "fabric", members: [] };
    g.members.push(n.id);
    groupMap.set(n.group, g);
  }
  const bundleList = [...bundles.values()].sort((x, y) => byName(x.id, y.id));
  const label = new Map(cables.map((c) => [c.id, c.cableId]));
  for (const b of bundleList) b.cableIds.sort((x, y) => byName(label.get(x) ?? x, label.get(y) ?? y));

  const canon = [
    `v${LAYOUT_VERSION}`,
    view,
    ...nodeList.map((n) => `${n.id}@${n.row}:${n.group}`),
    ...bundleList.map((b) => `${b.id}#${b.cableIds.length}`),
  ].join("\n");

  return {
    view,
    label: view === "trace" ? "Path trace" : scope.label,
    nodes: nodeList,
    cables: cables.sort((x, y) => byName(x.cableId, y.cableId)),
    bundles: bundleList,
    groups: [...groupMap.values()],
    structureKey: `${view}-${fnv1a(canon)}`,
    undrawn,
  };
}

/** Views above this many devices start with same-class hosts of a rack collapsed into one group node. */
export const CLUSTER_AT = 40;
const MIN_CLUSTER = 3;

export const clusterIdOf = (group: string, rack: string | null) => `cluster:${group}@${rack ?? "-"}`;

/** Host groups that `clusterGraph` would collapse (empty for small views). */
export function clusterCandidates(graph: TopoGraph): Map<string, TopoNode[]> {
  const out = new Map<string, TopoNode[]>();
  if (graph.nodes.length <= CLUSTER_AT) return out;
  for (const n of graph.nodes) {
    if (n.tier !== "hosts") continue;
    const id = clusterIdOf(n.group, n.rack);
    out.set(id, [...(out.get(id) ?? []), n]);
  }
  // Cables between two members would become self-loops: keep those devices individual.
  const memberOf = new Map<string, string>();
  for (const [id, ms] of out) for (const m of ms) memberOf.set(m.id, id);
  for (const c of graph.cables) {
    const g = memberOf.get(c.a);
    if (g && g === memberOf.get(c.z)) out.set(g, (out.get(g) ?? []).filter((m) => m.id !== c.a && m.id !== c.z));
  }
  for (const [id, ms] of out) if (ms.length < MIN_CLUSTER) out.delete(id);
  return out;
}

/**
 * Presentation only: replaces each collapsed host group with one node and re-bundles its cables per peer.
 * Cables are never removed or merged across device pairs' identities: every cable keeps its own record and
 * stays in exactly one bundle, and `checkGraphIntegrity` validates the result like any other graph.
 */
export function clusterGraph(graph: TopoGraph, expanded: ReadonlySet<string>): TopoGraph {
  const candidates = clusterCandidates(graph);
  const collapse = [...candidates].filter(([id]) => !expanded.has(id));
  if (!collapse.length) return graph;
  const displayOf: Record<string, string> = Object.fromEntries(graph.nodes.map((n) => [n.id, n.id]));
  const clusterNodes: TopoNode[] = [];
  const byId = new Map(graph.cables.map((c) => [c.id, c]));
  for (const [id, ms] of collapse) {
    const first = ms[0];
    const counts: Record<StatusKey, number> = { VERIFIED_LLDP: 0, VERIFIED_PHYSICAL: 0, AWAITING: 0, NEEDS_REVIEW: 0, MISMATCH: 0 };
    const cableIds = new Set<string>();
    for (const m of ms) {
      displayOf[m.id] = id;
      for (const c of m.cableIds) cableIds.add(c);
    }
    let status: LinkStatus = "NONE";
    for (const cid of cableIds) {
      const s = byId.get(cid)!.state;
      counts[statusKey(s)]++;
      status = status === "NONE" ? s : worst(status, s);
    }
    clusterNodes.push({
      ...first,
      id,
      name: `${first.groupLabel}${first.rack ? ` \u00b7 ${first.rack}` : ""}`,
      members: ms.map((m) => m.id),
      role: first.role,
      rackUnit: null,
      vendor: null,
      model: null,
      mgmtIp: null,
      inInventory: ms.every((m) => m.inInventory),
      counts,
      status,
      cableIds: [...cableIds],
    });
  }
  const hidden = new Set(collapse.flatMap(([, ms]) => ms.map((m) => m.id)));
  const nodes = [...graph.nodes.filter((n) => !hidden.has(n.id)), ...clusterNodes].sort(
    (x, y) => x.row - y.row || x.group.localeCompare(y.group) || byName(x.name, y.name),
  );
  const rowOf = new Map(nodes.map((n) => [n.id, n.row]));
  const bundles = new Map<string, TopoBundle>();
  for (const c of graph.cables) {
    const a = displayOf[c.a];
    const z = displayOf[c.z];
    const [up, down] = rowOf.get(a)! < rowOf.get(z)! || (rowOf.get(a) === rowOf.get(z) && byName(a, z) <= 0) ? [a, z] : [z, a];
    const key = `${up}|${down}`;
    const b = bundles.get(key) ?? { id: key, a: up, z: down, cableIds: [], status: c.state, sameRow: rowOf.get(up) === rowOf.get(down) };
    b.cableIds.push(c.id);
    b.status = b.cableIds.length === 1 ? c.state : worst(b.status, c.state);
    bundles.set(key, b);
  }
  const groups = new Map<string, TopoGroup>();
  for (const n of nodes) {
    const g = groups.get(n.group) ?? { id: n.group, label: n.groupLabel, kind: n.tier === "hosts" ? "hosts" : n.tier === "external" ? "external" : "fabric", members: [] };
    g.members.push(n.id);
    groups.set(n.group, g);
  }
  const bundleList = [...bundles.values()].sort((x, y) => byName(x.id, y.id));
  const canon = [graph.structureKey, ...collapse.map(([id]) => id).sort()].join("\n");
  return {
    ...graph,
    nodes,
    bundles: bundleList,
    groups: [...groups.values()],
    structureKey: `${graph.view}-${fnv1a(canon)}`,
    displayOf,
  };
}

/** Throws if the drawn graph does not represent every in-scope cable exactly once. */
export function checkGraphIntegrity(graph: TopoGraph, expectedCableIds: string[]): string[] {
  const problems: string[] = [];
  const drawn = graph.bundles.flatMap((b) => b.cableIds);
  const seen = new Set<string>();
  for (const id of drawn) {
    if (seen.has(id)) problems.push(`cable ${id} drawn twice`);
    seen.add(id);
  }
  const expected = new Set(expectedCableIds);
  for (const id of expected) if (!seen.has(id)) problems.push(`cable ${id} missing`);
  for (const id of seen) if (!expected.has(id)) problems.push(`cable ${id} not in source data`);
  const byId = new Map(graph.cables.map((c) => [c.id, c]));
  for (const b of graph.bundles) {
    for (const id of b.cableIds) {
      const c = byId.get(id);
      if (!c) {
        problems.push(`bundle ${b.id} references unknown cable ${id}`);
        continue;
      }
      const show = (d: string) => graph.displayOf?.[d] ?? d;
      const ends = [show(c.a), show(c.z)].sort().join("|");
      if (ends !== [b.a, b.z].sort().join("|")) problems.push(`cable ${c.cableId} merged into wrong bundle ${b.id}`);
    }
    const w = b.cableIds.map((id) => byId.get(id)?.state ?? "NONE").reduce<LinkStatus>((acc, s, i) => (i === 0 ? s : worst(acc, s)), "NONE");
    if (STATUS_RANK[w] !== STATUS_RANK[b.status]) problems.push(`bundle ${b.id} status ${b.status} != worst ${w}`);
  }
  for (const n of graph.nodes) {
    const total = Object.values(n.counts).reduce((s, v) => s + v, 0);
    if (total !== n.cableIds.length) problems.push(`device ${n.name} counts ${total} != cables ${n.cableIds.length}`);
  }
  return problems;
}
