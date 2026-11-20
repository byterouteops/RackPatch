import type { ParsedPlanRow } from "./plan-import";

export type LinkSnapshot = {
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  aDeviceNorm: string;
  aPortNorm: string;
  zDeviceNorm: string;
  zPortNorm: string;
  cableType?: string | null;
  notes?: string | null;
  endpointKey: string;
};

export type RevisionDiff = {
  added: LinkSnapshot[];
  removed: LinkSnapshot[];
  modified: Array<{ previous: LinkSnapshot; next: LinkSnapshot; endpointsChanged: boolean }>;
  unchanged: LinkSnapshot[];
};

function endpointsEqual(a: LinkSnapshot, b: LinkSnapshot): boolean {
  return (
    a.aDeviceNorm === b.aDeviceNorm &&
    a.aPortNorm === b.aPortNorm &&
    a.zDeviceNorm === b.zDeviceNorm &&
    a.zPortNorm === b.zPortNorm
  ) || (
    a.aDeviceNorm === b.zDeviceNorm &&
    a.aPortNorm === b.zPortNorm &&
    a.zDeviceNorm === b.aDeviceNorm &&
    a.zPortNorm === b.aPortNorm
  );
}

function metaEqual(a: LinkSnapshot, b: LinkSnapshot): boolean {
  return (
    (a.cableType ?? null) === (b.cableType ?? null) &&
    (a.notes ?? null) === (b.notes ?? null) &&
    a.aRack === b.aRack &&
    a.zRack === b.zRack &&
    a.aDevice === b.aDevice &&
    a.aPort === b.aPort &&
    a.zDevice === b.zDevice &&
    a.zPort === b.zPort
  );
}

export function toSnapshot(row: ParsedPlanRow): LinkSnapshot {
  return {
    cableId: row.cableId,
    aRack: row.aRack,
    aDevice: row.aDevice,
    aPort: row.aPort,
    zRack: row.zRack,
    zDevice: row.zDevice,
    zPort: row.zPort,
    aDeviceNorm: row.aDeviceNorm,
    aPortNorm: row.aPortNorm,
    zDeviceNorm: row.zDeviceNorm,
    zPortNorm: row.zPortNorm,
    cableType: row.cableType,
    notes: row.notes,
    endpointKey: row.endpointKey,
  };
}

/** Diff previous revision vs new rows keyed by cable_id. */
export function diffRevisions(previous: LinkSnapshot[], next: LinkSnapshot[]): RevisionDiff {
  const prevMap = new Map(previous.map((l) => [l.cableId, l]));
  const nextMap = new Map(next.map((l) => [l.cableId, l]));

  const added: LinkSnapshot[] = [];
  const removed: LinkSnapshot[] = [];
  const modified: RevisionDiff["modified"] = [];
  const unchanged: LinkSnapshot[] = [];

  for (const [cableId, n] of nextMap) {
    const p = prevMap.get(cableId);
    if (!p) {
      added.push(n);
      continue;
    }
    const endpointsChanged = !endpointsEqual(p, n);
    if (endpointsChanged || !metaEqual(p, n)) {
      modified.push({ previous: p, next: n, endpointsChanged });
    } else {
      unchanged.push(n);
    }
  }

  for (const [cableId, p] of prevMap) {
    if (!nextMap.has(cableId)) removed.push(p);
  }

  return { added, removed, modified, unchanged };
}

/**
 * Carry installation/verification forward only when cable ID and both physical endpoints are unchanged.
 */
export function shouldCarryForward(previous: LinkSnapshot, next: LinkSnapshot): boolean {
  return previous.cableId === next.cableId && endpointsEqual(previous, next);
}
