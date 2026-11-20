/**
 * Attach credential passwords for seeded demo users (dev login only).
 * Password for all demo users: password123
 */
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD = "password123";

async function main() {
  const emails = [
    "lead@demo.rackpatch.local",
    "tech@demo.rackpatch.local",
    "verifier@demo.rackpatch.local",
    "admin@rackpatch.local",
  ];
  const passwordHash = await hashPassword(PASSWORD);

  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log("skip missing", email);
      continue;
    }
    await prisma.account.deleteMany({
      where: { userId: user.id, providerId: "credential" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    console.log("set password for", email);
  }
  console.log("Done. Dev password:", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
