import { describe, expect, it } from "vitest";
import { generateApiTokenSecret, hashApiToken, looksLikeApiToken } from "@/lib/api-token";

describe("api-token", () => {
  it("generates hashed live tokens", () => {
    const a = generateApiTokenSecret();
    expect(looksLikeApiToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashApiToken(a.token));
    expect(a.prefix).toBe(a.token.slice(0, 12));
    expect(generateApiTokenSecret().token).not.toBe(a.token);
  });
});
