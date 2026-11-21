"use client";

import { useState } from "react";
import { submitPilotRequest } from "@/app/actions/pilot";
import { Button, Input, ErrorBanner } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function PilotRequestForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    setSuccess(null);
    const fd = new FormData(form);
    try {
      const result = await submitPilotRequest({
        name: String(fd.get("name") || ""),
        businessEmail: String(fd.get("businessEmail") || ""),
        company: String(fd.get("company") || ""),
        projectSize: String(fd.get("projectSize") || ""),
      });
      setSuccess(result.message);
      form.reset();
    } catch (err) {
      setError(actionErrorMessage(err, "Request failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Name
          <Input name="name" required className="mt-1" autoComplete="name" />
        </label>
        <label className="block text-sm font-medium">
          Business email
          <Input
            name="businessEmail"
            type="email"
            required
            className="mt-1"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium">
          Company
          <Input name="company" required className="mt-1" autoComplete="organization" />
        </label>
        <label className="block text-sm font-medium">
          Project size
          <Input
            name="projectSize"
            required
            className="mt-1"
            placeholder="e.g. 200 cables, 2 racks"
          />
        </label>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Request a pilot"}
      </Button>
    </form>
  );
}