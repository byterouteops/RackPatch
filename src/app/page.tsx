import Link from "next/link";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Layers,
  Network,
  Play,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { RackIllustration } from "@/components/landing/rack-illustration";
import { PilotRequestForm } from "@/components/pilot-request-form";
import { getLandingStats } from "@/lib/landing-stats";

export const dynamic = "force-dynamic";

const REPO_URL = "https://github.com/byterouteops/RackPatch";

const steps = [
  { title: "Plan", body: "Import & manage cabling plans", icon: Layers },
  { title: "Install", body: "Track as-built connections", icon: Wrench },
  { title: "Discover", body: "Collect LLDP/CDP from multi-vendor", icon: Network },
  { title: "Verify", body: "Detect mismatches and resolve", icon: ShieldCheck },
  { title: "Handover", body: "Generate reports and evidence", icon: ClipboardList },
];

const features = [
  { title: "Cable planning", body: "Import CSV cable plans, publish revisions, and track A/Z endpoints." },
  { title: "Installation tracking", body: "Technicians mark Planned, Installed, or Blocked on the floor." },
  { title: "Physical verification", body: "Independent verifier confirms both ends — not the installer." },
  { title: "Mismatch detection", body: "Compare LLDP/CDP neighbor evidence (Cisco, Arista, Juniper) to the approved plan." },
  { title: "Exceptions", body: "Keep expected vs observed ports visible until evidence changes." },
  { title: "Project handover", body: "Snapshot status, export CSV, and print an evidence-backed report." },
];

const nav = [
  { label: "Workflow", href: "#workflow" },
  { label: "Features", href: "#features" },
  { label: "Pilot", href: "#pilot" },
  { label: "Demo", href: "/demo" },
];

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const fmt = new Intl.NumberFormat("en-US");

export default async function Home() {
  const stats = await getLandingStats();
  const installedPct = stats ? Math.round((stats.installed / stats.planned) * 100) : 0;

  return (
    <div className="relative min-h-screen bg-[#04111d] text-slate-300">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(46,230,214,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(0,118,213,0.14),transparent_50%)]"
        aria-hidden
      />

      <header className="relative border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-white">
            <BrandMark size={30} />
            RackPatch
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            {nav.map((n) => (
              <Link key={n.label} href={n.href} className="transition-colors hover:text-white">
                {n.label}
              </Link>
            ))}
            <a href={REPO_URL} className="transition-colors hover:text-white" target="_blank" rel="noreferrer">
              Open Source
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              href="/sign-in"
              className="rounded-lg border border-[#2ee6d6]/60 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2ee6d6]/10"
            >
              Sign in
            </Link>
            <Link
              href="/sign-in"
              className="hidden rounded-lg bg-[#2ee6d6] px-4 py-2 text-sm font-semibold text-[#03202a] transition-colors hover:bg-[#5ff0e3] sm:inline-block"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#2ee6d6]/40 bg-[#2ee6d6]/5 px-3 py-1 text-xs font-medium text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2ee6d6]" aria-hidden />
              Open Source
              <span className="text-slate-500" aria-hidden>|</span>
              Apache 2.0
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight !text-white sm:text-5xl lg:text-6xl">
              Every connection.
              <span className="block text-[#2ee6d6]">Verified.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              Plan, install, discover (LLDP/CDP), verify and hand over data center cabling with confidence.
            </p>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Know which cables are right before you hand over the rack.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2ee6d6] px-6 py-3 text-sm font-semibold text-[#03202a] shadow-[0_0_24px_rgba(46,230,214,0.35)] transition-colors hover:bg-[#5ff0e3]"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden />
                Explore Live Demo
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2.5 rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#2ee6d6]/70 hover:bg-white/5"
              >
                <GitHubMark className="h-4 w-4" />
                <span className="text-left leading-tight">
                  Deploy Free
                  <span className="block text-[11px] font-normal text-slate-400">(Open Source)</span>
                </span>
              </a>
            </div>
          </div>
          <RackIllustration className="mx-auto w-full max-w-[540px]" />
        </section>

        {stats && (
          <section aria-labelledby="stats-heading" className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="stats-heading" className="sr-only">
              Demo project status
            </h2>
            <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#2ee6d6]/10 text-[#2ee6d6]">
                  <Cable className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="rp-mono text-2xl font-semibold text-white">{fmt.format(stats.planned)}</p>
                  <p className="text-xs text-slate-400">Planned cables</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-400/10 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="rp-mono text-2xl font-semibold text-white">{fmt.format(stats.installed)}</p>
                  <p className="text-xs text-slate-400">Installed ({installedPct}% of plan)</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-orange-400/10 text-orange-400">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="rp-mono text-2xl font-semibold text-white">{fmt.format(stats.mismatches)}</p>
                  <p className="text-xs text-orange-300">Mismatches</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-500">
              Live counts from the synthetic demo project “{stats.projectName}” — not customer data.
            </p>
          </section>
        )}

        <section id="workflow" aria-labelledby="workflow-heading" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-14 sm:px-6">
          <h2 id="workflow-heading" className="sr-only">
            Workflow
          </h2>
          <ol className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-1 flex-col items-center gap-3 lg:flex-row">
                <div className="w-full flex-1 rounded-xl border border-[#2ee6d6]/30 bg-[#0a1f2e]/80 p-5 text-center shadow-[inset_0_0_24px_rgba(46,230,214,0.05)]">
                  <s.icon className="mx-auto h-7 w-7 text-[#2ee6d6]" aria-hidden />
                  <p className="mt-3 text-base font-semibold text-white">{s.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.body}</p>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-5 w-5 shrink-0 rotate-90 text-slate-500 lg:rotate-0" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        </section>

        <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-14 sm:px-6">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight !text-white">
            What you can do today
          </h2>
          <p className="mt-1 text-sm text-slate-400">Implemented Community Edition capabilities only.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2ee6d6]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="pilot" aria-labelledby="pilot-heading" className="mx-auto grid max-w-6xl scroll-mt-6 gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="rounded-xl border border-[#2ee6d6]/30 bg-[#0a1f2e]/80 p-6 sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2ee6d6]">Optional assisted pilot</p>
            <h2 id="pilot-heading" className="rp-mono mt-2 text-3xl font-semibold !text-white">
              $299
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Optional service: installation assistance, first cable-plan import help, and a handover walkthrough.
              Community Edition remains free to self-host.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Manual invoicing. No in-app checkout. Hosted SaaS commercial activation is separate from open-source
              self-host.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 text-[var(--body)] sm:p-8">
            <h3 className="text-base font-semibold">Request an assisted pilot</h3>
            <p className="mt-1 text-sm text-[var(--muted-fg)]">
              We respond by email. No delivery date promised. Submissions are rate-limited.
            </p>
            <div className="mt-5">
              <PilotRequestForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/5 py-6 text-center text-xs text-slate-500">
        <p>
          RackPatch Community Edition · Apache License 2.0 ·{" "}
          <Link href="/about" className="hover:text-slate-300">
            About
          </Link>{" "}
          ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-slate-300">
            GitHub
          </a>
        </p>
        <p className="mt-1.5">© 2026 K G Pramod / VEX-NX</p>
      </footer>
    </div>
  );
}
