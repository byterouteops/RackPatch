import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeDevice } from "@/lib/csv/normalize";
import { parseNeighborEvidence } from "@/lib/lldp/parse-neighbor-evidence";
import { looksLikeInterfaceStatus, parseInterfaceStatus } from "@/lib/lldp/interface-status";
import type { EvidenceFormat } from "@/lib/lldp/types";

export type EvidenceFormatChoice = EvidenceFormat | "interface-status" | "auto";

export type StoreEvidenceInput = {
  projectId: string;
  sourceDevice: string;
  text: string;
  uploadedById: string;
  filename?: string | null;
  captureTime?: Date | null;
  format?: EvidenceFormatChoice;
  synthetic?: boolean;
  demoSnapshot?: string | null;
  osProfile?: string | null;
};

export type StoreEvidenceResult =
  | { ok: true; importId: string; kind: "NEIGHBOR" | "INTERFACE_STATE"; count: number; warnings: string[]; formatId: string }
  | { ok: false; importId: string; error: string; warnings: string[] };

/**
 * Parse and persist one evidence capture. Neighbor (LLDP/CDP/lldpd) and interface-state
 * (`show interface status`) captures share the EvidenceImport row and differ by `kind`.
 * Failed parses are stored too (parseFailed) so PARSER_ERROR can be reported.
 */
export async function storeEvidence(input: StoreEvidenceInput): Promise<StoreEvidenceResult> {
  const format = input.format ?? "auto";
  const isState = format === "interface-status" || (format === "auto" && looksLikeInterfaceStatus(input.text));
  const common = {
    projectId: input.projectId,
    sourceDevice: input.sourceDevice,
    sourceDeviceNorm: normalizeDevice(input.sourceDevice),
    uploadedById: input.uploadedById,
    filename: input.filename ?? null,
    rawTextHash: createHash("sha256").update(input.text).digest("hex"),
    captureTime: input.captureTime ?? null,
    synthetic: input.synthetic ?? false,
    demoSnapshot: input.demoSnapshot ?? null,
    osProfile: input.osProfile ?? null,
  };

  if (isState) {
    const parsed = parseInterfaceStatus(input.text);
    if (parsed.failed) {
      const imp = await prisma.evidenceImport.create({
        data: { ...common, kind: "INTERFACE_STATE", parseWarnings: parsed.warnings, parseFailed: true, parseError: parsed.error },
      });
      return { ok: false, importId: imp.id, error: parsed.error ?? "Parse failed", warnings: parsed.warnings };
    }
    const imp = await prisma.evidenceImport.create({
      data: {
        ...common,
        kind: "INTERFACE_STATE",
        formatId: parsed.format,
        parseWarnings: parsed.warnings,
        interfaceStates: {
          create: parsed.states.map((s) => ({ port: s.port, portNorm: s.portNorm, operState: s.operState, speed: s.speed })),
        },
      },
    });
    return { ok: true, importId: imp.id, kind: "INTERFACE_STATE", count: parsed.states.length, warnings: parsed.warnings, formatId: parsed.format! };
  }

  const parsed = parseNeighborEvidence(input.text, format as EvidenceFormat | "auto");
  if (parsed.failed) {
    const imp = await prisma.evidenceImport.create({
      data: { ...common, kind: "NEIGHBOR", parseWarnings: parsed.warnings, parseFailed: true, parseError: parsed.error },
    });
    return { ok: false, importId: imp.id, error: parsed.error ?? "Parse failed", warnings: parsed.warnings };
  }
  const imp = await prisma.evidenceImport.create({
    data: {
      ...common,
      kind: "NEIGHBOR",
      formatId: parsed.format ?? null,
      parseWarnings: parsed.warnings,
      observations: {
        create: parsed.observations.map((o) => ({
          localInterface: o.localInterface,
          localInterfaceNorm: o.localInterfaceNorm,
          remoteSystemName: o.remoteSystemName,
          remoteSystemNorm: o.remoteSystemNorm,
          remotePortId: o.remotePortId,
          remotePortNorm: o.remotePortNorm,
          sourceExcerpt: o.sourceExcerpt,
        })),
      },
    },
  });
  return { ok: true, importId: imp.id, kind: "NEIGHBOR", count: parsed.observations.length, warnings: parsed.warnings, formatId: parsed.format ?? "auto" };
}
