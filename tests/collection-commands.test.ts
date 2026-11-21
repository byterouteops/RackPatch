import { describe, expect, it } from "vitest";
import {
  getCollectionProfile,
  isAllowedCollectionCommand,
} from "@/lib/collection/commands";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";

describe("collection allowlist", () => {
  it("only exposes known profiles", () => {
    expect(getCollectionProfile("cisco-nxos-lldp")?.command).toContain("lldp");
    expect(getCollectionProfile("rm -rf /")).toBeNull();
    expect(isAllowedCollectionCommand("show lldp neighbors detail")).toBe(true);
    expect(isAllowedCollectionCommand("configure terminal")).toBe(false);
  });
});

describe("secret encryption", () => {
  it("round-trips with BETTER_AUTH_SECRET", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-at-least-16-chars!!";
    const enc = encryptSecret("s3cret");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe("s3cret");
  });
});
