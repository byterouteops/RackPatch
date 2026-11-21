import { PLAN_FIELDS, normalizeMappedRows, type HeaderMapping, type ParsedPlanRow, type PlanIssue } from "@/lib/csv/plan-import";
import { toCsv } from "@/lib/csv/safe-export";
import { normalizeDevice } from "@/lib/csv/normalize";

/**
 * NetBox import-only mapping (Phase 19 CE). Pure functions: no network, no DB, no writes.
 * Accepts NetBox REST list payloads (3.3+ `a_terminations` and legacy `termination_a`).
 */

export type NetBoxDevice = {
  id: number | string;
  name: string;
  rack: string | null;
  site: string | null;
  status: string | null;
};

export type NetBoxEndpoint = { device: string; port: string };

export type NetBoxCable = {
  id: number | string;
  label: string | null;
  type: string | null;
  a: NetBoxEndpoint[];
  b: NetBoxEndpoint[];
  /** Terminations that exist but are not device ports (circuits, power, etc.). */
  unsupportedTerminations: number;
};

export type NetBoxData = { devices: NetBoxDevice[]; cables: NetBoxCable[] };

const MAX_FIXTURE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_TERMINATION_TYPES = new Set(["dcim.interface", "dcim.frontport", "dcim.rearport"]);

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: Json): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

/** NetBox nested refs look like {id, name, display} or {value,label}. */
function refName(v: Json): string | null {
  if (typeof v === "string") return str(v);
  if (!isObj(v)) return null;
  return str(v.name) ?? str(v.display) ?? str(v.label) ?? str(v.value);
}

function listOf(v: Json): Json[] {
  if (Array.isArray(v)) return v;
  if (isObj(v) && Array.isArray(v.results)) return v.results;
  return [];
}

export function parseNetBoxDevices(payload: Json): NetBoxDevice[] {
  const out: NetBoxDevice[] = [];
  for (const item of listOf(payload)) {
    if (!isObj(item)) continue;
    const name = str(item.name);
    if (!name) continue; // unnamed devices cannot map to plan endpoints
    out.push({
      id: typeof item.id === "number" || typeof item.id === "string" ? item.id : name,
      name,
      rack: refName(item.rack),
      site: refName(item.site),
      status: refName(item.status),
    });
  }
  return out;
}

function parseTermination(t: Json): NetBoxEndpoint | "unsupported" | null {
  if (!isObj(t)) return null;
  // 3.3+: {object_type: "dcim.interface", object: {name, device: {name}}}
  if (typeof t.object_type === "string") {
    if (!SUPPORTED_TERMINATION_TYPES.has(t.object_type)) return "unsupported";
    const obj = isObj(t.object) ? t.object : null;
    const device = obj ? refName(obj.device) : null;
    const port = obj ? str(obj.name) : null;
    return device && port ? { device, port } : null;
  }
  // legacy: {device: {name}, name}
  const device = refName(t.device);
  const port = str(t.name);
  return device && port ? { device, port } : null;
}

function terminationsOf(item: Record<string, Json>, side: "a" | "b"): { eps: NetBoxEndpoint[]; unsupported: number } {
  const modern = item[`${side}_terminations`];
  const legacy = item[`termination_${side}`];
  const raw: Json[] = Array.isArray(modern) ? modern : legacy ? [legacy] : [];
  const eps: NetBoxEndpoint[] = [];
  let unsupported = 0;
  for (const t of raw) {
    const p = parseTermination(t);
    if (p === "unsupported") unsupported += 1;
    else if (p) eps.push(p);
  }
  return { eps, unsupported };
}

export function parseNetBoxCables(payload: Json): NetBoxCable[] {
  const out: NetBoxCable[] = [];
  for (const item of listOf(payload)) {
    if (!isObj(item)) continue;
    const id = typeof item.id === "number" || typeof item.id === "string" ? item.id : null;
    if (id === null) continue;
    const a = terminationsOf(item, "a");
    const b = terminationsOf(item, "b");
    out.push({
      id,
      label: str(item.label),
      type: refName(item.type),
      a: a.eps,
      b: b.eps,
      unsupportedTerminations: a.unsupported + b.unsupported,
    });
  }
  return out;
}

/** Parse a NetBox-like JSON fixture: `{devices, cables}`, or a bare devices array / list payload. */
export function parseNetBoxFixture(text: string): NetBoxData {
  if (Buffer.byteLength(text, "utf8") > MAX_FIXTURE_BYTES) {
    throw new Error("Fixture exceeds 5 MB");
  }
  let json: Json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Fixture is not valid JSON");
  }
  if (isObj(json) && ("devices" in json || "cables" in json)) {
    return {
      devices: parseNetBoxDevices(json.devices),
      cables: parseNetBoxCables(json.cables),
    };
  }
  return { devices: parseNetBoxDevices(json), cables: [] };
}

export type DeviceMatch = "plan" | "alias" | "none";

export type NetBoxPreviewContext = {
  /** normalized device names in the active plan */
  planDeviceNorms: Set<string>;
  /** aliasNorm -> deviceNorm from DeviceAlias */
  aliasNorms: Map<string, string>;
  /** endpointKey of every link in the active plan */
  planEndpointKeys: Set<string>;
};

export type NetBoxPreview = {
  devices: {
    total: number;
    matchedPlan: number;
    matchedAlias: number;
    unmatched: number;
    sample: Array<{ name: string; rack: string | null; site: string | null; status: string | null; match: DeviceMatch }>;
  };
  cables: {
    total: number;
    mappable: number;
    skipped: number;
    alreadyInPlan: number;
    newToPlan: number;
    rows: ParsedPlanRow[];
  };
  errors: PlanIssue[];
  warnings: string[];
  /** Plan-import CSV for mappable cables (paste into Plan import to publish; nothing is written here). */
  planCsv: string;
};

export function matchDevice(name: string, ctx: NetBoxPreviewContext): DeviceMatch {
  const norm = normalizeDevice(name);
  if (ctx.planDeviceNorms.has(norm)) return "plan";
  if (ctx.aliasNorms.has(norm)) return "alias";
  return "none";
}

const IDENTITY_MAPPING: HeaderMapping = Object.fromEntries(PLAN_FIELDS.map((f) => [f, f]));

export function buildNetBoxPreview(data: NetBoxData, ctx: NetBoxPreviewContext): NetBoxPreview {
  const warnings: string[] = [];
  const rackByDevice = new Map(data.devices.map((d) => [normalizeDevice(d.name), d.rack]));

  const deviceRows = data.devices.map((d) => ({
    name: d.name,
    rack: d.rack,
    site: d.site,
    status: d.status,
    match: matchDevice(d.name, ctx),
  }));

  const records: Record<string, string>[] = [];
  let skipped = 0;
  for (const c of data.cables) {
    const tag = `Cable ${c.id}`;
    if (c.unsupportedTerminations > 0) {
      skipped += 1;
      warnings.push(`${tag}: skipped (non-device-port termination, e.g. circuit/power)`);
      continue;
    }
    if (c.a.length !== 1 || c.b.length !== 1) {
      skipped += 1;
      warnings.push(
        `${tag}: skipped (${c.a.length} A / ${c.b.length} B terminations; plan links need exactly one each)`,
      );
      continue;
    }
    const [a] = c.a;
    const [z] = c.b;
    const aRack = rackByDevice.get(normalizeDevice(a.device)) ?? null;
    const zRack = rackByDevice.get(normalizeDevice(z.device)) ?? null;
    if (!aRack || !zRack) {
      warnings.push(`${tag}: rack unknown for ${!aRack ? a.device : z.device}; using "UNASSIGNED"`);
    }
    records.push({
      cable_id: `NB-${c.id}`,
      a_rack: aRack ?? "UNASSIGNED",
      a_device: a.device,
      a_port: a.port,
      z_rack: zRack ?? "UNASSIGNED",
      z_device: z.device,
      z_port: z.port,
      cable_type: c.type ?? "",
      notes: c.label ? `NetBox label: ${c.label}` : "",
    });
  }

  const normalized = normalizeMappedRows(records, IDENTITY_MAPPING, 1);
  const rows = normalized.rows;
  const alreadyInPlan = rows.filter((r) => ctx.planEndpointKeys.has(r.endpointKey)).length;

  const header = [...PLAN_FIELDS];
  const planCsv = toCsv([
    header,
    ...rows.map((r) => [
      r.cableId,
      r.aRack,
      r.aDevice,
      r.aPort,
      r.zRack,
      r.zDevice,
      r.zPort,
      r.cableType,
      r.notes,
    ]),
  ]);

  return {
    devices: {
      total: deviceRows.length,
      matchedPlan: deviceRows.filter((d) => d.match === "plan").length,
      matchedAlias: deviceRows.filter((d) => d.match === "alias").length,
      unmatched: deviceRows.filter((d) => d.match === "none").length,
      sample: deviceRows.slice(0, 100),
    },
    cables: {
      total: data.cables.length,
      mappable: rows.length,
      skipped,
      alreadyInPlan,
      newToPlan: rows.length - alreadyInPlan,
      rows: rows.slice(0, 100),
    },
    errors: normalized.errors,
    warnings: warnings.slice(0, 200),
    planCsv,
  };
}

/** Counts-only summary persisted on SyncJob (no payloads, no tokens). */
export function summarizePreview(p: NetBoxPreview): Record<string, number> {
  return {
    devices: p.devices.total,
    devicesMatchedPlan: p.devices.matchedPlan,
    devicesMatchedAlias: p.devices.matchedAlias,
    devicesUnmatched: p.devices.unmatched,
    cables: p.cables.total,
    cablesMappable: p.cables.mappable,
    cablesSkipped: p.cables.skipped,
    cablesAlreadyInPlan: p.cables.alreadyInPlan,
    cablesNew: p.cables.newToPlan,
    errors: p.errors.length,
    warnings: p.warnings.length,
  };
}
