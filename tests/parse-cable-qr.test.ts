import { describe, expect, it } from "vitest";
import { parseCableQr } from "@/lib/qr/parse-cable-qr";

describe("parseCableQr", () => {
  const projectId = "proj_abc";

  it("accepts absolute cable URL with action", () => {
    const r = parseCableQr(
      `https://example.com/app/projects/${projectId}/cables/link_1?action=install`,
      projectId,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.linkId).toBe("link_1");
      expect(r.action).toBe("install");
      expect(r.path).toContain("action=install");
    }
  });

  it("accepts path-only QR", () => {
    const r = parseCableQr(`/app/projects/${projectId}/cables/link_2`, projectId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.linkId).toBe("link_2");
      expect(r.action).toBeNull();
    }
  });

  it("rejects other project", () => {
    const r = parseCableQr(`/app/projects/other/cables/link_1`, projectId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/different project/i);
  });

  it("rejects non-cable strings", () => {
    expect(parseCableQr("hello", projectId).ok).toBe(false);
    expect(parseCableQr("https://evil.example/x", projectId).ok).toBe(false);
  });
});
