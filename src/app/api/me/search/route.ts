import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { globalSearch } from "@/lib/search/global-search";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().trim().min(1).max(120),
  projectId: z.string().max(64).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? "",
    projectId: req.nextUrl.searchParams.get("projectId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ hits: [] });
  const hits = await globalSearch(user, parsed.data.q, { projectId: parsed.data.projectId });
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
