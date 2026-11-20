function truthy(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

export function isDevLoginEnabled(): boolean {
  return truthy(process.env.ENABLE_DEV_LOGIN);
}

export function assertProductionSafety(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (isDevLoginEnabled()) {
    throw new Error(
      "Refusing to start: ENABLE_DEV_LOGIN is enabled in production. Disable it before deploying.",
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!secret || secret.length < 32) {
    throw new Error(
      "Refusing to start: BETTER_AUTH_SECRET must be set to a random value of at least 32 characters.",
    );
  }
  if (/replace-with-a-long-random-secret|^changeme$|^password123$/i.test(secret)) {
    throw new Error(
      "Refusing to start: BETTER_AUTH_SECRET looks like a placeholder. Generate a real secret.",
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Refusing to start: DATABASE_URL is required in production.");
  }
}

export function getAppUrl(): string {
  return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function getPlatformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Env allowlist only — prefer `userHasPlatformAdmin` for authorization. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getPlatformAdminEmails().includes(email.toLowerCase());
}

/** @deprecated Use isPlatformAdminEmail or userHasPlatformAdmin */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  return isPlatformAdminEmail(email);
}

/**
 * Hosted SaaS mode: when true, project mutations require PILOT/PAID (or demo).
 * Community / self-host default is false — full workflow without payment activation.
 */
export function isHostedSaas(): boolean {
  return truthy(process.env.HOSTED_SAAS);
}
