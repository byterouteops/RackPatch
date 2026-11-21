"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { diffRevisions, toSnapshot } from "@/lib/csv/diff-revisions";
import {
  buildNetBoxPreview,
  parseNetBoxFixture,
  summarizePreview,
  type NetBoxData,
  type NetBoxPreview,
} from "@/lib/netbox";
import { fetchNetBoxData, normalizeNetBoxBaseUrl } from "@/lib/netbox-client";
import { parseNetBoxCableId, patchNetBoxCableLabel } from "@/lib/netbox-write";
import { gitOpsToCsv, parseGitOps, type GitOpsFormat } from "@/lib/gitops";
import { buildActivePlanGitOps } from "@/lib/gitops-export";
import { importPlanCsv, type HeaderMapping } from "@/lib/csv/plan-import";
import { publishPlanRevision } from "@/lib/plan/publish";
import { notifyProjectLeads } from "@/lib/notifications";
import { createHash } from "crypto";

const saveSchema = z.object({
  projectId: z.string(),
  baseUrl: z.string().min(1).max(2048),
  /** Omit/empty on update to keep the stored token. */
  token: z.string().max(512).optional(),
  enabled: z.boolean().default(true),
  writeEnabled: z.boolean().default(false),
});

/** Save NetBox URL + token (token AES-GCM encrypted). writeEnabled gates outbound PATCH. */
export async function saveNetBoxConfig(raw: z.input<typeof saveSchema>) {
  const user = await requireSessionUser();
  const data = saveSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const baseUrl = normalizeNetBoxBaseUrl(data.baseUrl);
  const token = data.token?.trim();

  const existing = await prisma.integrationConfig.findUnique({
    where: { projectId_kind: { projectId: data.projectId, kind: "NETBOX" } },
  });
  if (!existing && !token) throw new Error("API token is required");

  const tokenCiphertext = token ? encryptSecret(token) : existing!.tokenCiphertext;
  await prisma.integrationConfig.upsert({
    where: { projectId_kind: { projectId: data.projectId, kind: "NETBOX" } },
    create: {
      projectId: data.projectId,
      kind: "NETBOX",
      baseUrl,
      tokenCiphertext,
      enabled: data.enabled,
      writeEnabled: data.writeEnabled,
      createdById: user.id,
    },
    update: {
      baseUrl,
      tokenCiphertext,
      enabled: data.enabled,
      writeEnabled: data.writeEnabled,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "integration.netbox.save",
    summary: `Saved NetBox connection ${baseUrl}${token ? " (token updated)" : ""}${data.writeEnabled ? " [writes ON]" : ""}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/integrations`);
  return { ok: true as const, baseUrl };
}

export async function removeNetBoxConfig(raw: { projectId: string }) {
  const user = await requireSessionUser();
  const { projectId } = z.object({ projectId: z.string() }).parse(raw);
  await requireProjectAccess(user, projectId, "canManageProject");
  await assertPaidOrThrow(projectId);

  await prisma.integrationConfig.deleteMany({ where: { projectId, kind: "NETBOX" } });
  await recordAudit({
    projectId,
    actorId: user.id,
    action: "integration.netbox.remove",
    summary: "Removed NetBox connection",
  });
  revalidatePath(`/app/projects/${projectId}/integrations`);
  return { ok: true as const };
}

async function loadPreviewContext(projectId: string, activeRevisionId: string | null) {
  const planDeviceNorms = new Set<string>();
  const planEndpointKeys = new Set<string>();
  if (activeRevisionId) {
    const links = await prisma.plannedLink.findMany({
      where: { revisionId: activeRevisionId },
      select: { aDeviceNorm: true, zDeviceNorm: true, endpointKey: true },
    });
    for (const l of links) {
      planDeviceNorms.add(l.aDeviceNorm);
      planDeviceNorms.add(l.zDeviceNorm);
      planEndpointKeys.add(l.endpointKey);
    }
  }
  const aliases = await prisma.deviceAlias.findMany({ where: { projectId } });
  const aliasNorms = new Map(aliases.map((a) => [a.aliasNorm, a.deviceNorm]));
  return { planDeviceNorms, planEndpointKeys, aliasNorms };
}

async function runPreviewJob(input: {
  projectId: string;
  userId: string;
  integrationId: string | null;
  source: "netbox_live" | "netbox_fixture";
  activeRevisionId: string | null;
  load: () => Promise<NetBoxData>;
}): Promise<{ ok: true; jobId: string; preview: NetBoxPreview } | { ok: false; jobId: string; error: string }> {
  // Preview jobs are dry-run; apply/write use separate actions.
  const job = await prisma.syncJob.create({
    data: {
      projectId: input.projectId,
      integrationId: input.integrationId,
      source: input.source,
      status: "RUNNING",
      dryRun: true,
      createdById: input.userId,
    },
  });
  try {
    const data = await input.load();
    const ctx = await loadPreviewContext(input.projectId, input.activeRevisionId);
    const preview = buildNetBoxPreview(data, ctx);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        summary: JSON.stringify(summarizePreview(preview)),
      },
    });
    await recordAudit({
      projectId: input.projectId,
      actorId: input.userId,
      action: "integration.netbox.dry_run",
      summary: `NetBox dry-run (${input.source}): ${preview.cables.mappable} mappable cables, ${preview.devices.total} devices`,
      metadata: { jobId: job.id, source: input.source },
    });
    return { ok: true, jobId: job.id, preview };
  } catch (e) {
    const error = (e instanceof Error ? e.message : "Dry-run failed").slice(0, 300);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error },
    });
    return { ok: false, jobId: job.id, error };
  }
}

/** Live NetBox dry-run: read-only GETs, SSRF-guarded, preview only. */
export async function runNetBoxDryRun(raw: { projectId: string }) {
  const user = await requireSessionUser();
  const { projectId } = z.object({ projectId: z.string() }).parse(raw);
  const access = await requireProjectAccess(user, projectId, "canManageProject");
  await assertPaidOrThrow(projectId);

  const config = await prisma.integrationConfig.findUnique({
    where: { projectId_kind: { projectId, kind: "NETBOX" } },
  });
  if (!config) throw new Error("NetBox is not configured");
  if (!config.enabled) throw new Error("NetBox integration is disabled");

  const result = await runPreviewJob({
    projectId,
    userId: user.id,
    integrationId: config.id,
    source: "netbox_live",
    activeRevisionId: access.project.activeRevisionId,
    load: () => fetchNetBoxData(config.baseUrl, decryptSecret(config.tokenCiphertext)),
  });
  revalidatePath(`/app/projects/${projectId}/integrations`);
  return result;
}

const fixtureSchema = z.object({
  projectId: z.string(),
  json: z.string().min(2).max(5_000_000),
});

/** Preview a NetBox-like JSON export (no live NetBox needed). */
export async function previewNetBoxFixture(raw: z.infer<typeof fixtureSchema>) {
  const user = await requireSessionUser();
  const data = fixtureSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId, "canPublishPlan");
  await assertPaidOrThrow(data.projectId);

  const result = await runPreviewJob({
    projectId: data.projectId,
    userId: user.id,
    integrationId: null,
    source: "netbox_fixture",
    activeRevisionId: access.project.activeRevisionId,
    load: async () => parseNetBoxFixture(data.json),
  });
  revalidatePath(`/app/projects/${data.projectId}/integrations`);
  return result;
}

const exportSchema = z.object({
  projectId: z.string(),
  format: z.enum(["yaml", "json"]).default("yaml"),
});

/** Export the active plan as YAML/JSON (GitOps). Returns text for client download. */
export async function exportPlanGitOps(raw: z.input<typeof exportSchema>) {
  const user = await requireSessionUser();
  const data = exportSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canExport");
  await assertPaidOrThrow(data.projectId);

  const out = await buildActivePlanGitOps(data.projectId, data.format as GitOpsFormat);
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "gitops.export",
    summary: `Exported plan r${out.revisionNumber} as ${data.format} (${out.cableCount} cables)`,
  });
  return out;
}

const importSchema = z.object({
  projectId: z.string(),
  text: z.string().min(1).max(5_000_000),
});

const applyPlanSchema = z.object({
  projectId: z.string(),
  planCsv: z.string().min(1).max(5_000_000),
  note: z.string().max(500).optional(),
  confirm: z.literal(true),
});

/**
 * Apply a NetBox dry-run preview CSV as a new plan revision (writes RackPatch plan, not NetBox).
 */
export async function applyNetBoxPlanImport(raw: z.input<typeof applyPlanSchema>) {
  const user = await requireSessionUser();
  const data = applyPlanSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canPublishPlan");
  await assertPaidOrThrow(data.projectId);

  const mapping = Object.fromEntries(
    [
      "cable_id",
      "a_rack",
      "a_device",
      "a_port",
      "z_rack",
      "z_device",
      "z_port",
      "cable_type",
      "notes",
    ].map((f) => [f, f]),
  ) as HeaderMapping;

  const result = importPlanCsv(data.planCsv, mapping);
  if (result.errors.length || result.rows.length === 0) {
    throw new Error(
      `Cannot apply NetBox preview: ${result.errors[0]?.message ?? "no mappable cables"}`,
    );
  }

  const importKey = `netbox-apply-${createHash("sha256").update(data.planCsv).digest("hex").slice(0, 32)}`;
  const job = await prisma.syncJob.create({
    data: {
      projectId: data.projectId,
      source: "netbox_apply_plan",
      status: "RUNNING",
      dryRun: false,
      createdById: user.id,
    },
  });

  try {
    const published = await publishPlanRevision({
      projectId: data.projectId,
      actorId: user.id,
      rows: result.rows,
      note: data.note ?? "Applied from NetBox preview",
      importKey,
      sourceCsv: data.planCsv,
    });

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        summary: JSON.stringify({
          cables: result.rows.length,
          revisionNumber: published.revision.revisionNumber,
          deduplicated: published.deduplicated,
        }),
      },
    });

    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "integration.netbox.apply_plan",
      summary: `Applied NetBox preview as plan r${published.revision.revisionNumber} (${result.rows.length} cables)`,
      metadata: { jobId: job.id, revisionId: published.revision.id },
    });

    await notifyProjectLeads({
      projectId: data.projectId,
      actorId: user.id,
      kind: "integration.netbox.apply_plan",
      title: "NetBox plan applied",
      body: `Revision r${published.revision.revisionNumber} · ${result.rows.length} cables`,
      href: `/app/projects/${data.projectId}/plan`,
      sourceId: job.id,
    });

    revalidatePath(`/app/projects/${data.projectId}`);
    revalidatePath(`/app/projects/${data.projectId}/integrations`);
    revalidatePath(`/app/projects/${data.projectId}/plan`);
    return {
      ok: true as const,
      jobId: job.id,
      revisionNumber: published.revision.revisionNumber,
      cableCount: result.rows.length,
      deduplicated: published.deduplicated,
    };
  } catch (e) {
    const error = (e instanceof Error ? e.message : "Apply failed").slice(0, 300);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error },
    });
    throw e;
  }
}

const writeSchema = z.object({
  projectId: z.string(),
  /** RackPatch cableIds like NB-10; labels pushed to NetBox. */
  updates: z
    .array(
      z.object({
        cableId: z.string(),
        label: z.string().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
  confirmPhrase: z.literal("WRITE NETBOX"),
});

/**
 * Outbound NetBox writes: PATCH cable labels. Requires writeEnabled + typed confirm.
 */
export async function writeNetBoxCableLabels(raw: z.input<typeof writeSchema>) {
  const user = await requireSessionUser();
  const data = writeSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const config = await prisma.integrationConfig.findUnique({
    where: { projectId_kind: { projectId: data.projectId, kind: "NETBOX" } },
  });
  if (!config?.enabled) throw new Error("NetBox is not configured or disabled");
  if (!config.writeEnabled) {
    throw new Error("NetBox writes are disabled. Enable “Allow NetBox writes” on the connection.");
  }

  const token = decryptSecret(config.tokenCiphertext);
  const job = await prisma.syncJob.create({
    data: {
      projectId: data.projectId,
      integrationId: config.id,
      source: "netbox_write",
      status: "RUNNING",
      dryRun: false,
      createdById: user.id,
    },
  });

  let okCount = 0;
  const errors: string[] = [];
  try {
    for (const u of data.updates) {
      const nbId = parseNetBoxCableId(u.cableId);
      if (!nbId) {
        errors.push(`${u.cableId}: not a NetBox-mapped cable (expected NB-#)`);
        continue;
      }
      const res = await patchNetBoxCableLabel({
        baseUrl: config.baseUrl,
        token,
        netboxCableId: nbId,
        label: u.label,
      });
      if (res.ok) okCount += 1;
      else errors.push(`${u.cableId}: ${res.error}`);
    }

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: errors.length && okCount === 0 ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        summary: JSON.stringify({ wrote: okCount, errors: errors.length }),
        error: errors.length ? errors.slice(0, 5).join("; ").slice(0, 300) : null,
      },
    });

    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "integration.netbox.write",
      summary: `NetBox write: ${okCount} label(s) updated, ${errors.length} error(s)`,
      metadata: { jobId: job.id, wrote: okCount },
    });

    revalidatePath(`/app/projects/${data.projectId}/integrations`);
    return { ok: true as const, wrote: okCount, errors };
  } catch (e) {
    const error = (e instanceof Error ? e.message : "Write failed").slice(0, 300);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error },
    });
    throw e;
  }
}

/** GitOps import DRY-RUN: validates and diffs against the active plan; never publishes. */
export async function previewGitOpsImport(raw: z.infer<typeof importSchema>) {
  const user = await requireSessionUser();
  const data = importSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId, "canPublishPlan");
  await assertPaidOrThrow(data.projectId);

  const parsed = parseGitOps(data.text);
  if (!parsed.import) {
    return { ok: false as const, errors: parsed.errors };
  }

  let diff: { added: number; removed: number; modified: number; unchanged: number } | null = null;
  if (access.project.activeRevisionId) {
    const current = await prisma.plannedLink.findMany({
      where: { revisionId: access.project.activeRevisionId },
    });
    const d = diffRevisions(current.map((l) => toSnapshot({ ...l, lineNumber: 0 })), parsed.import.rows);
    diff = {
      added: d.added.length,
      removed: d.removed.length,
      modified: d.modified.length,
      unchanged: d.unchanged.length,
    };
  }

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "gitops.import_dry_run",
    summary: `GitOps import dry-run: ${parsed.import.rows.length} valid cables, ${parsed.import.errors.length} errors`,
  });

  return {
    ok: true as const,
    rowCount: parsed.import.rows.length,
    errors: parsed.import.errors,
    warnings: parsed.import.warnings,
    diff,
    canPublish: parsed.import.errors.length === 0 && parsed.import.rows.length > 0,
    /** Paste into Plan import to publish; this action itself never publishes. */
    csv: gitOpsToCsv(parsed.import),
    sample: parsed.import.rows.slice(0, 20).map((r) => ({
      cableId: r.cableId,
      a: `${r.aDevice} ${r.aPort}`,
      z: `${r.zDevice} ${r.zPort}`,
      cableType: r.cableType,
    })),
  };
}
