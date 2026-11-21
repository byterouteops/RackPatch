-- Phase 14: Site under workspace
CREATE TABLE "site" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_workspaceId_slug_key" ON "site"("workspaceId", "slug");
CREATE INDEX "site_workspaceId_idx" ON "site"("workspaceId");

ALTER TABLE "site" ADD CONSTRAINT "site_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project" ADD COLUMN "siteId" TEXT;
CREATE INDEX "project_siteId_idx" ON "project"("siteId");
ALTER TABLE "project" ADD CONSTRAINT "project_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill sites from distinct project.site labels
INSERT INTO "site" ("id", "workspaceId", "name", "slug", "createdAt", "updatedAt")
SELECT
  md5(p."workspaceId" || ':' || lower(trim(p."site"))),
  p."workspaceId",
  trim(p."site"),
  left(regexp_replace(lower(trim(p."site")), '[^a-z0-9]+', '-', 'g'), 48),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "workspaceId", "site"
  FROM "project"
  WHERE trim("site") <> ''
) p
ON CONFLICT ("workspaceId", "slug") DO NOTHING;

UPDATE "project" pr
SET "siteId" = s."id"
FROM "site" s
WHERE s."workspaceId" = pr."workspaceId"
  AND s."name" = trim(pr."site")
  AND pr."siteId" IS NULL;

-- Phase 15: link lifecycle fields
ALTER TABLE "link_runtime" ADD COLUMN "assetSerial" TEXT;
ALTER TABLE "link_runtime" ADD COLUMN "lengthMeters" DOUBLE PRECISION;
ALTER TABLE "link_runtime" ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "link_runtime" ADD COLUMN "retireNote" TEXT;

-- Phase 10: collection job stub
CREATE TYPE "CollectionJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "collection_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "CollectionJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDevice" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "evidenceImportId" TEXT,
    "note" TEXT,

    CONSTRAINT "collection_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collection_job_projectId_createdAt_idx" ON "collection_job"("projectId", "createdAt");

ALTER TABLE "collection_job" ADD CONSTRAINT "collection_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 19: API tokens
CREATE TABLE "api_token" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_token_tokenHash_key" ON "api_token"("tokenHash");
CREATE INDEX "api_token_projectId_idx" ON "api_token"("projectId");

ALTER TABLE "api_token" ADD CONSTRAINT "api_token_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
