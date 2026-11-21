import { matchObservationsToPlan, type LinkMatchResult, type ObservedNeighbor, type PlannedEndpoint } from "@/lib/verify/match";
import { evaluateLink, type Outcome } from "@/lib/verify/evaluate";
import { classifyObservability, readDiscoveryProfile, type DiscoveryProfile } from "@/lib/verify/observability";

export type ComputeLink = PlannedEndpoint & { speed: string | null; media: string | null };

export type ComputeImport = {
  sourceDevice: string;
  sourceDeviceNorm: string;
  captureTime: Date | null;
  uploadedAt: Date;
  parseFailed: boolean;
  kind: string;
  synthetic: boolean;
  observations: Array<{
    localInterface: string;
    localInterfaceNorm: string;
    remoteSystemName: string | null;
    remoteSystemNorm: string | null;
    remotePortId: string | null;
    remotePortNorm: string | null;
  }>;
  interfaceStates: Array<{ portNorm: string; operState: string; speed: string | null }>;
};

export type ComputeInput = {
  links: ComputeLink[];
  aliases: Array<{ aliasNorm: string; deviceNorm: string }>;
  portAliases: Array<{ deviceNorm: string; aliasNorm: string; portNorm: string }>;
  devices: Array<{ nameNorm: string; role: string | null; attributes: unknown }>;
  /** Newest first. */
  imports: ComputeImport[];
  maxEvidenceAgeDays: number | null;
  /** Reference "now"; null = newest successful capture (deterministic playback). */
  now: Date | null;
};

export type ComputedLink = {
  cableId: string;
  match: LinkMatchResult;
  observability: ReturnType<typeof classifyObservability>;
  outcome: Outcome;
};

/**
 * Pure evidence → outcome pipeline (no DB): latest successful import per (device, kind),
 * alias resolution, directional matching, observability and outcome precedence.
 */
export function computeOutcomes(input: ComputeInput): { links: ComputedLink[]; neighborDevices: string[] } {
  const aliasMap = new Map(input.aliases.map((a) => [a.aliasNorm, a.deviceNorm]));
  const portAliasMap = new Map(input.portAliases.map((p) => [`${p.deviceNorm}|${p.aliasNorm}`, p.portNorm]));

  const knownDevices = new Set<string>();
  for (const l of input.links) {
    knownDevices.add(l.aDeviceNorm);
    knownDevices.add(l.zDeviceNorm);
  }
  for (const d of input.devices) knownDevices.add(d.nameNorm);
  for (const a of input.aliases) knownDevices.add(a.deviceNorm);

  const profiles = new Map<string, DiscoveryProfile>(input.devices.map((d) => [d.nameNorm, readDiscoveryProfile(d.role, d.attributes)]));

  const seenNeighbor = new Set<string>();
  const seenState = new Set<string>();
  const failedOnly = new Set<string>();
  const observations: ObservedNeighbor[] = [];
  const ifState = new Map<string, { operState: string; speed: string | null }>();
  let newestCapture: Date | null = null;

  for (const imp of input.imports) {
    const dev = aliasMap.get(imp.sourceDeviceNorm) ?? imp.sourceDeviceNorm;
    const captured = imp.captureTime ?? imp.uploadedAt;
    if (imp.parseFailed) {
      if (imp.kind !== "INTERFACE_STATE" && !seenNeighbor.has(dev)) failedOnly.add(dev);
      continue;
    }
    if (imp.kind === "INTERFACE_STATE") {
      if (seenState.has(dev)) continue;
      seenState.add(dev);
      for (const s of imp.interfaceStates) ifState.set(`${dev}|${s.portNorm}`, { operState: s.operState, speed: s.speed });
      continue;
    }
    if (seenNeighbor.has(dev)) continue;
    seenNeighbor.add(dev);
    failedOnly.delete(dev);
    if (!newestCapture || captured > newestCapture) newestCapture = captured;
    for (const obs of imp.observations) {
      let remoteNorm = obs.remoteSystemNorm;
      if (remoteNorm && aliasMap.has(remoteNorm)) remoteNorm = aliasMap.get(remoteNorm)!;
      let remotePort = obs.remotePortNorm;
      if (remoteNorm && remotePort) {
        const key = `${remoteNorm}|${remotePort}`;
        if (portAliasMap.has(key)) remotePort = portAliasMap.get(key)!;
      }
      const localPort = portAliasMap.get(`${dev}|${obs.localInterfaceNorm}`) ?? obs.localInterfaceNorm;
      observations.push({
        localDeviceNorm: dev,
        localPortNorm: localPort,
        remoteDeviceNorm: remoteNorm,
        remotePortNorm: remotePort,
        localDevice: imp.sourceDevice,
        localPort: obs.localInterface,
        remoteDevice: obs.remoteSystemName,
        remotePort: obs.remotePortId,
        captureTime: captured,
        evidenceSource: `${imp.synthetic ? "SYNTHETIC " : ""}LLDP:${imp.sourceDevice}@${captured.toISOString()}`,
      });
    }
  }

  const reference = input.now ?? newestCapture;
  const staleBefore =
    input.maxEvidenceAgeDays != null && reference ? new Date(reference.getTime() - input.maxEvidenceAgeDays * 86_400_000) : null;

  const matches = matchObservationsToPlan(input.links, observations, { knownDevices });
  const byCable = new Map(matches.map((m) => [m.cableId, m]));

  const links = input.links.map((link) => {
    const match = byCable.get(link.cableId)!;
    const observability = classifyObservability(link, profiles);
    const outcome = evaluateLink({
      match,
      observability: observability.observability,
      observabilityReason: observability.reason,
      plannedSpeed: link.speed,
      staleBefore,
      a: {
        observable: observability.aObservable,
        hasNeighborEvidence: seenNeighbor.has(link.aDeviceNorm),
        parseFailedOnly: failedOnly.has(link.aDeviceNorm),
        interfaceState: ifState.get(`${link.aDeviceNorm}|${link.aPortNorm}`) ?? null,
        label: `${link.aDevice} ${link.aPort}`,
      },
      z: {
        observable: observability.zObservable,
        hasNeighborEvidence: seenNeighbor.has(link.zDeviceNorm),
        parseFailedOnly: failedOnly.has(link.zDeviceNorm),
        interfaceState: ifState.get(`${link.zDeviceNorm}|${link.zPortNorm}`) ?? null,
        label: `${link.zDevice} ${link.zPort}`,
      },
    });
    return { cableId: link.cableId, match, observability, outcome };
  });
  return { links, neighborDevices: Array.from(seenNeighbor) };
}
