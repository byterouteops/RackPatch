import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

/**
 * Find or create a Site for a workspace from a free-text location label.
 * Keeps Project.site string in sync for handover/CSV.
 */
export async function ensureSite(workspaceId: string, siteName: string) {
  const name = siteName.trim();
  if (!name) throw new Error("Site name is required");

  let slug = slugify(name) || "site";
  const clash = await prisma.site.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
  });
  if (clash && clash.name.toLowerCase() !== name.toLowerCase()) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const existing = await prisma.site.findFirst({
    where: {
      workspaceId,
      OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }],
    },
  });
  if (existing) return existing;

  return prisma.site.create({
    data: { workspaceId, name, slug },
  });
}
