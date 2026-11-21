-- Phase 13 full: field photos + offline sync batches
CREATE TABLE "field_photo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plannedLinkId" TEXT,
    "clientId" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'online',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "field_photo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_photo_projectId_clientId_key" ON "field_photo"("projectId", "clientId");
CREATE INDEX "field_photo_projectId_plannedLinkId_idx" ON "field_photo"("projectId", "plannedLinkId");
CREATE INDEX "field_photo_plannedLinkId_idx" ON "field_photo"("plannedLinkId");

ALTER TABLE "field_photo" ADD CONSTRAINT "field_photo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "field_photo" ADD CONSTRAINT "field_photo_plannedLinkId_fkey" FOREIGN KEY ("plannedLinkId") REFERENCES "planned_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "offline_sync_batch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "photoCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,

    CONSTRAINT "offline_sync_batch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "offline_sync_batch_projectId_createdAt_idx" ON "offline_sync_batch"("projectId", "createdAt");

ALTER TABLE "offline_sync_batch" ADD CONSTRAINT "offline_sync_batch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
