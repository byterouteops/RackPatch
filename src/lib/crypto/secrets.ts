import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1:";

function getSecretsKey(): Buffer {
  const raw =
    process.env.FIELD_SECRETS_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  if (!raw || raw.length < 16) {
    throw new Error(
      "FIELD_SECRETS_KEY or BETTER_AUTH_SECRET (16+ chars) required to store device credentials",
    );
  }
  return createHash("sha256").update(raw).digest();
}

/** Encrypt UTF-8 secret for DB storage (AES-256-GCM). */
export function encryptSecret(plaintext: string): string {
  const key = getSecretsKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith(PREFIX)) throw new Error("Unknown secret format");
  const key = getSecretsKey();
  const buf = Buffer.from(payload.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
