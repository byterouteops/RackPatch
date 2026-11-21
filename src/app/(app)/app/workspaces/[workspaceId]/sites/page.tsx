import Link from "next/link";
import { Lock, MapPin } from "lucide-react";
import { requireWorkspaceOwner } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createSite } from "@/app/actions/workspace";
import { Button, Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";

export default async function WorkspaceSitesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  try {
    await requireWorkspaceOwner(user, workspaceId);
  } catch {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="Workspace owners only."
      />
    );
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const sites = await prisma.site.findMany({
    where: { workspaceId },
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Sites"
        description={`${workspace.name} — physical locations for projects.`}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/app" className="hover:text-[var(--accent)] hover:underline">
              Workspaces
            </Link>
            <span aria-hidden>›</span>
            <span className="font-medium text-[var(--foreground)]">{workspace.name}</span>
          </nav>
        }
        actions={
          <Button href={`/app/workspaces/${workspaceId}/team`} variant="secondary" size="sm">
            Team
          </Button>
        }
      />

      <Card title="Add site" description="Sites are also created automatically when you create a project." className="mb-6">
        <form
          action={async (fd) => {
            "use server";
            await createSite({
              workspaceId,
              name: String(fd.get("name") || ""),
            });
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input name="name" required placeholder="Site / location name" className="flex-1" />
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
      </Card>

      <Card title="Sites in this workspace" flush>
        {sites.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<MapPin className="h-5 w-5" aria-hidden />}
              title="No sites yet"
              description="Create a site, or create a project with a location — sites are created automatically."
            />
          </div>
        ) : (
          <table className="rp-table rp-table-auto">
            <thead>
              <tr>
                <th>Site</th>
                <th>Projects</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>
                    <Badge tone={s._count.projects > 0 ? "info" : "neutral"}>
                      {s._count.projects} project{s._count.projects === 1 ? "" : "s"}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <Link
                      href="/app"
                      className="rp-focus text-sm font-semibold text-[var(--accent)] hover:underline"
                    >
                      View projects
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
