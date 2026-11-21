"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, PanelSide } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import {
  buildPanelPortIndexes,
  validateCircuitInput,
  validateCircuitPorts,
  validatePanelInput,
  validatePortMapping,
  type PanelSideCode,
} from "@/lib/panels";

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const panelSchema = z.object({
  projectId: z.string(),
  name: z.string().max(120),
  rack: z.string().max(80),
  rackUnit: z.coerce.number().int().optional().nullable(),
  portCount: z.coerce.number().int(),
});

export async function createPatchPanel(raw: z.input<typeof panelSchema>) {
  const user = await requireSessionUser();
  const data = panelSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const v = validatePanelInput(data);
  if (!v.ok) throw new Error(v.error);

  try {
    const panel = await prisma.patchPanel.create({
      data: {
        projectId: data.projectId,
        name: v.value.name,
        rack: v.value.rack,
        rackUnit: v.value.rackUnit,
        portCount: v.value.portCount,
        ports: {
          create: buildPanelPortIndexes(v.value.portCount).map((portIndex) => ({ portIndex })),
        },
      },
    });
    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "panel.create",
      summary: `Created patch panel ${panel.name} (${panel.portCount} ports) in ${panel.rack}`,
    });
    revalidatePath(`/app/projects/${data.projectId}/panels`);
    return { id: panel.id };
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error(`Panel ${v.value.name} already exists`);
    throw e;
  }
}

const mapSchema = z.object({
  projectId: z.string(),
  portId: z.string(),
  plannedLinkId: z.string(),
  side: z.enum(["A", "Z"]),
});

/** Map a panel port to one end of a planned link on the ACTIVE revision. */
export async function mapPanelPort(raw: z.infer<typeof mapSchema>) {
  const user = await requireSessionUser();
  const data = mapSchema.parse(raw);
  const access = await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const activeRevisionId = access.project.activeRevisionId;
  if (!activeRevisionId) throw new Error("No active plan revision");

  const link = await prisma.plannedLink.findFirst({
    where: { id: data.plannedLinkId, revisionId: activeRevisionId },
    select: { id: true, cableId: true },
  });
  if (!link) throw new Error("Cable not found on the active plan");

  const projectPorts = await prisma.panelPort.findMany({
    where: { panel: { projectId: data.projectId } },
    select: { id: true, panelId: true, portIndex: true, side: true, plannedLinkId: true },
  });
  const check = validatePortMapping({
    ports: projectPorts.map((p) => ({ ...p, side: p.side as PanelSideCode | null })),
    portId: data.portId,
    plannedLinkId: link.id,
    side: data.side,
  });
  if (!check.ok) throw new Error(check.error);

  try {
    await prisma.panelPort.update({
      where: { id: data.portId },
      data: { plannedLinkId: link.id, side: data.side as PanelSide },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error("That cable end is already mapped to another port");
    throw e;
  }

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "panel.port.map",
    summary: `Mapped panel port to ${link.cableId} end ${data.side}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/panels`);
}

export async function unmapPanelPort(raw: { projectId: string; portId: string }) {
  const user = await requireSessionUser();
  const data = z.object({ projectId: z.string(), portId: z.string() }).parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const port = await prisma.panelPort.findFirst({
    where: { id: data.portId, panel: { projectId: data.projectId } },
    include: { panel: { select: { name: true } } },
  });
  if (!port) throw new Error("Port not found");

  await prisma.panelPort.update({
    where: { id: port.id },
    data: { plannedLinkId: null, side: null },
  });
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "panel.port.unmap",
    summary: `Unmapped ${port.panel.name} port ${port.portIndex}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/panels`);
}

const circuitSchema = z.object({
  projectId: z.string(),
  name: z.string().max(200),
  mediaType: z.string().max(40),
  panelPortAId: z.string(),
  panelPortZId: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function createCircuit(raw: z.input<typeof circuitSchema>) {
  const user = await requireSessionUser();
  const data = circuitSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const v = validateCircuitInput(data);
  if (!v.ok) throw new Error(v.error);

  const portIds = [data.panelPortAId, data.panelPortZId].filter(Boolean) as string[];
  const found = await prisma.panelPort.findMany({
    where: { id: { in: portIds }, panel: { projectId: data.projectId } },
    select: { id: true },
  });
  if (found.length !== new Set(portIds).size) throw new Error("Panel port not found in this project");

  const existing = await prisma.circuit.findMany({
    where: { projectId: data.projectId },
    select: { id: true, panelPortAId: true, panelPortZId: true },
  });
  const ports = validateCircuitPorts({
    portAId: data.panelPortAId,
    portZId: data.panelPortZId,
    existing: existing.map((c) => ({
      circuitId: c.id,
      portAId: c.panelPortAId,
      portZId: c.panelPortZId,
    })),
  });
  if (!ports.ok) throw new Error(ports.error);

  try {
    const circuit = await prisma.circuit.create({
      data: {
        projectId: data.projectId,
        name: v.name,
        mediaType: v.mediaType,
        panelPortAId: data.panelPortAId,
        panelPortZId: data.panelPortZId || null,
        note: data.note?.trim() || null,
      },
    });
    await recordAudit({
      projectId: data.projectId,
      actorId: user.id,
      action: "circuit.create",
      summary: `Created circuit ${circuit.name} (${circuit.mediaType})`,
    });
    revalidatePath(`/app/projects/${data.projectId}/panels`);
    return { id: circuit.id };
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error("Circuit name or port is already in use");
    throw e;
  }
}

export async function deleteCircuit(raw: { projectId: string; circuitId: string }) {
  const user = await requireSessionUser();
  const data = z.object({ projectId: z.string(), circuitId: z.string() }).parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const circuit = await prisma.circuit.findFirst({
    where: { id: data.circuitId, projectId: data.projectId },
  });
  if (!circuit) throw new Error("Circuit not found");
  await prisma.circuit.delete({ where: { id: circuit.id } });
  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "circuit.delete",
    summary: `Deleted circuit ${circuit.name}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/panels`);
}
