"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { parseNeighborEvidence } from "@/lib/lldp/parse-neighbor-evidence";
import type { EvidenceFormat } from "@/lib/lldp/types";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";
import { recordAudit } from "@/lib/audit";
import { recomputeFindings } from "@/lib/verify/recompute";

const formatSchema = z
  .enum([
    "auto",
    "cisco-nxos-lldp",
    "cisco-ios-lldp",
    "cisco-cdp",
    "arista-eos-lldp",
    "juniper-junos-lldp",
  ])
  .default("auto");

const previewSchema = z.object({
  projectId: z.string(),
  text: z.string().min(1).max(2_000_000),
  format: formatSchema.optional(),
});

export async function previewLldpImport(raw: z.infer<typeof previewSchema>) {
  const user = await requireSessionUser();
  const data = previewSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canImportEvidence");
  await assertPaidOrThrow(data.projectId);
  return parseNeighborEvidence(data.text, (data.format ?? "auto") as EvidenceFormat | "auto");
}

const importSchema = z.object({
  projectId: z.string(),
  text: z.string().min(1).max(2_000_000),
  sourceDevice: z.string().min(1).max(120),
  captureTime: z.string().datetime().optional().nullable(),
  filename: z.string().max(255).optional(),
  format: formatSchema.optional(),
  deviceAliases: z
    .array(z.object({ alias: z.string(), deviceName: z.string() }))
    .optional(),
  portAliases: z
    .array(
      z.object({
        deviceName: z.string(),
        alias: z.string(),
        portLabel: z.string(),
      }),
    )
    .optional(),
});

export async function importLldpEvidence(raw: z.infer<typeof importSchema>) {
  const user = await requireSessionUser();
  const data = importSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canImportEvidence");
  await assertPaidOrThrow(data.projectId);

  const parsed = parseNeighborEvidence(
    data.text,
    (data.format ?? "auto") as EvidenceFormat | "auto",
  );
  const formatLabel = parsed.format ?? data.format ?? "auto";

  if (parsed.failed) {
    await prisma.evidenceImport.create({
      data: {
        projectId: data.projectId,
        sourceDevice: data.sourceDevice,
        sourceDeviceNorm: normalizeDevice(data.sourceDevice),
        uploadedById: user.id,
        filename: data.filename,
        rawTextHash: createHash("sha256").update(data.text).digest("hex"),
        parseWarnings: parsed.warnings,
        parseFailed: true,
        parseError: parsed.error,
        captureTime: data.captureTime ? new Date(data.captureTime) : null,
      },
    });
    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "evidence.neighbor.failed",
      summary: `Neighbor evidence import failed for ${data.sourceDevice}: ${parsed.error}`,
    });
    return { ok: false as const, error: parsed.error, warnings: parsed.warnings };
  }

  for (const a of data.deviceAliases ?? []) {
    await prisma.deviceAlias.upsert({
      where: {
        projectId_aliasNorm: {
          projectId: data.projectId,
          aliasNorm: normalizeDevice(a.alias),
        },
      },
      create: {
        projectId: data.projectId,
        alias: a.alias,
        aliasNorm: normalizeDevice(a.alias),
        deviceName: a.deviceName,
        deviceNorm: normalizeDevice(a.deviceName),
      },
      update: {
        deviceName: a.deviceName,
        deviceNorm: normalizeDevice(a.deviceName),
      },
    });
  }

  for (const p of data.portAliases ?? []) {
    const deviceNorm = normalizeDevice(p.deviceName);
    await prisma.portAlias.upsert({
      where: {
        projectId_deviceNorm_aliasNorm: {
          projectId: data.projectId,
          deviceNorm,
          aliasNorm: normalizePort(p.alias),
        },
      },
      create: {
        projectId: data.projectId,
        deviceNorm,
        alias: p.alias,
        aliasNorm: normalizePort(p.alias),
        portLabel: p.portLabel,
        portNorm: normalizePort(p.portLabel),
      },
      update: {
        portLabel: p.portLabel,
        portNorm: normalizePort(p.portLabel),
      },
    });
  }

  const imp = await prisma.evidenceImport.create({
    data: {
      projectId: data.projectId,
      sourceDevice: data.sourceDevice,
      sourceDeviceNorm: normalizeDevice(data.sourceDevice),
      uploadedById: user.id,
      filename: data.filename,
      rawTextHash: createHash("sha256").update(data.text).digest("hex"),
      parseWarnings: parsed.warnings,
      parseFailed: false,
      captureTime: data.captureTime ? new Date(data.captureTime) : null,
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

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "evidence.neighbor.import",
    summary: `Imported ${formatLabel} from ${data.sourceDevice} (${parsed.observations.length} neighbors)`,
    metadata: { format: formatLabel },
  });

  await recomputeFindings(data.projectId);
  revalidatePath(`/app/projects/${data.projectId}`);
  return {
    ok: true as const,
    importId: imp.id,
    observationCount: parsed.observations.length,
    warnings: parsed.warnings,
    format: parsed.format,
  };
}
