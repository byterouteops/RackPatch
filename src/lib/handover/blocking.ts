import { prisma } from "@/lib/db";

/** Open ERROR-severity findings on the revision with no authorized waiver: these block owner acceptance. */
export function countBlockingExceptions(revisionId: string) {
  return prisma.verificationFinding.count({
    where: { revisionId, severity: "ERROR", exceptionStatus: { not: "CLOSED" }, waivedAt: null },
  });
}
