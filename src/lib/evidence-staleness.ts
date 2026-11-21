/**
 * Flag devices whose latest neighbor evidence is older than maxAgeDays (Phase 11 CE).
 * Not a continuous compliance engine — no schedules/notifications platform.
 */

export type EvidenceImportStamp = {
  sourceDevice: string;
  sourceDeviceNorm: string;
  uploadedAt: Date;
  captureTime: Date | null;
  parseFailed: boolean;
};

export type StaleDevice = {
  sourceDevice: string;
  sourceDeviceNorm: string;
  lastSeenAt: Date;
  ageDays: number;
  parseFailed: boolean;
};

export type StalenessReport = {
  maxAgeDays: number;
  asOf: Date;
  stale: StaleDevice[];
  fresh: StaleDevice[];
  neverImported: string[];
};

function effectiveTime(imp: EvidenceImportStamp): Date {
  return imp.captureTime ?? imp.uploadedAt;
}

export function computeEvidenceStaleness(opts: {
  imports: EvidenceImportStamp[];
  /** Planned device names to check for missing evidence */
  plannedDevices?: string[];
  maxAgeDays?: number;
  now?: Date;
}): StalenessReport {
  const maxAgeDays = opts.maxAgeDays ?? 7;
  const asOf = opts.now ?? new Date();
  const cutoffMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const latest = new Map<string, EvidenceImportStamp>();
  for (const imp of opts.imports) {
    const prev = latest.get(imp.sourceDeviceNorm);
    if (!prev || effectiveTime(imp) > effectiveTime(prev)) {
      latest.set(imp.sourceDeviceNorm, imp);
    }
  }

  const stale: StaleDevice[] = [];
  const fresh: StaleDevice[] = [];

  for (const imp of latest.values()) {
    const lastSeenAt = effectiveTime(imp);
    const ageDays = Math.floor((asOf.getTime() - lastSeenAt.getTime()) / (24 * 60 * 60 * 1000));
    const row: StaleDevice = {
      sourceDevice: imp.sourceDevice,
      sourceDeviceNorm: imp.sourceDeviceNorm,
      lastSeenAt,
      ageDays,
      parseFailed: imp.parseFailed,
    };
    if (asOf.getTime() - lastSeenAt.getTime() > cutoffMs || imp.parseFailed) {
      stale.push(row);
    } else {
      fresh.push(row);
    }
  }

  stale.sort((a, b) => b.ageDays - a.ageDays);
  fresh.sort((a, b) => a.sourceDevice.localeCompare(b.sourceDevice));

  const seenNorms = new Set(latest.keys());
  const neverImported: string[] = [];
  const neverSeen = new Set<string>();
  for (const name of opts.plannedDevices ?? []) {
    const norm = name.replace(/^\uFEFF/, "").trim().toLowerCase();
    if (!norm || seenNorms.has(norm) || neverSeen.has(norm)) continue;
    neverSeen.add(norm);
    neverImported.push(name.trim());
  }
  neverImported.sort((a, b) => a.localeCompare(b));

  return { maxAgeDays, asOf, stale, fresh, neverImported };
}
