-- AlterTable
ALTER TABLE "handover_snapshot" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "handover_snapshot" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "handover_snapshot_shareToken_key" ON "handover_snapshot"("shareToken");
