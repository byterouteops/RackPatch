import { format } from "date-fns";
import { FolderKanban, Inbox, Lock } from "lucide-react";
import { listVisibleProjects, requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { activateProjectCommercial } from "@/app/actions/pilot";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";

export default async function AdminPage() {
  const user = await requireSessionUser();
  try {
    await requirePlatformAdmin(user);
  } catch {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Permission denied"
        description="Platform admin only."
      />
    );
  }

  const [pilots, projects] = await Promise.all([
    prisma.pilotRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    listVisibleProjects(user),
  ]);

  const allProjects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { workspace: true },
  });

  return (
    <div>
      <PageHeader
        title="Platform admin"
        description={`Signed in as ${user.email}`}
        breadcrumb="Administration"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pilot requests"
          value={pilots.length}
          icon={<Inbox className="h-5 w-5" aria-hidden />}
          tone="info"
        />
        <StatCard
          label="Projects (latest 100)"
          value={allProjects.length}
          icon={<FolderKanban className="h-5 w-5" aria-hidden />}
          tone="info"
        />
        <StatCard label="Visible to you" value={projects.length} tone="neutral" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          title="Pilot requests"
          description="Latest 50 submissions."
          className="xl:col-span-3"
          flush
        >
          {pilots.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-fg)]">No requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Project size</th>
                    <th>Status</th>
                    <th className="text-right">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {pilots.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.company}</td>
                      <td>
                        <p>{p.name}</p>
                        <p className="text-xs text-[var(--muted-fg)]">{p.businessEmail}</p>
                      </td>
                      <td className="text-[var(--muted-fg)]">{p.projectSize}</td>
                      <td>
                        <Badge tone="neutral">{p.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-right text-xs text-[var(--muted-fg)]">
                        {format(p.createdAt, "PP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Activate project (pilot / paid)"
          description="Records a commercial activation for the selected project."
          className="xl:col-span-2"
        >
          <form
            action={async (fd) => {
              "use server";
              await activateProjectCommercial({
                projectId: String(fd.get("projectId")),
                status: fd.get("status") as "PILOT" | "PAID",
                note: String(fd.get("note") || "") || undefined,
              });
            }}
            className="grid gap-3"
          >
            <Select name="projectId" aria-label="Project">
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.workspace.name}) — {p.commercialStatus}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue="PILOT" aria-label="Activation status">
              <option value="PILOT">PILOT</option>
              <option value="PAID">PAID</option>
            </Select>
            <Input name="note" placeholder="Activation note" aria-label="Activation note" />
            <Button type="submit">Record activation</Button>
          </form>
          {projects.length > 0 && (
            <p className="mt-3 text-xs text-[var(--muted-fg)]">
              You also have access to {projects.length} visible project(s) as a user.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
