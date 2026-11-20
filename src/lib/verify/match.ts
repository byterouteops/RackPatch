import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";

export type PlannedEndpoint = {
  cableId: string;
  aDeviceNorm: string;
  aPortNorm: string;
  zDeviceNorm: string;
  zPortNorm: string;
  aDevice: string;
  aPort: string;
  zDevice: string;
  zPort: string;
};

export type ObservedNeighbor = {
  localDeviceNorm: string;
  localPortNorm: string;
  remoteDeviceNorm: string | null;
  remotePortNorm: string | null;
  localDevice: string;
  localPort: string;
  remoteDevice: string | null;
  remotePort: string | null;
  captureTime?: Date | null;
  evidenceSource?: string;
};

export type MatchKind =
  | "exact"
  | "wrong_endpoint"
  | "ambiguous"
  | "no_observation"
  | "conflicting";

export type LinkMatchResult = {
  cableId: string;
  kind: MatchKind;
  expectedSummary: string;
  observedSummary: string | null;
  relatedCableId: string | null;
  evidenceSource: string | null;
  captureTime: Date | null;
  nextAction: string;
};

function expectedSummary(link: PlannedEndpoint): string {
  return `${link.aDevice} ${link.aPort} ↔ ${link.zDevice} ${link.zPort}`;
}

function sideOf(link: PlannedEndpoint, deviceNorm: string, portNorm: string): "A" | "Z" | null {
  if (link.aDeviceNorm === deviceNorm && link.aPortNorm === portNorm) return "A";
  if (link.zDeviceNorm === deviceNorm && link.zPortNorm === portNorm) return "Z";
  return null;
}

function otherEnd(link: PlannedEndpoint, side: "A" | "Z") {
  return side === "A"
    ? { deviceNorm: link.zDeviceNorm, portNorm: link.zPortNorm, device: link.zDevice, port: link.zPort }
    : { deviceNorm: link.aDeviceNorm, portNorm: link.aPortNorm, device: link.aDevice, port: link.aPort };
}

export function resolveDeviceAlias(
  name: string,
  aliases: Map<string, string>,
): { deviceNorm: string; ambiguous: boolean; candidates: string[] } {
  const norm = normalizeDevice(name);
  if (aliases.has(norm)) {
    return { deviceNorm: aliases.get(norm)!, ambiguous: false, candidates: [aliases.get(norm)!] };
  }
  return { deviceNorm: norm, ambiguous: false, candidates: [norm] };
}

export function resolvePortAlias(
  deviceNorm: string,
  port: string,
  aliases: Map<string, string>,
): string {
  const key = `${deviceNorm}|${normalizePort(port)}`;
  return aliases.get(key) ?? normalizePort(port);
}

/**
 * Match observations against planned links.
 * A/Z orientation reversal counts as the same link.
 * Multiple incompatible observations for one endpoint → conflicting.
 * Missing observation → no_observation (awaiting), never "absent".
 */
export function matchObservationsToPlan(
  links: PlannedEndpoint[],
  observations: ObservedNeighbor[],
): LinkMatchResult[] {
  const byLocal = new Map<string, ObservedNeighbor[]>();
  for (const obs of observations) {
    const key = `${obs.localDeviceNorm}|${obs.localPortNorm}`;
    const list = byLocal.get(key) ?? [];
    list.push(obs);
    byLocal.set(key, list);
  }

  const portOwner = new Map<string, PlannedEndpoint>();
  for (const link of links) {
    portOwner.set(`${link.aDeviceNorm}|${link.aPortNorm}`, link);
    portOwner.set(`${link.zDeviceNorm}|${link.zPortNorm}`, link);
  }

  return links.map((link) => {
    const aKey = `${link.aDeviceNorm}|${link.aPortNorm}`;
    const zKey = `${link.zDeviceNorm}|${link.zPortNorm}`;
    const aObs = byLocal.get(aKey) ?? [];
    const zObs = byLocal.get(zKey) ?? [];
    const all = [...aObs, ...zObs];

    if (all.length === 0) {
      return {
        cableId: link.cableId,
        kind: "no_observation",
        expectedSummary: expectedSummary(link),
        observedSummary: null,
        relatedCableId: null,
        evidenceSource: null,
        captureTime: null,
        nextAction: "Await usable LLDP or perform independent physical verification",
      };
    }

    // Detect conflicting observations on the same local endpoint
    for (const group of [aObs, zObs]) {
      if (group.length > 1) {
        const signatures = new Set(
          group.map((o) => `${o.remoteDeviceNorm}|${o.remotePortNorm}`),
        );
        if (signatures.size > 1) {
          return {
            cableId: link.cableId,
            kind: "conflicting",
            expectedSummary: expectedSummary(link),
            observedSummary: group
              .map((o) => `${o.localDevice} ${o.localPort} → ${o.remoteDevice ?? "?"} ${o.remotePort ?? "?"}`)
              .join("; "),
            relatedCableId: null,
            evidenceSource: group[0]?.evidenceSource ?? null,
            captureTime: group[0]?.captureTime ?? null,
            nextAction: "Review conflicting observations; do not auto-pick a winner",
          };
        }
      }
    }

    // Ambiguous if remote identity missing
    const usable = all.filter((o) => o.remoteDeviceNorm && o.remotePortNorm);
    if (usable.length === 0) {
      return {
        cableId: link.cableId,
        kind: "ambiguous",
        expectedSummary: expectedSummary(link),
        observedSummary: all
          .map((o) => `${o.localDevice} ${o.localPort} → ${o.remoteDevice ?? "?"} ${o.remotePort ?? "?"}`)
          .join("; "),
        relatedCableId: null,
        evidenceSource: all[0]?.evidenceSource ?? null,
        captureTime: all[0]?.captureTime ?? null,
        nextAction: "Map remote device/port aliases and re-import",
      };
    }

    const obs = usable[0];
    const localSide = sideOf(link, obs.localDeviceNorm, obs.localPortNorm);
    if (!localSide) {
      return {
        cableId: link.cableId,
        kind: "ambiguous",
        expectedSummary: expectedSummary(link),
        observedSummary: `${obs.localDevice} ${obs.localPort} → ${obs.remoteDevice} ${obs.remotePort}`,
        relatedCableId: null,
        evidenceSource: obs.evidenceSource ?? null,
        captureTime: obs.captureTime ?? null,
        nextAction: "Confirm local switch mapping",
      };
    }

    const expectedOther = otherEnd(link, localSide);
    const remoteMatches =
      obs.remoteDeviceNorm === expectedOther.deviceNorm &&
      obs.remotePortNorm === expectedOther.portNorm;

    if (remoteMatches) {
      return {
        cableId: link.cableId,
        kind: "exact",
        expectedSummary: expectedSummary(link),
        observedSummary: `${obs.localDevice} ${obs.localPort} → ${obs.remoteDevice} ${obs.remotePort}`,
        relatedCableId: null,
        evidenceSource: obs.evidenceSource ?? null,
        captureTime: obs.captureTime ?? null,
        nextAction: "No action required",
      };
    }

    // Wrong endpoint — find which planned link owns the observed remote port if any
    const remoteKey = `${obs.remoteDeviceNorm}|${obs.remotePortNorm}`;
    const owner = portOwner.get(remoteKey);
    const related =
      owner && owner.cableId !== link.cableId
        ? owner.cableId
        : findSwapPartner(link, links, usable);

    return {
      cableId: link.cableId,
      kind: "wrong_endpoint",
      expectedSummary: expectedSummary(link),
      observedSummary: `${obs.localDevice} ${obs.localPort} → ${obs.remoteDevice} ${obs.remotePort}`,
      relatedCableId: related,
      evidenceSource: obs.evidenceSource ?? null,
      captureTime: obs.captureTime ?? null,
      nextAction: related
        ? `Fix swapped pair: check ${link.cableId} and ${related}`
        : `Reconnect to expected ${expectedOther.device} ${expectedOther.port}`,
    };
  });
}

function findSwapPartner(
  link: PlannedEndpoint,
  links: PlannedEndpoint[],
  obsForLink: ObservedNeighbor[],
): string | null {
  // Classic swap: A sees B's expected remote and B sees A's
  for (const other of links) {
    if (other.cableId === link.cableId) continue;
    // If this link's observation points at other's A or Z port
    for (const obs of obsForLink) {
      const hitsOther =
        (obs.remoteDeviceNorm === other.aDeviceNorm && obs.remotePortNorm === other.aPortNorm) ||
        (obs.remoteDeviceNorm === other.zDeviceNorm && obs.remotePortNorm === other.zPortNorm);
      if (hitsOther) return other.cableId;
    }
  }
  return null;
}

export function kindToVerificationState(kind: MatchKind): {
  state: "AWAITING" | "VERIFIED_LLDP" | "MISMATCH" | "NEEDS_REVIEW";
  findingType:
    | "EXACT_MATCH"
    | "WRONG_ENDPOINT"
    | "AMBIGUOUS"
    | "NO_OBSERVATION"
    | "CONFLICTING_OBSERVATIONS"
    | "AWAITING";
  severity: "INFO" | "WARNING" | "ERROR";
} {
  switch (kind) {
    case "exact":
      return { state: "VERIFIED_LLDP", findingType: "EXACT_MATCH", severity: "INFO" };
    case "wrong_endpoint":
      return { state: "MISMATCH", findingType: "WRONG_ENDPOINT", severity: "ERROR" };
    case "ambiguous":
      return { state: "NEEDS_REVIEW", findingType: "AMBIGUOUS", severity: "WARNING" };
    case "conflicting":
      return { state: "NEEDS_REVIEW", findingType: "CONFLICTING_OBSERVATIONS", severity: "ERROR" };
    case "no_observation":
    default:
      return { state: "AWAITING", findingType: "NO_OBSERVATION", severity: "INFO" };
  }
}

export { normalizeDevice, normalizePort };
