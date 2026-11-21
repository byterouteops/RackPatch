import { prisma } from "@/lib/db";

export async function createNotification(input: {
  userId: string;
  projectId?: string | null;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  sourceId?: string | null;
}) {
  return prisma.userNotification.create({
    data: {
      userId: input.userId,
      projectId: input.projectId ?? null,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 500),
      href: input.href ?? null,
      sourceId: input.sourceId ?? null,
    },
  });
}

/** Notify project leads + workspace owners (excluding actor). */
export async function notifyProjectLeads(input: {
  projectId: string;
  actorId?: string | null;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  sourceId?: string | null;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { workspaceId: true },
  });
  if (!project) return 0;

  const [leads, owners] = await Promise.all([
    prisma.projectMembership.findMany({
      where: { projectId: input.projectId, role: "LEAD", contractor: false },
      select: { userId: true },
    }),
    prisma.workspaceMembership.findMany({
      where: { workspaceId: project.workspaceId, role: "OWNER" },
      select: { userId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const m of leads) ids.add(m.userId);
  for (const m of owners) ids.add(m.userId);
  if (input.actorId) ids.delete(input.actorId);

  let n = 0;
  for (const userId of ids) {
    await createNotification({
      userId,
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      sourceId: input.sourceId,
    });
    n += 1;
  }
  return n;
}

export async function listNotifications(userId: string, take = 40) {
  return prisma.userNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function unreadNotificationCount(userId: string) {
  return prisma.userNotification.count({
    where: { userId, readAt: null },
  });
}

export async function markNotificationRead(userId: string, id: string) {
  await prisma.userNotification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.userNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
