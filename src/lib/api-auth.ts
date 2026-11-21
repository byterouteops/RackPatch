import { prisma } from "@/lib/db";
import { hashApiToken, looksLikeApiToken } from "@/lib/api-token";
import { getSessionUser } from "@/lib/session";
import { getProjectAccess, type SessionUser } from "@/lib/authz";

export type ApiAuthResult =
  | { ok: true; projectId: string; via: "session" | "token"; user: SessionUser | null }
  | { ok: false; status: number; error: string };

/**
 * Authenticate read API: session cookie (project member) or Bearer API token.
 */
export async function authenticateProjectRead(
  request: Request,
  projectId: string,
): Promise<ApiAuthResult> {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (!looksLikeApiToken(token)) {
      return { ok: false, status: 401, error: "Invalid API token format" };
    }
    const hash = hashApiToken(token);
    const row = await prisma.apiToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.projectId !== projectId) {
      return { ok: false, status: 401, error: "Invalid or revoked API token" };
    }
    await prisma.apiToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return { ok: true, projectId, via: "token", user: null };
  }

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required" };
  }
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return { ok: false, status: 403, error: "Permission denied" };
  }
  return { ok: true, projectId, via: "session", user };
}
