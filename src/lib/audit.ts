import { prisma } from "@/lib/db";

export async function recordAudit(input: {
  projectId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      projectId: input.projectId ?? null,
      workspaceId: input.workspaceId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
