export type NeighborObservation = {
  localInterface: string;
  localInterfaceNorm: string;
  remoteSystemName: string | null;
  remoteSystemNorm: string | null;
  remotePortId: string | null;
  remotePortNorm: string | null;
  sourceExcerpt: string;
};

/** @deprecated Prefer NeighborObservation — kept for existing call sites */
export type LldpObservation = NeighborObservation;

export type EvidenceFormat =
  | "cisco-nxos-lldp"
  | "cisco-ios-lldp"
  | "cisco-cdp"
  | "arista-eos-lldp"
  | "juniper-junos-lldp"
  | "lldpd-keyvalue";

export type NeighborParseResult = {
  observations: NeighborObservation[];
  warnings: string[];
  failed: boolean;
  error?: string;
  format?: EvidenceFormat;
};

/** @deprecated Prefer NeighborParseResult */
export type LldpParseResult = NeighborParseResult;

export const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

export const SUPPORTED_EVIDENCE_FORMATS: Array<{
  id: EvidenceFormat;
  label: string;
  command: string;
}> = [
  {
    id: "cisco-nxos-lldp",
    label: "Cisco NX-OS LLDP",
    command: "show lldp neighbors detail",
  },
  {
    id: "cisco-ios-lldp",
    label: "Cisco IOS / IOS-XE LLDP",
    command: "show lldp neighbors detail",
  },
  {
    id: "cisco-cdp",
    label: "Cisco CDP (NX-OS / IOS)",
    command: "show cdp neighbors detail",
  },
  {
    id: "arista-eos-lldp",
    label: "Arista EOS LLDP",
    command: "show lldp neighbors detail",
  },
  {
    id: "juniper-junos-lldp",
    label: "Juniper Junos LLDP",
    command: "show lldp neighbors interface <if> detail / show lldp neighbors detail",
  },
  {
    id: "lldpd-keyvalue",
    label: "Linux / Cumulus lldpd",
    command: "lldpcli show neighbors -f keyvalue",
  },
];
