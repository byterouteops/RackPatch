"use client";

import { useState } from "react";
import { createApiToken } from "@/app/actions/api-tokens";
import { Button, ErrorBanner, Input } from "@/components/ui";

export function ApiTokenCreateForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("Script access");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    setError(null);
    setToken(null);
    try {
      const res = await createApiToken({ projectId, name });
      setToken(res.token);
      setName("Script access");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {token && (
        <div className="rounded border border-[var(--border)] bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Copy this token now — it will not be shown again.</p>
          <code className="mt-2 block break-all">{token}</code>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          placeholder="Token name"
          className="flex-1"
        />
        <Button type="button" disabled={busy || !name.trim()} onClick={() => void onCreate()}>
          Create token
        </Button>
      </div>
    </div>
  );
}
