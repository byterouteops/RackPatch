import type { InstallStatus } from "@prisma/client";
import { normalizeCableType } from "@/lib/cable-type";

export type CapacityLinkInput = {
  aRack: string;
  zRack: string;
  aDevice: string;
  zDevice: string;
  aPort: string;
  zPort: string;
  cableType: string | null;
  installStatus: InstallStatus | null;
  retiredAt: Date | null;
};

export type CapacitySummary = {
  totalLinks: number;
  activeLinks: number;
  retiredLinks: number;
  byInstallStatus: Record<string, number>;
  byCableType: Array<{ type: string; count: number }>;
  byRack: Array<{ rack: string; links: number; installed: number }>;
  byDevice: Array<{ device: string; portsUsed: number; installed: number }>;
};

/**
 * Aggregate plan-link capacity from the active revision (Phase 12 CE).
 * Counts planned endpoints only — not a full port inventory.
 */
export function computeCapacitySummary(links: CapacityLinkInput[]): CapacitySummary {
  const byInstallStatus: Record<string, number> = {
    PLANNED: 0,
    INSTALLED: 0,
    BLOCKED: 0,
  };
  const typeMap = new Map<string, number>();
  const rackMap = new Map<string, { links: number; installed: number }>();
  const deviceMap = new Map<string, { portsUsed: number; installed: number }>();

  let retiredLinks = 0;

  for (const link of links) {
    const retired = !!link.retiredAt;
    if (retired) retiredLinks += 1;

    const status = link.installStatus ?? "PLANNED";
    byInstallStatus[status] = (byInstallStatus[status] ?? 0) + 1;

    const type = normalizeCableType(link.cableType) ?? "—";
    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);

    const installed = status === "INSTALLED" ? 1 : 0;

    for (const rack of new Set([link.aRack, link.zRack])) {
      const cur = rackMap.get(rack) ?? { links: 0, installed: 0 };
      cur.links += 1;
      cur.installed += installed;
      rackMap.set(rack, cur);
    }

    for (const [device, port] of [
      [link.aDevice, link.aPort],
      [link.zDevice, link.zPort],
    ] as const) {
      const key = `${device}`;
      const cur = deviceMap.get(key) ?? { portsUsed: 0, installed: 0 };
      cur.portsUsed += 1;
      cur.installed += installed;
      void port;
      deviceMap.set(key, cur);
    }
  }

  return {
    totalLinks: links.length,
    activeLinks: links.length - retiredLinks,
    retiredLinks,
    byInstallStatus,
    byCableType: Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    byRack: Array.from(rackMap.entries())
      .map(([rack, v]) => ({ rack, ...v }))
      .sort((a, b) => a.rack.localeCompare(b.rack)),
    byDevice: Array.from(deviceMap.entries())
      .map(([device, v]) => ({ device, ...v }))
      .sort((a, b) => b.portsUsed - a.portsUsed || a.device.localeCompare(b.device)),
  };
}
