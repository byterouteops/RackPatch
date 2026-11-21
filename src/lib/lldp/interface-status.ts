import { normalizePort, trimField } from "@/lib/csv/normalize";
import { MAX_EVIDENCE_BYTES } from "@/lib/lldp/types";

/**
 * NX-OS / Arista EOS `show interface status`: operational state and negotiated speed per port.
 * This is the only trusted source for LINK_DOWN and SPEED_MISMATCH; LLDP never implies speed.
 */

export type InterfaceState = {
  port: string;
  portNorm: string;
  /** up | down | disabled */
  operState: "up" | "down" | "disabled";
  speed: string | null;
  raw: string;
};

export type InterfaceStatusParseResult = {
  states: InterfaceState[];
  warnings: string[];
  failed: boolean;
  error?: string;
  format?: "nxos-interface-status" | "eos-interface-status";
};

const STATUS_RE = /^(connected|notconnec|notconnect|disabled|sfpAbsent|xcvrAbsen|xcvrAbsent|down|err-disabled|errdisabled|inactive|noOperMem|linkFlapE)$/i;

function expandPort(token: string): string {
  return token.replace(/^Et(?=\d)/, "Ethernet");
}

export function normalizeSpeed(token: string | undefined | null): string | null {
  if (!token) return null;
  const t = token.replace(/^a-/i, "").trim();
  if (!t || /^(auto|--|unknown)$/i.test(t)) return null;
  const g = t.match(/^(\d+(?:\.\d+)?)\s*g(?:bps)?$/i);
  if (g) return `${g[1]}G`;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 1000 ? `${n / 1000}G` : `${n}M`;
  }
  return t.toUpperCase();
}

export function looksLikeInterfaceStatus(text: string): boolean {
  return /^\s*Port\s+Name\s+Status\s+Vlan\s+Duplex\s+Speed/im.test(text);
}

export function parseInterfaceStatus(text: string): InterfaceStatusParseResult {
  if (!text || !trimField(text)) return { states: [], warnings: [], failed: true, error: "Empty input" };
  if (Buffer.byteLength(text, "utf8") > MAX_EVIDENCE_BYTES) {
    return { states: [], warnings: [], failed: true, error: `Evidence exceeds maximum size of ${MAX_EVIDENCE_BYTES} bytes` };
  }
  if (!looksLikeInterfaceStatus(text)) {
    return { states: [], warnings: [], failed: true, error: "Not `show interface status` output (missing Port/Name/Status/Vlan/Duplex/Speed header)" };
  }

  const warnings: string[] = [];
  const states: InterfaceState[] = [];
  const isEos = /\bFlags\b|\bEncapsulation\b/.test(text) || /^\s*Et\d/m.test(text);

  let inTable = false;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*Port\s+Name\s+Status/i.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable || !line.trim() || /^[-\s]+$/.test(line) || /^\s*[!#]/.test(line)) continue;
    const tokens = line.trim().split(/\s+/);
    const statusIdx = tokens.findIndex((t, i) => i > 0 && STATUS_RE.test(t));
    if (statusIdx < 0) {
      warnings.push(`Skipped line without a recognised status: ${line.trim().slice(0, 60)}`);
      continue;
    }
    const status = tokens[statusIdx].toLowerCase();
    const port = expandPort(tokens[0]);
    states.push({
      port,
      portNorm: normalizePort(port),
      operState: status === "connected" ? "up" : status === "disabled" ? "disabled" : "down",
      speed: status === "connected" ? normalizeSpeed(tokens[statusIdx + 3]) : null,
      raw: line.trim(),
    });
  }

  if (states.length === 0) {
    return { states: [], warnings, failed: true, error: "Parsed zero interface rows" };
  }
  return { states, warnings, failed: false, format: isEos ? "eos-interface-status" : "nxos-interface-status" };
}
