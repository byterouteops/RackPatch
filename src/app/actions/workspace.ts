"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireWorkspaceOwner } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { ensureSite } from "@/lib/sites";
import { trackEvent } from "@/lib/analytics";
import { slugify } from "@/lib/utils";

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
});

export async function createWorkspace(raw: z.infer<typeof createWorkspaceSchema>) {
  const user = await requireSessionUser();
  const data = createWorkspaceSchema.parse(raw);
  let slug = slugify(data.name) || "workspace";
  const existing = await prisma.workspace.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${randomBytes(2).toString("hex")}`;

  const workspace = await prisma.workspace.create({
    data: {
      name: data.name,
      slug,
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  await recordAudit({
    workspaceId: workspace.id,
    actorId: user.id,
    action: "workspace.create",
    summary: `Created workspace ${workspace.name}`,
  });

  revalidatePath("/app");
  return workspace;
}

const createProjectSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(2).max(120),
  customerName: z.string().max(120).optional(),
  site: z.string().min(1).max(120),
  timeZone: z.string().min(1).max(64).default("UTC"),
});

export async function createProject(raw: z.infer<typeof createProjectSchema>) {
  const user = await requireSessionUser();
  const data = createProjectSchema.parse(raw);
  await requireWorkspaceOwner(user, data.workspaceId);

  const site = await ensureSite(data.workspaceId, data.site);

  const project = await prisma.project.create({
    data: {
      workspaceId: data.workspaceId,
      name: data.name,
      customerName: data.customerName || null,
      site: site.name,
      siteId: site.id,
      timeZone: data.timeZone,
      commercialStatus: "NONE",
      memberships: {
        create: { userId: user.id, role: ProjectRole.LEAD },
      },
    },
  });

  await recordAudit({
    projectId: project.id,
    workspaceId: data.workspaceId,
    actorId: user.id,
    action: "project.create",
    summary: `Created project ${project.name} at ${project.site}`,
  });
  await trackEvent({
    name: "project.create",
    projectId: project.id,
    workspaceId: data.workspaceId,
    actorId: user.id,
  });

  revalidatePath("/app");
  return project;
}

const inviteSchema = z.object({
  workspaceId: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(ProjectRole),
  projectId: z.string().min(1),
  contractor: z.boolean().optional().default(false),
});

export async function inviteTeammate(raw: z.input<typeof inviteSchema>) {
  const user = await requireSessionUser();
  const data = inviteSchema.parse(raw);
  await requireWorkspaceOwner(user, data.workspaceId);
  if (data.contractor && data.role !== ProjectRole.TECHNICIAN) {
    throw new Error("Contractors must be invited as Technician");
  }
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, workspaceId: data.workspaceId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in this workspace");

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId: data.workspaceId,
      email: data.email.toLowerCase(),
      role: data.role,
      contractor: data.contractor,
      projectId: data.projectId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedById: user.id,
    },
  });

  await recordAudit({
    workspaceId: data.workspaceId,
    projectId: data.projectId,
    actorId: user.id,
    action: "invitation.create",
    summary: `Invited ${data.email} as ${data.contractor ? "contractor " : ""}${data.role}`,
  });

  revalidatePath(`/app/workspaces/${data.workspaceId}/team`);
  return { id: invitation.id, token, email: invitation.email };
}

export async function acceptInvitation(token: string) {
  const user = await requireSessionUser();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw new Error("Invitation is invalid or expired");
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("Invitation is addressed to a different email address");
  }
  if (!invitation.projectId) {
    throw new Error("Invitation is missing a project assignment");
  }

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    await tx.projectMembership.upsert({
      where: {
        projectId_userId: {
          projectId: invitation.projectId!,
          userId: user.id,
        },
      },
      create: {
        projectId: invitation.projectId!,
        userId: user.id,
        role: invitation.role,
        contractor: invitation.contractor && invitation.role === ProjectRole.TECHNICIAN,
      },
      update: {
        role: invitation.role,
        contractor: invitation.contractor && invitation.role === ProjectRole.TECHNICIAN,
      },
    });
  });

  await recordAudit({
    workspaceId: invitation.workspaceId,
    projectId: invitation.projectId,
    actorId: user.id,
    action: "invitation.accept",
    summary: `${user.email} accepted invitation as ${invitation.contractor ? "contractor " : ""}${invitation.role}`,
  });

  revalidatePath("/app");
  return { workspaceId: invitation.workspaceId, projectId: invitation.projectId };
}

const createSiteSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(120),
});

export async function createSite(raw: z.infer<typeof createSiteSchema>) {
  const user = await requireSessionUser();
  const data = createSiteSchema.parse(raw);
  await requireWorkspaceOwner(user, data.workspaceId);
  const site = await ensureSite(data.workspaceId, data.name);
  await recordAudit({
    workspaceId: data.workspaceId,
    actorId: user.id,
    action: "site.create",
    summary: `Ensured site ${site.name}`,
  });
  revalidatePath(`/app/workspaces/${data.workspaceId}/sites`);
  revalidatePath("/app");
  return site;
}
