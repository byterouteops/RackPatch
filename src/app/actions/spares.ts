"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import { normalizeSku, requiredStockCapability, MAX_STOCK_QUANTITY } from "@/lib/stock";
import { postStockTransaction } from "@/lib/stock-ledger";

const createSchema = z.object({
  projectId: z.string(),
  sku: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
  unit: z.string().min(1).max(20).default("each"),
  initialQuantity: z.coerce.number().int().min(0).max(MAX_STOCK_QUANTITY).default(0),
});

export async function createStockItem(raw: z.input<typeof createSchema>) {
  const user = await requireSessionUser();
  const data = createSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canManageProject");
  await assertPaidOrThrow(data.projectId);

  const sku = normalizeSku(data.sku);
  if (!sku) throw new Error("SKU is required");

  let item;
  try {
    item = await prisma.stockItem.create({
      data: {
        projectId: data.projectId,
        sku,
        description: data.description.trim(),
        unit: data.unit.trim(),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(`SKU ${sku} already exists`);
    }
    throw e;
  }

  if (data.initialQuantity > 0) {
    await postStockTransaction({
      projectId: data.projectId,
      itemId: item.id,
      delta: data.initialQuantity,
      reason: "Initial stock",
      actorId: user.id,
    });
  }

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "spares.item.create",
    summary: `Created stock item ${sku} (initial ${data.initialQuantity})`,
  });
  revalidatePath(`/app/projects/${data.projectId}/spares`);
  return { id: item.id };
}

const adjustSchema = z.object({
  projectId: z.string(),
  itemId: z.string(),
  delta: z.coerce.number().int(),
  reason: z.string().min(1).max(200),
});

/** Receive (positive, lead) or consume/remove (negative, technician+) stock. Never below zero. */
export async function adjustStock(raw: z.input<typeof adjustSchema>) {
  const user = await requireSessionUser();
  const data = adjustSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, requiredStockCapability(data.delta));
  await assertPaidOrThrow(data.projectId);

  const result = await postStockTransaction({
    projectId: data.projectId,
    itemId: data.itemId,
    delta: data.delta,
    reason: data.reason,
    actorId: user.id,
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "spares.adjust",
    summary: `Stock ${data.delta > 0 ? "+" : ""}${data.delta} on item ${data.itemId} -> ${result.quantityAfter}`,
  });
  revalidatePath(`/app/projects/${data.projectId}/spares`);
  return result;
}
