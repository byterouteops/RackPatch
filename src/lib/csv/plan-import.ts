import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  endpointKey,
  normalizeDevice,
  normalizePort,
  trimField,
} from "./normalize";

export const PLAN_FIELDS = [
  "cable_id",
  "a_rack",
  "a_device",
  "a_port",
  "z_rack",
  "z_device",
  "z_port",
  "cable_type",
  "notes",
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number];

export type HeaderMapping = Partial<Record<PlanField, string>>;

export type ParsedPlanRow = {
  lineNumber: number;
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  aDeviceNorm: string;
  aPortNorm: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  zDeviceNorm: string;
  zPortNorm: string;
  cableType: string | null;
  notes: string | null;
  endpointKey: string;
};

export type PlanIssue = {
  lineNumber: number;
  severity: "error" | "warning";
  message: string;
  cableId?: string;
};

export type PlanImportResult = {
  rows: ParsedPlanRow[];
  errors: PlanIssue[];
  warnings: PlanIssue[];
  headers: string[];
};

const REQUIRED: PlanField[] = [
  "cable_id",
  "a_rack",
  "a_device",
  "a_port",
  "z_rack",
  "z_device",
  "z_port",
];

const MAX_ROWS = 50_000;
const MAX_BYTES = 5 * 1024 * 1024;

export function suggestMapping(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {};
  const lower = headers.map((h) => ({ raw: h, key: trimField(h).toLowerCase().replace(/\s+/g, "_") }));

  const aliases: Record<PlanField, string[]> = {
    cable_id: ["cable_id", "cableid", "cable", "id", "link_id"],
    a_rack: ["a_rack", "arack", "rack_a", "from_rack", "near_rack"],
    a_device: ["a_device", "adevice", "device_a", "from_device", "near_device", "a_host"],
    a_port: ["a_port", "aport", "port_a", "from_port", "near_port", "a_interface"],
    z_rack: ["z_rack", "zrack", "rack_z", "to_rack", "far_rack"],
    z_device: ["z_device", "zdevice", "device_z", "to_device", "far_device", "z_host"],
    z_port: ["z_port", "zport", "port_z", "to_port", "far_port", "z_interface"],
    cable_type: ["cable_type", "type", "media", "speed"],
    notes: ["notes", "note", "comment", "comments"],
  };

  for (const field of PLAN_FIELDS) {
    const hit = lower.find((h) => aliases[field].includes(h.key));
    if (hit) mapping[field] = hit.raw;
  }
  return mapping;
}

export function parseCsvText(text: string): { headers: string[]; records: Record<string, string>[]; lineOffset: number } {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    throw new Error(`CSV exceeds maximum size of ${MAX_BYTES} bytes`);
  }

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
    bom: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  if (records.length > MAX_ROWS) {
    throw new Error(`CSV exceeds maximum of ${MAX_ROWS} data rows`);
  }

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, records, lineOffset: 2 };
}

const rowSchema = z.object({
  cableId: z.string().min(1),
  aRack: z.string().min(1),
  aDevice: z.string().min(1),
  aPort: z.string().min(1),
  zRack: z.string().min(1),
  zDevice: z.string().min(1),
  zPort: z.string().min(1),
  cableType: z.string().nullable(),
  notes: z.string().nullable(),
});

export function normalizeMappedRows(
  records: Record<string, string>[],
  mapping: HeaderMapping,
  lineOffset = 2,
): PlanImportResult {
  const errors: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  const rows: ParsedPlanRow[] = [];

  for (const field of REQUIRED) {
    if (!mapping[field]) {
      errors.push({
        lineNumber: 0,
        severity: "error",
        message: `Required field "${field}" is not mapped to a CSV column`,
      });
    }
  }
  if (errors.length) {
    return { rows: [], errors, warnings, headers: [] };
  }

  const get = (rec: Record<string, string>, field: PlanField) =>
    trimField(rec[mapping[field] as string] ?? "");

  const cableIds = new Map<string, number>();
  const ports = new Map<string, { line: number; cableId: string }>();

  records.forEach((rec, idx) => {
    const lineNumber = idx + lineOffset;
    const cableId = get(rec, "cable_id");
    const aRack = get(rec, "a_rack");
    const aDevice = get(rec, "a_device");
    const aPort = get(rec, "a_port");
    const zRack = get(rec, "z_rack");
    const zDevice = get(rec, "z_device");
    const zPort = get(rec, "z_port");
    const cableType = mapping.cable_type ? get(rec, "cable_type") || null : null;
    const notes = mapping.notes ? get(rec, "notes") || null : null;

    const parsed = rowSchema.safeParse({
      cableId,
      aRack,
      aDevice,
      aPort,
      zRack,
      zDevice,
      zPort,
      cableType,
      notes,
    });

    if (!parsed.success) {
      errors.push({
        lineNumber,
        severity: "error",
        message: `Missing required values: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
        cableId: cableId || undefined,
      });
      return;
    }

    const aDeviceNorm = normalizeDevice(aDevice);
    const aPortNorm = normalizePort(aPort);
    const zDeviceNorm = normalizeDevice(zDevice);
    const zPortNorm = normalizePort(zPort);

    if (aDeviceNorm === zDeviceNorm && aPortNorm === zPortNorm) {
      errors.push({
        lineNumber,
        severity: "error",
        message: `Link has identical endpoints (${aDevice} ${aPort})`,
        cableId,
      });
      return;
    }

    if (cableIds.has(cableId)) {
      errors.push({
        lineNumber,
        severity: "error",
        message: `Duplicate cable_id "${cableId}" (also on line ${cableIds.get(cableId)})`,
        cableId,
      });
      return;
    }
    cableIds.set(cableId, lineNumber);

    const aKey = `${aDeviceNorm}|${aPortNorm}`;
    const zKey = `${zDeviceNorm}|${zPortNorm}`;
    for (const [portKey, label] of [
      [aKey, "A"],
      [zKey, "Z"],
    ] as const) {
      const existing = ports.get(portKey);
      if (existing) {
        errors.push({
          lineNumber,
          severity: "error",
          message: `Port conflict on ${label}-end: same physical port already used by cable ${existing.cableId} (line ${existing.line})`,
          cableId,
        });
      } else {
        ports.set(portKey, { line: lineNumber, cableId });
      }
    }

    rows.push({
      lineNumber,
      cableId,
      aRack,
      aDevice,
      aPort,
      aDeviceNorm,
      aPortNorm,
      zRack,
      zDevice,
      zPort,
      zDeviceNorm,
      zPortNorm,
      cableType,
      notes,
      endpointKey: endpointKey(aDeviceNorm, aPortNorm, zDeviceNorm, zPortNorm),
    });
  });

  return { rows, errors, warnings, headers: Object.values(mapping).filter(Boolean) as string[] };
}

export function importPlanCsv(text: string, mapping?: HeaderMapping): PlanImportResult & { mapping: HeaderMapping } {
  const { headers, records, lineOffset } = parseCsvText(text);
  const resolved = mapping && Object.keys(mapping).length ? mapping : suggestMapping(headers);
  const result = normalizeMappedRows(records, resolved, lineOffset);
  return { ...result, mapping: resolved, headers };
}

export const SAMPLE_CSV = `cable_id,a_rack,a_device,a_port,z_rack,z_device,z_port,cable_type,notes
C-001,R01,GPU-07,NIC 2,R01,Leaf-02,Ethernet17,400G DAC,Backend fabric
`;
