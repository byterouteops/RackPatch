import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [items, unread] = await Promise.all([
    listNotifications(user.id, 40),
    unreadNotificationCount(user.id),
  ]);
  return NextResponse.json(
    {
      unread,
      items: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        href: n.href,
        projectId: n.projectId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
