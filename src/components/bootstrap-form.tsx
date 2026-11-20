"use client";

import { useState } from "react";
import { createFirstAdministrator } from "@/app/actions/bootstrap";
import { Button, ErrorBanner, Input } from "@/components/ui";

export function BootstrapForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createFirstAdministrator({
        name: String(fd.get("name") || ""),
        email: String(fd.get("email") || ""),
        password: String(fd.get("password") || ""),
      });
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="border border-[var(--border)] border-l-4 border-l-[var(--accent)] bg-[var(--info-soft)] px-3 py-2 text-xs text-[#036a91]">
        No administrators exist yet. Create the first account for this RackPatch instance. This
        form disappears after the first user is created.
      </p>
      {error && <ErrorBanner message={error} />}
      <label className="block text-sm font-medium">
        Full name
        <Input name="name" type="text" required minLength={2} className="mt-1" autoComplete="name" />
      </label>
      <label className="block text-sm font-medium">
        Admin email
        <Input name="email" type="email" required className="mt-1" autoComplete="email" />
      </label>
      <label className="block text-sm font-medium">
        Password
        <Input
          name="password"
          type="password"
          required
          minLength={10}
          className="mt-1"
          autoComplete="new-password"
        />
      </label>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create administrator"}
      </Button>
    </form>
  );
}
