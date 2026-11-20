import { notFound } from "next/navigation";
import { ProjectRole } from "@prisma/client";
import { requireWorkspaceOwner } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { inviteTeammate } from "@/app/actions/workspace";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();

  try {
    await requireWorkspaceOwner(user, workspaceId);
  } catch {
    return <EmptyState title="Permission denied" description="Workspace owners only." />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { projects: { orderBy: { name: "asc" } } },
  });
  if (!workspace) notFound();

  return (
    <div>
      <PageHeader title={`Team · ${workspace.name}`} description="Invite technicians or leads to a project." />

      <Card title="Send invitation">
        <form
          action={async (fd) => {
            "use server";
            const result = await inviteTeammate({
              workspaceId,
              email: String(fd.get("email")),
              role: fd.get("role") as ProjectRole,
              projectId: String(fd.get("projectId")),
            });
            if (process.env.NODE_ENV !== "production") {
              console.info("[invite] token for", result.email, result.token);
            }
          }}
          className="grid max-w-lg gap-3"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm"
          />
          <select
            name="projectId"
            required
            className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm"
            defaultValue={workspace.projects[0]?.id}
          >
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="role" className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm" defaultValue="TECHNICIAN">
            <option value="TECHNICIAN">Technician</option>
            <option value="LEAD">Lead</option>
          </select>
          <Button type="submit">Create invite</Button>
          <p className="text-xs text-[var(--muted-fg)]">
            Share the invite link: <code>/invite/[token]</code> (token is logged server-side in dev).
          </p>
        </form>
      </Card>
    </div>
  );
}