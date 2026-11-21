import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { requireWorkspaceOwner } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { inviteTeammate } from "@/app/actions/workspace";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

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
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="Workspace owners only."
      />
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { projects: { orderBy: { name: "asc" } } },
  });
  if (!workspace) notFound();

  return (
    <div>
      <PageHeader
        title={`Team · ${workspace.name}`}
        description="Invite technicians or leads to a project."
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
          <Button href={`/app/workspaces/${workspaceId}/sites`} variant="secondary" size="sm">
            Sites
          </Button>
        }
      />

      <Card
        title="Send invitation"
        description="Invitees receive access to the selected project only."
        className="max-w-2xl"
      >
        <form
          action={async (fd) => {
            "use server";
            const result = await inviteTeammate({
              workspaceId,
              email: String(fd.get("email")),
              role: fd.get("role") as ProjectRole,
              projectId: String(fd.get("projectId")),
              contractor: fd.get("contractor") === "on",
            });
            if (process.env.NODE_ENV !== "production") {
              console.info("[invite] token for", result.email, result.token);
            }
          }}
          className="grid gap-3"
        >
          <Input name="email" type="email" required placeholder="colleague@company.com" />
          <Select name="projectId" required defaultValue={workspace.projects[0]?.id}>
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="role" defaultValue="TECHNICIAN">
            <option value="TECHNICIAN">Technician</option>
            <option value="LEAD">Lead</option>
          </Select>
          <label className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/50 p-3 text-sm">
            <input type="checkbox" name="contractor" className="mt-1 accent-[var(--accent)]" />
            <span>
              External contractor (Technician only). Can install, verify and QC-acknowledge findings;
              cannot resolve exceptions, import, export or manage the project.
            </span>
          </label>
          <Button type="submit">Create invite</Button>
          <p className="text-xs text-[var(--muted-fg)]">
            Share the invite link: <code>/invite/[token]</code> (token is logged server-side in dev).
          </p>
        </form>
      </Card>
    </div>
  );
}