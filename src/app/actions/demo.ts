"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/authz";
import { requireSessionUser } from "@/lib/session";
import { applyDemoSnapshot } from "@/lib/demo/playback";
import { SNAPSHOTS } from "@/lib/demo/ai-hpc/evidence";

const schema = z.object({ projectId: z.string().min(1), snapshot: z.enum(SNAPSHOTS) });

/** Switch synthetic evidence playback on a demo project (leads only). Recomputes and audits. */
export async function setDemoEvidenceSnapshot(input: { projectId: string; snapshot: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid snapshot" };
  const user = await requireSessionUser();
  const access = await requireProjectAccess(user, parsed.data.projectId, "canImportEvidence");
  if (!access.project.isDemo) return { ok: false as const, error: "Playback is only available on demo projects" };
  try {
    await applyDemoSnapshot(parsed.data.projectId, parsed.data.snapshot, user.id);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Playback failed" };
  }
  revalidatePath(`/app/projects/${parsed.data.projectId}`, "layout");
  return { ok: true as const };
}
