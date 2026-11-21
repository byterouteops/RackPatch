import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * Cisco IOS / IOS-XE `show lldp neighbors detail`
 * Uses Local Intf (not Local Port id).
 */

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function looksLikeIosLldp(text: string): boolean {
  return (
    /local intf:/i.test(text) &&
    (/system name:/i.test(text) || /port id:/i.test(text)) &&
    !/local port id:/i.test(text)
  );
}

export function parseIosLldpNeighborsDetail(text: string): NeighborParseResult {
  if (!text || !trimField(text)) {
    return { observations: [], warnings: [], failed: true, error: "Empty LLDP input" };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_EVIDENCE_BYTES) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: `Evidence exceeds maximum size of ${MAX_EVIDENCE_BYTES} bytes`,
    };
  }
  if (!looksLikeIosLldp(text)) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: "Not Cisco IOS/IOS-XE LLDP (expected Local Intf).",
    };
  }

  const warnings: string[] = [];
  const observations: NeighborObservation[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n-{3,}\n?|\n(?=Local Intf:)/i)
    .map((b) => b.trim())
    .filter((b) => /local intf:/i.test(b));

  for (const block of blocks) {
    const localInterface = field(block, /Local Intf:\s*(.+)/i);
    const remotePortId = field(block, /(?:^|\n)Port id:\s*(.+)/i);
    const remoteSystemName = field(block, /System Name:\s*(.+)/i);

    if (!localInterface) {
      warnings.push("Skipped IOS LLDP block without Local Intf");
      continue;
    }

    observations.push({
      localInterface,
      localInterfaceNorm: normalizePort(localInterface),
      remoteSystemName,
      remoteSystemNorm: remoteSystemName ? normalizeDevice(remoteSystemName) : null,
      remotePortId,
      remotePortNorm: remotePortId ? normalizePort(remotePortId) : null,
      sourceExcerpt: block.slice(0, 800),
    });
  }

  if (observations.length === 0) {
    return {
      observations: [],
      warnings,
      failed: true,
      error: "Parsed zero usable neighbor entries from IOS LLDP",
    };
  }

  return { observations, warnings, failed: false, format: "cisco-ios-lldp" };
}
