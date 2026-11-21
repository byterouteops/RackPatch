import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * Cisco NX-OS `show lldp neighbors detail`
 * Local Port id / Port id / System Name / Chassis id
 */

function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split(/\n(?=Chassis id:)/i);
  if (parts.length > 1) {
    return parts.map((p) => p.trim()).filter(Boolean);
  }
  return normalized
    .split(/\n-{3,}\n|\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => /local port id:/i.test(p) || /chassis id:/i.test(p));
}

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function looksLikeNxosLldp(text: string): boolean {
  // NX-OS uses "Local Port id: Eth1/1". Junos also has "Local Port ID: <number>"
  // plus "Local Interface :" — exclude Junos and IOS Local Intf.
  return (
    /local port id:\s*(eth|ethernet|mgmt|po|port-channel)/i.test(text) &&
    !/local interface\s*:/i.test(text) &&
    !/local intf:/i.test(text) &&
    (/system name:/i.test(text) || /port id:/i.test(text)) &&
    /chassis id:/i.test(text)
  );
}

export function parseNxosLldpNeighborsDetail(text: string): NeighborParseResult {
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

  if (!looksLikeNxosLldp(text)) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: "Not Cisco NX-OS LLDP (expected Local Port id + Chassis id).",
    };
  }

  const blocks = splitBlocks(text);
  if (blocks.length === 0) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: "No NX-OS LLDP neighbor blocks could be extracted",
    };
  }

  for (const block of blocks) {
    const localInterface = field(block, /Local Port id:\s*(.+)/i);
    const remotePortId = field(block, /(?:^|\n)Port id:\s*(.+)/i);
    const remoteSystemName = field(block, /System Name:\s*(.+)/i);

    if (!localInterface) {
      warnings.push("Skipped a neighbor block without Local Port id");
      continue;
    }

    if (!remoteSystemName && !remotePortId) {
      warnings.push(`Local ${localInterface}: missing remote System Name and Port id`);
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
      error: "Parsed zero usable neighbor entries from NX-OS LLDP",
    };
  }

  return { observations, warnings, failed: false, format: "cisco-nxos-lldp" };
}
