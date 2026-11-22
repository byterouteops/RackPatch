import { prisma } from "@/lib/db";

export type LandingStats = {
  projectName: string;
  planned: number;
  installed: number;
  mismatches: number;
};

/** Live counts from the largest seeded demo project; null when none is seeded or the DB is unreachable. */
export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    const demos = await prisma.project.findMany({
      where: { isDemo: true, activeRevisionId: { not: null } },
      select: { name: true, activeRevisionId: true },
    });
    if (demos.length === 0) return null;

    const sized = await Promise.all(
      demos.map(async (p) => ({
        ...p,
        planned: await prisma.plannedLink.count({ where: { revisionId: p.activeRevisionId! } }),
      })),
    );
    const top = sized.reduce((a, b) => (b.planned > a.planned ? b : a));
    if (top.planned === 0) return null;

    const revisionId = top.activeRevisionId!;
    const [installed, mismatches] = await Promise.all([
      prisma.linkRuntime.count({
        where: { installStatus: "INSTALLED", retiredAt: null, plannedLink: { revisionId } },
      }),
      prisma.verificationFinding.count({ where: { revisionId, state: "MISMATCH" } }),
    ]);

    return { projectName: top.name, planned: top.planned, installed, mismatches };
  } catch (err) {
    console.error("[landing] stats unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
