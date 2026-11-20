import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertProductionSafety } from "@/lib/env";

/** Readiness: dependencies available. Do not leak internal error details. */
export async function GET() {
  try {
    assertProductionSafety();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ready: true, service: "rackpatch" });
  } catch {
    return NextResponse.json({ ok: false, ready: false }, { status: 503 });
  }
}
