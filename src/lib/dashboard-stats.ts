import { prisma } from "@/lib/db";

export type ProjectDashStat = {
  id: string;
  name: string;
  site: string;
  cables: number;
  installed: number;
  verified: number;
  exceptions: number;
  mismatch: number;
  needsReview: number;
};

export type ProjectPhase = "no-plan" | "in-progress" | "verifying" | "completed";

/** Phase derived from live counts only. */
export function projectPhase(s: Pick<ProjectDashStat, "cables" | "installed" | "verified">): ProjectPhase {
  if (s.cables === 0) return "no-plan";
  if (s.verified >= s.cables) return "completed";
  if (s.installed >= s.cables) return "verifying";
  return "in-progress";
}

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  "no-plan": "No plan",
  "in-progress": "In Progress",
  verifying: "Verifying",
  completed: "Completed",
};

/** Aggregate dashboard stats without loading full cable rows. */
export async function loadProjectDashStats(
  projects: Array<{ id: string; name: string; site: string; activeRevisionId: string | null }>,
): Promise<ProjectDashStat[]> {
  const withRev = projects.filter((p) => p.activeRevisionId);
  if (withRev.length === 0) {
    return projects.map((p) => emptyStat(p));
  }

  const revisionIds = withRev.map((p) => p.activeRevisionId!);

  const [cableCounts, findingGroups, ...installedPairs] = await Promise.all([
    prisma.plannedLink.groupBy({
      by: ["revisionId"],
      where: { revisionId: { in: revisionIds } },
      _count: { _all: true },
    }),
    prisma.verificationFinding.groupBy({
      by: ["revisionId", "state", "exceptionStatus"],
      where: { revisionId: { in: revisionIds } },
      _count: { _all: true },
    }),
    ...revisionIds.map(async (revisionId) => {
      const n = await prisma.plannedLink.count({
        where: { revisionId, runtime: { installStatus: "INSTALLED" } },
      });
      return [revisionId, n] as const;
    }),
  ]);

  const cableMap = new Map(cableCounts.map((c) => [c.revisionId, c._count._all]));
  const installedMap = new Map(installedPairs as Array<readonly [string, number]>);

  return projects.map((p) => {
    const rev = p.activeRevisionId;
    if (!rev) return emptyStat(p);

    let verified = 0;
    let exceptions = 0;
    let mismatch = 0;
    let needsReview = 0;
    for (const g of findingGroups) {
      if (g.revisionId !== rev) continue;
      const n = g._count._all;
      if (g.state === "VERIFIED_LLDP" || g.state === "VERIFIED_PHYSICAL") verified += n;
      if (g.state === "MISMATCH") mismatch += n;
      if (g.state === "NEEDS_REVIEW") needsReview += n;
      if (
        g.exceptionStatus !== "CLOSED" &&
        (g.state === "MISMATCH" || g.state === "NEEDS_REVIEW")
      ) {
        exceptions += n;
      }
    }

    return {
      id: p.id,
      name: p.name,
      site: p.site,
      cables: cableMap.get(rev) ?? 0,
      installed: installedMap.get(rev) ?? 0,
      verified,
      exceptions,
      mismatch,
      needsReview,
    };
  });
}

function emptyStat(p: { id: string; name: string; site: string }): ProjectDashStat {
  return {
    id: p.id,
    name: p.name,
    site: p.site,
    cables: 0,
    installed: 0,
    verified: 0,
    exceptions: 0,
    mismatch: 0,
    needsReview: 0,
  };
}
