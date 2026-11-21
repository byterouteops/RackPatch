"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PortStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import { normalizeDevice, normalizePort } from "@/lib/csv/normalize";
import { derivePortsFromLinks, planPortSync } from "@/lib/port-inventory";

/** Upsert devices/ports from the active plan revision (non-retired links). */
export async function syncPortInventory(projectId: string) {
  const user = await requireSessionUser();
  const access = await requireProjectAccess(user, projectId, "canManageProject");
  await assertPaidOrThrow(projectId);

  const revisionId = access.project.activeRevisionId;
  if (!revisionId) throw new Error("No active plan revision");

  const links = await prisma.plannedLink.findMany({
    where: { revisionId },
    include: { runtime: { select: { retiredAt: true } } },
  });

  const { ports: derived, conflicts } = derivePortsFromLinks(
    links.map((l) => ({
      cableId: l.cableId,
      aRack: l.aRack,
      aDevice: l.aDevice,
      aPort: l.aPort,
      zRack: l.zRack,
      zDevice: l.zDevice,
      zPort: l.zPort,
      retiredAt: l.runtime?.retiredAt ?? null,
    })),
  );

  const existingDevices = await prisma.deviceInventory.findMany({
    where: { projectId },
    include: { ports: true },
  });
  const plan = planPortSync(
    existingDevices.flatMap((d) =>
      d.ports.map((p) => ({
        deviceNorm: d.nameNorm,
        portNorm: p.portNorm,
        status: p.status,
        plannedCableId: p.plannedCableId,
      })),
    ),
    derived,
  );

  const result = await prisma.$transaction(async (tx) => {
    const deviceIds = new Map<string, string>(existingDevices.map((d) => [d.nameNorm, d.id]));

    for (const p of derived) {
      let deviceId = deviceIds.get(p.deviceNorm);
      if (!deviceId) {
        const created = await tx.deviceInventory.create({
          data: { projectId, name: p.device, nameNorm: p.deviceNorm, rack: p.rack || null },
        });
        deviceId = created.id;
        deviceIds.set(p.deviceNorm, deviceId);
      } else if (p.rack) {
        await tx.deviceInventory.update({ where: { id: deviceId }, data: { rack: p.rack } });
      }
      await tx.devicePort.upsert({
        where: { deviceId_portNorm: { deviceId, portNorm: p.portNorm } },
        create: {
          deviceId,
          portLabel: p.portLabel,
          portNorm: p.portNorm,
          status: PortStatus.USED,
          plannedCableId: p.cableId,
        },
        update: { status: PortStatus.USED, plannedCableId: p.cableId, portLabel: p.portLabel },
      });
    }

    for (const r of plan.release) {
      const deviceId = deviceIds.get(r.deviceNorm);
      if (!deviceId) continue;
      await tx.devicePort.update({
        where: { deviceId_portNorm: { deviceId, portNorm: r.portNorm } },
        data: { status: PortStatus.FREE, plannedCableId: null },
      });
    }

    return { devices: deviceIds.size, ports: derived.length };
  });

  await recordAudit({
    projectId,
    actorId: user.id,
    action: "inventory.sync",
    summary: `Synced port inventory: ${result.ports} used ports on ${result.devices} devices`,
    metadata: {
      released: plan.release.length,
      reservedConflicts: plan.reservedConflicts.length,
      portConflicts: conflicts.length,
    },
  });

  revalidatePath(`/app/projects/${projectId}/inventory`);
  return {
    devices: result.devices,
    usedPorts: result.ports,
    released: plan.release.length,
    reservedConflicts: plan.reservedConflicts.length,
    portConflicts: conflicts.length,
  };
}

const portSchema = z.object({
  projectId: z.string(),
  device: z.string().min(1).max(120),
  port: z.string().min(1).max(80),
  speed: z.string().max(40).optional().nullable(),
});

/** Add a spare/free port that is not (yet) in the plan. */
export async function addInventoryPort(raw: z.input<typeof portSchema>) {
  const user = await requireSessionUser();
  const data = portSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const nameNorm = normalizeDevice(data.device);
  const portNorm = normalizePort(data.port);
  if (!nameNorm || !portNorm) throw new Error("Device and port are required");

  const device = await prisma.deviceInventory.upsert({
    where: { projectId_nameNorm: { projectId: data.projectId, nameNorm } },
    create: { projectId: data.projectId, name: data.device.trim(), nameNorm },
    update: {},
  });
  const existing = await prisma.devicePort.findUnique({
    where: { deviceId_portNorm: { deviceId: device.id, portNorm } },
  });
  if (existing) throw new Error("Port already exists on this device");

  await prisma.devicePort.create({
    data: {
      deviceId: device.id,
      portLabel: data.port.trim(),
      portNorm,
      speed: data.speed?.trim() || null,
      status: PortStatus.FREE,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "inventory.port.add",
    summary: `Added port ${data.port.trim()} on ${device.name}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/inventory`);
}

const updateSchema = z.object({
  projectId: z.string(),
  portId: z.string(),
  status: z.enum(["FREE", "RESERVED"]).optional(),
  speed: z.string().max(40).optional().nullable(),
});

/** Reserve/free a port and set speed. Plan-occupied (USED) ports cannot be changed to FREE/RESERVED. */
export async function updateInventoryPort(raw: z.input<typeof updateSchema>) {
  const user = await requireSessionUser();
  const data = updateSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const port = await prisma.devicePort.findFirst({
    where: { id: data.portId, device: { projectId: data.projectId } },
    include: { device: true },
  });
  if (!port) throw new Error("Port not found");

  if (data.status && port.status === PortStatus.USED) {
    throw new Error("Port is used by the active plan; change the plan instead");
  }

  await prisma.devicePort.update({
    where: { id: port.id },
    data: {
      ...(data.status ? { status: data.status as PortStatus } : {}),
      ...(data.speed !== undefined ? { speed: data.speed?.trim() || null } : {}),
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "inventory.port.update",
    summary: `Updated ${port.device.name} ${port.portLabel}${data.status ? ` -> ${data.status}` : ""}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/inventory`);
}
