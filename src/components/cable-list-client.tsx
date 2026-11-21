"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InstallStatus, VerificationState } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  History,
  Info,
  Network,
  Search,
  Server,
  Share2,
  X,
} from "lucide-react";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { Badge, Button, EmptyState, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

export type CableRow = {
  id: string;
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  cableType: string | null;
  installStatus: InstallStatus;
  verificationState: VerificationState;
  retired: boolean;
  lengthMeters: number | null;
  notes: string | null;
  blockedReason: string | null;
  expected: string | null;
  observed: string | null;
  nextAction: string | null;
  evidenceSource: string | null;
};

export type CableHistoryEvent = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  actor: string | null;
};

const DASH = "\u2014";

type View = "all" | "issues" | "topology" | "history";
const PAGE_SIZES = [25, 50, 100];

function isIssue(r: CableRow) {
  return (
    r.verificationState === "MISMATCH" ||
    r.verificationState === "NEEDS_REVIEW" ||
    r.installStatus === "BLOCKED"
  );
}

export function CableListClient({
  projectId,
  rows,
  racks,
  cableTypes,
  history,
}: {
  projectId: string;
  rows: CableRow[];
  racks: string[];
  cableTypes: string[];
  history: CableHistoryEvent[];
}) {
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [rack, setRack] = useState("");
  const [install, setInstall] = useState("");
  const [verification, setVerification] = useState("");
  const [cableType, setCableType] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const issueCount = useMemo(() => rows.filter(isIssue).length, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "issues" && !isIssue(r)) return false;
      if (rack && r.aRack !== rack && r.zRack !== rack) return false;
      if (install && r.installStatus !== install) return false;
      if (verification && r.verificationState !== verification) return false;
      if (cableType && r.cableType !== cableType) return false;
      if (!q) return true;
      const hay =
        `${r.cableId} ${r.aDevice} ${r.aPort} ${r.zDevice} ${r.zPort} ${r.aRack} ${r.zRack} ${r.cableType ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, view, search, rack, install, verification, cableType]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const filtersActive = Boolean(search || rack || install || verification || cableType);

  useEffect(() => setPage(0), [view, search, rack, install, verification, cableType, pageSize]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const idx = pageRows.findIndex((r) => r.id === selectedId);
      const next = pageRows[e.key === "ArrowDown" ? idx + 1 : idx - 1];
      if (next) {
        e.preventDefault();
        setSelectedId(next.id);
        document.getElementById(`cable-row-${next.id}`)?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageRows, selectedId]);

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageChecked = pageRows.length > 0 && pageRows.every((r) => checked.has(r.id));

  function togglePage() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allOnPageChecked) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function copyChecked() {
    const ids = rows.filter((r) => checked.has(r.id)).map((r) => r.cableId);
    await navigator.clipboard.writeText(ids.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rp-card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-3 pt-2">
          {(
            [
              { id: "all", label: `Cable List (${rows.length})`, Icon: Network },
              { id: "topology", label: "Topology View", Icon: Share2 },
              { id: "issues", label: `Validation Results (${issueCount})`, Icon: AlertTriangle },
              { id: "history", label: "Change History", Icon: History },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "-mb-px flex items-center gap-2 rounded-t-lg border-b-[3px] px-4 py-2.5 text-sm font-semibold",
                view === id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {view === "history" && <HistoryList events={history} />}
        {view !== "history" && (
        <>

        <div className="flex flex-col gap-2 border-b border-[var(--border)] p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search cables</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-fg)]"
              aria-hidden
            />
            <input
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[var(--muted-fg)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder={"Search cables (ID, device, port)\u2026"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Select className="h-9 sm:w-[130px]" value={rack} onChange={(e) => setRack(e.target.value)} aria-label="Filter by rack">
            <option value="">All racks</option>
            {racks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select className="h-9 sm:w-[130px]" value={install} onChange={(e) => setInstall(e.target.value)} aria-label="Filter by install status">
            <option value="">All install</option>
            <option value="PLANNED">Planned</option>
            <option value="INSTALLED">Installed</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
          <Select
            className="h-9 sm:w-[150px]"
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
            aria-label="Filter by verification"
          >
            <option value="">All status</option>
            <option value="AWAITING">Pending</option>
            <option value="VERIFIED_LLDP">Verified (LLDP)</option>
            <option value="VERIFIED_PHYSICAL">Verified (physical)</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NEEDS_REVIEW">Needs review</option>
          </Select>
          <Select className="h-9 sm:w-[140px]" value={cableType} onChange={(e) => setCableType(e.target.value)} aria-label="Filter by cable type">
            <option value="">All cable types</option>
            {cableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {filtersActive && (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
              onClick={() => {
                setSearch("");
                setRack("");
                setInstall("");
                setVerification("");
                setCableType("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2 text-sm">
            <span className="font-semibold text-[var(--accent)]">{checked.size} selected</span>
            <button type="button" onClick={() => void copyChecked()} className="inline-flex items-center gap-1 font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? "Copied" : "Copy cable IDs"}
            </button>
            <Link href={`/app/projects/${projectId}/labels`} className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
              Print labels
            </Link>
            <Link href={`/app/projects/${projectId}/work-orders`} className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]">
              Create work order
            </Link>
            <button type="button" onClick={() => setChecked(new Set())} className="ml-auto inline-flex items-center gap-1 text-[var(--muted-fg)] hover:text-[var(--foreground)]">
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          </div>
        )}

        {view === "topology" ? (
          <TopologyView rows={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-left text-[12px] font-semibold text-[var(--muted-fg)]">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    checked={allOnPageChecked}
                    onChange={togglePage}
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-2 py-2.5">Cable ID</th>
                <th className="px-2 py-2.5">A-End (Source)</th>
                <th className="w-8 px-0 py-2.5" aria-hidden />
                <th className="px-2 py-2.5">B-End (Destination)</th>
                <th className="px-2 py-2.5">Cable Type</th>
                <th className="px-2 py-2.5">Length</th>
                <th className="px-2 py-2.5">Install</th>
                <th className="px-2 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const isSel = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    id={`cable-row-${r.id}`}
                    onClick={() => setSelectedId(r.id)}
                    aria-selected={isSel}
                    className={cn(
                      "cursor-pointer border-b border-[var(--border)] last:border-0",
                      isSel
                        ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]"
                        : "hover:bg-[var(--muted)]/70",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        checked={checked.has(r.id)}
                        onChange={() => toggleChecked(r.id)}
                        aria-label={`Select ${r.cableId}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="rp-mono font-bold text-[var(--accent)]">{r.cableId}</span>
                      {r.retired && (
                        <Badge tone="neutral" className="ml-1.5">
                          Retired
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="font-semibold">{r.aDevice}</span>
                      <span className="text-[var(--muted-fg)]"> / {r.aPort}</span>
                    </td>
                    <td className="px-0 py-2 text-[var(--muted-fg)]">
                      <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="font-semibold">{r.zDevice}</span>
                      <span className="text-[var(--muted-fg)]"> / {r.zPort}</span>
                    </td>
                    <td className="px-2 py-2 text-[var(--muted-fg)]">{r.cableType ?? DASH}</td>
                    <td className="px-2 py-2 text-[var(--muted-fg)]">
                      {r.lengthMeters != null ? `${r.lengthMeters} m` : DASH}
                    </td>
                    <td className="px-2 py-2">
                      <InstallStatusBadge status={r.installStatus} />
                    </td>
                    <td className="px-2 py-2">
                      <VerificationBadge state={r.verificationState} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-[var(--border)] md:hidden">
          {pageRows.map((r) => (
            <li key={r.id}>
              <Link href={`/app/projects/${projectId}/cables/${r.id}`} className="rp-focus block p-3 active:bg-[var(--muted)]">
                <div className="flex items-start justify-between gap-2">
                  <span className="rp-mono text-base font-bold text-[var(--accent)]">{r.cableId}</span>
                  <InstallStatusBadge status={r.installStatus} />
                </div>
                <p className="mt-2 text-sm">
                  {r.aDevice} / {r.aPort} {"\u2194"} {r.zDevice} / {r.zPort}
                </p>
                <div className="mt-2">
                  <VerificationBadge state={r.verificationState} />
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Search className="h-5 w-5" aria-hidden />}
              title={view === "issues" ? "No validation issues" : "No cables match these filters"}
              description={view === "issues" ? "Every cable is clean or pending evidence." : "Adjust search or clear a filter."}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-fg)]">
            <span>
              Showing {safePage * pageSize + 1}{"\u2013"}{Math.min(filtered.length, (safePage + 1) * pageSize)} of{" "}
              {filtered.length.toLocaleString("en-US")} cables
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className="rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--muted)] disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: pageCount }, (_, i) => i)
                .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - safePage) <= 1)
                .map((i, idx, arr) => (
                  <span key={i} className="flex items-center">
                    {idx > 0 && i - arr[idx - 1] > 1 && <span className="px-1">{"\u2026"}</span>}
                    <button
                      type="button"
                      onClick={() => setPage(i)}
                      className={cn(
                        "min-w-[28px] rounded-md px-2 py-1 text-xs font-semibold",
                        i === safePage ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--muted)]",
                      )}
                    >
                      {i + 1}
                    </button>
                  </span>
                ))}
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                className="rounded-md border border-[var(--border)] p-1.5 hover:bg-[var(--muted)] disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="flex items-center gap-2">
              Rows per page
              <select
                className="h-7 rounded-md border border-[var(--border)] bg-white px-1.5 text-xs"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        </>
        )}
        </>
        )}
      </div>

      <CableDetailsPanel projectId={projectId} cable={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function CableDetailsPanel({
  projectId,
  cable,
  onClose,
}: {
  projectId: string;
  cable: CableRow | null;
  onClose: () => void;
}) {
  if (!cable) {
    return (
      <aside className="rp-card hidden p-6 text-center text-sm text-[var(--muted-fg)] xl:block">
        <Info className="mx-auto mb-2 h-5 w-5" aria-hidden />
        Select a cable to see its details.
      </aside>
    );
  }
  const problem = cable.verificationState === "MISMATCH" || cable.verificationState === "NEEDS_REVIEW";
  const href = `/app/projects/${projectId}/cables/${cable.id}`;
  const fields: Array<[string, string]> = [
    ["Cable ID", cable.cableId],
    ["A-End", `${cable.aDevice} / ${cable.aPort}`],
    ["A Rack", cable.aRack],
    ["B-End", `${cable.zDevice} / ${cable.zPort}`],
    ["B Rack", cable.zRack],
    ["Cable Type", cable.cableType ?? DASH],
    ["Length", cable.lengthMeters != null ? `${cable.lengthMeters} m` : DASH],
  ];

  return (
    <aside className="rp-card sticky top-20 hidden overflow-hidden xl:block" aria-label="Cable details">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="rp-display text-[15px] font-bold">
          Cable Details {"\u2014"} <span className="rp-mono">{cable.cableId}</span>
        </h2>
        <div className="flex items-center gap-1">
          <VerificationBadge state={cable.verificationState} compact />
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--muted-fg)] hover:bg-[var(--muted)]" aria-label="Close details">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4 p-4">
        <dl className="space-y-1.5 text-[13px]">
          {fields.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[90px_1fr] gap-2">
              <dt className="text-[var(--muted-fg)]">{k}</dt>
              <dd className="truncate font-medium">{v}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[90px_1fr] items-center gap-2">
            <dt className="text-[var(--muted-fg)]">Install</dt>
            <dd>
              <InstallStatusBadge status={cable.installStatus} />
            </dd>
          </div>
        </dl>
        <div className="flex w-[92px] flex-col items-center text-center text-[11px]">
          <div className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-1.5 py-1.5">
            <Server className="mx-auto h-4 w-4 text-[var(--accent)]" aria-hidden />
            <p className="truncate font-bold">{cable.aDevice}</p>
            <p className="truncate text-[var(--muted-fg)]">{cable.aPort}</p>
          </div>
          <div
            className={cn("my-1 h-10 w-0.5", problem ? "bg-[var(--danger)]" : "bg-[var(--success)]")}
            aria-hidden
          />
          <div className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-1.5 py-1.5">
            <Server className="mx-auto h-4 w-4 text-[var(--accent)]" aria-hidden />
            <p className="truncate font-bold">{cable.zDevice}</p>
            <p className="truncate text-[var(--muted-fg)]">{cable.zPort}</p>
          </div>
        </div>
      </div>

      {(problem || cable.blockedReason) && (
        <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-[var(--danger-soft)] p-3 text-[13px]">
          <p className="flex items-center gap-1.5 font-bold text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {cable.blockedReason && !problem ? "Blocked" : "Exception Details"}
          </p>
          {cable.blockedReason && <p className="mt-1">{cable.blockedReason}</p>}
          {cable.observed && (
            <p className="mt-1">
              <span className="font-semibold">Observed:</span> {cable.observed}
            </p>
          )}
          {cable.expected && (
            <p className="mt-0.5">
              <span className="font-semibold">Expected:</span> {cable.expected}
            </p>
          )}
          {cable.nextAction && <p className="mt-1 text-[var(--muted-fg)]">{cable.nextAction}</p>}
        </div>
      )}

      {!problem && cable.evidenceSource && (
        <p className="mx-4 mb-4 text-xs text-[var(--muted-fg)]">Evidence: {cable.evidenceSource}</p>
      )}
      {cable.notes && <p className="mx-4 mb-4 text-xs text-[var(--muted-fg)]">Notes: {cable.notes}</p>}

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] p-3">
        <Button href={href} size="sm">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open / Update
        </Button>
        <Button href={`/app/projects/${projectId}/evidence`} size="sm" variant="secondary">
          Add Evidence
        </Button>
        <Button href={`/app/projects/${projectId}/work-orders`} size="sm" variant="secondary">
          Assign
        </Button>
        <Button href={`/app/projects/${projectId}/lldp`} size="sm" variant="secondary">
          Re-verify
        </Button>
      </div>
    </aside>
  );
}

const EDGE_COLOR: Record<string, string> = {
  VERIFIED_LLDP: "#16a34a",
  VERIFIED_PHYSICAL: "#16a34a",
  MISMATCH: "#dc2626",
  NEEDS_REVIEW: "#d97706",
  AWAITING: "#94a3b8",
};

const TOPO_MAX_DEVICES = 60;

/** Two-column device graph: A-side devices left, B-side right, one edge per cable. */
function TopologyView({
  rows,
  selectedId,
  onSelect,
}: {
  rows: CableRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const aCount = new Map<string, number>();
  const zCount = new Map<string, number>();
  for (const r of rows) {
    aCount.set(r.aDevice, (aCount.get(r.aDevice) ?? 0) + 1);
    zCount.set(r.zDevice, (zCount.get(r.zDevice) ?? 0) + 1);
  }
  const all = new Set([...aCount.keys(), ...zCount.keys()]);
  const byName = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
  const left = [...all].filter((d) => (aCount.get(d) ?? 0) >= (zCount.get(d) ?? 0)).sort(byName);
  const right = [...all].filter((d) => (aCount.get(d) ?? 0) < (zCount.get(d) ?? 0)).sort(byName);
  const truncated = left.length > TOPO_MAX_DEVICES || right.length > TOPO_MAX_DEVICES;
  const L = left.slice(0, TOPO_MAX_DEVICES);
  const R = right.slice(0, TOPO_MAX_DEVICES);

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="Nothing to draw" description="No cables match the current filters." />
      </div>
    );
  }

  const rowH = 34;
  const nodeW = 150;
  const width = 640;
  const height = Math.max(L.length, R.length, 1) * rowH + 24;
  const yOf = (list: string[], d: string) => {
    const offset = ((Math.max(L.length, R.length) - list.length) * rowH) / 2;
    return 12 + offset + list.indexOf(d) * rowH + rowH / 2;
  };
  const side = (d: string) => (L.includes(d) ? "L" : R.includes(d) ? "R" : null);

  return (
    <div className="overflow-x-auto p-4">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block" role="img" aria-label="Cable topology">
        {rows.map((r) => {
          const sa = side(r.aDevice);
          const sz = side(r.zDevice);
          if (!sa || !sz) return null;
          const ax = sa === "L" ? nodeW : width - nodeW;
          const zx = sz === "L" ? nodeW : width - nodeW;
          const ay = yOf(sa === "L" ? L : R, r.aDevice);
          const zy = yOf(sz === "L" ? L : R, r.zDevice);
          const sel = r.id === selectedId;
          const mid = (ax + zx) / 2 + (sa === sz ? (sa === "L" ? 80 : -80) : 0);
          return (
            <path
              key={r.id}
              d={`M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${zy}, ${zx} ${zy}`}
              fill="none"
              stroke={EDGE_COLOR[r.verificationState] ?? "#94a3b8"}
              strokeWidth={sel ? 4 : 1.75}
              strokeOpacity={sel || !selectedId ? 1 : 0.55}
              className="cursor-pointer"
              onClick={() => onSelect(r.id)}
            >
              <title>{`${r.cableId}: ${r.aDevice}/${r.aPort} \u2194 ${r.zDevice}/${r.zPort}`}</title>
            </path>
          );
        })}
        {([["L", L], ["R", R]] as const).map(([s, list]) =>
          list.map((d) => {
            const x = s === "L" ? 0 : width - nodeW;
            const y = yOf(list, d) - 12;
            return (
              <g key={`${s}-${d}`}>
                <rect x={x} y={y} width={nodeW} height={24} rx={6} fill="#0f2742" />
                <text x={x + nodeW / 2} y={y + 16} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#fff">
                  {d.length > 20 ? `${d.slice(0, 19)}\u2026` : d}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--muted-fg)]">
        {([["#16a34a", "Verified"], ["#dc2626", "Mismatch"], ["#d97706", "Needs review"], ["#94a3b8", "Pending"]] as const).map(
          ([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5" style={{ background: c }} aria-hidden />
              {l}
            </span>
          ),
        )}
        <span>Click a line to select the cable.</span>
        {truncated && <span>Showing first {TOPO_MAX_DEVICES} devices per side {"\u2014"} filter to narrow.</span>}
      </div>
    </div>
  );
}

function HistoryList({ events }: { events: CableHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No changes recorded" description="Plan publishes, installs and evidence imports appear here." />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{e.summary}</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-fg)]">
              <span className="rp-mono">{e.action}</span>
              {e.actor && ` \u00b7 ${e.actor}`}
            </p>
          </div>
          <time className="shrink-0 text-[11px] text-[var(--muted-fg)]" dateTime={e.createdAt}>
            {e.createdAt.slice(0, 16).replace("T", " ")} UTC
          </time>
        </li>
      ))}
    </ul>
  );
}
