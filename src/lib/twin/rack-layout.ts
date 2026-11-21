/**
 * Schematic rack "twin" layout derived purely from active plan endpoints (Phase 17 CE).
 *
 * HONEST SCOPE: plan data carries rack + device names only. There is no rack-unit (U)
 * position, device height, or room geometry. Devices are stacked in deterministic
 * alphabetical "schematic slots" — this is NOT surveyed, measured, or LIDAR data.
 */

export type TwinLinkInput = {
  aRack: string;
  zRack: string;
  aDevice: string;
  zDevice: string;
  installStatus: "PLANNED" | "INSTALLED" | "BLOCKED" | null;
  retiredAt: Date | null;
};

export type TwinDeviceStatus = "installed" | "partial" | "blocked" | "planned";

export type TwinDevice = {
  device: string;
  /** 1-based schematic slot from the top of the rack (not a real rack unit). */
  slot: number;
  /** Plan endpoints terminating on this device. */
  portsUsed: number;
  installed: number;
  blocked: number;
  planned: number;
  status: TwinDeviceStatus;
};

export type TwinRack = {
  rack: string;
  devices: TwinDevice[];
  /** Links with at least one endpoint in this rack. */
  links: number;
};

export type RackConnection = {
  /** Sorted pair; equal values mean an intra-rack link. */
  racks: [string, string];
  links: number;
};

export type RackLayout = {
  racks: TwinRack[];
  connections: RackConnection[];
  totalDevices: number;
  activeLinks: number;
  retiredLinksSkipped: number;
};

function clean(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function statusOf(d: { portsUsed: number; installed: number; blocked: number }): TwinDeviceStatus {
  if (d.blocked > 0) return "blocked";
  if (d.portsUsed > 0 && d.installed === d.portsUsed) return "installed";
  if (d.installed > 0) return "partial";
  return "planned";
}

/**
 * Group devices by rack from active (non-retired) plan links.
 * Devices are keyed per rack by case-insensitive name; the first-seen spelling is displayed.
 */
export function buildRackLayout(links: TwinLinkInput[]): RackLayout {
  type Acc = { display: string; portsUsed: number; installed: number; blocked: number };
  const racks = new Map<string, { display: string; devices: Map<string, Acc>; links: number }>();
  const connections = new Map<string, RackConnection>();
  let activeLinks = 0;
  let retiredLinksSkipped = 0;

  for (const link of links) {
    if (link.retiredAt) {
      retiredLinksSkipped += 1;
      continue;
    }
    activeLinks += 1;
    const status = link.installStatus ?? "PLANNED";

    const ends = [
      { rack: clean(link.aRack), device: clean(link.aDevice) },
      { rack: clean(link.zRack), device: clean(link.zDevice) },
    ];

    for (const end of ends) {
      const rackKey = end.rack.toLowerCase();
      const rack =
        racks.get(rackKey) ?? { display: end.rack || "(no rack)", devices: new Map(), links: 0 };
      racks.set(rackKey, rack);

      const devKey = end.device.toLowerCase();
      const dev =
        rack.devices.get(devKey) ??
        { display: end.device || "(unnamed device)", portsUsed: 0, installed: 0, blocked: 0 };
      dev.portsUsed += 1;
      if (status === "INSTALLED") dev.installed += 1;
      if (status === "BLOCKED") dev.blocked += 1;
      rack.devices.set(devKey, dev);
    }

    const aKey = ends[0].rack.toLowerCase();
    const zKey = ends[1].rack.toLowerCase();
    for (const key of new Set([aKey, zKey])) racks.get(key)!.links += 1;

    const pair = [aKey, zKey].sort() as [string, string];
    const connKey = pair.join("\u0000");
    const existing = connections.get(connKey);
    if (existing) {
      existing.links += 1;
    } else {
      const names = pair.map((k) => racks.get(k)!.display) as [string, string];
      connections.set(connKey, { racks: names, links: 1 });
    }
  }

  const outRacks: TwinRack[] = Array.from(racks.values())
    .map((r) => {
      const devices = Array.from(r.devices.values())
        .sort((a, b) => a.display.localeCompare(b.display, undefined, { numeric: true }))
        .map<TwinDevice>((d, i) => ({
          device: d.display,
          slot: i + 1,
          portsUsed: d.portsUsed,
          installed: d.installed,
          blocked: d.blocked,
          planned: d.portsUsed - d.installed - d.blocked,
          status: statusOf(d),
        }));
      return { rack: r.display, devices, links: r.links };
    })
    .sort((a, b) => a.rack.localeCompare(b.rack, undefined, { numeric: true }));

  return {
    racks: outRacks,
    connections: Array.from(connections.values()).sort(
      (a, b) =>
        b.links - a.links ||
        a.racks.join("|").localeCompare(b.racks.join("|"), undefined, { numeric: true }),
    ),
    totalDevices: outRacks.reduce((n, r) => n + r.devices.length, 0),
    activeLinks,
    retiredLinksSkipped,
  };
}
