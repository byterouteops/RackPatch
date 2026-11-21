import { cache } from "react";
import {
  CommercialStatus,
  ProjectRole,
  WorkspaceRole,
  type Project,
  type ProjectMembership,
  type WorkspaceMembership,
} from "@prisma/client";
import { isHostedSaas, isPlatformAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/db";
import { resolveProjectCapabilities } from "@/lib/authz-capabilities";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type ProjectAccess = {
  project: Project;
  workspaceRole: WorkspaceRole | null;
  projectRole: ProjectRole | null;
  isOwner: boolean;
  isLead: boolean;
  isTechnician: boolean;
  /** Contractor membership (technician-level, never lead). */
  isContractor: boolean;
  canManageWorkspace: boolean;
  canManageProject: boolean;
  canPublishPlan: boolean;
  canImportEvidence: boolean;
  canUpdateInstall: boolean;
  canPhysicalVerify: boolean;
  canResolveExceptions: boolean;
  /** Contractor QC acknowledge (lead uses canResolveExceptions instead). */
  canQcAcknowledge: boolean;
  canExport: boolean;
  canView: boolean;
};

/**
 * On Community Edition / self-host (HOSTED_SAAS unset/false), all projects may mutate.
 * On hosted SaaS (HOSTED_SAAS=true), only PILOT/PAID projects may mutate (demo still bypasses).
 */
export function commercialAllowsMutations(status: CommercialStatus): boolean {
  if (!isHostedSaas()) return true;
  return status === CommercialStatus.PILOT || status === CommercialStatus.PAID;
}

/** Per-request cache — pages that call access + nested loaders share one lookup. */
export const getProjectAccess = cache(
  async (user: SessionUser, projectId: string): Promise<ProjectAccess | null> => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return null;

    const [wsMembership, projMembership] = await Promise.all([
      prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: project.workspaceId, userId: user.id },
        },
      }),
      prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      }),
    ]);

    return buildAccess(project, wsMembership, projMembership);
  },
);

function buildAccess(
  project: Project,
  wsMembership: WorkspaceMembership | null,
  projMembership: ProjectMembership | null,
): ProjectAccess | null {
  const isOwner = wsMembership?.role === WorkspaceRole.OWNER;

  // Owners see all workspace projects; leads/techs/contractors need membership
  if (!isOwner && !projMembership) {
    return null;
  }

  const paid = commercialAllowsMutations(project.commercialStatus) || project.isDemo;
  const caps = resolveProjectCapabilities({
    isOwner,
    role: projMembership?.role ?? null,
    contractor: projMembership?.contractor ?? false,
    paid,
  });

  return {
    project,
    workspaceRole: wsMembership?.role ?? null,
    projectRole: projMembership?.role ?? null,
    ...caps,
    canManageWorkspace: isOwner,
  };
}

export async function requireProjectAccess(
  user: SessionUser,
  projectId: string,
  capability?: keyof ProjectAccess,
) {
  const access = await getProjectAccess(user, projectId);
  if (!access || !access.canView) {
    const err = new Error("Permission denied");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  if (capability && capability !== "canView" && !access[capability]) {
    const err = new Error("Permission denied");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return access;
}

export async function requireWorkspaceOwner(user: SessionUser, workspaceId: string) {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || membership.role !== WorkspaceRole.OWNER) {
    const err = new Error("Permission denied");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return membership;
}

export async function userHasPlatformAdmin(user: SessionUser): Promise<boolean> {
  if (isPlatformAdminEmail(user.email)) return true;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { platformAdmin: true },
  });
  return row?.platformAdmin === true;
}

export async function requirePlatformAdmin(user: SessionUser) {
  if (!(await userHasPlatformAdmin(user))) {
    const err = new Error("Permission denied");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

export const listVisibleProjects = cache(async function listVisibleProjects(user: SessionUser) {
  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id },
    include: {
      workspace: {
        include: {
          projects: {
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
  });

  const projectMemberships = await prisma.projectMembership.findMany({
    where: { userId: user.id },
    include: { project: true },
  });

  const byId = new Map<string, Project>();
  for (const m of memberships) {
    for (const p of m.workspace.projects) byId.set(p.id, p);
  }
  for (const m of projectMemberships) {
    byId.set(m.project.id, m.project);
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
});
