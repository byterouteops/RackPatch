import type { FabricDevice, FabricLink, LinkStatus } from "@/lib/fabric/load";

/**
 * Deterministic spine/leaf cable plans of a given device count, for topology scale tests only.
 * Used by the Node layout tests and by the SIT seed (which imports them through the real CSV + publish path).
 */
export type ScaleDevice = { name: string; rack: string; role: string };
export type ScaleCable = {
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  fabric: "FE" | "STORAGE";
  speed: string;
  cableType: string;
};
export type ScalePlan = { devices: ScaleDevice[]; cables: ScaleCable[]; states: Record<string, LinkStatus> };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Stable pseudo-random status per cable id (no Math.random, so every run is identical). */
function stateFor(id: string): LinkStatus {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  if (r < 0.03) return "MISMATCH";
  if (r < 0.07) return "NEEDS_REVIEW";
  if (r < 0.17) return "AWAITING";
  if (r < 0.22) return "VERIFIED_PHYSICAL";
  return "VERIFIED_LLDP";
}

export function scalePlan(total: number): ScalePlan {
  const spines = Math.max(2, Math.round(total / 60));
  const leaves = Math.max(2, 2 * Math.ceil((total - 4 - spines) / 34));
  const hosts = total - 4 - spines - leaves;
  if (hosts < 2) throw new Error(`too few devices: ${total}`);
  const devices: ScaleDevice[] = [];
  const cables: ScaleCable[] = [];
  const port = new Map<string, number>();
  const next = (d: string, prefix: string) => {
    const n = (port.get(d) ?? 0) + 1;
    port.set(d, n);
    return `${prefix}${n}`;
  };
  const rackOf = new Map<string, string>();
  const add = (name: string, rack: string, role: string) => {
    devices.push({ name, rack, role });
    rackOf.set(name, rack);
  };
  const cable = (a: string, z: string, fabric: "FE" | "STORAGE", speed: string, cableType: string, zPrefix = "Ethernet1/") => {
    const cableId = `SCL-${pad(cables.length + 1, 5)}`;
    cables.push({ cableId, aRack: rackOf.get(a)!, aDevice: a, aPort: next(a, a.includes("SRV") || a.includes("GPU") || a.includes("STO") ? "eth" : "Ethernet1/"), zRack: rackOf.get(z)!, zDevice: z, zPort: next(z, zPrefix), fabric, speed, cableType });
  };

  for (let i = 1; i <= 2; i++) add(`SCL-RTR-${pad(i)}`, "NET1", "router");
  for (let i = 1; i <= spines; i++) add(`SCL-SPINE-${pad(i)}`, "NET1", "fe-spine");
  for (let i = 1; i <= 2; i++) add(`SCL-BL-${pad(i)}`, "NET1", "border-leaf");
  const pairs = leaves / 2;
  for (let p = 0; p < pairs; p++) for (const s of ["A", "B"]) add(`SCL-LEAF-${pad(p + 1)}${s}`, `R${pad(p + 1)}`, "fe-leaf");
  const hostNames: string[] = [];
  for (let h = 0; h < hosts; h++) {
    const p = h % pairs;
    const kind = h % 10 === 9 ? "storage" : h % 10 >= 6 ? "cpu" : "gpu";
    const name = `SCL-${kind === "gpu" ? "GPU" : kind === "cpu" ? "SRV" : "STO"}-${pad(h + 1, 3)}`;
    add(name, `R${pad(p + 1)}`, kind);
    hostNames.push(name);
  }

  for (const r of ["SCL-RTR-01", "SCL-RTR-02"]) for (const b of ["SCL-BL-01", "SCL-BL-02"]) cable(b, r, "FE", "100G", "100G AOC", "et-0/0/");
  for (let s = 1; s <= spines; s++) {
    const spine = `SCL-SPINE-${pad(s)}`;
    for (const b of ["SCL-BL-01", "SCL-BL-02"]) for (let k = 0; k < 2; k++) cable(b, spine, "FE", "400G", "400G AOC");
    for (let p = 0; p < pairs; p++) for (const side of ["A", "B"]) for (let k = 0; k < 2; k++) cable(`SCL-LEAF-${pad(p + 1)}${side}`, spine, "FE", "400G", "400G AOC");
  }
  hostNames.forEach((h, i) => {
    const p = i % pairs;
    const fabric = h.includes("STO") ? "STORAGE" : "FE";
    for (const side of ["A", "B"]) cable(h, `SCL-LEAF-${pad(p + 1)}${side}`, fabric, "100G", "100G DAC");
  });

  const states = Object.fromEntries(cables.map((c) => [c.cableId, stateFor(c.cableId)]));
  return { devices, cables, states };
}

/** The plan shaped like `loadFabric()` output, for the pure graph + layout tests. */
export function scaleFabric(plan: ScalePlan): { devices: FabricDevice[]; links: FabricLink[] } {
  const links: FabricLink[] = plan.cables.map((c) => ({
    id: c.cableId, cableId: c.cableId, fabric: c.fabric, rail: null, speed: c.speed, media: null, lengthM: null,
    aRack: c.aRack, aDevice: c.aDevice, aPort: c.aPort, zRack: c.zRack, zDevice: c.zDevice, zPort: c.zPort,
    installStatus: "INSTALLED", state: plan.states[c.cableId], findingType: null, observedSummary: null, nextAction: null,
    observability: null, relatedCableId: null, cableType: c.cableType, expectedSummary: null, evidenceSource: null, captureTime: null,
    observedSides: null, physical: null,
  }));
  const devices: FabricDevice[] = plan.devices.map((d) => ({
    id: d.name, name: d.name, rack: d.rack, rackUnit: null, uHeight: null, role: d.role, vendor: null, model: null,
    attributes: null, portCount: 0, usedPorts: 0, status: "NONE", links: [],
  }));
  return { devices, links };
}

export function scaleCsv(plan: ScalePlan): string {
  const lines = ["cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port,cable_type,speed,fabric"];
  for (const c of plan.cables) lines.push([c.cableId, c.aRack, c.aDevice, c.aPort, c.zRack, c.zDevice, c.zPort, c.cableType, c.speed, c.fabric].join(","));
  return lines.join("\n");
}
