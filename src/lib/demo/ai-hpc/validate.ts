import type { CableSpec, DeviceSpec, FabricCode, Role, Topology } from "@/lib/demo/ai-hpc/topology";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

/** Roles allowed at either end of a cable, per fabric. FE and BE switches never meet. */
const FABRIC_ROLES: Record<FabricCode, Role[]> = {
  FE: ["fe-spine", "fe-leaf", "border-leaf", "gpu", "cpu", "controller"],
  STORAGE: ["fe-leaf", "storage"],
  BE: ["be-spine", "be-leaf", "gpu"],
  EXT: ["router", "firewall", "border-leaf", "demarc"],
  PATCH: ["panel"],
  OOB: [
    "oob", "console", "jump", "nms", "router", "firewall", "fe-spine", "fe-leaf", "border-leaf", "be-spine", "be-leaf",
    "gpu", "cpu", "controller", "storage",
  ],
};

const gbps = (s: string | null) => {
  const m = s?.match(/^(\d+(?:\.\d+)?)G$/i);
  return m ? Number(m[1]) : null;
};

export type ValidationIssue = { code: string; message: string };

export function validateTopology(t: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const racks = new Map(t.racks.map((r) => [r.name, r]));
  const devices = new Map<string, DeviceSpec>();

  for (const d of t.devices) {
    if (devices.has(normalizeDevice(d.name))) issues.push({ code: "device.duplicate", message: `Duplicate device ${d.name}` });
    devices.set(normalizeDevice(d.name), d);
    const rack = racks.get(d.rack);
    if (!rack) {
      issues.push({ code: "device.rack", message: `${d.name} is in unknown rack ${d.rack}` });
      continue;
    }
    if (d.rackUnit < 1 || d.rackUnit + d.uHeight - 1 > rack.heightU) {
      issues.push({ code: "rack.bounds", message: `${d.name} U${d.rackUnit}+${d.uHeight} exceeds ${rack.heightU}U rack ${d.rack}` });
    }
    const seen = new Set<string>();
    for (const p of d.ports) {
      const k = normalizePort(p.name);
      if (seen.has(k)) issues.push({ code: "port.duplicate", message: `${d.name} declares ${p.name} twice` });
      seen.add(k);
    }
  }

  for (const r of t.racks) {
    const units = new Map<number, string>();
    for (const d of t.devices.filter((x) => x.rack === r.name)) {
      for (let u = d.rackUnit; u < d.rackUnit + d.uHeight; u++) {
        const other = units.get(u);
        if (other) issues.push({ code: "rack.overlap", message: `${r.name} U${u}: ${d.name} overlaps ${other}` });
        units.set(u, d.name);
      }
    }
  }

  const ids = new Set<string>();
  const used = new Map<string, string>();
  for (const c of t.cables) {
    if (ids.has(c.cableId)) issues.push({ code: "cable.duplicate", message: `Duplicate cable ID ${c.cableId}` });
    ids.add(c.cableId);
    for (const [side, ep] of [["A", c.a], ["Z", c.z]] as const) {
      const dev = devices.get(normalizeDevice(ep.device));
      if (!dev) {
        issues.push({ code: "endpoint.device", message: `${c.cableId} ${side}: unknown device ${ep.device}` });
        continue;
      }
      if (dev.rack !== ep.rack) issues.push({ code: "endpoint.rack", message: `${c.cableId} ${side}: ${ep.device} is in ${dev.rack}, not ${ep.rack}` });
      const port = dev.ports.find((p) => normalizePort(p.name) === normalizePort(ep.port));
      if (!port) {
        issues.push({ code: "endpoint.port", message: `${c.cableId} ${side}: ${ep.device} has no port ${ep.port}` });
      } else {
        const cable = gbps(c.speed);
        const cap = gbps(port.speed);
        if (cable && cap && cable > cap) issues.push({ code: "endpoint.speed", message: `${c.cableId} ${side}: ${c.speed} exceeds ${ep.device} ${ep.port} (${port.speed})` });
      }
      const key = `${normalizeDevice(ep.device)}|${normalizePort(ep.port)}`;
      const prev = used.get(key);
      if (prev) issues.push({ code: "port.reuse", message: `${ep.device} ${ep.port} used by ${prev} and ${c.cableId}` });
      used.set(key, c.cableId);
      if (!FABRIC_ROLES[c.fabric].includes(dev.role)) {
        issues.push({ code: "fabric.role", message: `${c.cableId} (${c.fabric}) touches ${dev.role} ${ep.device}` });
      }
    }
  }

  // FE and BE switching never connect to each other.
  const feSwitch = new Set<Role>(["fe-spine", "fe-leaf", "border-leaf"]);
  const beSwitch = new Set<Role>(["be-spine", "be-leaf"]);
  for (const c of t.cables) {
    const a = devices.get(normalizeDevice(c.a.device))?.role;
    const z = devices.get(normalizeDevice(c.z.device))?.role;
    if (!a || !z) continue;
    if ((feSwitch.has(a) && beSwitch.has(z)) || (beSwitch.has(a) && feSwitch.has(z))) {
      issues.push({ code: "fabric.bridge", message: `${c.cableId} bridges FE and BE switching` });
    }
  }
  return issues;
}

export function cablesByFabric(cables: CableSpec[]) {
  const out: Record<string, number> = {};
  for (const c of cables) out[c.fabric] = (out[c.fabric] ?? 0) + 1;
  return out;
}
