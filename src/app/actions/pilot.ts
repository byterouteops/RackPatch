"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireSessionUser } from "@/lib/session";
import { requirePlatformAdmin } from "@/lib/authz";
import { CommercialStatus } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const pilotSchema = z.object({
  name: z.string().min(1).max(120),
  businessEmail: z.string().email().max(200),
  company: z.string().min(1).max(200),
  projectSize: z.string().min(1).max(200),
});

export async function submitPilotRequest(
  raw: z.infer<typeof pilotSchema>,
  clientKey?: string,
) {
  const data = pilotSchema.parse(raw);
  const key = `pilot:${(clientKey || data.businessEmail).toLowerCase()}`;
  const limit = await consumeRateLimit(key, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    throw new Error("Too many pilot requests. Please try again later.");
  }

  const request = await prisma.pilotRequest.create({
    data: {
      name: data.name,
      businessEmail: data.businessEmail.toLowerCase(),
      company: data.company,
      projectSize: data.projectSize,
    },
  });

  if (process.env.PILOT_NOTIFY_EMAIL && process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "RackPatch <onboarding@resend.dev>",
        to: process.env.PILOT_NOTIFY_EMAIL,
        subject: `Pilot request from ${data.company}`,
        text: `${data.name} <${data.businessEmail}> — ${data.company} — size: ${data.projectSize}`,
      }),
    }).catch(() => undefined);
  }

  return {
    id: request.id,
    message:
      "Thanks — we received your pilot request. We will follow up by email. This does not promise a delivery date.",
  };
}

const activateSchema = z.object({
  projectId: z.string(),
  status: z.enum(["PILOT", "PAID"]),
  note: z.string().max(500).optional(),
});

export async function activateProjectCommercial(raw: z.infer<typeof activateSchema>) {
  const user = await requireSessionUser();
  await requirePlatformAdmin(user);
  const data = activateSchema.parse(raw);

  const project = await prisma.project.update({
    where: { id: data.projectId },
    data: { commercialStatus: data.status as CommercialStatus },
  });

  await prisma.commercialActivation.create({
    data: {
      projectId: data.projectId,
      status: data.status as CommercialStatus,
      actorId: user.id,
      note: data.note,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "commercial.activate",
    summary: `Activated project as ${data.status}`,
  });

  revalidatePath("/app/admin");
  revalidatePath(`/app/projects/${data.projectId}`);
  return project;
}
