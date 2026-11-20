-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('LEAD', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('NONE', 'PILOT', 'PAID');

-- CreateEnum
CREATE TYPE "InstallStatus" AS ENUM ('PLANNED', 'INSTALLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('AWAITING', 'VERIFIED_LLDP', 'VERIFIED_PHYSICAL', 'MISMATCH', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('EXACT_MATCH', 'WRONG_ENDPOINT', 'AMBIGUOUS', 'NO_OBSERVATION', 'CONFLICTING_OBSERVATIONS', 'PHYSICAL_MISMATCH', 'AWAITING');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_membership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'TECHNICIAN',
    "projectId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerName" TEXT,
    "site" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'NONE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "activeRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_membership" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_revision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT NOT NULL,
    "note" TEXT,
    "importKey" TEXT,
    "sourceCsvHash" TEXT,

    CONSTRAINT "plan_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_link" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "aRack" TEXT NOT NULL,
    "aDevice" TEXT NOT NULL,
    "aPort" TEXT NOT NULL,
    "aDeviceNorm" TEXT NOT NULL,
    "aPortNorm" TEXT NOT NULL,
    "zRack" TEXT NOT NULL,
    "zDevice" TEXT NOT NULL,
    "zPort" TEXT NOT NULL,
    "zDeviceNorm" TEXT NOT NULL,
    "zPortNorm" TEXT NOT NULL,
    "cableType" TEXT,
    "notes" TEXT,
    "endpointKey" TEXT NOT NULL,

    CONSTRAINT "planned_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_runtime" (
    "id" TEXT NOT NULL,
    "plannedLinkId" TEXT NOT NULL,
    "installStatus" "InstallStatus" NOT NULL DEFAULT 'PLANNED',
    "blockedReason" TEXT,
    "installerId" TEXT,
    "installedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "carriedFromLinkId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_runtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_import" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceDevice" TEXT NOT NULL,
    "sourceDeviceNorm" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captureTime" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT,
    "rawTextHash" TEXT NOT NULL,
    "parseWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parseFailed" BOOLEAN NOT NULL DEFAULT false,
    "parseError" TEXT,

    CONSTRAINT "evidence_import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation" (
    "id" TEXT NOT NULL,
    "evidenceImportId" TEXT NOT NULL,
    "localInterface" TEXT NOT NULL,
    "localInterfaceNorm" TEXT NOT NULL,
    "remoteSystemName" TEXT,
    "remoteSystemNorm" TEXT,
    "remotePortId" TEXT,
    "remotePortNorm" TEXT,
    "sourceExcerpt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_alias" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNorm" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceNorm" TEXT NOT NULL,

    CONSTRAINT "device_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_alias" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deviceNorm" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNorm" TEXT NOT NULL,
    "portLabel" TEXT NOT NULL,
    "portNorm" TEXT NOT NULL,

    CONSTRAINT "port_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_verification" (
    "id" TEXT NOT NULL,
    "plannedLinkId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "verifierId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "aConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "zConfirmed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "physical_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_finding" (
    "id" TEXT NOT NULL,
    "plannedLinkId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "state" "VerificationState" NOT NULL DEFAULT 'AWAITING',
    "findingType" "FindingType" NOT NULL DEFAULT 'AWAITING',
    "severity" "FindingSeverity" NOT NULL DEFAULT 'INFO',
    "expectedSummary" TEXT NOT NULL,
    "observedSummary" TEXT,
    "evidenceSource" TEXT,
    "captureTime" TIMESTAMP(3),
    "nextAction" TEXT,
    "exceptionStatus" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgeNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "relatedCableId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_snapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "title" TEXT,
    "payloadJson" TEXT NOT NULL,
    "hasUnresolvedExceptions" BOOLEAN NOT NULL DEFAULT false,
    "awaitingCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "handover_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_request" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "projectSize" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,

    CONSTRAINT "pilot_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_activation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "CommercialStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_activation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_membership_workspaceId_userId_key" ON "workspace_membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_email_workspaceId_idx" ON "invitation"("email", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "project_activeRevisionId_key" ON "project"("activeRevisionId");

-- CreateIndex
CREATE INDEX "project_workspaceId_idx" ON "project"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "project_membership_projectId_userId_key" ON "project_membership"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_revision_projectId_revisionNumber_key" ON "plan_revision"("projectId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "plan_revision_projectId_importKey_key" ON "plan_revision"("projectId", "importKey");

-- CreateIndex
CREATE INDEX "planned_link_revisionId_endpointKey_idx" ON "planned_link"("revisionId", "endpointKey");

-- CreateIndex
CREATE UNIQUE INDEX "planned_link_revisionId_cableId_key" ON "planned_link"("revisionId", "cableId");

-- CreateIndex
CREATE UNIQUE INDEX "planned_link_revisionId_aDeviceNorm_aPortNorm_key" ON "planned_link"("revisionId", "aDeviceNorm", "aPortNorm");

-- CreateIndex
CREATE UNIQUE INDEX "planned_link_revisionId_zDeviceNorm_zPortNorm_key" ON "planned_link"("revisionId", "zDeviceNorm", "zPortNorm");

-- CreateIndex
CREATE UNIQUE INDEX "link_runtime_plannedLinkId_key" ON "link_runtime"("plannedLinkId");

-- CreateIndex
CREATE INDEX "evidence_import_projectId_sourceDeviceNorm_uploadedAt_idx" ON "evidence_import"("projectId", "sourceDeviceNorm", "uploadedAt");

-- CreateIndex
CREATE INDEX "observation_evidenceImportId_idx" ON "observation"("evidenceImportId");

-- CreateIndex
CREATE UNIQUE INDEX "device_alias_projectId_aliasNorm_key" ON "device_alias"("projectId", "aliasNorm");

-- CreateIndex
CREATE UNIQUE INDEX "port_alias_projectId_deviceNorm_aliasNorm_key" ON "port_alias"("projectId", "deviceNorm", "aliasNorm");

-- CreateIndex
CREATE INDEX "physical_verification_plannedLinkId_idx" ON "physical_verification"("plannedLinkId");

-- CreateIndex
CREATE INDEX "verification_finding_revisionId_state_idx" ON "verification_finding"("revisionId", "state");

-- CreateIndex
CREATE INDEX "verification_finding_revisionId_exceptionStatus_idx" ON "verification_finding"("revisionId", "exceptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "verification_finding_plannedLinkId_revisionId_key" ON "verification_finding"("plannedLinkId", "revisionId");

-- CreateIndex
CREATE INDEX "handover_snapshot_projectId_createdAt_idx" ON "handover_snapshot"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_projectId_createdAt_idx" ON "audit_event"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "pilot_request_createdAt_idx" ON "pilot_request"("createdAt");

-- CreateIndex
CREATE INDEX "commercial_activation_projectId_idx" ON "commercial_activation"("projectId");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_key_idx" ON "rate_limit_bucket"("key");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_bucket_key_windowStart_key" ON "rate_limit_bucket"("key", "windowStart");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "plan_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_membership" ADD CONSTRAINT "project_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_revision" ADD CONSTRAINT "plan_revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_link" ADD CONSTRAINT "planned_link_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "plan_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_runtime" ADD CONSTRAINT "link_runtime_plannedLinkId_fkey" FOREIGN KEY ("plannedLinkId") REFERENCES "planned_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_runtime" ADD CONSTRAINT "link_runtime_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_import" ADD CONSTRAINT "evidence_import_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_evidenceImportId_fkey" FOREIGN KEY ("evidenceImportId") REFERENCES "evidence_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alias" ADD CONSTRAINT "device_alias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "port_alias" ADD CONSTRAINT "port_alias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_verification" ADD CONSTRAINT "physical_verification_plannedLinkId_fkey" FOREIGN KEY ("plannedLinkId") REFERENCES "planned_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_verification" ADD CONSTRAINT "physical_verification_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "plan_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_verification" ADD CONSTRAINT "physical_verification_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_finding" ADD CONSTRAINT "verification_finding_plannedLinkId_fkey" FOREIGN KEY ("plannedLinkId") REFERENCES "planned_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_finding" ADD CONSTRAINT "verification_finding_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "plan_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_snapshot" ADD CONSTRAINT "handover_snapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_snapshot" ADD CONSTRAINT "handover_snapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activation" ADD CONSTRAINT "commercial_activation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activation" ADD CONSTRAINT "commercial_activation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
