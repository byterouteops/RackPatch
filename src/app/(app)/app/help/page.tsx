import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import { requireSessionUser } from "@/lib/session";
import { WORKFLOW_STEPS } from "@/lib/navigation";
import { Badge, Button, Card, PageHeader } from "@/components/ui";

/** In-app destinations that exist as routes. */
const APP_LINKS = [
  {
    href: "/about",
    label: "About RackPatch",
    description: "Version, license, creator and a summary of the bundled source documents.",
  },
  {
    href: "/demo",
    label: "Interactive demo",
    description: "Read-only walkthrough of the seeded swapped-pair scenario (synthetic data).",
  },
  {
    href: "/app/settings",
    label: "Settings",
    description: "Your workspaces, deployment details and service endpoints.",
  },
];

/**
 * Markdown documents shipped in the repository. They are not served by the app,
 * so they are listed as repo paths rather than links.
 */
const REPO_DOCS: Array<{ file: string; description: string }> = [
  { file: "README.md", description: "Setup, fixtures and Railway notes." },
  { file: "FIRST_PROJECT_QUICKSTART.md", description: "Create and run your first project." },
  { file: "DEMO_WALKTHROUGH.md", description: "Step-by-step demo script." },
  { file: "CUSTOMER_ONBOARDING_GUIDE.md", description: "Onboarding a customer team." },
  { file: "CABLE_ASSET_MANAGEMENT_GUIDE.md", description: "Cable asset and lifecycle workflows." },
  { file: "FAQ.md", description: "Frequently asked questions." },
  { file: "DOCKER_DEPLOYMENT_GUIDE.md", description: "Self-hosting with Docker." },
  { file: "BACKUP_RESTORE_GUIDE.md", description: "Backup and restore procedures." },
  { file: "UPGRADE_ROLLBACK_GUIDE.md", description: "Upgrading and rolling back." },
  { file: "docs/RESEND_SETUP.md", description: "Email delivery with Resend." },
  { file: "SECURITY.md", description: "Private vulnerability reporting." },
  { file: "CONTRIBUTING.md", description: "How to contribute." },
  { file: "CHANGELOG.md", description: "Release history." },
];

export default async function HelpPage() {
  await requireSessionUser();

  return (
    <div>
      <PageHeader
        title="Help & docs"
        description="Where to find guides, the demo, and operational endpoints for this RackPatch instance."
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

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Card
            title="Core workflow"
            description="Open a project from the dashboard to use these stages."
          >
            <ol className="grid gap-3 sm:grid-cols-2">
              {WORKFLOW_STEPS.map((step, i) => (
                <li
                  key={step.label}
                  className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold">{step.label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-[var(--muted-fg)]">
              <Link href="/app" className="font-semibold text-[var(--accent)] hover:underline">
                Go to the dashboard
              </Link>{" "}
              to open a project.
            </p>
          </Card>

          <Card
            title="Repository documentation"
            description="Markdown guides shipped with the source. Read them in the repository or your checkout."
            flush
          >
            <ul className="divide-y divide-[var(--border)]">
              {REPO_DOCS.map((d) => (
                <li key={d.file} className="flex items-start gap-3 px-5 py-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-fg)]" aria-hidden />
                  <div className="min-w-0">
                    <code className="rp-mono text-sm font-semibold">{d.file}</code>
                    <p className="text-xs text-[var(--muted-fg)]">{d.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card title="In-app pages" flush>
            <ul className="divide-y divide-[var(--border)]">
              {APP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="rp-focus flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--accent-soft)]"
                  >
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                    <div>
                      <p className="text-sm font-semibold text-[var(--accent)]">{l.label}</p>
                      <p className="text-xs text-[var(--muted-fg)]">{l.description}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Operational endpoints">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-2">
                <code className="rp-mono">/api/health</code>
                <Badge tone="info">GET · JSON</Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="rp-mono">/api/ready</code>
                <Badge tone="info">GET · JSON</Badge>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
