-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FindingType" ADD VALUE 'WRONG_NEIGHBOR';
ALTER TYPE "FindingType" ADD VALUE 'WRONG_PORT';
ALTER TYPE "FindingType" ADD VALUE 'MISSING_NEIGHBOR';
ALTER TYPE "FindingType" ADD VALUE 'STALE_EVIDENCE';
ALTER TYPE "FindingType" ADD VALUE 'AMBIGUOUS_IDENTITY';
ALTER TYPE "FindingType" ADD VALUE 'UNOBSERVABLE';
ALTER TYPE "FindingType" ADD VALUE 'PARSER_ERROR';
ALTER TYPE "FindingType" ADD VALUE 'LINK_DOWN';
ALTER TYPE "FindingType" ADD VALUE 'SPEED_MISMATCH';

-- AlterEnum
ALTER TYPE "ProjectRole" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "device_inventory" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "face" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "rackUnit" INTEGER,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "uHeight" INTEGER,
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "evidence_import" ADD COLUMN     "demoSnapshot" TEXT,
ADD COLUMN     "formatId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'NEIGHBOR',
ADD COLUMN     "osProfile" TEXT,
ADD COLUMN     "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "planned_link" ADD COLUMN     "color" TEXT,
ADD COLUMN     "connector" TEXT,
ADD COLUMN     "fabric" TEXT,
ADD COLUMN     "lengthM" DOUBLE PRECISION,
ADD COLUMN     "media" TEXT,
ADD COLUMN     "rail" TEXT,
ADD COLUMN     "speed" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "demoEvidenceSnapshot" TEXT;

-- AlterTable
ALTER TABLE "verification_finding" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "observability" TEXT,
ADD COLUMN     "observedSides" TEXT,
ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedById" TEXT,
ADD COLUMN     "waiverReason" TEXT;

-- CreateTable
CREATE TABLE "rack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "heightU" INTEGER NOT NULL DEFAULT 42,
    "purpose" TEXT,
    "row" TEXT,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_state_observation" (
    "id" TEXT NOT NULL,
    "evidenceImportId" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "portNorm" TEXT NOT NULL,
    "operState" TEXT NOT NULL,
    "speed" TEXT,

    CONSTRAINT "interface_state_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_approval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rack_projectId_name_key" ON "rack"("projectId", "name");

-- CreateIndex
CREATE INDEX "interface_state_observation_evidenceImportId_idx" ON "interface_state_observation"("evidenceImportId");

-- CreateIndex
CREATE INDEX "handover_approval_projectId_idx" ON "handover_approval"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "handover_approval_snapshotId_stage_key" ON "handover_approval"("snapshotId", "stage");

-- AddForeignKey
ALTER TABLE "rack" ADD CONSTRAINT "rack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_state_observation" ADD CONSTRAINT "interface_state_observation_evidenceImportId_fkey" FOREIGN KEY ("evidenceImportId") REFERENCES "evidence_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_approval" ADD CONSTRAINT "handover_approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_approval" ADD CONSTRAINT "handover_approval_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "handover_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_approval" ADD CONSTRAINT "handover_approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
