import { ProjectRole } from "@prisma/client";

/**
 * Pure capability resolution for project access (unit-tested without a DB).
 *
 * Contractor rule: a membership flagged `contractor` never gets lead powers, even if its stored
 * role is LEAD (defense in depth). Contractors are technicians who may additionally QC-acknowledge
 * open findings (`canQcAcknowledge`) but cannot resolve exceptions, publish, import, export, or
 * manage the project. Workspace owners are never treated as contractors.
 */
export type CapabilityInput = {
  isOwner: boolean;
  /** Stored project membership role, null if none. */
  role: ProjectRole | null;
  contractor: boolean;
  /** commercialAllowsMutations(...) || project.isDemo */
  paid: boolean;
};

export type ProjectCapabilities = {
  isOwner: boolean;
  isLead: boolean;
  isTechnician: boolean;
  isContractor: boolean;
  canManageProject: boolean;
  canPublishPlan: boolean;
  canImportEvidence: boolean;
  canUpdateInstall: boolean;
  canPhysicalVerify: boolean;
  canResolveExceptions: boolean;
  canQcAcknowledge: boolean;
  canExport: boolean;
  canView: true;
};

export function resolveProjectCapabilities(input: CapabilityInput): ProjectCapabilities {
  const { isOwner, role, paid } = input;
  const isContractor = input.contractor && !isOwner && role !== null;
  const isLead = isOwner || (role === ProjectRole.LEAD && !isContractor);
  const isTechnician =
    role === ProjectRole.TECHNICIAN || role === ProjectRole.LEAD || isLead || isContractor;

  return {
    isOwner,
    isLead,
    isTechnician,
    isContractor,
    canManageProject: isLead && paid,
    canPublishPlan: isLead && paid,
    canImportEvidence: isLead && paid,
    canUpdateInstall: isTechnician && paid,
    canPhysicalVerify: isTechnician && paid,
    canResolveExceptions: isLead && paid,
    canQcAcknowledge: isContractor && paid,
    canExport: isLead && paid,
    canView: true,
  };
}

/** True if the user may acknowledge an open finding via the QC queue (lead resolve OR contractor QC). */
export function canAcknowledgeFinding(caps: {
  canResolveExceptions: boolean;
  canQcAcknowledge: boolean;
}): boolean {
  return caps.canResolveExceptions || caps.canQcAcknowledge;
}
