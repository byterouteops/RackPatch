/**
 * Allowlisted read-only neighbor collection commands only.
 * No arbitrary CLI — security non-negotiable for Phase 10.
 */

export const COLLECTION_PROFILES = {
  "cisco-nxos-lldp": {
    label: "Cisco NX-OS LLDP",
    command: "show lldp neighbors detail",
    format: "cisco-nxos-lldp" as const,
  },
  "cisco-ios-lldp": {
    label: "Cisco IOS-XE LLDP",
    command: "show lldp neighbors detail",
    format: "cisco-ios-lldp" as const,
  },
  "cisco-cdp": {
    label: "Cisco CDP",
    command: "show cdp neighbors detail",
    format: "cisco-cdp" as const,
  },
  "arista-eos-lldp": {
    label: "Arista EOS LLDP",
    command: "show lldp neighbors detail",
    format: "arista-eos-lldp" as const,
  },
  "juniper-junos-lldp": {
    label: "Juniper Junos LLDP",
    command: "show lldp neighbors detail",
    format: "juniper-junos-lldp" as const,
  },
} as const;

export type CollectionProfileId = keyof typeof COLLECTION_PROFILES;

export function getCollectionProfile(id: string) {
  if (id in COLLECTION_PROFILES) {
    return COLLECTION_PROFILES[id as CollectionProfileId];
  }
  return null;
}

export function isAllowedCollectionCommand(command: string): boolean {
  return Object.values(COLLECTION_PROFILES).some((p) => p.command === command.trim());
}
