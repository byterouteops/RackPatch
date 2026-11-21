import Link from "next/link";
import { Camera, Lock } from "lucide-react";
import { getProjectAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { ProjectPageHeader } from "@/components/project-page-header";
import { Badge, Button, Card, EmptyState, StatCard } from "@/components/ui";

/** Project evidence library — real FieldPhoto records only (no invented counts). */
export default async function EvidenceLibraryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  const access = await getProjectAccess(user, projectId);
  if (!access) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="You do not have access to this project."
      />
    );
  }

  const photos = await prisma.fieldPhoto.findMany({
    where: { projectId },
    orderBy: { capturedAt: "desc" },
    take: 100,
    select: {
      id: true,
      note: true,
      source: true,
      capturedAt: true,
      mimeType: true,
      byteSize: true,
      plannedLinkId: true,
      plannedLink: { select: { cableId: true, id: true } },
    },
  });

  const linked = photos.filter((p) => p.plannedLinkId).length;

  return (
    <div>
      <ProjectPageHeader
        projectId={projectId}
        projectName={access.project.name}
        section="Photos"
        title="Evidence library"
        description="Field photos stored for this project. Upload from a cable detail page or sync offline queue."
        actions={
          <Button href={`/app/projects/${projectId}/scan`} variant="secondary" size="sm">
            Open scanner
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Photos"
          value={photos.length}
          icon={<Camera className="h-5 w-5" aria-hidden />}
          tone="info"
        />
        <StatCard label="Linked to cables" value={linked} tone="success" />
        <StatCard
          label="Offline sync source"
          value={photos.filter((p) => p.source === "offline_sync").length}
          tone="neutral"
        />
      </div>

      <Card title="Photo gallery" description="Newest first (max 100 shown).">
        {photos.length === 0 ? (
          <EmptyState
            icon={<Camera className="h-5 w-5" aria-hidden />}
            title="No photos yet"
            description="Open a cable and use Photo evidence, or sync the offline field queue after capturing offline."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/field-photos/${p.id}`}
                  alt={p.note || "Field photo"}
                  className="aspect-video w-full object-cover bg-[var(--muted)]"
                />
                <div className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="info">{p.source}</Badge>
                    {p.plannedLink ? (
                      <Link
                        href={`/app/projects/${projectId}/cables/${p.plannedLink.id}`}
                        className="rp-mono font-semibold text-[var(--accent)] hover:underline"
                      >
                        {p.plannedLink.cableId}
                      </Link>
                    ) : (
                      <span className="text-[var(--muted-fg)]">Unlinked</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-fg)]">
                    {p.capturedAt.toLocaleString()} · {Math.round(p.byteSize / 1024)} KB
                  </p>
                  {p.note && <p className="text-xs">{p.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
