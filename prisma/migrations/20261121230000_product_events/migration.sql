-- Feature 10: first-party product analytics events (no third-party trackers)
CREATE TABLE "product_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "actorId" TEXT,
    "name" TEXT NOT NULL,
    "propsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_event_projectId_createdAt_idx" ON "product_event"("projectId", "createdAt");
CREATE INDEX "product_event_name_createdAt_idx" ON "product_event"("name", "createdAt");
