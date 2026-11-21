import { createHash, randomBytes } from "crypto";

const PREFIX = "rp_live_";

export function generateApiTokenSecret(): { token: string; prefix: string; hash: string } {
  const body = randomBytes(24).toString("base64url");
  const token = `${PREFIX}${body}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashApiToken(token),
  };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function looksLikeApiToken(value: string): boolean {
  return value.trim().startsWith(PREFIX) && value.trim().length > PREFIX.length + 8;
}
