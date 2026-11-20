"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { bootstrapFirstAdmin, isBootstrapRequired } from "@/lib/bootstrap";
import { recordAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(128),
});

export async function createFirstAdministrator(raw: z.infer<typeof schema>) {
  const data = schema.parse(raw);

  if (!(await isBootstrapRequired())) {
    throw new Error("Setup already completed. Sign in with an existing account.");
  }

  const { email } = await bootstrapFirstAdmin(data);

  const result = await auth.api.signInEmail({
    body: {
      email,
      password: data.password,
      callbackURL: "/app",
    },
    headers: await headers(),
  });

  if (!result) {
    throw new Error("Administrator created but sign-in failed. Try signing in manually.");
  }

  await recordAudit({
    actorId: result.user.id,
    action: "instance.bootstrap",
    summary: `First administrator created (${email})`,
  });

  return { ok: true as const, email };
}

export async function getBootstrapStatus() {
  return { required: await isBootstrapRequired() };
}
