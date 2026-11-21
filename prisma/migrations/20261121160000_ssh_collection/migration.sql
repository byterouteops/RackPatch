CREATE TABLE "device_credential" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "authKind" TEXT NOT NULL DEFAULT 'password',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_credential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_credential_projectId_idx" ON "device_credential"("projectId");
ALTER TABLE "device_credential" ADD CONSTRAINT "device_credential_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "collection_target" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "credentialId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "hostKeyFingerprint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_target_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collection_target_projectId_idx" ON "collection_target"("projectId");
ALTER TABLE "collection_target" ADD CONSTRAINT "collection_target_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_target" ADD CONSTRAINT "collection_target_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "device_credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collection_job" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'manual_paste';
ALTER TABLE "collection_job" ADD COLUMN "targetId" TEXT;
