import { beforeEach, describe, expect, it, vi } from "vitest";

const executeRaw = vi.fn();
const userCount = vi.fn();
const userCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: (...args: unknown[]) => userCount(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
        user: {
          count: (...args: unknown[]) => userCount(...args),
          create: (...args: unknown[]) => userCreate(...args),
        },
      };
      return fn(tx);
    },
  },
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn(async () => "hashed-password"),
}));

describe("bootstrapFirstAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRaw.mockResolvedValue(undefined);
    userCreate.mockResolvedValue({ id: "usr_test" });
  });

  it("creates the first admin when the instance is empty", async () => {
    userCount.mockResolvedValue(0);
    const { bootstrapFirstAdmin } = await import("@/lib/bootstrap");
    const result = await bootstrapFirstAdmin({
      name: "Admin",
      email: "admin@example.com",
      password: "secure-password-1",
    });
    expect(result.email).toBe("admin@example.com");
    expect(userCreate).toHaveBeenCalled();
    const createArg = userCreate.mock.calls[0][0];
    expect(createArg.data.platformAdmin).toBe(true);
    expect(createArg.data.accounts.create.providerId).toBe("credential");
  });

  it("rejects when users already exist", async () => {
    userCount.mockResolvedValue(2);
    const { bootstrapFirstAdmin } = await import("@/lib/bootstrap");
    await expect(
      bootstrapFirstAdmin({
        name: "Admin",
        email: "admin@example.com",
        password: "secure-password-1",
      }),
    ).rejects.toThrow(/already completed/i);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects short passwords", async () => {
    userCount.mockResolvedValue(0);
    const { bootstrapFirstAdmin } = await import("@/lib/bootstrap");
    await expect(
      bootstrapFirstAdmin({
        name: "Admin",
        email: "admin@example.com",
        password: "short",
      }),
    ).rejects.toThrow(/10 characters/i);
  });
});
