"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import { notifyProjectLeads, createNotification } from "@/lib/notifications";
import { nextWorkOrderCode } from "@/lib/work-orders";

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  assigneeId: z.string().optional(),
  dueAt: z.string().datetime().optional().nullable(),
  plannedLinkIds: z.array(z.string()).max(500).default([]),
});

export async function createWorkOrder(raw: z.input<typeof createSchema>) {
  const user = await requireSessionUser();
  const data = createSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const existing = await prisma.workOrder.findMany({
    where: { projectId: data.projectId },
    select: { code: true },
  });
  const code = nextWorkOrderCode(existing.map((w) => w.code));

  if (data.assigneeId) {
    const member = await prisma.projectMembership.findUnique({
      where: {
        projectId_userId: { projectId: data.projectId, userId: data.assigneeId },
      },
    });
    if (!member) throw new Error("Assignee must be a project member");
  }

  const revisionId = access.project.activeRevisionId;
  const linkIds = data.plannedLinkIds;
  if (linkIds.length && revisionId) {
    const valid = await prisma.plannedLink.count({
      where: { id: { in: linkIds }, revisionId },
    });
    if (valid !== linkIds.length) throw new Error("Some cables are not in the active plan");
  } else if (linkIds.length && !revisionId) {
    throw new Error("Publish a plan before attaching cables");
  }

  const wo = await prisma.workOrder.create({
    data: {
      projectId: data.projectId,
      code,
      title: data.title,
      notes: data.notes || null,
      status: "OPEN",
      assigneeId: data.assigneeId || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      createdById: user.id,
      items: {
        create: linkIds.map((plannedLinkId) => ({ plannedLinkId })),
      },
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "work_order.create",
    summary: `Created ${code}: ${data.title} (${linkIds.length} cables)`,
    metadata: { workOrderId: wo.id },
  });

  if (data.assigneeId && data.assigneeId !== user.id) {
    await createNotification({
      userId: data.assigneeId,
      projectId: data.projectId,
      kind: "work_order.assigned",
      title: `Assigned ${code}`,
      body: data.title,
      href: `/app/projects/${data.projectId}/work-orders/${wo.id}`,
      sourceId: wo.id,
    });
  }

  await notifyProjectLeads({
    projectId: data.projectId,
    actorId: user.id,
    kind: "work_order.create",
    title: `Work order ${code}`,
    body: data.title,
    href: `/app/projects/${data.projectId}/work-orders/${wo.id}`,
    sourceId: wo.id,
  });

  revalidatePath(`/app/projects/${data.projectId}/work-orders`);
  return { id: wo.id, code: wo.code };
}

const statusSchema = z.object({
  projectId: z.string(),
  workOrderId: z.string(),
  status: z.nativeEnum(WorkOrderStatus),
});

export async function updateWorkOrderStatus(raw: z.infer<typeof statusSchema>) {
  const user = await requireSessionUser();
  const data = statusSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canUpdateInstall");
  await assertPaidOrThrow(data.projectId);

  const wo = await prisma.workOrder.findFirst({
    where: { id: data.workOrderId, projectId: data.projectId },
  });
  if (!wo) throw new Error("Work order not found");

  await prisma.workOrder.update({
    where: { id: wo.id },
    data: { status: data.status },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "work_order.status",
    summary: `${wo.code} → ${data.status}`,
    metadata: { workOrderId: wo.id, status: data.status },
  });

  revalidatePath(`/app/projects/${data.projectId}/work-orders`);
  revalidatePath(`/app/projects/${data.projectId}/work-orders/${wo.id}`);
  return { ok: true as const };
}

const attachSchema = z.object({
  projectId: z.string(),
  workOrderId: z.string(),
  plannedLinkIds: z.array(z.string()).min(1).max(200),
});

export async function attachLinksToWorkOrder(raw: z.infer<typeof attachSchema>) {
  const user = await requireSessionUser();
  const data = attachSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const wo = await prisma.workOrder.findFirst({
    where: { id: data.workOrderId, projectId: data.projectId },
  });
  if (!wo) throw new Error("Work order not found");
  if (!access.project.activeRevisionId) throw new Error("No active plan");

  const valid = await prisma.plannedLink.findMany({
    where: {
      id: { in: data.plannedLinkIds },
      revisionId: access.project.activeRevisionId,
    },
    select: { id: true },
  });
  if (valid.length === 0) throw new Error("No valid cables selected");

  await prisma.workOrderLink.createMany({
    data: valid.map((l) => ({ workOrderId: wo.id, plannedLinkId: l.id })),
    skipDuplicates: true,
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "work_order.attach",
    summary: `Attached ${valid.length} cable(s) to ${wo.code}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/work-orders/${wo.id}`);
  return { ok: true as const, attached: valid.length };
}
