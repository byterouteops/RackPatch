import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * Juniper Junos LLDP neighbor detail
 *
 * Local Interface : ge-0/0/0.0
 * System Name: switch2
 * Port ID: ge-0/0/1.0  (or Port description)
 */

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function looksLikeJunosLldp(text: string): boolean {
  // Junos uses "Local Interface :" (and may also list numeric "Local Port ID").
  return (
    /local interface\s*:/i.test(text) &&
    (/system name\s*:/i.test(text) || /port id\s*:/i.test(text)) &&
    (/chassis id\s*:/i.test(text) || /ge-\d|xe-\d|et-\d/i.test(text)) &&
    !/local intf:/i.test(text) &&
    !/device id:/i.test(text) &&
    !/Interface\s+\S+\s+detected\s+\d+\s+LLDP neighbors:/i.test(text)
  );
}

export function parseJunosLldpNeighborsDetail(text: string): NeighborParseResult {
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

  const warnings: string[] = [];
  const observations: NeighborObservation[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n(?=Local Interface\s*:)/i)
    .map((b) => b.trim())
    .filter((b) => /local interface\s*:/i.test(b));

  for (const block of blocks) {
    const localInterface = field(block, /Local Interface\s*:\s*(.+)/i);
    const remoteSystemName = field(block, /System Name\s*:\s*(.+)/i);
    const remotePortId =
      field(block, /Port description\s*:\s*(.+)/i) ||
      field(block, /Port ID\s*:\s*(.+)/i) ||
      field(block, /Port id\s*:\s*(.+)/i);

    if (!localInterface) {
      warnings.push("Skipped Junos LLDP block without Local Interface");
      continue;
    }

    // Strip unit suffix noise for matching: ge-0/0/0.0 → ge-0/0/0 still ok via normalizePort
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
      error: "Parsed zero usable neighbor entries from Junos LLDP",
    };
  }

  return { observations, warnings, failed: false, format: "juniper-junos-lldp" };
}
