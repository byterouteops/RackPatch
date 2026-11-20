import { format } from "date-fns";
import { listVisibleProjects, requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/session";
import { activateProjectCommercial } from "@/app/actions/pilot";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function AdminPage() {
  const user = await requireSessionUser();
  try {
    await requirePlatformAdmin(user);
  } catch {
    return <EmptyState title="Permission denied" description="Platform admin only." />;
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
      <PageHeader title="Platform admin" description={`Signed in as ${user.email}`} />

      <Card title="Pilot requests" className="mb-8">
        {pilots.length === 0 ? (
          <p className="text-sm text-[var(--muted-fg)]">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {pilots.map((p) => (
              <li key={p.id} className="py-3">
                <p className="font-medium">
                  {p.company} — {p.name}
                </p>
                <p className="text-[var(--muted-fg)]">
                  {p.businessEmail} · {p.projectSize} · {format(p.createdAt, "PP")} · {p.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Activate project (pilot / paid)">
        <form
          action={async (fd) => {
            "use server";
            await activateProjectCommercial({
              projectId: String(fd.get("projectId")),
              status: fd.get("status") as "PILOT" | "PAID",
              note: String(fd.get("note") || "") || undefined,
            });
          }}
          className="grid max-w-lg gap-3"
        >
          <select name="projectId" className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm">
            {allProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.workspace.name}) — {p.commercialStatus}
              </option>
            ))}
          </select>
          <select name="status" className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm" defaultValue="PILOT">
            <option value="PILOT">PILOT</option>
            <option value="PAID">PAID</option>
          </select>
          <input
            name="note"
            placeholder="Activation note"
            className="h-11 rounded-lg border border-[var(--border)] px-3 text-sm"
          />
          <Button type="submit">Record activation</Button>
        </form>
        {projects.length > 0 && (
          <p className="mt-3 text-xs text-[var(--muted-fg)]">
            You also have access to {projects.length} visible project(s) as a user.
          </p>
        )}
      </Card>
    </div>
  );
}