import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertProductionSafety } from "@/lib/env";

/**
 * Liveness-oriented check used by orchestrators.
 * Prefer `/api/ready` for dependency readiness (DB).
 */
export async function GET() {
  try {
    assertProductionSafety();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "rackpatch" });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
