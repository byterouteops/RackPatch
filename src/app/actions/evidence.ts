"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { parseNeighborEvidence } from "@/lib/lldp/parse-neighbor-evidence";
import type { EvidenceFormat } from "@/lib/lldp/types";
import { looksLikeInterfaceStatus, parseInterfaceStatus } from "@/lib/lldp/interface-status";
import { storeEvidence } from "@/lib/evidence/store";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";
import { recordAudit } from "@/lib/audit";
import { recomputeFindings } from "@/lib/verify/recompute";
import { enqueueOutboundWebhook } from "@/lib/webhook-dispatch";
import { trackEvent } from "@/lib/analytics";

const formatSchema = z
  .enum([
    "auto",
    "cisco-nxos-lldp",
    "cisco-ios-lldp",
    "cisco-cdp",
    "arista-eos-lldp",
    "juniper-junos-lldp",
    "lldpd-keyvalue",
    "interface-status",
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
  const fmt = data.format ?? "auto";
  if (fmt === "interface-status" || (fmt === "auto" && looksLikeInterfaceStatus(data.text))) {
    const st = parseInterfaceStatus(data.text);
    return {
      observations: [],
      warnings: [
        ...st.warnings,
        ...(st.failed ? [] : [`Interface status: ${st.states.length} ports (${st.states.filter((s) => s.operState === "up").length} up). Used for link-down and speed checks, not neighbor matching.`]),
      ],
      failed: st.failed,
      error: st.error,
    };
  }
  return parseNeighborEvidence(data.text, fmt as EvidenceFormat | "auto");
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

  const job = await prisma.collectionJob.create({
    data: {
      projectId: data.projectId,
      status: "RUNNING",
      sourceDevice: data.sourceDevice,
      createdById: user.id,
      startedAt: new Date(),
      note: "manual_paste",
    },
  });

  const stored = await storeEvidence({
    projectId: data.projectId,
    sourceDevice: data.sourceDevice,
    text: data.text,
    uploadedById: user.id,
    filename: data.filename,
    captureTime: data.captureTime ? new Date(data.captureTime) : null,
    format: data.format ?? "auto",
  });

  if (!stored.ok) {
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: stored.error, evidenceImportId: stored.importId },
    });
    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "evidence.neighbor.failed",
      summary: `Evidence import failed for ${data.sourceDevice}: ${stored.error}`,
    });
    await recomputeFindings(data.projectId);
    return { ok: false as const, error: stored.error, warnings: stored.warnings, jobId: job.id };
  }
  const formatLabel = stored.formatId;

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

  await prisma.collectionJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", finishedAt: new Date(), evidenceImportId: stored.importId },
  });

  const noun = stored.kind === "INTERFACE_STATE" ? "interface states" : "neighbors";
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: stored.kind === "INTERFACE_STATE" ? "evidence.interface_state.import" : "evidence.neighbor.import",
    summary: `Imported ${formatLabel} from ${data.sourceDevice} (${stored.count} ${noun})`,
    metadata: { format: formatLabel, jobId: job.id },
  });

  await recomputeFindings(data.projectId);
  enqueueOutboundWebhook(data.projectId, "evidence.import", {
    importId: stored.importId,
    jobId: job.id,
    sourceDevice: data.sourceDevice,
    observationCount: stored.count,
  });
  await trackEvent({
    name: "evidence.import",
    projectId: data.projectId,
    actorId: user.id,
    props: { observationCount: stored.count },
  });
  revalidatePath(`/app/projects/${data.projectId}`);
  revalidatePath(`/app/projects/${data.projectId}/lldp`);
  return {
    ok: true as const,
    importId: stored.importId,
    jobId: job.id,
    observationCount: stored.count,
    warnings: stored.warnings,
    format: formatLabel,
  };
}
