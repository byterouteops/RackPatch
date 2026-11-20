"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InstallStatus, VerificationState } from "@prisma/client";
import { Search } from "lucide-react";
import { InstallStatusBadge, VerificationBadge } from "@/components/status-badges";
import { Input, Select } from "@/components/ui";

export type CableRow = {
  id: string;
  cableId: string;
  aRack: string;
  aDevice: string;
  aPort: string;
  zRack: string;
  zDevice: string;
  zPort: string;
  installStatus: InstallStatus;
  verificationState: VerificationState;
};

export function CableListClient({
  projectId,
  rows,
  racks,
}: {
  projectId: string;
  rows: CableRow[];
  racks: string[];
}) {
  const [search, setSearch] = useState("");
  const [rack, setRack] = useState("");
  const [install, setInstall] = useState("");
  const [verification, setVerification] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (rack && r.aRack !== rack && r.zRack !== rack) return false;
      if (install && r.installStatus !== install) return false;
      if (verification && r.verificationState !== verification) return false;
      if (!q) return true;
      const hay = `${r.cableId} ${r.aDevice} ${r.aPort} ${r.zDevice} ${r.zPort}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, rack, install, verification]);

  return (
    <div className="space-y-4">
      <div className="rp-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-fg)]"
              aria-hidden
            />
            <Input
              className="pl-9"
              placeholder="Search cables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search cables"
            />
          </div>
          <Select value={rack} onChange={(e) => setRack(e.target.value)} aria-label="Filter by rack">
            <option value="">All racks</option>
            {racks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select
            value={install}
            onChange={(e) => setInstall(e.target.value)}
            aria-label="Filter by install status"
          >
            <option value="">Any install</option>
            <option value="PLANNED">Planned</option>
            <option value="INSTALLED">Installed</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
          <Select
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
            aria-label="Filter by verification"
          >
            <option value="">Any verification</option>
            <option value="AWAITING">Pending</option>
            <option value="VERIFIED_LLDP">Verified (LLDP)</option>
            <option value="VERIFIED_PHYSICAL">Verified (physical)</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NEEDS_REVIEW">Needs review</option>
          </Select>
        </div>
        <p className="mt-3 text-sm text-[var(--muted-fg)]">
          Showing <span className="font-medium text-[var(--foreground)]">{filtered.length}</span> of{" "}
          {rows.length} cables
        </p>
      </div>

      <div className="rp-table-wrap hidden md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="rp-table">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>Cable ID</th>
                <th>A end</th>
                <th>Z end</th>
                <th>Install</th>
                <th>Verify</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">
                    <Link
                      href={`/app/projects/${projectId}/cables/${r.id}`}
                      className="rp-mono text-[var(--accent)] hover:underline"
                    >
                      {r.cableId}
                    </Link>
                  </td>
                  <td className="text-[var(--muted-fg)]">
                    <span className="font-medium text-[var(--foreground)]">{r.aDevice}</span>
                    <span className="rp-mono"> / {r.aPort}</span>
                    <span className="mt-0.5 block text-xs">{r.aRack}</span>
                  </td>
                  <td className="text-[var(--muted-fg)]">
                    <span className="font-medium text-[var(--foreground)]">{r.zDevice}</span>
                    <span className="rp-mono"> / {r.zPort}</span>
                    <span className="mt-0.5 block text-xs">{r.zRack}</span>
                  </td>
                  <td>
                    <InstallStatusBadge status={r.installStatus} />
                  </td>
                  <td>
                    <VerificationBadge state={r.verificationState} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link
              href={`/app/projects/${projectId}/cables/${r.id}`}
              className="block border border-[var(--border)] bg-white p-3 active:bg-[var(--muted)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-semibold">{r.cableId}</span>
                <InstallStatusBadge status={r.installStatus} />
              </div>
              <p className="mt-3 text-sm">
                <span className="text-[var(--muted-fg)]">A:</span>{" "}
                <span className="font-medium">
                  {r.aDevice} / {r.aPort}
                </span>
              </p>
              <p className="text-sm">
                <span className="text-[var(--muted-fg)]">Z:</span>{" "}
                <span className="font-medium">
                  {r.zDevice} / {r.zPort}
                </span>
              </p>
              <div className="mt-3">
                <VerificationBadge state={r.verificationState} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted-fg)]">
          No cables match these filters.
        </p>
      )}
    </div>
  );
}
