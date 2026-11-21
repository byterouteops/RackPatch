import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** Serve a field photo to project members only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const photo = await prisma.fieldPhoto.findUnique({ where: { id: photoId } });
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await getProjectAccess(user, photo.projectId);
  if (!access) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  return new NextResponse(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.byteSize),
      "Cache-Control": "private, max-age=3600",
      ETag: `"${photo.sha256}"`,
    },
  });
}
