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

/** Precise outcome; `kind` stays as the coarse legacy classification. */
export type MatchDetail =
  | "match"
  | "wrong_neighbor"
  | "wrong_port"
  | "ambiguous_identity"
  | "ambiguous_fields"
  | "conflicting"
  | "no_observation";

export type LinkMatchResult = {
  cableId: string;
  kind: MatchKind;
  detail: MatchDetail;
  /** Which planned endpoints produced usable neighbor evidence: "A", "Z", "AZ" or null. */
  observedSides: "A" | "Z" | "AZ" | null;
  expectedSummary: string;
  observedSummary: string | null;
  relatedCableId: string | null;
  evidenceSource: string | null;
  captureTime: Date | null;
  /** Oldest capture time among the observations used (for staleness). */
  oldestCaptureTime: Date | null;
  nextAction: string;
};

export type MatchOptions = {
  /**
   * Device norms known to the project (plan endpoints + inventory + alias targets). When given,
   * a remote identity outside this set is AMBIGUOUS_IDENTITY instead of a wrong neighbor.
   */
  knownDevices?: Set<string>;
};

function expectedSummary(link: PlannedEndpoint): string {
  return `${link.aDevice} ${link.aPort} ↔ ${link.zDevice} ${link.zPort}`;
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

const fmtObs = (o: ObservedNeighbor) =>
  `${o.localDevice} ${o.localPort} → ${o.remoteDevice ?? "?"} ${o.remotePort ?? "?"}`;

function times(list: ObservedNeighbor[]) {
  const ts = list.map((o) => o.captureTime).filter((t): t is Date => !!t);
  if (!ts.length) return { newest: null, oldest: null };
  return {
    newest: new Date(Math.max(...ts.map((t) => t.getTime()))),
    oldest: new Date(Math.min(...ts.map((t) => t.getTime()))),
  };
}

/**
 * Match observations against planned links.
 * Neighbor evidence is directional: each endpoint's observation is judged on its own.
 * A/Z orientation reversal counts as the same link.
 * Multiple incompatible observations for one endpoint → conflicting.
 * The same remote identity+port seen from two different local ports → ambiguous identity.
 * Missing observation → no_observation (awaiting), never "absent".
 */
export function matchObservationsToPlan(
  links: PlannedEndpoint[],
  observations: ObservedNeighbor[],
  options: MatchOptions = {},
): LinkMatchResult[] {
  const byLocal = new Map<string, ObservedNeighbor[]>();
  const remoteSeenFrom = new Map<string, Set<string>>();
  for (const obs of observations) {
    const key = `${obs.localDeviceNorm}|${obs.localPortNorm}`;
    const list = byLocal.get(key) ?? [];
    list.push(obs);
    byLocal.set(key, list);
    if (obs.remoteDeviceNorm && obs.remotePortNorm) {
      const rk = `${obs.remoteDeviceNorm}|${obs.remotePortNorm}`;
      const from = remoteSeenFrom.get(rk) ?? new Set<string>();
      from.add(key);
      remoteSeenFrom.set(rk, from);
    }
  }

  const portOwner = new Map<string, PlannedEndpoint>();
  for (const link of links) {
    portOwner.set(`${link.aDeviceNorm}|${link.aPortNorm}`, link);
    portOwner.set(`${link.zDeviceNorm}|${link.zPortNorm}`, link);
  }

  return links.map((link): LinkMatchResult => {
    const aObs = byLocal.get(`${link.aDeviceNorm}|${link.aPortNorm}`) ?? [];
    const zObs = byLocal.get(`${link.zDeviceNorm}|${link.zPortNorm}`) ?? [];
    const all = [...aObs, ...zObs];
    const base = {
      cableId: link.cableId,
      expectedSummary: expectedSummary(link),
      relatedCableId: null as string | null,
    };

    if (all.length === 0) {
      return {
        ...base,
        kind: "no_observation",
        detail: "no_observation",
        observedSides: null,
        observedSummary: null,
        evidenceSource: null,
        captureTime: null,
        oldestCaptureTime: null,
        nextAction: "Await usable LLDP or perform independent physical verification",
      };
    }

    const { newest, oldest } = times(all);

    for (const group of [aObs, zObs]) {
      if (group.length > 1) {
        const signatures = new Set(group.map((o) => `${o.remoteDeviceNorm}|${o.remotePortNorm}`));
        if (signatures.size > 1) {
          return {
            ...base,
            kind: "conflicting",
            detail: "conflicting",
            observedSides: aObs.length && zObs.length ? "AZ" : aObs.length ? "A" : "Z",
            observedSummary: group.map(fmtObs).join("; "),
            evidenceSource: group[0]?.evidenceSource ?? null,
            captureTime: newest,
            oldestCaptureTime: oldest,
            nextAction: "Review conflicting observations; do not auto-pick a winner",
          };
        }
      }
    }

    const usableA = aObs.filter((o) => o.remoteDeviceNorm && o.remotePortNorm);
    const usableZ = zObs.filter((o) => o.remoteDeviceNorm && o.remotePortNorm);
    const usable = [...usableA, ...usableZ];
    const sides = usableA.length && usableZ.length ? "AZ" : usableA.length ? "A" : usableZ.length ? "Z" : null;

    if (usable.length === 0) {
      return {
        ...base,
        kind: "ambiguous",
        detail: "ambiguous_fields",
        observedSides: null,
        observedSummary: all.map(fmtObs).join("; "),
        evidenceSource: all[0]?.evidenceSource ?? null,
        captureTime: newest,
        oldestCaptureTime: oldest,
        nextAction: "Neighbor entry lacks a remote system name or port ID; map aliases and re-import",
      };
    }

    // One remote identity+port claimed from two different local ports cannot be a single cable.
    const identityIssue = usable.find(
      (o) => (remoteSeenFrom.get(`${o.remoteDeviceNorm}|${o.remotePortNorm}`)?.size ?? 0) > 1,
    );
    if (identityIssue) {
      return {
        ...base,
        kind: "ambiguous",
        detail: "ambiguous_identity",
        observedSides: sides,
        observedSummary: usable.map(fmtObs).join("; "),
        evidenceSource: identityIssue.evidenceSource ?? null,
        captureTime: newest,
        oldestCaptureTime: oldest,
        nextAction: `Remote identity "${identityIssue.remoteDevice} ${identityIssue.remotePort}" is reported on more than one port; fix duplicate hostnames or add a device alias`,
      };
    }

    const judged = [
      ...usableA.map((o) => ({ o, expected: otherEnd(link, "A") })),
      ...usableZ.map((o) => ({ o, expected: otherEnd(link, "Z") })),
    ];
    const wrong = judged.find(
      ({ o, expected }) => o.remoteDeviceNorm !== expected.deviceNorm || o.remotePortNorm !== expected.portNorm,
    );

    if (!wrong) {
      return {
        ...base,
        kind: "exact",
        detail: "match",
        observedSides: sides,
        observedSummary: usable.map(fmtObs).join("; "),
        evidenceSource: usable[0].evidenceSource ?? null,
        captureTime: newest,
        oldestCaptureTime: oldest,
        nextAction: sides === "AZ" ? "No action required" : `No action required (${sides} side observed only)`,
      };
    }

    const obs = wrong.o;
    const owner = portOwner.get(`${obs.remoteDeviceNorm}|${obs.remotePortNorm}`);
    const related = owner && owner.cableId !== link.cableId ? owner.cableId : findSwapPartner(link, links, usable);
    const samePeer = obs.remoteDeviceNorm === wrong.expected.deviceNorm;
    const unknownPeer = options.knownDevices ? !options.knownDevices.has(obs.remoteDeviceNorm!) : false;

    return {
      ...base,
      kind: "wrong_endpoint",
      detail: samePeer ? "wrong_port" : "wrong_neighbor",
      observedSides: sides,
      observedSummary: fmtObs(obs),
      relatedCableId: related,
      evidenceSource: obs.evidenceSource ?? null,
      captureTime: newest,
      oldestCaptureTime: oldest,
      nextAction: related
        ? `Fix swapped pair: check ${link.cableId} and ${related}`
        : samePeer
          ? `Right device, wrong port: move to ${wrong.expected.device} ${wrong.expected.port}`
          : unknownPeer
            ? `"${obs.remoteDevice}" is not in this project; reconnect to ${wrong.expected.device} ${wrong.expected.port} or add a device alias if it is the same host`
            : `Reconnect to expected ${wrong.expected.device} ${wrong.expected.port}`,
    };
  });
}

function findSwapPartner(
  link: PlannedEndpoint,
  links: PlannedEndpoint[],
  obsForLink: ObservedNeighbor[],
): string | null {
  for (const other of links) {
    if (other.cableId === link.cableId) continue;
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
