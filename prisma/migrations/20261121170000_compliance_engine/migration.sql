-- Phase 11 CE: continuous compliance policy + run history
CREATE TABLE "compliance_policy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxEvidenceAgeDays" INTEGER NOT NULL DEFAULT 7,
    "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recomputeFindings" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_policy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "compliance_policy_projectId_key" ON "compliance_policy"("projectId");
ALTER TABLE "compliance_policy" ADD CONSTRAINT "compliance_policy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "compliance_run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "status" TEXT NOT NULL,
    "staleDeviceCount" INTEGER NOT NULL DEFAULT 0,
    "neverImportedCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "maxEvidenceAgeDays" INTEGER NOT NULL DEFAULT 7,
    "fingerprint" TEXT,
    "summary" TEXT NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "notifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_run_projectId_createdAt_idx" ON "compliance_run"("projectId", "createdAt");
ALTER TABLE "compliance_run" ADD CONSTRAINT "compliance_run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
