import Link from "next/link";
import { Cable, Camera, CheckCircle2, Network, QrCode, Server, TriangleAlert } from "lucide-react";
import type { TwinDevice, TwinDeviceStatus, TwinRack } from "@/lib/twin/rack-layout";
import { cn } from "@/lib/utils";

const LED: Record<TwinDeviceStatus, string> = {
  installed: "bg-emerald-400",
  partial: "bg-amber-400",
  blocked: "bg-red-500",
  planned: "bg-slate-500",
};

const LED_LABEL: Record<TwinDeviceStatus, string> = {
  installed: "all endpoints installed",
  partial: "partially installed",
  blocked: "blocked endpoints",
  planned: "planned, not installed",
};

const MIN_SLOTS = 8;
const MAX_PORT_BLOCKS = 16;

export type RackUnitInfo = { rackUnit: number | null; uHeight: number | null; model: string | null };

/**
 * Dashboard rack summary. When inventory records carry rack-unit positions the
 * devices are ordered top-down by U and labelled; otherwise they are listed
 * alphabetically without U numbers (the plan alone has no RU data).
 */
export function RackViewPanel({
  projectId,
  site,
  rack,
  verifiedInRack,
  units,
  view = "grid",
}: {
  projectId: string;
  site: string;
  rack: TwinRack;
  verifiedInRack: number;
  units?: Map<string, RackUnitInfo>;
  view?: "grid" | "list";
}) {
  const unitOf = (d: TwinDevice) => units?.get(d.device.toLowerCase())?.rackUnit ?? null;
  const placedCount = rack.devices.filter((d) => unitOf(d) !== null).length;
  const devices =
    placedCount > 0
      ? [...rack.devices].sort((a, b) => (unitOf(b) ?? -1) - (unitOf(a) ?? -1) || a.device.localeCompare(b.device))
      : rack.devices;
  const slots = Math.max(MIN_SLOTS, devices.length);
  const installed = rack.devices.reduce((n, d) => n + d.installed, 0);
  const endpoints = rack.devices.reduce((n, d) => n + d.portsUsed, 0);
  const blocked = rack.devices.reduce((n, d) => n + d.blocked, 0);
  const base = `/app/projects/${projectId}`;
  const health =
    blocked > 0
      ? { label: "Attention", icon: TriangleAlert, cls: "bg-[var(--warning-soft)] text-[var(--warning-ink)] border-[#f6d9a4]" }
      : endpoints > 0 && installed === endpoints
        ? { label: "Healthy", icon: CheckCircle2, cls: "bg-[var(--success-soft)] text-[var(--success-ink)] border-[#bfe3cb]" }
        : { label: "In progress", icon: Server, cls: "bg-[var(--info-soft)] text-[#005fb0] border-[#c3dcf4]" };
  const HealthIcon = health.icon;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      {view === "list" ? (
        <div className="rp-table-wrap overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="rp-table rp-table-auto">
            <thead>
              <tr>
                {placedCount > 0 && <th>U</th>}
                <th>Device</th>
                <th>Endpoints</th>
                <th>Installed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.device}>
                  {placedCount > 0 && <td className="rp-mono">{unitOf(d) ?? "\u2014"}</td>}
                  <td className="font-semibold text-[var(--foreground)]">{d.device}</td>
                  <td className="rp-mono">{d.portsUsed}</td>
                  <td className="rp-mono">{d.installed}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span className={cn("h-2 w-2 rounded-full", LED[d.status])} aria-hidden />
                      {LED_LABEL[d.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="rounded-xl border border-[#1f3352] bg-gradient-to-b from-[#1c2c47] to-[#0b1628] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          aria-label={`Rack ${rack.rack} device summary`}
        >
          <div className="mb-2 rounded-md bg-[#071222] py-1.5 text-center text-[15px] font-bold tracking-wide text-white">
            {rack.rack}
          </div>
          <div
            className="rp-focus max-h-[456px] space-y-[3px] overflow-y-auto rounded-md border border-[#22344f] bg-[#081120] p-1.5"
            tabIndex={slots > 15 ? 0 : undefined}
            role={slots > 15 ? "region" : undefined}
            aria-label={slots > 15 ? `Rack ${rack.rack} units (scrollable)` : undefined}
          >
            {Array.from({ length: slots }).map((_, i) => {
              const d = devices[i];
              if (!d) {
                return <div key={i} className="h-[26px] rounded-[3px] border border-dashed border-[#1c2a40]" aria-hidden />;
              }
              const u = unitOf(d);
              const blocks = Math.min(d.portsUsed, MAX_PORT_BLOCKS);
              return (
                <div
                  key={d.device}
                  title={`${d.device}${u ? ` \u00b7 U${u}` : ""}: ${d.installed}/${d.portsUsed} endpoints installed${d.blocked ? `, ${d.blocked} blocked` : ""}`}
                  className="flex h-[26px] items-center gap-2 rounded-[3px] border border-[#3a4c66] bg-gradient-to-b from-[#3d4d65] to-[#2b394e] px-2"
                >
                  {placedCount > 0 && (
                    <span className="w-7 shrink-0 font-mono text-[10px] text-[#9fb3cc]">{u ? `U${u}` : ""}</span>
                  )}
                  <span className="w-[112px] shrink-0 truncate text-[12px] font-semibold text-white">{d.device}</span>
                  <span className="flex min-w-0 flex-1 gap-[3px] overflow-hidden" aria-hidden>
                    {Array.from({ length: blocks }).map((__, p) => (
                      <span
                        key={p}
                        className={cn(
                          "h-3 w-3 shrink-0 rounded-[2px] border border-[#0b1220]",
                          p < d.installed ? "bg-emerald-400" : p < d.installed + d.blocked ? "bg-red-500" : "bg-[#162236]",
                        )}
                      />
                    ))}
                  </span>
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", LED[d.status])} aria-hidden />
                  <span className="sr-only">{LED_LABEL[d.status]}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-[#b4c4d8]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-400" aria-hidden />Installed</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" aria-hidden />Blocked</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-[#3a4c66] bg-[#162236]" aria-hidden />Planned</span>
            {placedCount === 0 && <span>Order: alphabetical (no rack-unit data)</span>}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-[17px] font-bold text-[var(--foreground)]">
              <Server className="h-5 w-5 text-[var(--accent-ink)]" aria-hidden />
              {rack.rack}
            </p>
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", health.cls)}>
              <HealthIcon className="h-3.5 w-3.5" aria-hidden />
              {health.label}
            </span>
          </div>
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
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <dt className="text-[var(--muted-fg)]">{k}</dt>
                <dd className="truncate font-semibold text-[var(--foreground)]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="mb-2 text-[14px] font-bold text-[var(--foreground)]">Quick Actions</p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
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
                title={label}
                className="rp-focus flex min-h-[40px] min-w-0 items-center gap-1.5 rounded-lg border border-[#c9dcef] bg-white px-2.5 py-1.5 text-[12px] font-semibold leading-tight text-[#005fb0] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
