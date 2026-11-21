import { describe, expect, it } from "vitest";
import {
  buildComplianceEmail,
  evaluateCompliance,
  parseNotifyEmails,
  shouldNotify,
  verifyComplianceSecret,
} from "@/lib/compliance";
import { computeEvidenceStaleness } from "@/lib/evidence-staleness";

const now = new Date("2026-11-21T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function staleness(opts: { ageDays: number; planned?: string[] }) {
  return computeEvidenceStaleness({
    imports: [
      {
        sourceDevice: "sw1",
        sourceDeviceNorm: "sw1",
        uploadedAt: new Date(now.getTime() - opts.ageDays * day),
        captureTime: null,
        parseFailed: false,
      },
    ],
    plannedDevices: opts.planned ?? ["sw1"],
    maxAgeDays: 7,
    now,
  });
}

describe("parseNotifyEmails", () => {
  it("splits, lowercases, de-dupes and reports invalid entries", () => {
    const r = parseNotifyEmails("A@x.com, b@x.com;a@x.com\nnot-an-email");
    expect(r.emails).toEqual(["a@x.com", "b@x.com"]);
    expect(r.invalid).toEqual(["not-an-email"]);
  });

  it("accepts arrays and empty input", () => {
    expect(parseNotifyEmails(["a@x.com,b@x.com"]).emails).toHaveLength(2);
    expect(parseNotifyEmails(null).emails).toEqual([]);
  });
});

describe("verifyComplianceSecret", () => {
  it("requires a configured secret and exact match", () => {
    expect(verifyComplianceSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyComplianceSecret("wrong", "s3cret")).toBe(false);
    expect(verifyComplianceSecret(null, "s3cret")).toBe(false);
    expect(verifyComplianceSecret("anything", undefined)).toBe(false);
    expect(verifyComplianceSecret("", "")).toBe(false);
  });
});

describe("evaluateCompliance", () => {
  it("returns OK when fresh and no findings", () => {
    const e = evaluateCompliance({
      staleness: staleness({ ageDays: 1 }),
      mismatchCount: 0,
      needsReviewCount: 0,
    });
    expect(e.status).toBe("OK");
    expect(e.fingerprint).toBeNull();
  });

  it("flags stale evidence, never-imported devices and mismatches", () => {
    const e = evaluateCompliance({
      staleness: staleness({ ageDays: 30, planned: ["sw1", "sw2"] }),
      mismatchCount: 2,
      needsReviewCount: 1,
    });
    expect(e.status).toBe("ISSUES");
    expect(e.staleDeviceCount).toBe(1);
    expect(e.neverImportedCount).toBe(1);
    expect(e.lines).toHaveLength(4);
    expect(e.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("fingerprint is stable for the same issue set and changes with it", () => {
    const a = evaluateCompliance({
      staleness: staleness({ ageDays: 30 }),
      mismatchCount: 1,
      needsReviewCount: 0,
    });
    const b = evaluateCompliance({
      staleness: staleness({ ageDays: 45 }),
      mismatchCount: 1,
      needsReviewCount: 0,
    });
    const c = evaluateCompliance({
      staleness: staleness({ ageDays: 45 }),
      mismatchCount: 2,
      needsReviewCount: 0,
    });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

describe("shouldNotify", () => {
  const issues = { status: "ISSUES" as const, fingerprint: "fp1" };

  it("never notifies for OK or without recipients", () => {
    expect(
      shouldNotify({
        evaluation: { status: "OK", fingerprint: null },
        recipientCount: 1,
        lastNotified: null,
      }),
    ).toBe(false);
    expect(shouldNotify({ evaluation: issues, recipientCount: 0, lastNotified: null })).toBe(false);
  });

  it("notifies on first issue and on changed fingerprint", () => {
    expect(shouldNotify({ evaluation: issues, recipientCount: 1, lastNotified: null })).toBe(true);
    expect(
      shouldNotify({
        evaluation: issues,
        recipientCount: 1,
        lastNotified: { fingerprint: "other", at: new Date(now.getTime() - 1000) },
        now,
      }),
    ).toBe(true);
  });

  it("suppresses identical issues inside the cooldown, re-sends after", () => {
    expect(
      shouldNotify({
        evaluation: issues,
        recipientCount: 1,
        lastNotified: { fingerprint: "fp1", at: new Date(now.getTime() - 60 * 60 * 1000) },
        now,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        evaluation: issues,
        recipientCount: 1,
        lastNotified: { fingerprint: "fp1", at: new Date(now.getTime() - 25 * 60 * 60 * 1000) },
        now,
      }),
    ).toBe(true);
  });
});

describe("buildComplianceEmail", () => {
  it("includes project name, issue lines and link", () => {
    const evaluation = evaluateCompliance({
      staleness: staleness({ ageDays: 30 }),
      mismatchCount: 1,
      needsReviewCount: 0,
    });
    const mail = buildComplianceEmail({
      projectName: "DC1",
      evaluation,
      projectUrl: "http://x/app/projects/p/compliance",
    });
    expect(mail.subject).toContain("DC1");
    expect(mail.text).toContain("open mismatch");
    expect(mail.text).toContain("http://x/app/projects/p/compliance");
  });
});
