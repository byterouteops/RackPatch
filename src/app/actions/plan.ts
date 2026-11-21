"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import {
  importPlanCsv,
  type HeaderMapping,
  PLAN_FIELDS,
} from "@/lib/csv/plan-import";
import { publishPlanRevision } from "@/lib/plan/publish";
import { recordAudit } from "@/lib/audit";

const previewSchema = z.object({
  projectId: z.string(),
  csvText: z.string().min(1).max(5_000_000),
  mapping: z.record(z.string(), z.string()).optional(),
});

export async function previewPlanImport(raw: z.infer<typeof previewSchema>) {
  const user = await requireSessionUser();
  const data = previewSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canPublishPlan");
  await assertPaidOrThrow(data.projectId);

  const mapping = data.mapping as HeaderMapping | undefined;
  const result = importPlanCsv(data.csvText, mapping);
  return {
    mapping: result.mapping,
    headers: result.headers,
    rows: result.rows.slice(0, 50),
    rowCount: result.rows.length,
    errors: result.errors,
    warnings: result.warnings,
    fields: PLAN_FIELDS,
    canPublish: result.errors.length === 0 && result.rows.length > 0,
  };
}

const publishSchema = z.object({
  projectId: z.string(),
  csvText: z.string().min(1).max(5_000_000),
  mapping: z.record(z.string(), z.string()),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export async function publishPlanImport(raw: z.infer<typeof publishSchema>) {
  const user = await requireSessionUser();
  const data = publishSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canPublishPlan");
  await assertPaidOrThrow(data.projectId);

  const result = importPlanCsv(data.csvText, data.mapping as HeaderMapping);
  if (result.errors.length || result.rows.length === 0) {
    throw new Error("Cannot publish: fix validation errors first");
  }

  const published = await publishPlanRevision({
    projectId: data.projectId,
    actorId: user.id,
    rows: result.rows,
    note: data.note,
    importKey: data.idempotencyKey,
    sourceCsv: data.csvText,
  });

  revalidatePath(`/app/projects/${data.projectId}`);
  return {
    revisionId: published.revision.id,
    revisionNumber: published.revision.revisionNumber,
    deduplicated: published.deduplicated,
    diff: published.diff
      ? {
          added: published.diff.added.length,
          removed: published.diff.removed.length,
          modified: published.diff.modified.length,
          unchanged: published.diff.unchanged.length,
          modifiedDetails: published.diff.modified.map((m) => ({
            cableId: m.next.cableId,
            endpointsChanged: m.endpointsChanged,
          })),
        }
      : null,
  };
}

export async function hashCsv(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function logPlanPreviewAudit(projectId: string, rowCount: number) {
  const user = await requireSessionUser();
  await requireProjectAccess(user, projectId, "canPublishPlan");
  await recordAudit({
    projectId,
    actorId: user.id,
    action: "plan.preview",
    summary: `Previewed cable plan import (${rowCount} rows)`,
  });
}
