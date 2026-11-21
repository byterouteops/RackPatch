import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * Arista EOS `show lldp neighbors detail`
 *
 * Common patterns:
 *   Interface: Ethernet1   Port: Ethernet2   Neighbor Device: leaf2
 * or per-neighbor blocks with Chassis ID / System Name / Port ID / Interface
 */

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function looksLikeAristaEosLldp(text: string): boolean {
  const lower = text.toLowerCase();
  const eosSection = /Interface\s+\S+\s+detected\s+\d+\s+LLDP neighbors:/i.test(text);
  const aristaBrand = lower.includes("arista");
  return (
    (eosSection || aristaBrand || /neighbor device:/i.test(text)) &&
    (/system name:/i.test(text) ||
      /neighbor system name:/i.test(text) ||
      /neighbor device:/i.test(text)) &&
    !/local interface\s*:/i.test(text) &&
    !/local port id:/i.test(text) &&
    !/local intf:/i.test(text) &&
    !/device id:/i.test(text) &&
    !/juniper networks/i.test(text)
  );
}

export function parseAristaEosLldpNeighborsDetail(text: string): NeighborParseResult {
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

  // Pattern A: "Interface EthernetX detected N LLDP neighbors:" sections
  const sectionRe =
    /Interface\s+(\S+)\s+detected\s+\d+\s+LLDP neighbors:([\s\S]*?)(?=Interface\s+\S+\s+detected\s+\d+\s+LLDP neighbors:|$)/gi;
  let sectionMatch: RegExpExecArray | null;
  let foundSections = false;
  while ((sectionMatch = sectionRe.exec(normalized)) !== null) {
    foundSections = true;
    const localInterface = trimField(sectionMatch[1]);
    const body = sectionMatch[2];
    const remoteSystemName =
      field(body, /Neighbor System Name:\s*(.+)/i) ||
      field(body, /System Name:\s*(.+)/i) ||
      field(body, /Neighbor Device:\s*(.+)/i);
    const remotePortId =
      field(body, /Neighbor Port ID:\s*(.+)/i) ||
      field(body, /Port ID:\s*(.+)/i) ||
      field(body, /Neighbor Port:\s*(.+)/i);

    observations.push({
      localInterface,
      localInterfaceNorm: normalizePort(localInterface),
      remoteSystemName,
      remoteSystemNorm: remoteSystemName ? normalizeDevice(remoteSystemName) : null,
      remotePortId,
      remotePortNorm: remotePortId ? normalizePort(remotePortId) : null,
      sourceExcerpt: (sectionMatch[0] || "").slice(0, 800),
    });
  }

  if (!foundSections) {
    const blocks = normalized
      .split(/\n-{3,}\n?|\n(?=Chassis ID:)/i)
      .map((b) => b.trim())
      .filter((b) => /chassis id:/i.test(b) || /system name:/i.test(b));

    for (const block of blocks) {
      const localInterface =
        field(block, /Interface:\s*(.+)/i) ||
        field(block, /Local Interface:\s*(.+)/i) ||
        field(block, /Port:\s*(.+)/i);
      const remoteSystemName =
        field(block, /System Name:\s*(.+)/i) || field(block, /Neighbor Device:\s*(.+)/i);
      const remotePortId =
        field(block, /Port ID:\s*(.+)/i) || field(block, /Neighbor Port ID:\s*(.+)/i);

      if (!localInterface) {
        warnings.push("Skipped Arista LLDP block without local Interface");
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
  }

  if (observations.length === 0) {
    return {
      observations: [],
      warnings,
      failed: true,
      error: "Parsed zero usable neighbor entries from Arista EOS LLDP",
    };
  }

  return { observations, warnings, failed: false, format: "arista-eos-lldp" };
}
