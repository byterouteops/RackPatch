import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  PLAN_FIELDS,
  normalizeMappedRows,
  type HeaderMapping,
  type PlanImportResult,
} from "@/lib/csv/plan-import";
import { toCsv } from "@/lib/csv/safe-export";

/**
 * GitOps plan documents (Phase 19 CE). Field names match the CSV plan import columns, so a
 * document round-trips through the same normalization/validation as CSV.
 */

export const GITOPS_API_VERSION = "rackpatch/v1";
export const GITOPS_KIND = "CablePlan";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CABLES = 50_000;

export type GitOpsCable = {
  cable_id: string;
  a_rack: string;
  a_device: string;
  a_port: string;
  z_rack: string;
  z_device: string;
  z_port: string;
  cable_type?: string | null;
  notes?: string | null;
};

export type GitOpsDocument = {
  apiVersion: typeof GITOPS_API_VERSION;
  kind: typeof GITOPS_KIND;
  metadata: {
    project?: string;
    site?: string;
    revision?: number;
    exportedAt?: string;
  };
  cables: GitOpsCable[];
};

export type GitOpsFormat = "yaml" | "json";

// Strings only: unquoted YAML like `001` would silently become the number 1, so require quoting.
const scalar = z.string();
const optionalScalar = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const cableSchema = z
  .object({
    cable_id: scalar,
    a_rack: scalar,
    a_device: scalar,
    a_port: scalar,
    z_rack: scalar,
    z_device: scalar,
    z_port: scalar,
    cable_type: optionalScalar,
    notes: optionalScalar,
  })
  .strict();

const docSchema = z.object({
  apiVersion: z.literal(GITOPS_API_VERSION),
  kind: z.literal(GITOPS_KIND),
  metadata: z
    .object({
      project: z.string().optional(),
      site: z.string().optional(),
      revision: z.number().int().optional(),
      exportedAt: z.string().optional(),
    })
    .passthrough()
    .optional(),
  cables: z.array(cableSchema).max(MAX_CABLES),
});

export function buildGitOpsDocument(input: {
  projectName: string;
  site?: string;
  revisionNumber: number;
  exportedAt?: Date;
  links: Array<{
    cableId: string;
    aRack: string;
    aDevice: string;
    aPort: string;
    zRack: string;
    zDevice: string;
    zPort: string;
    cableType: string | null;
    notes: string | null;
  }>;
}): GitOpsDocument {
  return {
    apiVersion: GITOPS_API_VERSION,
    kind: GITOPS_KIND,
    metadata: {
      project: input.projectName,
      ...(input.site ? { site: input.site } : {}),
      revision: input.revisionNumber,
      exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    },
    cables: input.links.map((l) => ({
      cable_id: l.cableId,
      a_rack: l.aRack,
      a_device: l.aDevice,
      a_port: l.aPort,
      z_rack: l.zRack,
      z_device: l.zDevice,
      z_port: l.zPort,
      cable_type: l.cableType,
      notes: l.notes,
    })),
  };
}

/** Deterministic serialization (stable key order) so Git diffs stay minimal. */
export function serializeGitOps(doc: GitOpsDocument, format: GitOpsFormat): string {
  if (format === "json") return JSON.stringify(doc, null, 2) + "\n";
  return stringifyYaml(doc, { lineWidth: 0 });
}

export type GitOpsParseResult = {
  document: GitOpsDocument | null;
  import: PlanImportResult | null;
  errors: string[];
};

const IDENTITY_MAPPING: HeaderMapping = Object.fromEntries(PLAN_FIELDS.map((f) => [f, f]));

/**
 * Parse YAML or JSON (JSON is valid YAML) and run it through plan-import normalization.
 * Never throws for bad content: returns errors instead.
 */
export function parseGitOps(text: string): GitOpsParseResult {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    return { document: null, import: null, errors: ["Document exceeds 5 MB"] };
  }
  let raw: unknown;
  try {
    // Plain-data schema + alias cap: no custom tags, no alias bombs.
    raw = parseYaml(text, { schema: "core", maxAliasCount: 10, uniqueKeys: true });
  } catch (e) {
    return {
      document: null,
      import: null,
      errors: [`Invalid YAML/JSON: ${e instanceof Error ? e.message.split("\n")[0] : "parse error"}`],
    };
  }

  const parsed = docSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      document: null,
      import: null,
      errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }

  const document: GitOpsDocument = {
    apiVersion: GITOPS_API_VERSION,
    kind: GITOPS_KIND,
    metadata: parsed.data.metadata ?? {},
    cables: parsed.data.cables.map((c) => ({ ...c })),
  };

  const records = document.cables.map((c) => ({
    cable_id: c.cable_id,
    a_rack: c.a_rack,
    a_device: c.a_device,
    a_port: c.a_port,
    z_rack: c.z_rack,
    z_device: c.z_device,
    z_port: c.z_port,
    cable_type: c.cable_type ?? "",
    notes: c.notes ?? "",
  }));
  // lineOffset 1 -> issues refer to the 1-based position in `cables:`
  const result = normalizeMappedRows(records, IDENTITY_MAPPING, 1);
  return { document, import: result, errors: [] };
}

/** Plan-import CSV equivalent of the parsed rows (feed to the existing Plan import to publish). */
export function gitOpsToCsv(result: PlanImportResult): string {
  return toCsv([
    [...PLAN_FIELDS],
    ...result.rows.map((r) => [
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
}
