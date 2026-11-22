import { describe, expect, it } from "vitest";
import { matchesImageSignature } from "@/lib/image-signature";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("matchesImageSignature", () => {
  it("accepts real PNG, JPEG and WebP headers for their declared type", () => {
    expect(matchesImageSignature(png, "image/png")).toBe(true);
    expect(matchesImageSignature(jpeg, "image/jpeg")).toBe(true);
    expect(matchesImageSignature(webp, "image/webp")).toBe(true);
  });

  it("rejects non-image bytes declared as an image", () => {
    const exe = Buffer.from("MZ this is not an image");
    for (const mime of ["image/png", "image/jpeg", "image/webp"]) expect(matchesImageSignature(exe, mime)).toBe(false);
  });

  it("rejects a valid image declared as a different type", () => {
    expect(matchesImageSignature(png, "image/jpeg")).toBe(false);
    expect(matchesImageSignature(jpeg, "image/png")).toBe(false);
  });

  it("rejects truncated headers, RIFF files that are not WebP, and unsupported types", () => {
    expect(matchesImageSignature(png.subarray(0, 4), "image/png")).toBe(false);
    expect(matchesImageSignature(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]), "image/webp")).toBe(false);
    expect(matchesImageSignature(png, "image/gif")).toBe(false);
    expect(matchesImageSignature(Buffer.alloc(0), "image/png")).toBe(false);
  });
});
