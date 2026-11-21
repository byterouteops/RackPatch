import Link from "next/link";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileText,
  Flame,
  HelpCircle,
  LifeBuoy,
  ListOrdered,
  PlayCircle,
  Rocket,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";
import { requireSessionUser } from "@/lib/session";
import { Panel } from "@/components/charts";
import { Button, PageHeader, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type Article = { id: string; title: string; topic: string; steps: string[]; link?: { href: string; label: string } };

const ARTICLES: Article[] = [
  {
    id: "first-project",
    title: "Create your first cable project",
    topic: "Get started",
    steps: ["Open Projects and choose New project.", "Set the site and customer.", "Import a cable plan CSV on Import / Export and publish it as revision 1."],
    link: { href: "/app/projects", label: "Open projects" },
  },
  {
    id: "import-plan",
    title: "Import a cable plan (CSV)",
    topic: "Plan",
    steps: ["Columns: cable_id, a_rack, a_device, a_port, z_rack, z_device, z_port, cable_type.", "Preview shows row errors and duplicates before publish.", "Publishing creates a new immutable revision; findings are recomputed."],
  },
  {
    id: "install",
    title: "Track installation in the field",
    topic: "Install",
    steps: ["Create work orders and assign technicians.", "Technicians mark cables Installed or Blocked (with a reason) from the cable record or QR scan.", "Field photos can be captured online or queued offline."],
  },
  {
    id: "lldp",
    title: "Verify cabling with LLDP / CDP",
    topic: "Verify",
    steps: ["Paste `show lldp neighbors detail` output on LLDP / CDP, or run allowlisted SSH collection.", "RackPatch compares observed neighbors with the plan and flags mismatches and swaps.", "Fix in the field, re-import evidence, and the finding clears automatically."],
  },
  {
    id: "exceptions",
    title: "Resolve exceptions and swaps",
    topic: "Verify",
    steps: ["Exceptions lists open mismatch and needs-review findings by severity.", "Acknowledge with a note while work is pending; acknowledging does not hide the problem.", "Swap playbooks give the exact port moves for crossed pairs."],
  },
  {
    id: "physical",
    title: "Independent physical verification",
    topic: "Verify",
    steps: ["Open a cable record and confirm both A and Z ends on site.", "The verifier must be a different person than the installer.", "Physically verified cables count as verified in handover readiness."],
  },
  {
    id: "handover",
    title: "Generate the handover package",
    topic: "Handover",
    steps: ["Handover shows readiness by area and the acceptance checklist.", "Create a snapshot to freeze the evidence, then export CSV or share a read-only link.", "Unresolved exceptions are flagged in the package."],
  },
  {
    id: "labels",
    title: "Design and print cable labels",
    topic: "Install",
    steps: ["Labels: pick a template or preset, choose fields and QR size.", "Batch print all labels or one rack; prints are logged in the history.", "Scan a label QR to open the cable record on a phone."],
  },
  {
    id: "roles",
    title: "Roles and permissions",
    topic: "Admin",
    steps: ["Owner and Lead manage plans, imports and handover.", "Technicians update install status and upload photos.", "Contractors get technician access plus QC acknowledge, never lead powers."],
  },
];

const REPO_DOCS: Array<{ file: string; description: string; group: string }> = [
  { file: "README.md", description: "Setup, fixtures and Railway notes", group: "Get started" },
  { file: "FIRST_PROJECT_QUICKSTART.md", description: "Create and run your first project", group: "Get started" },
  { file: "DEMO_WALKTHROUGH.md", description: "Step-by-step demo script", group: "Get started" },
  { file: "CUSTOMER_ONBOARDING_GUIDE.md", description: "Onboarding a customer team", group: "User guides" },
  { file: "CABLE_ASSET_MANAGEMENT_GUIDE.md", description: "Cable asset and lifecycle workflows", group: "User guides" },
  { file: "FAQ.md", description: "Frequently asked questions", group: "User guides" },
  { file: "DOCKER_DEPLOYMENT_GUIDE.md", description: "Self-hosting with Docker", group: "Deployment" },
  { file: "BACKUP_RESTORE_GUIDE.md", description: "Backup and restore", group: "Deployment" },
  { file: "UPGRADE_ROLLBACK_GUIDE.md", description: "Upgrading and rolling back", group: "Deployment" },
  { file: "docs/RESEND_SETUP.md", description: "Email delivery with Resend", group: "Deployment" },
  { file: "SECURITY.md", description: "Private vulnerability reporting", group: "Community" },
  { file: "CONTRIBUTING.md", description: "How to contribute", group: "Community" },
  { file: "CHANGELOG.md", description: "Release history", group: "Community" },
];

const STEPS = [
  { label: "Deploy", detail: "Railway or self-host", icon: Server },
  { label: "Create project", detail: "Site and team", icon: Rocket },
  { label: "Plan", detail: "Import cable CSV", icon: ListOrdered },
  { label: "Verify", detail: "LLDP / CDP compare", icon: ShieldCheck },
  { label: "Handover", detail: "Snapshot and evidence", icon: CheckCircle2 },
];

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string; a?: string; topic?: string }> }) {
  await requireSessionUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const topics = Array.from(new Set(ARTICLES.map((a) => a.topic)));
  const articles = ARTICLES.filter((a) => (!sp.topic || a.topic === sp.topic) && (!q || `${a.title} ${a.topic} ${a.steps.join(" ")}`.toLowerCase().includes(q)));
  const docs = REPO_DOCS.filter((d) => !q || `${d.file} ${d.description}`.toLowerCase().includes(q));
  const open = articles.find((a) => a.id === sp.a) ?? articles[0];
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, topic: sp.topic, a: sp.a, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/help${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Help Center, Documentation & Support"
        description="Get started, learn the workflow, troubleshoot, and find operational endpoints for this RackPatch instance."
        breadcrumb="Support"
        actions={
          <>
            <Button href="/demo" variant="secondary" size="sm">
              Open demo
            </Button>
            <Button href="/about" size="sm">
              About
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="In-app Guides" value={ARTICLES.length} icon={<BookOpen aria-hidden />} tone="info" />
        <StatCard label="Repository Docs" value={REPO_DOCS.length} icon={<FileText aria-hidden />} tone="neutral" />
        <StatCard label="Workflow Steps" value={STEPS.length} icon={<ListOrdered aria-hidden />} tone="neutral" />
        <StatCard label="REST Endpoints" value={3} icon={<Code2 aria-hidden />} tone="neutral" />
        <StatCard label="Release" value="v0.2.0" icon={<Rocket aria-hidden />} tone="neutral" />
        <StatCard label="System" value="Online" icon={<Activity aria-hidden />} tone="success" href="/api/ready" />
      </div>

      <div className="mb-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-[#0b1b3a] via-[#123063] to-[#1d4ed8] p-6 text-white shadow-sm">
          <h2 className="rp-display text-2xl font-extrabold">RackPatch Help Center</h2>
          <p className="mt-1 max-w-xl text-sm text-blue-100">Guides and examples to plan, install, verify and hand over your cabling.</p>
          <form action="/app/help" className="mt-5 flex max-w-xl gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search the documentation</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input name="q" defaultValue={sp.q ?? ""} placeholder={'Search guides, e.g. "LLDP", "labels", "handover"'} className="h-10 w-full rounded-md border-0 pl-9 pr-3 text-sm text-slate-900 outline-none" />
            </label>
            <button type="submit" className="h-10 rounded-md bg-white px-4 text-sm font-semibold text-[#1d4ed8] hover:bg-blue-50">
              Search
            </button>
          </form>
          {q && (
            <p className="mt-3 text-xs text-blue-100">
              {articles.length} guide(s) and {docs.length} document(s) match {"\u201c"}
              {sp.q}
              {"\u201d"}.{" "}
              <Link href="/app/help" className="font-semibold underline">
                Clear
              </Link>
            </p>
          )}
        </section>

        <Panel title="Quick Links" icon={Rocket}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { href: "/app/projects", label: "Get started", sub: "Open a project", icon: Rocket },
              { href: "/demo", label: "Feature tour", sub: "Interactive demo", icon: PlayCircle },
              { href: "/app/projects", label: "API reference", sub: "Project \u2192 API", icon: Code2 },
              { href: "/app/settings", label: "Settings", sub: "Deployment info", icon: Server },
              { href: "/about", label: "About", sub: "License and version", icon: HelpCircle },
              { href: "/api/health", label: "Health", sub: "/api/health JSON", icon: Activity },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2.5 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                <l.icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{l.label}</span>
                  <span className="block truncate text-[11px] text-[var(--muted-fg)]">{l.sub}</span>
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <Panel
          title="Guides"
          icon={Flame}
          flush
          action={
            <div className="flex flex-wrap gap-1">
              {["", ...topics].map((t) => (
                <Link
                  key={t || "all"}
                  href={href({ topic: t || undefined, a: undefined })}
                  scroll={false}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", (sp.topic ?? "") === t ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--muted)]")}
                >
                  {t || "All"}
                </Link>
              ))}
            </div>
          }
        >
          {articles.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-fg)]">No guides match.</p>
          ) : (
            <ol className="divide-y divide-[var(--border)]">
              {articles.map((a, i) => (
                <li key={a.id}>
                  <Link href={href({ a: a.id })} scroll={false} className={cn("flex items-center gap-3 px-4 py-2.5 text-[13px]", open?.id === a.id ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-[var(--muted)]/60")}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]">{i + 1}</span>
                    <span className="flex-1 font-medium">{a.title}</span>
                    <ChevronRight className="h-4 w-4 text-[var(--muted-fg)]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={open ? open.title : "Guide"} icon={BookOpen}>
          {open ? (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-fg)]">{open.topic}</p>
              <ol className="space-y-3">
                {open.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[13px]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              {open.link && (
                <div className="mt-4">
                  <Button href={open.link.href} size="sm">
                    {open.link.label}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--muted-fg)]">Pick a guide.</p>
          )}
        </Panel>

        <Panel title="Community & Support" icon={LifeBuoy}>
          <ul className="space-y-2.5 text-[13px]">
            <li>
              <span className="font-semibold">Report a security issue</span>
              <span className="block text-xs text-[var(--muted-fg)]">Follow SECURITY.md for private reporting.</span>
            </li>
            <li>
              <span className="font-semibold">Contribute or request a feature</span>
              <span className="block text-xs text-[var(--muted-fg)]">See CONTRIBUTING.md in the repository.</span>
            </li>
            <li>
              <span className="font-semibold">Your administrator</span>
              <span className="block text-xs text-[var(--muted-fg)]">Workspace owners manage access on Users &amp; Roles.</span>
            </li>
          </ul>
        </Panel>
      </div>

      <Panel title={"Get Started \u2014 Step by Step"} icon={ListOrdered} className="mb-4">
        <ol className="grid gap-3 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex flex-col items-center rounded-lg border border-[var(--border)] p-3 text-center">
              <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{i + 1}</span>
              <s.icon className="mb-1 h-5 w-5 text-[var(--accent)]" aria-hidden />
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="text-[11px] text-[var(--muted-fg)]">{s.detail}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Documentation Library (repository)" icon={FileText}>
          <p className="mb-3 text-xs text-[var(--muted-fg)]">Markdown guides shipped with the source. Read them in the repository or your checkout; they are not served by the app.</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {docs.map((d) => (
              <div key={d.file} className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <span className="min-w-0">
                  <code className="rp-mono text-xs font-semibold">{d.file}</code>
                  <span className="block text-[11px] text-[var(--muted-fg)]">
                    {d.group} {"\u00b7"} {d.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="System & Resources" icon={Activity}>
          <ul className="space-y-2.5 text-[13px]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden />
              System status: <span className="font-semibold text-[var(--success)]">Online</span>
            </li>
            {[
              ["/api/health", "Liveness (JSON)"],
              ["/api/ready", "Readiness incl. database (JSON)"],
              ["/demo", "Read-only demo walkthrough"],
            ].map(([p, d]) => (
              <li key={p} className="flex items-center justify-between gap-2">
                <Link href={p} className="rp-mono text-xs font-semibold text-[var(--accent)] hover:underline">
                  {p}
                </Link>
                <span className="text-xs text-[var(--muted-fg)]">{d}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
