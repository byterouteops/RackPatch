-- Phase 19 CE: NetBox dry-run config, sync jobs, outbound webhooks
CREATE TYPE "IntegrationKind" AS ENUM ('NETBOX');
CREATE TYPE "SyncJobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "integration_config" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_config_projectId_kind_key" ON "integration_config"("projectId", "kind");
ALTER TABLE "integration_config" ADD CONSTRAINT "integration_config_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sync_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "integrationId" TEXT,
    "source" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'RUNNING',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_job_projectId_createdAt_idx" ON "sync_job"("projectId", "createdAt");
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integration_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_endpoint_projectId_idx" ON "webhook_endpoint"("projectId");
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;