import Link from "next/link";
import { Cable, Camera, Network, QrCode, Server } from "lucide-react";
import type { TwinDeviceStatus, TwinRack } from "@/lib/twin/rack-layout";
import { cn } from "@/lib/utils";

const LED: Record<TwinDeviceStatus, string> = {
  installed: "bg-emerald-400",
  partial: "bg-amber-400",
  blocked: "bg-red-500",
  planned: "bg-slate-500",
};

const MIN_SLOTS = 8;

/**
 * Dashboard rack elevation. Devices sit in schematic slots (alphabetical) —
 * the plan has no rack-unit positions, so no U numbers are shown.
 */
export function RackViewPanel({
  projectId,
  site,
  rack,
  verifiedInRack,
}: {
  projectId: string;
  site: string;
  rack: TwinRack;
  verifiedInRack: number;
}) {
  const slots = Math.max(MIN_SLOTS, rack.devices.length);
  const installed = rack.devices.reduce((n, d) => n + d.installed, 0);
  const endpoints = rack.devices.reduce((n, d) => n + d.portsUsed, 0);
  const base = `/app/projects/${projectId}`;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="rounded-xl bg-gradient-to-b from-[#1e293b] to-[#0f172a] p-3 shadow-inner">
        <div className="mb-2 rounded-md bg-black/40 py-1.5 text-center text-sm font-bold tracking-wide text-white">
          {rack.rack}
        </div>
        <div className="space-y-1 rounded-md border border-slate-700 bg-[#0b1220] p-2">
          {Array.from({ length: slots }).map((_, i) => {
            const d = rack.devices[i];
            if (!d) {
              return <div key={i} className="h-7 rounded-sm border border-dashed border-slate-800" aria-hidden />;
            }
            const switchLike = d.portsUsed > 2;
            return (
              <div
                key={d.device}
                title={`${d.device}: ${d.installed}/${d.portsUsed} endpoints installed${d.blocked ? `, ${d.blocked} blocked` : ""}`}
                className="flex h-7 items-center gap-2 rounded-sm border border-slate-600 bg-gradient-to-b from-slate-600 to-slate-700 px-2"
              >
                <span className="w-24 truncate text-[11px] font-semibold text-slate-100">{d.device}</span>
                {switchLike ? (
                  <span className="flex flex-1 flex-wrap gap-[3px]" aria-hidden>
                    {Array.from({ length: Math.min(d.portsUsed, 24) }).map((__, p) => (
                      <span
                        key={p}
                        className={cn(
                          "h-2.5 w-2.5 rounded-[2px] border border-slate-900",
                          p < d.installed ? "bg-emerald-400" : p < d.installed + d.blocked ? "bg-red-500" : "bg-slate-800",
                        )}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <span className={cn("h-2 w-2 rounded-full", LED[d.status])} aria-hidden />
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold">
            <Server className="h-5 w-5 text-[var(--accent)]" aria-hidden />
            {rack.rack}
          </p>
          <dl className="mt-2 divide-y divide-[var(--border)] text-[13px]">
            {(
              [
                ["Site", site],
                ["Devices", String(rack.devices.length)],
                ["Cables (planned)", String(rack.links)],
                ["Endpoints installed", `${installed} / ${endpoints}`],
                ["Verified cables", String(verifiedInRack)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5">
                <dt className="text-[var(--muted-fg)]">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">Quick Actions</p>
          <div className="space-y-1.5">
            {(
              [
                [`${base}/cables`, "View Cable Plan", Cable],
                [`${base}/scan`, "Scan QR / Label", QrCode],
                [`${base}/evidence`, "Add Evidence", Camera],
                [`${base}/lldp`, "Run LLDP Collection", Network],
              ] as const
            ).map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
