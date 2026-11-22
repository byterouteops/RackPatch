"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/lib/commercial-gate";
import { recordAudit } from "@/lib/audit";
import { trackEvent } from "@/lib/analytics";
import { parseCableQr } from "@/lib/qr/parse-cable-qr";
import { matchesImageSignature } from "@/lib/image-signature";
import {
  MAX_PHOTO_BYTES,
  validateOfflineSyncPayload,
  type OfflineFieldItem,
} from "@/lib/offline/field-queue";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function decodePhoto(base64: string, mimeType: string) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("Only JPEG, PNG, or WebP photos are allowed");
  }
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) {
    throw new Error(`Photo must be between 1 and ${MAX_PHOTO_BYTES} bytes`);
  }
  if (!matchesImageSignature(buf, mimeType)) {
    throw new Error("File is not a valid JPEG, PNG, or WebP image");
  }
  return {
    data: buf,
    byteSize: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

const uploadSchema = z.object({
  projectId: z.string(),
  linkId: z.string(),
  photoBase64: z.string().min(1),
  mimeType: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
  clientId: z.string().max(80).optional().nullable(),
});

export async function uploadFieldPhoto(raw: z.infer<typeof uploadSchema>) {
  const user = await requireSessionUser();
  const data = uploadSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canUpdateInstall");
  await assertPaidOrThrow(data.projectId);

  const link = await prisma.plannedLink.findFirst({
    where: { id: data.linkId, revision: { projectId: data.projectId } },
  });
  if (!link) throw new Error("Cable not found");

  const photo = decodePhoto(data.photoBase64, data.mimeType);
  const clientId = data.clientId?.trim() || null;

  if (clientId) {
    const existing = await prisma.fieldPhoto.findUnique({
      where: { projectId_clientId: { projectId: data.projectId, clientId } },
    });
    if (existing) return { id: existing.id, deduped: true as const };
  }

  const row = await prisma.fieldPhoto.create({
    data: {
      projectId: data.projectId,
      plannedLinkId: link.id,
      clientId,
      mimeType: data.mimeType,
      byteSize: photo.byteSize,
      sha256: photo.sha256,
      data: photo.data,
      note: data.note?.trim() || null,
      source: "online",
      uploadedById: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "field_photo.upload",
    summary: `Uploaded field photo for ${link.cableId}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/cables/${link.id}`);
  return { id: row.id, deduped: false as const };
}

async function resolveLinkFromQr(projectId: string, qrRaw: string) {
  const parsed = parseCableQr(qrRaw, projectId);
  if (!parsed.ok) return { error: parsed.error as string };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.activeRevisionId) return { error: "No active plan" };

  const link = await prisma.plannedLink.findFirst({
    where: {
      revisionId: project.activeRevisionId,
      OR: [{ id: parsed.linkId }, { cableId: parsed.linkId }],
    },
  });
  if (!link) return { error: "Cable from QR not found in this project" };
  return { link, action: parsed.action };
}

export async function syncOfflineFieldQueue(raw: {
  projectId: string;
  items: OfflineFieldItem[];
}) {
  const user = await requireSessionUser();
  const projectId = z.string().parse(raw.projectId);
  await requireProjectAccess(user, projectId, "canUpdateInstall");
  await assertPaidOrThrow(projectId);

  const validated = validateOfflineSyncPayload({ items: raw.items }, projectId);
  if (!validated.ok) throw new Error(validated.error);

  let photoCount = 0;
  const results: Array<{ clientId: string; ok: boolean; error?: string; photoId?: string }> = [];

  for (const item of validated.items) {
    try {
      const resolved = await resolveLinkFromQr(projectId, item.qrRaw);
      if ("error" in resolved && resolved.error) {
        results.push({ clientId: item.clientId, ok: false, error: resolved.error });
        continue;
      }
      const link = "link" in resolved ? resolved.link : null;
      if (!link) {
        results.push({ clientId: item.clientId, ok: false, error: "Cable not found" });
        continue;
      }

      let photoId: string | undefined;
      if (item.photoBase64 && item.photoMimeType) {
        const existing = await prisma.fieldPhoto.findUnique({
          where: {
            projectId_clientId: { projectId, clientId: item.clientId },
          },
        });
        if (existing) {
          photoId = existing.id;
        } else {
          const photo = decodePhoto(item.photoBase64, item.photoMimeType);
          const row = await prisma.fieldPhoto.create({
            data: {
              projectId,
              plannedLinkId: link.id,
              clientId: item.clientId,
              mimeType: item.photoMimeType,
              byteSize: photo.byteSize,
              sha256: photo.sha256,
              data: photo.data,
              note: item.note,
              source: "offline_sync",
              capturedAt: new Date(item.capturedAt),
              uploadedById: user.id,
            },
          });
          photoId = row.id;
          photoCount += 1;
        }
      }

      results.push({ clientId: item.clientId, ok: true, photoId });
    } catch (e) {
      results.push({
        clientId: item.clientId,
        ok: false,
        error: e instanceof Error ? e.message : "Sync failed",
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await prisma.offlineSyncBatch.create({
    data: {
      projectId,
      uploadedById: user.id,
      itemCount: validated.items.length,
      photoCount,
      summary: `${okCount}/${validated.items.length} items synced`,
    },
  });

  await recordAudit({
    projectId,
    actorId: user.id,
    action: "offline.sync",
    summary: `Synced ${okCount}/${validated.items.length} offline field items (${photoCount} photos)`,
  });

  await trackEvent({
    name: "offline.sync",
    projectId,
    actorId: user.id,
    props: { itemCount: validated.items.length, okCount, photoCount },
  });

  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath(`/app/projects/${projectId}/scan`);
  return { results, photoCount, okCount };
}
