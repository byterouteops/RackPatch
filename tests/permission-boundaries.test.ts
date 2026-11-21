import { afterEach, describe, expect, it } from "vitest";
import { commercialAllowsMutations, type ProjectAccess } from "@/lib/authz";
import { CommercialStatus } from "@prisma/client";

/**
 * Authorization must never trust a client-supplied workspace/role.
 * These tests lock the capability matrix used by requireProjectAccess.
 */
function capabilities(access: Pick<ProjectAccess, "isOwner" | "isLead" | "isTechnician" | "project">) {
  const paid =
    access.project.isDemo || commercialAllowsMutations(access.project.commercialStatus);
  return {
    canView: true,
    canPublishPlan: access.isLead && paid,
    canUpdateInstall: access.isTechnician && paid,
    canExport: access.isLead && paid,
    canManageWorkspace: access.isOwner,
  };
}

describe("permission boundaries", () => {
  afterEach(() => {
    delete process.env.HOSTED_SAAS;
  });

  const baseProject = {
    id: "p1",
    workspaceId: "w1",
    name: "X",
    customerName: null,
    site: "S",
    siteId: null,
    timeZone: "UTC",
    commercialStatus: CommercialStatus.NONE,
    isDemo: false,
    demoEvidenceSnapshot: null,
    activeRevisionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("allows Community Edition mutations without paid status", () => {
    delete process.env.HOSTED_SAAS;
    const caps = capabilities({
      isOwner: true,
      isLead: true,
      isTechnician: true,
      project: baseProject,
    });
    expect(caps.canPublishPlan).toBe(true);
    expect(caps.canExport).toBe(true);
    expect(caps.canUpdateInstall).toBe(true);
  });

  it("denies mutations for NONE commercial status on hosted SaaS", () => {
    process.env.HOSTED_SAAS = "true";
    const caps = capabilities({
      isOwner: true,
      isLead: true,
      isTechnician: true,
      project: baseProject,
    });
    expect(caps.canPublishPlan).toBe(false);
    expect(caps.canExport).toBe(false);
    expect(caps.canUpdateInstall).toBe(false);
  });

  it("allows technician install but not export when paid", () => {
    process.env.HOSTED_SAAS = "true";
    const caps = capabilities({
      isOwner: false,
      isLead: false,
      isTechnician: true,
      project: { ...baseProject, commercialStatus: CommercialStatus.PAID },
    });
    expect(caps.canUpdateInstall).toBe(true);
    expect(caps.canPublishPlan).toBe(false);
    expect(caps.canExport).toBe(false);
    expect(caps.canManageWorkspace).toBe(false);
  });

  it("allows demo project mutations without paid status on hosted SaaS", () => {
    process.env.HOSTED_SAAS = "true";
    const caps = capabilities({
      isOwner: true,
      isLead: true,
      isTechnician: true,
      project: { ...baseProject, isDemo: true },
    });
    expect(caps.canPublishPlan).toBe(true);
    expect(caps.canExport).toBe(true);
  });
});
