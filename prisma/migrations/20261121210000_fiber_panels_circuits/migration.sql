-- Phase 16 CE: patch panels, panel ports, circuits
CREATE TYPE "PanelSide" AS ENUM ('A', 'Z');

CREATE TABLE "patch_panel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "rackUnit" INTEGER,
    "portCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patch_panel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patch_panel_portCount_positive" CHECK ("portCount" > 0)
);

CREATE UNIQUE INDEX "patch_panel_projectId_name_key" ON "patch_panel"("projectId", "name");
ALTER TABLE "patch_panel" ADD CONSTRAINT "patch_panel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "panel_port" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "portIndex" INTEGER NOT NULL,
    "side" "PanelSide",
    "plannedLinkId" TEXT,
    "note" TEXT,

    CONSTRAINT "panel_port_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "panel_port_index_positive" CHECK ("portIndex" > 0)
);

CREATE UNIQUE INDEX "panel_port_panelId_portIndex_key" ON "panel_port"("panelId", "portIndex");
CREATE UNIQUE INDEX "panel_port_plannedLinkId_side_key" ON "panel_port"("plannedLinkId", "side");
CREATE INDEX "panel_port_plannedLinkId_idx" ON "panel_port"("plannedLinkId");
ALTER TABLE "panel_port" ADD CONSTRAINT "panel_port_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "patch_panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "panel_port" ADD CONSTRAINT "panel_port_plannedLinkId_fkey" FOREIGN KEY ("plannedLinkId") REFERENCES "planned_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "circuit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "panelPortAId" TEXT NOT NULL,
    "panelPortZId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "circuit_ports_distinct" CHECK ("panelPortZId" IS NULL OR "panelPortZId" <> "panelPortAId")
);

CREATE UNIQUE INDEX "circuit_panelPortAId_key" ON "circuit"("panelPortAId");
CREATE UNIQUE INDEX "circuit_panelPortZId_key" ON "circuit"("panelPortZId");
CREATE UNIQUE INDEX "circuit_projectId_name_key" ON "circuit"("projectId", "name");
ALTER TABLE "circuit" ADD CONSTRAINT "circuit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circuit" ADD CONSTRAINT "circuit_panelPortAId_fkey" FOREIGN KEY ("panelPortAId") REFERENCES "panel_port"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "circuit" ADD CONSTRAINT "circuit_panelPortZId_fkey" FOREIGN KEY ("panelPortZId") REFERENCES "panel_port"("id") ON DELETE SET NULL ON UPDATE CASCADE;
