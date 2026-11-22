import { cache } from "react";
import type { VerificationState } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LinkStatus = VerificationState | "NONE";

export const STATUS_RANK: Record<LinkStatus, number> = {
  MISMATCH: 5,
  NEEDS_REVIEW: 4,
  AWAITING: 3,
  NONE: 2,
  VERIFIED_PHYSICAL: 1,
  VERIFIED_LLDP: 0,
};

export const STATUS_STYLE: Record<LinkStatus, { label: string; fill: string; stroke: string; text: string }> = {
  VERIFIED_LLDP: { label: "Verified (LLDP)", fill: "#dcfce7", stroke: "#16a34a", text: "#166534" },
  VERIFIED_PHYSICAL: { label: "Verified (physical)", fill: "#d1fae5", stroke: "#059669", text: "#065f46" },
  AWAITING: { label: "Awaiting evidence", fill: "#f1f5f9", stroke: "#94a3b8", text: "#334155" },
  NEEDS_REVIEW: { label: "Needs review", fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  MISMATCH: { label: "Mismatch", fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" },
  NONE: { label: "No cables", fill: "#f8fafc", stroke: "#cbd5e1", text: "#64748b" },
};

export function worst(a: LinkStatus, b: LinkStatus): LinkStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export type FabricLink = {
  id: string;
  cableId: string;
  fabric: string | null;
  rail: string | null;
  speed: string | null;
  media: string | null;
  lengthM: number | null;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  installStatus: string | null;
  state: LinkStatus;
  findingType: string | null;
  observedSummary: string | null;
  nextAction: string | null;
  observability: string | null;
  relatedCableId: string | null;
  cableType: string | null;
  expectedSummary: string | null;
  evidenceSource: string | null;
  captureTime: string | null;
  observedSides: string | null;
  /** Latest independent physical check on this revision, if any. */
  physical: { verifiedAt: string; aConfirmed: boolean; zConfirmed: boolean; note: string | null } | null;
};

export type FabricDevice = {
  id: string;
  name: string;
  rack: string | null;
  rackUnit: number | null;
  uHeight: number | null;
  role: string | null;
  vendor: string | null;
  model: string | null;
  attributes: Record<string, unknown> | null;
  portCount: number;
  usedPorts: number;
  status: LinkStatus;
  links: FabricLink[];
};

export type FabricData = {
  racks: Array<{ name: string; heightU: number; purpose: string | null; position: number | null }>;
  devices: FabricDevice[];
  links: FabricLink[];
  byDevice: Map<string, FabricDevice>;
};

/** Racks, placed devices and planned links with their current verification state (per request). */
export const loadFabric = cache(async (projectId: string, revisionId: string | null): Promise<FabricData> => {
  const [racks, devices, links] = await Promise.all([
    prisma.rack.findMany({ where: { projectId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { name: true, heightU: true, purpose: true, position: true } }),
    prisma.deviceInventory.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, rack: true, rackUnit: true, uHeight: true, role: true, vendor: true, model: true, attributes: true,
        _count: { select: { ports: true } },
        ports: { where: { status: "USED" }, select: { id: true } },
      },
    }),
    revisionId
      ? prisma.plannedLink.findMany({
          where: { revisionId },
          orderBy: { cableId: "asc" },
          select: {
            id: true, cableId: true, fabric: true, rail: true, speed: true, media: true, lengthM: true, cableType: true,
            aRack: true, aDevice: true, aPort: true, zRack: true, zDevice: true, zPort: true,
            runtime: { select: { installStatus: true } },
            findings: {
              where: { revisionId },
              take: 1,
              select: {
                state: true, findingType: true, observedSummary: true, nextAction: true, observability: true, relatedCableId: true,
                expectedSummary: true, evidenceSource: true, captureTime: true, observedSides: true,
              },
            },
            physicalChecks: {
              where: { revisionId },
              orderBy: { verifiedAt: "desc" },
              take: 1,
              select: { verifiedAt: true, aConfirmed: true, zConfirmed: true, note: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const flat: FabricLink[] = links.map((l) => {
    const f = l.findings[0];
    const pv = l.physicalChecks[0];
    return {
      id: l.id, cableId: l.cableId, fabric: l.fabric, rail: l.rail, speed: l.speed, media: l.media, lengthM: l.lengthM,
      aRack: l.aRack, aDevice: l.aDevice, aPort: l.aPort, zRack: l.zRack, zDevice: l.zDevice, zPort: l.zPort,
      installStatus: l.runtime?.installStatus ?? null,
      state: f?.state ?? "NONE",
      findingType: f?.findingType ?? null,
      observedSummary: f?.observedSummary ?? null,
      nextAction: f?.nextAction ?? null,
      observability: f?.observability ?? null,
      relatedCableId: f?.relatedCableId ?? null,
      cableType: l.cableType,
      expectedSummary: f?.expectedSummary ?? null,
      evidenceSource: f?.evidenceSource ?? null,
      captureTime: f?.captureTime?.toISOString() ?? null,
      observedSides: f?.observedSides ?? null,
      physical: pv ? { verifiedAt: pv.verifiedAt.toISOString(), aConfirmed: pv.aConfirmed, zConfirmed: pv.zConfirmed, note: pv.note } : null,
    };
  });

  const byName = new Map<string, FabricDevice>();
  for (const d of devices) {
    byName.set(d.name.toLowerCase(), {
      id: d.id, name: d.name, rack: d.rack, rackUnit: d.rackUnit, uHeight: d.uHeight, role: d.role, vendor: d.vendor, model: d.model,
      attributes: (d.attributes as Record<string, unknown> | null) ?? null,
      portCount: d._count.ports, usedPorts: d.ports.length, status: "NONE", links: [],
    });
  }
  for (const l of flat) {
    for (const name of [l.aDevice, l.zDevice]) {
      const d = byName.get(name.toLowerCase());
      if (!d) continue;
      d.links.push(l);
      d.status = d.status === "NONE" ? l.state : worst(d.status, l.state);
    }
  }
  return { racks, devices: [...byName.values()], links: flat, byDevice: byName };
});

export function peerOf(l: FabricLink, device: string) {
  const isA = l.aDevice.toLowerCase() === device.toLowerCase();
  return isA ? { port: l.aPort, peer: l.zDevice, peerPort: l.zPort, peerRack: l.zRack } : { port: l.zPort, peer: l.aDevice, peerPort: l.aPort, peerRack: l.aRack };
}

/**
 * Shortest device path over planned cables (BFS); returns the cables in order.
 * "data" never uses management (OOB) cables except a direct device-to-device hop;
 * "oob" uses only OOB cables, i.e. the management network path.
 */
export function tracePath(links: FabricLink[], from: string, to: string, network: "data" | "oob" = "data"): FabricLink[] | null {
  const src = from.toLowerCase();
  const dst = to.toLowerCase();
  if (src === dst) return [];
  const adj = new Map<string, FabricLink[]>();
  for (const l of links) {
    const oob = l.fabric === "OOB";
    if (network === "oob" ? !oob : oob && !isDirect(l, src, dst)) continue;
    for (const d of [l.aDevice.toLowerCase(), l.zDevice.toLowerCase()]) {
      const list = adj.get(d) ?? [];
      list.push(l);
      adj.set(d, list);
    }
  }
  const prev = new Map<string, { node: string; link: FabricLink }>();
  const seen = new Set([src]);
  const queue = [src];
  while (queue.length) {
    const node = queue.shift()!;
    for (const l of adj.get(node) ?? []) {
      const next = l.aDevice.toLowerCase() === node ? l.zDevice.toLowerCase() : l.aDevice.toLowerCase();
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node, link: l });
      if (next === dst) {
        const path: FabricLink[] = [];
        let cur = dst;
        while (cur !== src) {
          const p = prev.get(cur)!;
          path.unshift(p.link);
          cur = p.node;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function isDirect(l: FabricLink, a: string, b: string) {
  const x = l.aDevice.toLowerCase();
  const y = l.zDevice.toLowerCase();
  return (x === a && y === b) || (x === b && y === a);
}
