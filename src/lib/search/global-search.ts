import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import { listVisibleProjects } from "@/lib/authz";

export type SearchHit = {
  kind: "cable" | "project" | "device";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  projectId?: string;
};

const LIMIT = 40;

export async function globalSearch(
  user: SessionUser,
  qRaw: string,
  opts?: { projectId?: string },
): Promise<SearchHit[]> {
  const q = qRaw.trim().slice(0, 120);
  if (q.length < 2) return [];

  const projects = await listVisibleProjects(user);
  const scoped = opts?.projectId
    ? projects.filter((p) => p.id === opts.projectId)
    : projects;
  if (scoped.length === 0) return [];

  const projectIds = scoped.map((p) => p.id);
  const hits: SearchHit[] = [];

  for (const p of scoped) {
    if (p.name.toLowerCase().includes(q.toLowerCase()) || (p.site && p.site.toLowerCase().includes(q.toLowerCase()))) {
      hits.push({
        kind: "project",
        id: p.id,
        title: p.name,
        subtitle: p.site || "Project",
        href: `/app/projects/${p.id}`,
        projectId: p.id,
      });
    }
  }

  const revisionIds = scoped
    .map((p) => p.activeRevisionId)
    .filter((id): id is string => Boolean(id));

  if (revisionIds.length > 0) {
    const links = await prisma.plannedLink.findMany({
      where: {
        revisionId: { in: revisionIds },
        OR: [
          { cableId: { contains: q, mode: "insensitive" } },
          { aDevice: { contains: q, mode: "insensitive" } },
          { zDevice: { contains: q, mode: "insensitive" } },
          { aPort: { contains: q, mode: "insensitive" } },
          { zPort: { contains: q, mode: "insensitive" } },
          { aRack: { contains: q, mode: "insensitive" } },
          { zRack: { contains: q, mode: "insensitive" } },
        ],
      },
      take: LIMIT,
      orderBy: { cableId: "asc" },
      include: { revision: { select: { projectId: true } } },
    });

    for (const l of links) {
      hits.push({
        kind: "cable",
        id: l.id,
        title: l.cableId,
        subtitle: `${l.aDevice}/${l.aPort} → ${l.zDevice}/${l.zPort}`,
        href: `/app/projects/${l.revision.projectId}/cables/${l.id}`,
        projectId: l.revision.projectId,
      });
    }
  }

  const devices = await prisma.deviceInventory.findMany({
    where: {
      projectId: { in: projectIds },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { rack: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { name: "asc" },
  });

  for (const d of devices) {
    hits.push({
      kind: "device",
      id: d.id,
      title: d.name,
      subtitle: d.rack ? `Rack ${d.rack}` : "Inventory device",
      href: `/app/projects/${d.projectId}/inventory?device=${encodeURIComponent(d.name)}`,
      projectId: d.projectId,
    });
  }

  return hits.slice(0, LIMIT);
}
