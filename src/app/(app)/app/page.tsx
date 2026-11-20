import Link from "next/link";
import { listVisibleProjects } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { createProject, createWorkspace } from "@/app/actions/workspace";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

export default async function AppHomePage() {
  const user = await requireSessionUser();
  const [workspaces, projects] = await Promise.all([
    prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      include: { workspace: { include: { _count: { select: { projects: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    listVisibleProjects(user),
  ]);

  return (
    <div>
      <PageHeader title="Projects" description="Workspaces you belong to and rack projects." />

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="New workspace" description="Owners can create workspaces and projects.">
          <form
            action={async (fd) => {
              "use server";
              await createWorkspace({ name: String(fd.get("name") || "") });
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input name="name" required placeholder="Workspace name" className="flex-1" />
            <Button type="submit" variant="secondary">
              Create
            </Button>
          </form>
        </Card>

        {workspaces.length > 0 && (
          <Card title="New project" description="Requires workspace owner role.">
            <form
              action={async (fd) => {
                "use server";
                await createProject({
                  workspaceId: String(fd.get("workspaceId")),
                  name: String(fd.get("name") || ""),
                  site: String(fd.get("site") || ""),
                  timeZone: "UTC",
                  customerName: String(fd.get("customerName") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <Select
                name="workspaceId"
                required
                defaultValue={workspaces[0]?.workspaceId}
              >
                {workspaces.map((m) => (
                  <option key={m.workspaceId} value={m.workspaceId}>
                    {m.workspace.name}
                  </option>
                ))}
              </Select>
              <Input name="name" required placeholder="Project name" />
              <Input name="site" required placeholder="Site / location" />
              <Input name="customerName" placeholder="Customer (optional)" />
              <Button type="submit">Create project</Button>
            </form>
          </Card>
        )}
      </div>

      <Card title="Your projects" className="mb-8">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a workspace and project to import a cable plan."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link
                    href={`/app/projects/${p.id}`}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="text-sm text-[var(--muted-fg)]">
                    {p.site}
                    {p.customerName ? ` · ${p.customerName}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.commercialStatus === "NONE" ? "warning" : "success"}>
                    {p.isDemo ? "Demo" : p.commercialStatus}
                  </Badge>
                  <Button href={`/app/projects/${p.id}`} variant="secondary" size="sm">
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {workspaces.length > 0 && (
        <Card title="Workspaces">
          <ul className="space-y-3">
            {workspaces.map((m) => (
              <li key={m.workspaceId} className="flex items-center justify-between text-sm">
                <span className="font-medium">{m.workspace.name}</span>
                <Button
                  href={`/app/workspaces/${m.workspaceId}/team`}
                  variant="ghost"
                  size="sm"
                >
                  Team · {m.workspace._count.projects} projects
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}