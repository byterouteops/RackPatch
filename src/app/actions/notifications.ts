"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionUser } from "@/lib/session";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";

export async function markNotificationAsRead(raw: { id: string }) {
  const user = await requireSessionUser();
  const { id } = z.object({ id: z.string() }).parse(raw);
  await markNotificationRead(user.id, id);
  revalidatePath("/app/notifications");
  return { ok: true as const };
}

export async function markAllAsRead() {
  const user = await requireSessionUser();
  await markAllNotificationsRead(user.id);
  revalidatePath("/app/notifications");
  return { ok: true as const };
}
