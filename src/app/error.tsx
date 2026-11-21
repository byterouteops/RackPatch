"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <div className="w-full max-w-lg rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[var(--foreground)]">This page could not load</h1>
        <p className="mt-2 text-sm text-[var(--muted-fg)]">
          RackPatch could not reach a required service (for example the database). No changes were saved by this
          request. Try again in a moment; if it keeps happening, contact your administrator.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-[var(--muted-fg)]">
            Reference: <span className="rp-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })}>
            Try again
          </Button>
          <Button href="/app" variant="secondary">
            Dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
