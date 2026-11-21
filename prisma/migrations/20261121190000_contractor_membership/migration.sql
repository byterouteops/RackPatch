-- Phase 14 CE: contractor flag on project membership and invitations (ProjectRole enum unchanged)
ALTER TABLE "project_membership" ADD COLUMN "contractor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invitation" ADD COLUMN "contractor" BOOLEAN NOT NULL DEFAULT false;
