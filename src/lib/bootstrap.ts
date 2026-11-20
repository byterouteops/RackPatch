import { randomBytes } from "crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";

function createUserId() {
  return `usr_${randomBytes(12).toString("hex")}`;
}

export async function isBootstrapRequired(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0;
}

export type BootstrapAdminInput = {
  name: string;
  email: string;
  password: string;
};

/**
 * Create the first administrator when the instance has zero users.
 * Uses a Postgres advisory lock so concurrent bootstraps cannot both succeed.
 */
export async function bootstrapFirstAdmin(input: BootstrapAdminInput): Promise<{ userId: string; email: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (name.length < 2 || name.length > 80) {
    throw new Error("Name must be between 2 and 80 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email is required.");
  }
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }

  const userId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(872341)`;

    const count = await tx.user.count();
    if (count > 0) {
      throw new Error("Setup already completed. Sign in with an existing account.");
    }

    const id = createUserId();
    const hashed = await hashPassword(password);

    await tx.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: true,
        platformAdmin: true,
        accounts: {
          create: {
            accountId: id,
            providerId: "credential",
            password: hashed,
          },
        },
      },
    });

    return id;
  });

  return { userId, email };
}
