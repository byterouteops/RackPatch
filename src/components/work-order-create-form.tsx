"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrder } from "@/app/actions/work-orders";
import { Button, Input, TextArea } from "@/components/ui";

export function WorkOrderCreateForm({
  projectId,
  members,
  linkOptions,
}: {
  projectId: string;
  members: Array<{ id: string; name: string; email: string }>;
  linkOptions: Array<{ id: string; cableId: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <form
      className="rp-card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            const res = await createWorkOrder({
              projectId,
              title,
              notes: notes || undefined,
              assigneeId: assigneeId || undefined,
              plannedLinkIds: selected,
            });
            router.push(`/app/projects/${projectId}/work-orders/${res.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create");
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold">New work order</h2>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <Input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Rack R01 leaf uplinks)"
        aria-label="Title"
      />
      <TextArea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for field techs"
        rows={2}
        aria-label="Notes"
      />
      <label className="block text-sm">
        Assignee
        <select
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-1 text-sm font-medium">Cables ({selected.length} selected)</p>
        <div className="max-h-40 overflow-y-auto rounded border border-[var(--border)] p-2 text-xs">
          {linkOptions.length === 0 && (
            <p className="text-[var(--muted-fg)]">No cables in active plan.</p>
          )}
          {linkOptions.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={selected.includes(l.id)}
                onChange={() => toggle(l.id)}
              />
              <span className="rp-mono">{l.cableId}</span>
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" disabled={pending || !title.trim()}>
        Create work order
      </Button>
    </form>
  );
}
