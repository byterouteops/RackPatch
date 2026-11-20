import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";

/**
 * Supported format: Cisco NX-OS style `show lldp neighbors detail` text.
 *
 * Expected block markers (case-insensitive):
 *   Chassis id: ...
 *   Port id: ...
 *   Local Port id: ...
 *   System Name: ...
 *   System Description: ... (optional)
 *
 * Blocks are separated by blank lines or a line of dashes.
 * Representative fixtures live in /fixtures.
 */

export type LldpObservation = {
  localInterface: string;
  localInterfaceNorm: string;
  remoteSystemName: string | null;
  remoteSystemNorm: string | null;
  remotePortId: string | null;
  remotePortNorm: string | null;
  sourceExcerpt: string;
};

export type LldpParseResult = {
  observations: LldpObservation[];
  warnings: string[];
  failed: boolean;
  error?: string;
};

const MAX_BYTES = 2 * 1024 * 1024;

function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split(/\n(?=Chassis id:)/i);
  if (parts.length > 1) {
    return parts.map((p) => p.trim()).filter(Boolean);
  }
  // Fallback: dash or blank-line separated
  return normalized
    .split(/\n-{3,}\n|\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => /local port id:/i.test(p) || /chassis id:/i.test(p));
}

function field(block: string, label: RegExp): string | null {
  const m = block.match(label);
  return m ? trimField(m[1]) : null;
}

export function parseNxosLldpNeighborsDetail(text: string): LldpParseResult {
  if (!text || !trimField(text)) {
    return { observations: [], warnings: [], failed: true, error: "Empty LLDP input" };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: `LLDP file exceeds maximum size of ${MAX_BYTES} bytes`,
    };
  }

  const warnings: string[] = [];
  const observations: LldpObservation[] = [];

  const looksSupported =
    /local port id:/i.test(text) && (/system name:/i.test(text) || /port id:/i.test(text));

  if (!looksSupported) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error:
        "Unrecognized LLDP format. Supported: Cisco NX-OS `show lldp neighbors detail` with Local Port id, Port id, and System Name fields.",
    };
  }

  const blocks = splitBlocks(text);
  if (blocks.length === 0) {
    return {
      observations: [],
      warnings: [],
      failed: true,
      error: "No LLDP neighbor blocks could be extracted from the input",
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
      error: "Parsed zero usable neighbor entries from the LLDP input",
    };
  }

  return { observations, warnings, failed: false };
}
