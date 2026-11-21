import { describe, expect, it } from "vitest";
import { approvalBlocker, type ApprovalActor } from "@/lib/handover/approval";

const tech: ApprovalActor = { userId: "tech", projectRole: "TECHNICIAN", contractor: false, workspaceOwner: false };
const contractor: ApprovalActor = { userId: "kai", projectRole: "TECHNICIAN", contractor: true, workspaceOwner: false };
const qc: ApprovalActor = { userId: "qc", projectRole: "TECHNICIAN", contractor: false, workspaceOwner: false };
const viewer: ApprovalActor = { userId: "sam", projectRole: "VIEWER", contractor: false, workspaceOwner: false };
const owner: ApprovalActor = { userId: "morgan", projectRole: "LEAD", contractor: false, workspaceOwner: true };

const signed = (...pairs: [string, string][]) => pairs.map(([stage, approverId]) => ({ stage, approverId }));

describe("handover staged approvals", () => {
  it("enforces stage order", () => {
    expect(approvalBlocker("INDEPENDENT_QC", qc, { approvals: [], blockingExceptions: 0 })).toMatch(/Installation complete first/);
    expect(approvalBlocker("INSTALLATION", contractor, { approvals: [], blockingExceptions: 0 })).toBeNull();
  });

  it("blocks viewers from every stage", () => {
    expect(approvalBlocker("INSTALLATION", viewer, { approvals: [], blockingExceptions: 0 })).toMatch(/Read-only/);
  });

  it("requires QC to be independent of the installation signer and not a contractor", () => {
    const ctx = { approvals: signed(["INSTALLATION", "tech"]), blockingExceptions: 0 };
    expect(approvalBlocker("INDEPENDENT_QC", tech, ctx)).toMatch(/independent/);
    expect(approvalBlocker("INDEPENDENT_QC", contractor, ctx)).toMatch(/Contractors/);
    expect(approvalBlocker("INDEPENDENT_QC", qc, ctx)).toBeNull();
  });

  it("blocks owner acceptance while unwaived critical exceptions are open", () => {
    const approvals = signed(["INSTALLATION", "tech"], ["INDEPENDENT_QC", "qc"], ["ENGINEERING", "diego"]);
    expect(approvalBlocker("OWNER", owner, { approvals, blockingExceptions: 3 })).toMatch(/3 critical/);
    expect(approvalBlocker("OWNER", qc, { approvals, blockingExceptions: 0 })).toMatch(/workspace owner/);
    expect(approvalBlocker("OWNER", owner, { approvals, blockingExceptions: 0 })).toBeNull();
  });

  it("does not allow re-signing a stage", () => {
    expect(approvalBlocker("INSTALLATION", tech, { approvals: signed(["INSTALLATION", "kai"]), blockingExceptions: 0 })).toMatch(/already signed/);
  });
});
