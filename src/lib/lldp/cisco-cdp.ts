import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * Cisco CDP — `show cdp neighbors detail` (IOS / NX-OS style)
 *
 * Device ID: ...
 * Interface: GigabitEthernet1/0/1,  Port ID (outgoing port): GigabitEthernet0/1
 */

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function looksLikeCiscoCdp(text: string): boolean {
  return (
    /device id:/i.test(text) &&
    (/interface:/i.test(text) || /local interface:/i.test(text)) &&
    (/port id \(outgoing port\):/i.test(text) || /port id:/i.test(text)) &&
    !/local port id:/i.test(text) &&
    !/local intf:/i.test(text)
  );
}

export function parseCiscoCdpNeighborsDetail(text: string): NeighborParseResult {
  if (!text || !trimField(text)) {
    return { observations: [], warnings: [], failed: true, error: "Empty CDP input" };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_EVIDENCE_BYTES) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: `Evidence exceeds maximum size of ${MAX_EVIDENCE_BYTES} bytes`,
    };
  }
  if (!looksLikeCiscoCdp(text) && !(/device id:/i.test(text) && /interface:/i.test(text))) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: "Not Cisco CDP (expected Device ID + Interface).",
    };
  }

  const warnings: string[] = [];
  const observations: NeighborObservation[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n-{5,}\n?|\n(?=Device ID:)/i)
    .map((b) => b.trim())
    .filter((b) => /device id:/i.test(b));

  for (const block of blocks) {
    const remoteSystemName = field(block, /Device ID:\s*(.+)/i);
    // Classic: Interface: Gi1/0/1,  Port ID (outgoing port): Gi0/1
    const combo = block.match(
      /Interface:\s*([^,\n]+),\s*Port ID \(outgoing port\):\s*([^\n]+)/i,
    );
    let localInterface = combo ? trimField(combo[1]) : null;
    let remotePortId = combo ? trimField(combo[2]) : null;

    if (!localInterface) {
      localInterface =
        field(block, /Local Interface:\s*(.+)/i) || field(block, /Interface:\s*([^,\n]+)/i);
    }
    if (!remotePortId) {
      remotePortId =
        field(block, /Port ID \(outgoing port\):\s*(.+)/i) ||
        field(block, /(?:^|\n)Port ID:\s*(.+)/i);
    }

    if (!localInterface) {
      warnings.push("Skipped CDP block without local Interface");
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
      error: "Parsed zero usable neighbor entries from CDP",
    };
  }

  return { observations, warnings, failed: false, format: "cisco-cdp" };
}
