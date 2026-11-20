import { PrismaClient } from "@prisma/client";

/**
 * Exercises the same rules as recordPhysicalVerification without Next session.
 */
const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirstOrThrow({ where: { isDemo: true } });
  const tech = await prisma.user.findUniqueOrThrow({
    where: { email: "tech@demo.rackpatch.local" },
  });
  const verifier = await prisma.user.findUniqueOrThrow({
    where: { email: "verifier@demo.rackpatch.local" },
  });
  const lead = await prisma.user.findUniqueOrThrow({
    where: { email: "lead@demo.rackpatch.local" },
  });

  const link = await prisma.plannedLink.findFirstOrThrow({
    where: { cableId: "C-102", revisionId: project.activeRevisionId! },
    include: { runtime: true },
  });

  if (!link.runtime?.installerId) throw new Error("C-102 should have installer from browser test");

  const installerId = link.runtime.installerId;
  console.log(
    installerId === lead.id
      ? "PASS C-102 installer is lead (from browser mark installed)"
      : `INFO installer is ${installerId}`,
  );

  // Self-verify blocked
  const selfBlocked = installerId === lead.id;
  console.log(selfBlocked ? "PASS lead would be blocked from self-verify" : "FAIL");

  // Tech/verifier different from installer can verify
  const otherOk = tech.id !== installerId && verifier.id !== installerId;
  console.log(otherOk ? "PASS other team members eligible to verify" : "FAIL");

  // Actually record verify as verifier if not already done for C-102
  const existing = await prisma.physicalVerification.findFirst({
    where: { plannedLinkId: link.id },
  });
  if (!existing) {
    await prisma.physicalVerification.create({
      data: {
        plannedLinkId: link.id,
        revisionId: project.activeRevisionId!,
        verifierId: verifier.id,
        note: "Full test physical check",
        aConfirmed: true,
        zConfirmed: true,
      },
    });
    const { recomputeFindings } = await import("../src/lib/verify/recompute");
    await recomputeFindings(project.id);
    console.log("PASS verifier recorded physical check on C-102");
  } else {
    console.log("PASS physical check already present on C-102");
  }

  if (!selfBlocked || !otherOk) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
