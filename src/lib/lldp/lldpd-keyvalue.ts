import { normalizeDevice, normalizePort, trimField } from "@/lib/csv/normalize";
import {
  MAX_EVIDENCE_BYTES,
  type NeighborObservation,
  type NeighborParseResult,
} from "@/lib/lldp/types";

/**
 * lldpd `lldpcli show neighbors -f keyvalue` (Linux hosts, Cumulus Linux).
 *
 *   lldp.ens1f0np0.via=LLDP
 *   lldp.ens1f0np0.chassis.name=fe-leaf-01
 *   lldp.ens1f0np0.port.ifname=Ethernet1/1
 *
 * The remote port comes from port.ifname, then port.local, then port.mac. A MAC port ID is kept
 * verbatim and flagged: it only matches a plan port through an explicit port alias.
 */

const LINE_RE = /^lldp\.([^.=\s]+)\.([^=]+)=(.*)$/;

export function looksLikeLldpdKeyvalue(text: string): boolean {
  return /^lldp\.[^.=\s]+\.(chassis|port|via|rid|age)[.=]/m.test(text);
}

type Rec = { iface: string; fields: Map<string, string>; lines: string[] };

export function parseLldpdKeyvalue(text: string): NeighborParseResult {
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
  const records: Rec[] = [];
  const open = new Map<string, Rec>();

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, iface, key, value] = m;
    let rec = open.get(iface);
    if (!rec || rec.fields.has(key)) {
      rec = { iface, fields: new Map(), lines: [] };
      open.set(iface, rec);
      records.push(rec);
    }
    rec.fields.set(key, trimField(value));
    rec.lines.push(line);
  }

  const observations: NeighborObservation[] = [];
  for (const rec of records) {
    const name = rec.fields.get("chassis.name") || null;
    const portIfname = rec.fields.get("port.ifname") || rec.fields.get("port.local") || null;
    const portMac = rec.fields.get("port.mac") || null;
    const remotePortId = portIfname ?? portMac;
    if (!name && !rec.fields.get("chassis.mac")) {
      warnings.push(`Skipped ${rec.iface}: no chassis identity`);
      continue;
    }
    if (!portIfname && portMac) {
      warnings.push(`${rec.iface}: remote Port ID is a MAC (${portMac}); add a port alias to match it`);
    }
    observations.push({
      localInterface: rec.iface,
      localInterfaceNorm: normalizePort(rec.iface),
      remoteSystemName: name,
      remoteSystemNorm: name ? normalizeDevice(name) : null,
      remotePortId,
      remotePortNorm: remotePortId ? normalizePort(remotePortId) : null,
      sourceExcerpt: rec.lines.join("\n").slice(0, 800),
    });
  }

  if (observations.length === 0) {
    return {
      observations: [],
      warnings,
      failed: true,
      error: "Parsed zero usable neighbor entries from lldpd keyvalue output",
    };
  }
  return { observations, warnings, failed: false, format: "lldpd-keyvalue" };
}
