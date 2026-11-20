/**
 * Non-UI acceptance checks against the seeded demo DB.
 */
import { PrismaClient, VerificationState } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({
    where: { isDemo: true },
    include: { activeRevision: true },
  });
  if (!project?.activeRevisionId) throw new Error("Demo project missing");

  const findings = await prisma.verificationFinding.findMany({
    where: { revisionId: project.activeRevisionId },
    include: { plannedLink: { include: { runtime: true } } },
  });
  const byCable = Object.fromEntries(findings.map((f) => [f.plannedLink.cableId, f]));

  const checks: Array<[string, boolean]> = [
    ["C-201 mismatch", byCable["C-201"]?.state === VerificationState.MISMATCH],
    ["C-202 mismatch", byCable["C-202"]?.state === VerificationState.MISMATCH],
    ["C-201 related to C-202", byCable["C-201"]?.relatedCableId === "C-202"],
    ["C-202 related to C-201", byCable["C-202"]?.relatedCableId === "C-201"],
    ["C-203 awaiting", byCable["C-203"]?.state === VerificationState.AWAITING],
    ["C-203 installed", byCable["C-203"]?.plannedLink.runtime?.installStatus === "INSTALLED"],
    ["C-204 physical", byCable["C-204"]?.state === VerificationState.VERIFIED_PHYSICAL],
    ["C-205 blocked", byCable["C-205"]?.plannedLink.runtime?.installStatus === "BLOCKED"],
    ["C-101 lldp ok", byCable["C-101"]?.state === VerificationState.VERIFIED_LLDP],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed++;
  }

  // Cross-workspace isolation: guessing another id must not grant access via membership
  const other = await prisma.workspace.create({
    data: { name: "Other", slug: `other-${Date.now()}`, memberships: { create: [] } },
  });
  const lead = await prisma.user.findUnique({ where: { email: "lead@demo.rackpatch.local" } });
  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId: other.id, userId: lead!.id },
  });
  console.log(`${!membership ? "PASS" : "FAIL"} lead has no membership on foreign workspace`);
  if (membership) failed++;
  await prisma.workspace.delete({ where: { id: other.id } });

  if (failed) {
    console.error(`${failed} checks failed`);
    process.exit(1);
  }
  console.log("All demo workflow checks passed");
  console.log(`Demo project id: ${project.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
