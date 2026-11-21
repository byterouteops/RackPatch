import { NextResponse } from "next/server";
import { verifyComplianceSecret } from "@/lib/compliance";
import { runAllCompliance } from "@/lib/compliance-run";

export const dynamic = "force-dynamic";

/**
 * Cron-safe compliance check (Phase 11 CE).
 * POST with header `x-compliance-secret: $COMPLIANCE_CRON_SECRET`.
 * Optional JSON body: { "projectId": "..." } to limit to one project.
 */
export async function POST(request: Request) {
  const expected = process.env.COMPLIANCE_CRON_SECRET;
  if (!expected?.trim()) {
    return NextResponse.json({ error: "Compliance cron is not configured" }, { status: 503 });
  }
  if (!verifyComplianceSecret(request.headers.get("x-compliance-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let projectId: string | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { projectId?: unknown };
      if (typeof body.projectId === "string" && body.projectId) projectId = body.projectId;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const results = await runAllCompliance({ projectId });
  return NextResponse.json({
    ok: true,
    checked: results.length,
    results: results.map((r) => ({
      projectId: r.projectId,
      runId: r.runId,
      status: r.status,
      notified: r.notified,
    })),
  });
}
