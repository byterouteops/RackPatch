import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

/**
 * Pure port-inventory + impact helpers (Phase 12 CE).
 * Ports are derived from planned links only; no speeds/status are invented.
 */

export type InventoryLink = {
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  installStatus?: string | null;
  retiredAt?: Date | null;
};

export type DerivedPort = {
  deviceNorm: string;
  device: string;
  rack: string;
  portNorm: string;
  portLabel: string;
  cableId: string;
};

export type PortConflict = {
  deviceNorm: string;
  portNorm: string;
  cableIds: string[];
};

/** Collect every (device, port) endpoint from active (non-retired) links. */
export function derivePortsFromLinks(links: InventoryLink[]): {
  ports: DerivedPort[];
  conflicts: PortConflict[];
} {
  const byKey = new Map<string, DerivedPort>();
  const conflictMap = new Map<string, Set<string>>();

  const add = (cableId: string, rack: string, device: string, port: string) => {
    const deviceNorm = normalizeDevice(device);
    const portNorm = normalizePort(port);
    if (!deviceNorm || !portNorm) return;
    const key = `${deviceNorm}|${portNorm}`;
    const prev = byKey.get(key);
    if (prev) {
      if (prev.cableId !== cableId) {
        const set = conflictMap.get(key) ?? new Set([prev.cableId]);
        set.add(cableId);
        conflictMap.set(key, set);
      }
      return;
    }
    byKey.set(key, {
      deviceNorm,
      device: device.trim(),
      rack: rack.trim(),
      portNorm,
      portLabel: port.trim(),
      cableId,
    });
  };

  for (const l of links) {
    if (l.retiredAt) continue;
    add(l.cableId, l.aRack, l.aDevice, l.aPort);
    add(l.cableId, l.zRack, l.zDevice, l.zPort);
  }

  const ports = Array.from(byKey.values()).sort(
    (a, b) => a.deviceNorm.localeCompare(b.deviceNorm) || a.portNorm.localeCompare(b.portNorm),
  );
  const conflicts = Array.from(conflictMap.entries()).map(([key, set]) => {
    const [deviceNorm, portNorm] = key.split("|");
    return { deviceNorm, portNorm, cableIds: Array.from(set).sort() };
  });
  return { ports, conflicts };
}

export type ExistingPort = {
  deviceNorm: string;
  portNorm: string;
  status: "FREE" | "USED" | "RESERVED";
  plannedCableId: string | null;
};

export type PortSyncPlan = {
  /** Ports to upsert as USED (carries cable id). */
  markUsed: DerivedPort[];
  /** Previously plan-USED ports no longer in the plan -> FREE. */
  release: Array<{ deviceNorm: string; portNorm: string }>;
  /** RESERVED ports now occupied by the plan (reservation superseded by USED). */
  reservedConflicts: Array<{ deviceNorm: string; portNorm: string; cableId: string }>;
};

/**
 * Compute the changes to apply when syncing inventory from the active plan.
 * - Plan endpoints become USED.
 * - USED ports that came from an earlier sync (plannedCableId set) and are gone from the plan become FREE.
 * - Manually RESERVED ports not in the plan are untouched; RESERVED ports that the plan uses are reported.
 */
export function planPortSync(existing: ExistingPort[], derived: DerivedPort[]): PortSyncPlan {
  const derivedKeys = new Set(derived.map((d) => `${d.deviceNorm}|${d.portNorm}`));
  const existingByKey = new Map(existing.map((e) => [`${e.deviceNorm}|${e.portNorm}`, e]));

  const release: PortSyncPlan["release"] = [];
  for (const e of existing) {
    if (e.status === "USED" && e.plannedCableId && !derivedKeys.has(`${e.deviceNorm}|${e.portNorm}`)) {
      release.push({ deviceNorm: e.deviceNorm, portNorm: e.portNorm });
    }
  }

  const reservedConflicts: PortSyncPlan["reservedConflicts"] = [];
  for (const d of derived) {
    const e = existingByKey.get(`${d.deviceNorm}|${d.portNorm}`);
    if (e?.status === "RESERVED") {
      reservedConflicts.push({ deviceNorm: d.deviceNorm, portNorm: d.portNorm, cableId: d.cableId });
    }
  }

  return { markUsed: derived, release, reservedConflicts };
}

export type ImpactTarget = { device: string; port?: string | null };

export type AffectedLink = {
  cableId: string;
  /** Which end of the link matches the target. */
  role: "A" | "Z";
  localDevice: string;
  localPort: string;
  peerDevice: string;
  peerPort: string;
  peerRack: string;
  installStatus: string | null;
};

export type ImpactResult = {
  target: { device: string; port: string | null };
  affectedLinks: AffectedLink[];
  /** Distinct local ports touched (device-level target) or 1 for a port target with matches. */
  localPortsAffected: number;
  peerDevices: Array<{ device: string; links: number }>;
  byInstallStatus: Record<string, number>;
};

/**
 * Impact simulation: which planned links go down if a device (or a single port) fails/is removed.
 * Retired links are ignored. Pure; matching uses the same normalizers as plan import.
 */
export function calculateImpact(links: InventoryLink[], target: ImpactTarget): ImpactResult {
  const deviceNorm = normalizeDevice(target.device);
  const portRaw = target.port?.trim() ? target.port.trim() : null;
  const portNorm = portRaw ? normalizePort(portRaw) : null;

  const affected: AffectedLink[] = [];
  const localPorts = new Set<string>();

  for (const l of links) {
    if (l.retiredAt) continue;
    const aMatch =
      normalizeDevice(l.aDevice) === deviceNorm &&
      (portNorm === null || normalizePort(l.aPort) === portNorm);
    const zMatch =
      normalizeDevice(l.zDevice) === deviceNorm &&
      (portNorm === null || normalizePort(l.zPort) === portNorm);
    if (!aMatch && !zMatch) continue;

    const role: "A" | "Z" = aMatch ? "A" : "Z";
    const row: AffectedLink =
      role === "A"
        ? {
            cableId: l.cableId,
            role,
            localDevice: l.aDevice,
            localPort: l.aPort,
            peerDevice: l.zDevice,
            peerPort: l.zPort,
            peerRack: l.zRack,
            installStatus: l.installStatus ?? null,
          }
        : {
            cableId: l.cableId,
            role,
            localDevice: l.zDevice,
            localPort: l.zPort,
            peerDevice: l.aDevice,
            peerPort: l.aPort,
            peerRack: l.aRack,
            installStatus: l.installStatus ?? null,
          };
    affected.push(row);
    localPorts.add(normalizePort(row.localPort));
    if (aMatch && zMatch) localPorts.add(normalizePort(l.zPort));
  }

  affected.sort((a, b) => a.cableId.localeCompare(b.cableId));

  const peerMap = new Map<string, { device: string; links: number }>();
  const byInstallStatus: Record<string, number> = {};
  for (const a of affected) {
    const key = normalizeDevice(a.peerDevice);
    const p = peerMap.get(key) ?? { device: a.peerDevice, links: 0 };
    p.links += 1;
    peerMap.set(key, p);
    const status = a.installStatus ?? "UNKNOWN";
    byInstallStatus[status] = (byInstallStatus[status] ?? 0) + 1;
  }

  return {
    target: { device: target.device.trim(), port: portRaw },
    affectedLinks: affected,
    localPortsAffected: localPorts.size,
    peerDevices: Array.from(peerMap.values()).sort(
      (a, b) => b.links - a.links || a.device.localeCompare(b.device),
    ),
    byInstallStatus,
  };
}

export type PortStatusCounts = { FREE: number; USED: number; RESERVED: number; total: number };

export function countPortStatuses(ports: Array<{ status: "FREE" | "USED" | "RESERVED" }>): PortStatusCounts {
  const out: PortStatusCounts = { FREE: 0, USED: 0, RESERVED: 0, total: ports.length };
  for (const p of ports) out[p.status] += 1;
  return out;
}
