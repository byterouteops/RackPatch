import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { PilotRequestForm } from "@/components/pilot-request-form";
import { Button, Card } from "@/components/ui";

const headline = "Know which cables are right before you hand over the rack.";

const features = [
  {
    title: "Cable planning",
    body: "Import CSV cable plans, publish revisions, and track A/Z endpoints.",
  },
  {
    title: "Installation tracking",
    body: "Technicians mark Planned, Installed, or Blocked on the floor.",
  },
  {
    title: "Physical verification",
    body: "Independent verifier confirms both ends — not the installer.",
  },
  {
    title: "Mismatch detection",
    body: "Compare LLDP/CDP neighbor evidence (Cisco, Arista, Juniper) to the approved plan.",
  },
  {
    title: "Exceptions",
    body: "Keep expected vs observed ports visible until evidence changes.",
  },
  {
    title: "Project handover",
    body: "Snapshot status, export CSV, and print an evidence-backed report.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
      <header className="border-b border-[var(--border)] bg-[var(--chrome)] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
            <BrandMark size={28} />
            <span>
              RackPatch
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">
                Community Edition
              </span>
            </span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button href="/demo" variant="secondary" size="sm" className="border-white/20 bg-transparent text-white hover:border-[var(--accent)] hover:bg-white/5 hover:text-white">
              Explore Demo
            </Button>
            <Button href="/about" variant="ghost" size="sm" className="text-white/70 hover:bg-white/5 hover:text-white">
              Open Source
            </Button>
            <Button href="/sign-in" size="sm">
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--sidebar)] text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent 0, transparent 49%, #049fd9 50%, transparent 51%), linear-gradient(0deg, transparent 0, transparent 49%, #049fd9 50%, transparent 51%)",
              backgroundSize: "48px 48px",
            }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-line)]">
              Community Edition · Apache 2.0
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {headline}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/70">
              Plan, install, verify, and hand over physical data center cabling with traceable
              evidence — built for network operations teams.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/sign-in" size="lg">
                Get Started Free
              </Button>
              <Button
                href="/demo"
                variant="secondary"
                size="lg"
                className="border-white/25 bg-transparent text-white hover:border-[var(--accent)] hover:bg-white/5 hover:text-white"
              >
                Explore the Demo
              </Button>
            </div>
            <p className="mt-4 text-sm text-white/45">
              Self-host free. Optional assisted pilot is a service — not a software license.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <section aria-labelledby="features-heading">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-3">
              <div>
                <h2 id="features-heading" className="text-lg font-semibold tracking-tight">
                  What you can do today
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-fg)]">
                  Implemented Community Edition capabilities only.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="rp-card flex gap-3 border-l-4 border-l-[var(--accent)] p-4">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted-fg)]">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 border border-[var(--border)] bg-[var(--chrome)] p-6 text-white sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-line)]">
              Optional assisted pilot
            </p>
            <p className="rp-mono mt-2 text-3xl font-semibold">$299</p>
            <p className="mt-3 max-w-xl text-sm text-white/70">
              Optional service: installation assistance, first cable-plan import help, and a
              handover walkthrough. Community Edition remains free to self-host.
            </p>
            <p className="mt-3 max-w-xl text-xs text-white/45">
              Manual invoicing. No in-app checkout. Hosted SaaS commercial activation is separate
              from open-source self-host.
            </p>
          </section>

          <section id="pilot" className="mt-12 scroll-mt-8">
            <Card
              title="Request an assisted pilot"
              description="We respond by email. No delivery date promised. Submissions are rate-limited."
            >
              <PilotRequestForm />
            </Card>
          </section>

          <section className="mt-12 text-sm text-[var(--muted-fg)]">
            <h2 className="rp-panel-title text-[var(--foreground)]">How it works</h2>
            <ol className="mt-3 list-decimal space-y-2 border border-[var(--border)] bg-white p-4 pl-9">
              <li>Create a workspace and project after sign-in.</li>
              <li>Import a CSV cable plan (or seed the synthetic demo).</li>
              <li>Technicians mark install status; leads import LLDP or CDP evidence.</li>
              <li>Resolve mismatches; complete independent physical verification.</li>
              <li>Export CSV / create a handover snapshot when ready.</li>
            </ol>
            <p className="mt-4">
              Docs: see repository <code className="rp-mono text-xs">README.md</code>,{" "}
              <code className="rp-mono text-xs">FIRST_PROJECT_QUICKSTART.md</code>, and{" "}
              <Link className="font-semibold text-[var(--accent)] hover:underline" href="/about">
                About
              </Link>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--chrome)] py-5 text-center text-xs tracking-[0.06em] text-white/45">
        <p className="uppercase">RackPatch Community Edition · Apache License 2.0</p>
        <p className="mt-1.5 text-[11px] normal-case tracking-normal text-white/35">
          © 2026 K G Pramod / VEX-NX
        </p>
      </footer>
    </div>
  );
}
