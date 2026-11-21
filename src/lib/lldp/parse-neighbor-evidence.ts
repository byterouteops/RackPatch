import { parseAristaEosLldpNeighborsDetail, looksLikeAristaEosLldp } from "@/lib/lldp/arista-eos-lldp";
import { parseCiscoCdpNeighborsDetail, looksLikeCiscoCdp } from "@/lib/lldp/cisco-cdp";
import { parseIosLldpNeighborsDetail, looksLikeIosLldp } from "@/lib/lldp/ios-lldp";
import { parseJunosLldpNeighborsDetail, looksLikeJunosLldp } from "@/lib/lldp/junos-lldp";
import { parseNxosLldpNeighborsDetail, looksLikeNxosLldp } from "@/lib/lldp/nxos-neighbors-detail";
import { parseLldpdKeyvalue, looksLikeLldpdKeyvalue } from "@/lib/lldp/lldpd-keyvalue";
import {
  SUPPORTED_EVIDENCE_FORMATS,
  type EvidenceFormat,
  type NeighborParseResult,
} from "@/lib/lldp/types";
import { trimField } from "@/lib/csv/normalize";

const parsers: Record<
  EvidenceFormat,
  {
    looksLike: (text: string) => boolean;
    parse: (text: string) => NeighborParseResult;
  }
> = {
  "cisco-nxos-lldp": { looksLike: looksLikeNxosLldp, parse: parseNxosLldpNeighborsDetail },
  "cisco-ios-lldp": { looksLike: looksLikeIosLldp, parse: parseIosLldpNeighborsDetail },
  "cisco-cdp": { looksLike: looksLikeCiscoCdp, parse: parseCiscoCdpNeighborsDetail },
  "arista-eos-lldp": { looksLike: looksLikeAristaEosLldp, parse: parseAristaEosLldpNeighborsDetail },
  "juniper-junos-lldp": {
    looksLike: looksLikeJunosLldp,
    parse: parseJunosLldpNeighborsDetail,
  },
  "lldpd-keyvalue": { looksLike: looksLikeLldpdKeyvalue, parse: parseLldpdKeyvalue },
};

/** lldpd keyvalue is unambiguous; then Cisco LLDP before CDP; NX-OS before IOS. */
const AUTO_ORDER: EvidenceFormat[] = [
  "lldpd-keyvalue",
  "cisco-nxos-lldp",
  "cisco-ios-lldp",
  "cisco-cdp",
  "juniper-junos-lldp",
  "arista-eos-lldp",
];

export function parseNeighborEvidence(
  text: string,
  formatHint: EvidenceFormat | "auto" = "auto",
): NeighborParseResult {
  if (!text || !trimField(text)) {
    return { observations: [], warnings: [], failed: true, error: "Empty evidence input" };
  }

  if (formatHint !== "auto") {
    return parsers[formatHint].parse(text);
  }

  for (const id of AUTO_ORDER) {
    if (!parsers[id].looksLike(text)) continue;
    const result = parsers[id].parse(text);
    if (!result.failed) return result;
  }

  const supported = SUPPORTED_EVIDENCE_FORMATS.map(
    (f) => `${f.label} (\`${f.command}\`)`,
  ).join("; ");

  return {
    observations: [],
    warnings: [],
    failed: true,
    error: `Unrecognized neighbor evidence format. Supported: ${supported}.`,
  };
}

export { SUPPORTED_EVIDENCE_FORMATS };
export type { EvidenceFormat, NeighborParseResult };
