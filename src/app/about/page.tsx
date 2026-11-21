import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button, Card } from "@/components/ui";
import packageJson from "../../../package.json";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="h-1 w-full bg-[var(--accent-line)]" aria-hidden />
      <header className="border-b border-[var(--border)] bg-[var(--chrome)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-white">
            <BrandMark size={28} />
            RackPatch
          </Link>
          <Button href="/sign-in" size="sm">
            Sign in
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">About RackPatch</h1>
          <p className="mt-2 text-[var(--muted-fg)]">
            Know which cables are right before you hand over the rack.
          </p>
        </div>

        <Card title="Community Edition">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted-fg)]">Version</dt>
              <dd className="font-medium">{packageJson.version}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-fg)]">License</dt>
              <dd className="font-medium">Apache License 2.0</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-[var(--muted-fg)]">
            Self-host freely. Core cabling workflows do not require payment activation unless you run
            the official hosted SaaS with <code className="text-xs">HOSTED_SAAS=true</code>. Optional
            assisted pilot services are separate from the software license.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href="/demo" variant="secondary" size="sm">
              Open demo
            </Button>
            <Button href="/" size="sm">
              Home
            </Button>
          </div>
        </Card>

        <Card title="Creator">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted-fg)]">Author</dt>
              <dd className="font-medium">K G Pramod</dd>
            </div>
            <div>
              <dt className="text-[var(--muted-fg)]">Company</dt>
              <dd className="font-medium">VEX-NX</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-[var(--muted-fg)]">
            RackPatch is created and maintained by K G Pramod (VEX-NX). See{" "}
            <code className="text-xs">NOTICE</code> for copyright.
          </p>
        </Card>

        <Card title="Source documentation">
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted-fg)]">
            <li>
              <code>LICENSE</code> / <code>NOTICE</code> — Apache 2.0 and third-party attribution
            </li>
            <li>
              <code>CONTRIBUTING.md</code> / <code>CODE_OF_CONDUCT.md</code>
            </li>
            <li>
              <code>SECURITY.md</code> — private vulnerability reporting
            </li>
            <li>
              <code>README.md</code> — setup, fixtures, Railway notes
            </li>
          </ul>
        </Card>

        <footer className="border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--muted-fg)]">
          © 2026 K G Pramod / VEX-NX · RackPatch · Apache License 2.0
        </footer>
      </main>
    </div>
  );
}
