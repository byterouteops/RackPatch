"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";

export type CableDetails = {
  connector: string | null;
  rail: string | null;
  notes: string | null;
  blockedReason: string | null;
  expected: string | null;
  observed: string | null;
  nextAction: string | null;
  evidenceSource: string | null;
};

const input = z.object({ projectId: z.string().min(1), linkId: z.string().min(1) });

/** Detail text for one cable in the list's side panel (kept out of the list payload). */
export async function getCableDetails(raw: z.infer<typeof input>): Promise<CableDetails | null> {
  const user = await requireSessionUser();
  const { projectId, linkId } = input.parse(raw);
  const access = await requireProjectAccess(user, projectId);
  const revisionId = access.project.activeRevisionId;
  if (!revisionId) return null;

  const link = await prisma.plannedLink.findFirst({
    where: { id: linkId, revisionId },
    select: {
      connector: true,
      rail: true,
      notes: true,
      runtime: { select: { blockedReason: true } },
      findings: {
        where: { revisionId },
        take: 1,
        select: { expectedSummary: true, observedSummary: true, nextAction: true, evidenceSource: true },
      },
    },
  });
  if (!link) return null;
  const f = link.findings[0];
  return {
    connector: link.connector,
    rail: link.rail,
    notes: link.notes,
    blockedReason: link.runtime?.blockedReason ?? null,
    expected: f?.expectedSummary ?? null,
    observed: f?.observedSummary ?? null,
    nextAction: f?.nextAction ?? null,
    evidenceSource: f?.evidenceSource ?? null,
  };
}
