import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, FolderKanban, MapPin, Plus, Search } from "lucide-react";
import { listVisibleProjects } from "@/lib/authz";
import { loadProjectDashStats, projectPhase, PHASE_LABEL, type ProjectPhase } from "@/lib/dashboard-stats";
import { requireSessionUser } from "@/lib/session";
import { Button, EmptyState, ProgressRing } from "@/components/ui";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: "all" | ProjectPhase; label: string }> = [
  { id: "all", label: "All Projects" },
  { id: "in-progress", label: "In Progress" },
  { id: "verifying", label: "Verifying" },
  { id: "completed", label: "Completed" },
  { id: "no-plan", label: "No plan" },
];

const PHASE_TONE: Record<ProjectPhase, string> = {
  "no-plan": "bg-slate-100 text-slate-600",
  "in-progress": "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
  verifying: "bg-violet-50 text-violet-700",
  completed: "bg-[var(--success-soft)] text-[var(--success-ink)]",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireSessionUser();
  const { status = "all", q = "" } = await searchParams;
  const projects = await listVisibleProjects(user);
  const stats = await loadProjectDashStats(
    projects.map((p) => ({ id: p.id, name: p.name, site: p.site, activeRevisionId: p.activeRevisionId })),
  );
  const meta = new Map(projects.map((p) => [p.id, p]));

  const rows = stats.map((s) => ({ ...s, phase: projectPhase(s), customer: meta.get(s.id)?.customerName ?? null }));
  const counts = rows.reduce<Record<string, number>>(
    (acc, r) => {
      acc.all += 1;
      acc[r.phase] = (acc[r.phase] ?? 0) + 1;
      return acc;
    },
    { all: 0 },
  );
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (status === "all" || r.phase === status) &&
      (!needle ||
        r.name.toLowerCase().includes(needle) ||
        r.site.toLowerCase().includes(needle) ||
        (r.customer ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <FolderKanban className="mt-1 h-7 w-7 text-[var(--foreground)]" aria-hidden />
          <div>
            <h1 className="rp-display text-[28px] font-extrabold leading-tight tracking-tight">Projects</h1>
            <p className="text-sm text-[var(--muted-fg)]">
              Plan, track and manage cabling projects across sites and racks.
            </p>
          </div>
        </div>
        <Button href="/app#create">
          <Plus className="h-4 w-4" aria-hidden />
          Create Project
        </Button>
      </div>

      <div className="rp-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] px-3">
          {FILTERS.map((f) => {
            const active = status === f.id;
            const params = new URLSearchParams();
            if (f.id !== "all") params.set("status", f.id);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link
                key={f.id}
                href={`/app/projects${qs ? `?${qs}` : ""}`}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold",
                  active
                    ? "border-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    active ? "bg-[var(--accent)] text-white" : "bg-[var(--muted)] text-[var(--muted-fg)]",
                  )}
                >
                  {counts[f.id] ?? 0}
                </span>
              </Link>
            );
          })}
        </div>

        <form className="flex gap-2 border-b border-[var(--border)] p-3" action="/app/projects">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <label className="relative flex-1">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-fg)]" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search projects (name, site, customer)…"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={rows.length === 0 ? "No projects yet" : "No projects match"}
              description={rows.length === 0 ? "Create a workspace and project to get started." : "Try another filter or search."}
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/projects/${p.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 hover:bg-[var(--accent-soft)]/50 md:grid-cols-[minmax(0,1fr)_90px_70px_70px_110px_120px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar)] text-[var(--cyan)]">
                      <Building2 className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="rp-display truncate text-[15px] font-bold text-[var(--foreground)]">{p.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--muted-fg)]">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        {p.site}
                      </p>
                      {p.customer && (
                        <p className="truncate text-xs text-[var(--muted-fg)]">{p.customer}</p>
                      )}
                    </div>
                  </div>
                  <div className="hidden text-center md:block">
                    <p className="text-[11px] font-medium text-[var(--muted-fg)]">Cables</p>
                    <p className="rp-display text-lg font-extrabold">{p.cables.toLocaleString("en-US")}</p>
                  </div>
                  <div className="hidden flex-col items-center md:flex">
                    <p className="mb-1 text-[11px] font-medium text-[var(--muted-fg)]">Install</p>
                    <ProgressRing value={p.installed} max={p.cables} tone="success" />
                  </div>
                  <div className="hidden flex-col items-center md:flex">
                    <p className="mb-1 text-[11px] font-medium text-[var(--muted-fg)]">Verify</p>
                    <ProgressRing value={p.verified} max={p.cables} tone="info" />
                  </div>
                  <div className="hidden text-center md:block">
                    <p className="mb-1 text-[11px] font-medium text-[var(--muted-fg)]">Exceptions</p>
                    {p.exceptions > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--warning-soft)] px-2 py-1 text-sm font-bold text-[var(--warning-ink)]">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {p.exceptions}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--success-soft)] px-2 py-1 text-sm font-bold text-[var(--success-ink)]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />0
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", PHASE_TONE[p.phase])}>
                      {PHASE_LABEL[p.phase]}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
          Showing {visible.length} of {rows.length} projects
        </div>
      </div>
    </div>
  );
}
