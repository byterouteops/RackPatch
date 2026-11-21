import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/authz";
import { isPlatformAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/db";

/**
 * Request-scoped cache: layout + page both call this without a second auth round-trip.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
});

/** Session + platform-admin flag in one cached path (avoids extra layout query when email-listed). */
export const getAppAuth = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  if (isPlatformAdminEmail(user.email)) {
    return { user, isPlatformAdmin: true };
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { platformAdmin: true },
  });
  return { user, isPlatformAdmin: row?.platformAdmin === true };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
