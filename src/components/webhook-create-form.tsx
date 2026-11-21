"use client";

import { useState } from "react";
import { createWebhookEndpoint } from "@/app/actions/webhooks";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { Button, ErrorBanner, Input } from "@/components/ui";
import { actionErrorMessage } from "@/lib/action-error";

export function WebhookCreateForm({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    setBusy(true);
    setError(null);
    setSecret(null);
    try {
      const res = await createWebhookEndpoint({ projectId, url, events });
      setSecret(res.secret);
      setUrl("");
    } catch (e) {
      setError(actionErrorMessage(e, "Could not add endpoint"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {secret && (
        <div className="rounded border border-[var(--border)] bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Copy this signing secret now - it will not be shown again.</p>
          <code className="mt-2 block break-all">{secret}</code>
        </div>
      )}
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
        placeholder="https://hooks.example.com/rackpatch"
        aria-label="Webhook URL"
      />
      <div className="flex flex-wrap gap-4 text-sm">
        {WEBHOOK_EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={events.includes(ev)}
              disabled={busy}
              onChange={(e) =>
                setEvents((cur) => (e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev)))
              }
            />
            <code>{ev}</code>
          </label>
        ))}
      </div>
      <Button disabled={busy || !url.trim() || events.length === 0} onClick={() => void onCreate()}>
        Add endpoint
      </Button>
    </div>
  );
}
