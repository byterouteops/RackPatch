"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw, SlidersHorizontal } from "lucide-react";
import { adjustStock } from "@/app/actions/spares";
import { Button, ErrorBanner, Input, Select, TextArea } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "Receive" | "Issue" | "Return" | "Adjust";
const MODES: Array<{ id: Mode; icon: typeof ArrowDownToLine }> = [
  { id: "Receive", icon: ArrowDownToLine },
  { id: "Issue", icon: ArrowUpFromLine },
  { id: "Return", icon: RotateCcw },
  { id: "Adjust", icon: SlidersHorizontal },
];

export function StockTransactionForm({
  projectId,
  items,
  canReceive,
  canConsume,
}: {
  projectId: string;
  items: Array<{ id: string; sku: string; description: string; unit: string; quantityOnHand: number }>;
  canReceive: boolean;
  canConsume: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(canReceive ? "Receive" : "Issue");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const item = items.find((i) => i.id === itemId);
  const n = Number(qty);
  const delta = mode === "Issue" ? -Math.abs(n) : mode === "Adjust" ? n : Math.abs(n);
  const allowed = Number.isInteger(n) && n !== 0 && (delta > 0 ? canReceive : canConsume) && Boolean(reference.trim());

  return (
    <form
      className="space-y-3 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        const reason = `${mode}: ${reference.trim()}${notes.trim() ? ` \u2014 ${notes.trim()}` : ""}`.slice(0, 200);
        startTransition(async () => {
          try {
            const r = await adjustStock({ projectId, itemId, delta, reason });
            setDone(`${item?.sku} balance is now ${r.quantityAfter} ${item?.unit}`);
            setQty("");
            setReference("");
            setNotes("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Transaction failed");
          }
        });
      }}
    >
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-[var(--muted)] p-1" role="tablist" aria-label="Transaction type">
        {MODES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-semibold",
              mode === id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--muted-fg)] hover:bg-white",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {id}
          </button>
        ))}
      </div>
      {error && <ErrorBanner message={error} />}
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{done}</p>}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">Item / Part number</span>
        <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.sku} {"\u2013"} {i.description}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">
          Quantity{item ? ` (${item.unit}, on hand ${item.quantityOnHand})` : ""}
          {mode === "Adjust" ? " \u2014 signed, e.g. -2" : ""}
        </span>
        <Input required type="number" step={1} min={mode === "Adjust" ? undefined : 1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">Reference</span>
        <Input required maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={mode === "Issue" ? "Cable ID or work order" : "PO / RMA / count sheet"} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--muted-fg)]">Notes</span>
        <TextArea rows={2} maxLength={120} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Button type="submit" className="w-full" disabled={pending || !allowed || !itemId}>
        {pending ? "Recording\u2026" : `Record ${mode}`}
      </Button>
      {!canReceive && <p className="text-xs text-[var(--muted-fg)]">Receive, return and positive adjustments require a lead.</p>}
    </form>
  );
}
