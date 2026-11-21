-- Phase 12 CE: device/port inventory (synced from active plan) for impact simulation
CREATE TYPE "PortStatus" AS ENUM ('FREE', 'USED', 'RESERVED');

CREATE TABLE "device_inventory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "rack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_inventory_projectId_nameNorm_key" ON "device_inventory"("projectId", "nameNorm");
ALTER TABLE "device_inventory" ADD CONSTRAINT "device_inventory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "device_port" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "portLabel" TEXT NOT NULL,
    "portNorm" TEXT NOT NULL,
    "speed" TEXT,
    "status" "PortStatus" NOT NULL DEFAULT 'FREE',
    "plannedCableId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_port_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_port_deviceId_portNorm_key" ON "device_port"("deviceId", "portNorm");
CREATE INDEX "device_port_deviceId_status_idx" ON "device_port"("deviceId", "status");
ALTER TABLE "device_port" ADD CONSTRAINT "device_port_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device_inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
