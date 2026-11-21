"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/authz";
import { assertPaidOrThrow } from "@/app/actions/workspace";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/secrets";
import { COLLECTION_PROFILES, getCollectionProfile } from "@/lib/collection/commands";
import { runAllowlistedSshCollect } from "@/lib/collection/ssh-collect";
import { importLldpEvidence } from "@/app/actions/evidence";

const credSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(80),
  username: z.string().min(1).max(120),
  secret: z.string().min(1).max(16_000),
  authKind: z.enum(["password", "privateKey"]).default("password"),
});

export async function createDeviceCredential(raw: z.infer<typeof credSchema>) {
  const user = await requireSessionUser();
  const data = credSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canImportEvidence");
  await assertPaidOrThrow(data.projectId);

  const row = await prisma.deviceCredential.create({
    data: {
      projectId: data.projectId,
      name: data.name.trim(),
      username: data.username.trim(),
      secretCiphertext: encryptSecret(data.secret),
      authKind: data.authKind,
      createdById: user.id,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "collection.credential.create",
    summary: `Created collection credential ${row.name}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/collection`);
  return { id: row.id, name: row.name };
}

const targetSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  credentialId: z.string(),
  profileId: z.string(),
});

export async function createCollectionTarget(raw: z.infer<typeof targetSchema>) {
  const user = await requireSessionUser();
  const data = targetSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canImportEvidence");
  await assertPaidOrThrow(data.projectId);

  if (!getCollectionProfile(data.profileId)) {
    throw new Error("Invalid collection profile");
  }

  const cred = await prisma.deviceCredential.findFirst({
    where: { id: data.credentialId, projectId: data.projectId },
  });
  if (!cred) throw new Error("Credential not found");

  // Basic host validation — no URLs, no spaces
  if (!/^[a-zA-Z0-9._:-]+$/.test(data.host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(data.host)) {
    // allow hostname or IPv4; reject shell metacharacters
    if (/[^\w.\-:]/.test(data.host)) {
      throw new Error("Invalid host");
    }
  }

  const row = await prisma.collectionTarget.create({
    data: {
      projectId: data.projectId,
      name: data.name.trim(),
      host: data.host.trim(),
      port: data.port,
      credentialId: data.credentialId,
      profileId: data.profileId,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "collection.target.create",
    summary: `Created collection target ${row.name} (${row.host})`,
  });

  revalidatePath(`/app/projects/${data.projectId}/collection`);
  return { id: row.id };
}

const runSchema = z.object({
  projectId: z.string(),
  targetId: z.string(),
  acceptHostKey: z.boolean().optional(),
});

export async function runSshCollection(raw: z.infer<typeof runSchema>) {
  const user = await requireSessionUser();
  const data = runSchema.parse(raw);
  await requireProjectAccess(user, data.projectId, "canImportEvidence");
  await assertPaidOrThrow(data.projectId);

  const target = await prisma.collectionTarget.findFirst({
    where: { id: data.targetId, projectId: data.projectId, enabled: true },
    include: { credential: true },
  });
  if (!target) throw new Error("Target not found");

  const job = await prisma.collectionJob.create({
    data: {
      projectId: data.projectId,
      status: "RUNNING",
      sourceDevice: target.name,
      createdById: user.id,
      startedAt: new Date(),
      note: `ssh:${target.profileId}`,
      kind: "ssh",
      targetId: target.id,
    },
  });

  const result = await runAllowlistedSshCollect({
    host: target.host,
    port: target.port,
    username: target.credential.username,
    secretCiphertext: target.credential.secretCiphertext,
    authKind: target.credential.authKind,
    profileId: target.profileId,
    hostKeyFingerprint: target.hostKeyFingerprint,
    acceptHostKey: data.acceptHostKey,
  });

  if (!result.ok) {
    if (result.needsHostKeyAccept && result.hostKeyFingerprint && data.acceptHostKey) {
      // should have been accepted inside runner; fall through
    }
    if (result.needsHostKeyAccept && result.hostKeyFingerprint && !data.acceptHostKey) {
      await prisma.collectionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: result.error,
        },
      });
      return {
        ok: false as const,
        jobId: job.id,
        error: result.error,
        needsHostKeyAccept: true as const,
        hostKeyFingerprint: result.hostKeyFingerprint,
      };
    }

    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: result.error },
    });
    return { ok: false as const, jobId: job.id, error: result.error };
  }

  if (data.acceptHostKey || !target.hostKeyFingerprint) {
    await prisma.collectionTarget.update({
      where: { id: target.id },
      data: { hostKeyFingerprint: result.hostKeyFingerprint },
    });
  }

  const imported = await importLldpEvidence({
    projectId: data.projectId,
    text: result.output,
    sourceDevice: target.name,
    format: result.format as
      | "cisco-nxos-lldp"
      | "cisco-ios-lldp"
      | "cisco-cdp"
      | "arista-eos-lldp"
      | "juniper-junos-lldp",
    filename: `ssh-${target.host}.txt`,
  });

  await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status: imported.ok ? "COMPLETED" : "FAILED",
      finishedAt: new Date(),
      evidenceImportId: imported.ok ? imported.importId : undefined,
      error: imported.ok ? null : imported.error,
    },
  });

  await recordAudit({
    projectId: data.projectId,
    actorId: user.id,
    action: "collection.ssh.run",
    summary: `SSH collect ${target.name}: ${imported.ok ? "ok" : imported.error}`,
  });

  revalidatePath(`/app/projects/${data.projectId}/collection`);
  revalidatePath(`/app/projects/${data.projectId}/lldp`);
  return { ok: imported.ok, jobId: job.id, imported };
}

export async function listCollectionProfiles() {
  return Object.entries(COLLECTION_PROFILES).map(([id, p]) => ({
    id,
    label: p.label,
    command: p.command,
  }));
}
