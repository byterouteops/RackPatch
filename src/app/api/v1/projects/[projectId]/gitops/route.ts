import { NextResponse } from "next/server";
import { authenticateProjectRead } from "@/lib/api-auth";
import { buildActivePlanGitOps } from "@/lib/gitops-export";

export const dynamic = "force-dynamic";

/**
 * Read-only GitOps export of the active plan (Phase 19 CE).
 * `?format=yaml|json` (default yaml). Session or Bearer API token. Export only: no write-back.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authenticateProjectRead(request, projectId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "yaml";
  try {
    const out = await buildActivePlanGitOps(projectId, format);
    return new NextResponse(out.text, {
      status: 200,
      headers: {
        "Content-Type": `${out.contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: msg === "No active plan revision" ? 404 : 500 });
  }
}
