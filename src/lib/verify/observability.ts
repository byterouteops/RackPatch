/**
 * Which endpoints of a planned link can produce LLDP/CDP neighbor evidence.
 *
 * Neighbor evidence is directional: endpoint A's neighbor table shows Z only if Z *transmits*
 * advertisements and A's table is *collectable* (supported parser / collection profile).
 * Profiles come from `DeviceInventory.attributes.discovery`; devices without metadata are
 * unknown and treated as transmitting + collectable (legacy behaviour).
 */

export type Observability =
  | "BOTH_ENDPOINTS_OBSERVABLE"
  | "ONE_ENDPOINT_OBSERVABLE"
  | "NEITHER_ENDPOINT_OBSERVABLE"
  | "NOT_APPLICABLE";

type Capability = { transmits?: boolean; collectable?: boolean; reason?: string };

export type DiscoveryProfile = {
  transmits: boolean | null;
  collectable: boolean | null;
  reason?: string;
  /** Per-port overrides keyed by normalized port (e.g. a BMC port that cannot be collected). */
  ports?: Record<string, Capability>;
};

const NON_ETHERNET_MEDIA = /^(power|ac|dc|c13|c14|c19|c20|serial|rj45-serial|console)$/i;

export function readDiscoveryProfile(role: string | null | undefined, attributes: unknown): DiscoveryProfile {
  if (role === "panel") return { transmits: false, collectable: false, reason: "Passive patch panel (no LLDP)" };
  if (role === "demarc") return { transmits: false, collectable: false, reason: "Carrier demarcation (not managed)" };
  const d = (attributes as { discovery?: Capability & { ports?: Record<string, Capability> } } | null)?.discovery;
  if (!d) return { transmits: null, collectable: null };
  return {
    transmits: typeof d.transmits === "boolean" ? d.transmits : null,
    collectable: typeof d.collectable === "boolean" ? d.collectable : null,
    reason: d.reason,
    ports: d.ports,
  };
}

function atPort(p: DiscoveryProfile, portNorm: string | undefined): DiscoveryProfile {
  const o = portNorm ? p.ports?.[portNorm] : undefined;
  if (!o) return p;
  return {
    transmits: typeof o.transmits === "boolean" ? o.transmits : p.transmits,
    collectable: typeof o.collectable === "boolean" ? o.collectable : p.collectable,
    reason: o.reason ?? p.reason,
  };
}

export function classifyObservability(
  link: { media?: string | null; aDeviceNorm: string; zDeviceNorm: string; aPortNorm?: string; zPortNorm?: string },
  profiles: Map<string, DiscoveryProfile>,
): { observability: Observability | null; reason: string | null; aObservable: boolean; zObservable: boolean } {
  if (link.media && NON_ETHERNET_MEDIA.test(link.media.trim())) {
    return { observability: "NOT_APPLICABLE", reason: `Non-Ethernet media (${link.media})`, aObservable: false, zObservable: false };
  }
  const a = atPort(profiles.get(link.aDeviceNorm) ?? { transmits: null, collectable: null }, link.aPortNorm);
  const z = atPort(profiles.get(link.zDeviceNorm) ?? { transmits: null, collectable: null }, link.zPortNorm);
  const unknown = (p: DiscoveryProfile) => p.transmits === null && p.collectable === null;
  if (unknown(a) && unknown(z)) {
    return { observability: null, reason: null, aObservable: true, zObservable: true };
  }
  const aObservable = a.collectable !== false && z.transmits !== false;
  const zObservable = z.collectable !== false && a.transmits !== false;
  if (aObservable && zObservable) {
    return { observability: "BOTH_ENDPOINTS_OBSERVABLE", reason: null, aObservable, zObservable };
  }
  const reasons = [a.reason, z.reason].filter(Boolean).join("; ");
  if (aObservable || zObservable) {
    return {
      observability: "ONE_ENDPOINT_OBSERVABLE",
      reason: reasons || "Only one direction of neighbor discovery is collectable",
      aObservable,
      zObservable,
    };
  }
  return {
    observability: "NEITHER_ENDPOINT_OBSERVABLE",
    reason: reasons || "Neither direction of neighbor discovery is collectable",
    aObservable,
    zObservable,
  };
}
