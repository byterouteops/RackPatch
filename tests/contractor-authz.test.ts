import { describe, expect, it } from "vitest";
import { ProjectRole } from "@prisma/client";
import { canAcknowledgeFinding, resolveProjectCapabilities } from "@/lib/authz-capabilities";
import { formatQcNote, isQcAcknowledgeable } from "@/lib/qc";

const base = { isOwner: false, contractor: false, paid: true };

describe("resolveProjectCapabilities", () => {
  it("lead keeps full project powers and no QC-only flag", () => {
    const c = resolveProjectCapabilities({ ...base, role: ProjectRole.LEAD });
    expect(c.isLead).toBe(true);
    expect(c.canResolveExceptions).toBe(true);
    expect(c.canExport).toBe(true);
    expect(c.canQcAcknowledge).toBe(false);
    expect(c.isContractor).toBe(false);
  });

  it("technician cannot resolve or QC acknowledge", () => {
    const c = resolveProjectCapabilities({ ...base, role: ProjectRole.TECHNICIAN });
    expect(c.canUpdateInstall).toBe(true);
    expect(c.canResolveExceptions).toBe(false);
    expect(c.canQcAcknowledge).toBe(false);
    expect(canAcknowledgeFinding(c)).toBe(false);
  });

  it("contractor is technician-level plus QC acknowledge only", () => {
    const c = resolveProjectCapabilities({
      ...base,
      role: ProjectRole.TECHNICIAN,
      contractor: true,
    });
    expect(c.isContractor).toBe(true);
    expect(c.isLead).toBe(false);
    expect(c.canUpdateInstall).toBe(true);
    expect(c.canPhysicalVerify).toBe(true);
    expect(c.canQcAcknowledge).toBe(true);
    expect(c.canResolveExceptions).toBe(false);
    expect(c.canManageProject).toBe(false);
    expect(c.canPublishPlan).toBe(false);
    expect(c.canImportEvidence).toBe(false);
    expect(c.canExport).toBe(false);
    expect(canAcknowledgeFinding(c)).toBe(true);
  });

  it("a contractor flag on a LEAD membership is downgraded (no lead powers)", () => {
    const c = resolveProjectCapabilities({ ...base, role: ProjectRole.LEAD, contractor: true });
    expect(c.isLead).toBe(false);
    expect(c.isTechnician).toBe(true);
    expect(c.canManageProject).toBe(false);
    expect(c.canResolveExceptions).toBe(false);
    expect(c.canQcAcknowledge).toBe(true);
  });

  it("workspace owner is never a contractor", () => {
    const c = resolveProjectCapabilities({
      isOwner: true,
      role: ProjectRole.TECHNICIAN,
      contractor: true,
      paid: true,
    });
    expect(c.isContractor).toBe(false);
    expect(c.isLead).toBe(true);
    expect(c.canResolveExceptions).toBe(true);
    expect(c.canQcAcknowledge).toBe(false);
  });

  it("unpaid hosted projects deny all mutations including QC acknowledge", () => {
    const c = resolveProjectCapabilities({
      ...base,
      paid: false,
      role: ProjectRole.TECHNICIAN,
      contractor: true,
    });
    expect(c.canQcAcknowledge).toBe(false);
    expect(c.canUpdateInstall).toBe(false);
    expect(canAcknowledgeFinding(c)).toBe(false);
  });
});

describe("qc helpers", () => {
  it("only open mismatch/needs-review findings are acknowledgeable", () => {
    expect(isQcAcknowledgeable({ state: "MISMATCH", exceptionStatus: "OPEN" })).toBe(true);
    expect(isQcAcknowledgeable({ state: "NEEDS_REVIEW", exceptionStatus: "OPEN" })).toBe(true);
    expect(isQcAcknowledgeable({ state: "MISMATCH", exceptionStatus: "ACKNOWLEDGED" })).toBe(false);
    expect(isQcAcknowledgeable({ state: "MISMATCH", exceptionStatus: "CLOSED" })).toBe(false);
    expect(isQcAcknowledgeable({ state: "AWAITING", exceptionStatus: "OPEN" })).toBe(false);
    expect(isQcAcknowledgeable({ state: "VERIFIED_LLDP", exceptionStatus: "OPEN" })).toBe(false);
  });

  it("prefixes and bounds the QC note", () => {
    expect(formatQcNote("  checked   both ends ", "contractor")).toBe(
      "[QC] contractor: checked both ends",
    );
    expect(formatQcNote("x".repeat(900)).length).toBe(500);
  });
});
